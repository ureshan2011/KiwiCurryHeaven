const STORAGE_KEY = 'kiwi-curry-cart';

function getCartKey(itemId, size) {
  if (typeof itemId !== 'string') {
    throw new TypeError('itemId must be a string');
  }

  const sizeLabel = size == null ? '' : String(size);
  return `${itemId}-${sizeLabel}`;
}

function validateCartCollection(cartItems) {
  if (!cartItems || typeof cartItems.set !== 'function' || typeof cartItems.get !== 'function') {
    throw new TypeError('cartItems must be a Map-like collection');
  }
}

export function addOrUpdateCartItem(cartItems, item) {
  validateCartCollection(cartItems);

  if (!item || typeof item.itemId !== 'string') {
    throw new TypeError('item.itemId must be a string');
  }

  const size = item.size == null ? '' : String(item.size);
  const quantityNumber = Number(item.quantity);
  const unitPriceNumber = Number(item.unitPrice);

  if (!Number.isFinite(unitPriceNumber)) {
    throw new TypeError('item.unitPrice must be a finite number');
  }

  if (!Number.isFinite(quantityNumber) || quantityNumber <= 0) {
    return cartItems.get(getCartKey(item.itemId, size)) ?? null;
  }

  const key = getCartKey(item.itemId, size);
  const existing = cartItems.get(key);

  if (existing) {
    existing.quantity += quantityNumber;
    return existing;
  }

  const cartItem = {
    itemId: item.itemId,
    itemName: typeof item.itemName === 'string' ? item.itemName : '',
    size,
    unitLabel: typeof item.unitLabel === 'string' ? item.unitLabel : '',
    unitPrice: unitPriceNumber,
    quantity: quantityNumber,
  };

  cartItems.set(key, cartItem);
  return cartItem;
}

export function createCartCollection(initialItems = []) {
  const collection = new Map();

  if (Array.isArray(initialItems)) {
    initialItems.forEach((rawItem) => {
      try {
        addOrUpdateCartItem(collection, rawItem);
      } catch {
        // Ignore invalid entries when hydrating
      }
    });
  }

  return collection;
}

function persistCart(cartItems, storage) {
  if (!storage) {
    return;
  }

  try {
    const serialised = JSON.stringify(Array.from(cartItems.values()));
    storage.setItem(STORAGE_KEY, serialised);
  } catch (error) {
    console.warn('Unable to persist cart', error);
  }
}

function hydrateCart(cartItems, storage) {
  if (!storage) {
    return;
  }

  try {
    const stored = storage.getItem(STORAGE_KEY);
    if (!stored) {
      return;
    }

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return;
    }

    cartItems.clear();
    parsed.forEach((rawItem) => {
      try {
        addOrUpdateCartItem(cartItems, rawItem);
      } catch {
        // Ignore malformed entries when restoring
      }
    });
  } catch (error) {
    console.warn('Unable to restore cart', error);
  }
}

function getStorage(windowObj) {
  try {
    return windowObj.localStorage ?? null;
  } catch {
    return null;
  }
}

export function removeCartItem(cartItems, item) {
  validateCartCollection(cartItems);

  if (!item || typeof item.itemId !== 'string') {
    throw new TypeError('item.itemId must be a string');
  }

  const key = getCartKey(item.itemId, item.size);
  return cartItems.delete(key);
}

export function setCartItemQuantity(cartItems, item) {
  validateCartCollection(cartItems);

  if (!item || typeof item.itemId !== 'string') {
    throw new TypeError('item.itemId must be a string');
  }

  const quantityNumber = Number(item.quantity);
  if (!Number.isFinite(quantityNumber)) {
    throw new TypeError('item.quantity must be a finite number');
  }

  const key = getCartKey(item.itemId, item.size);
  const existing = cartItems.get(key);

  if (!existing) {
    if (quantityNumber <= 0) {
      cartItems.delete(key);
    }
    return null;
  }

  if (quantityNumber <= 0) {
    cartItems.delete(key);
    return null;
  }

  existing.quantity = quantityNumber;
  return existing;
}

export function createPersistentCart(windowObj) {
  const cartItems = createCartCollection();
  const storage = windowObj ? getStorage(windowObj) : null;

  hydrateCart(cartItems, storage);

  function persist() {
    persistCart(cartItems, storage);
  }

  return { cartItems, persist };
}

export function initializeCartPage({ window }) {
  if (!window || !window.document) {
    throw new TypeError('A window with a document is required to initialise the cart page');
  }

  const { document } = window;
  const currencyFormatter = new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
  });

  const cartItems = createCartCollection();

  const cartBadge = document.querySelector('[data-cart-count]');
  const cartLink = document.querySelector('[data-cart-link]');
  const subtotalDisplays = document.querySelectorAll('[data-cart-subtotal]');
  const cartBar = document.querySelector('[data-cart-bar]');
  const reviewButtons = document.querySelectorAll('[data-review-order]');

  const storage = getStorage(window);

  function updateCartUI() {
    let totalQuantity = 0;
    let subtotal = 0;

    cartItems.forEach((cartItem) => {
      totalQuantity += cartItem.quantity;
      subtotal += cartItem.quantity * cartItem.unitPrice;
    });

    if (cartBadge) {
      cartBadge.textContent = String(totalQuantity);
      cartBadge.classList.toggle('hidden', totalQuantity === 0);
    }

    if (cartLink) {
      const label = totalQuantity === 0
        ? 'Cart (empty)'
        : `Cart (${totalQuantity} ${totalQuantity === 1 ? 'item' : 'items'})`;
      cartLink.setAttribute('aria-label', label);
    }

    subtotalDisplays.forEach((element) => {
      element.textContent = currencyFormatter.format(subtotal);
    });

    reviewButtons.forEach((button) => {
      if (subtotal === 0) {
        button.classList.add('pointer-events-none', 'opacity-70');
        button.setAttribute('aria-disabled', 'true');
      } else {
        button.classList.remove('pointer-events-none', 'opacity-70');
        button.removeAttribute('aria-disabled');
      }
    });

    if (cartBar) {
      cartBar.classList.toggle('hidden', subtotal === 0);
    }

    persistCart(cartItems, storage);
  }

  function handleAddButtonClick(itemEl, quantityRows, addButton) {
    let quantitiesAdded = 0;

    quantityRows.forEach((row) => {
      const input = row.querySelector('[data-quantity-input]');
      const quantity = Number.parseInt(input?.value ?? '0', 10) || 0;
      if (quantity <= 0) {
        return;
      }

      const itemId = itemEl.dataset.itemId ?? '';
      const itemName = itemEl.dataset.itemName ?? '';
      const size = row.dataset.size ?? '';
      const unitLabel = row.dataset.unitLabel ?? '';
      const unitPrice = Number.parseFloat(row.dataset.price ?? '0');

      if (!Number.isFinite(unitPrice) || !itemId) {
        return;
      }

      addOrUpdateCartItem(cartItems, {
        itemId,
        itemName,
        size,
        unitLabel,
        unitPrice,
        quantity,
      });
      quantitiesAdded += quantity;

      if (input) {
        input.value = '0';
      }
    });

    if (quantitiesAdded === 0) {
      addButton.classList.add('animate-pulse');
      window.setTimeout(() => {
        addButton.classList.remove('animate-pulse');
      }, 400);
      return;
    }

    updateCartUI();
    addButton.classList.add('ring-2', 'ring-primary');
    window.setTimeout(() => {
      addButton.classList.remove('ring-2', 'ring-primary');
    }, 500);
  }

  hydrateCart(cartItems, storage);
  updateCartUI();

  document.querySelectorAll('[data-menu-item]').forEach((itemEl) => {
    const addButton = itemEl.querySelector('[data-add-to-cart]');
    const quantityRows = Array.from(itemEl.querySelectorAll('[data-quantity-row]'));

    quantityRows.forEach((row) => {
      const input = row.querySelector('[data-quantity-input]');
      const decreaseButton = row.querySelector('[data-quantity-decrease]');
      const increaseButton = row.querySelector('[data-quantity-increase]');

      const parseValue = () => Number.parseInt(input?.value ?? '0', 10) || 0;

      decreaseButton?.addEventListener('click', () => {
        if (!input) {
          return;
        }

        const nextValue = Math.max(0, parseValue() - 1);
        input.value = String(nextValue);
      });

      increaseButton?.addEventListener('click', () => {
        if (!input) {
          return;
        }

        const nextValue = parseValue() + 1;
        input.value = String(nextValue);
      });
    });

    if (addButton) {
      addButton.addEventListener('click', () => handleAddButtonClick(itemEl, quantityRows, addButton));
    }
  });

  return {
    cartItems,
    updateCartUI,
  };
}

export function openAdmin(windowObj) {
  const password = windowObj.prompt('Enter admin password');
  if (password === null) {
    return;
  }

  const normalizedPassword = password.trim();
  if (normalizedPassword === 'admin') {
    windowObj.location.href = 'admin-menu.html';
  } else {
    windowObj.alert('Incorrect password');
  }
}

if (typeof window !== 'undefined' && window.document) {
  window.addEventListener('DOMContentLoaded', () => {
    initializeCartPage({ window });
  });

  window.openAdmin = () => openAdmin(window);
}
