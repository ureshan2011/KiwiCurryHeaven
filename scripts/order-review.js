import {
  createPersistentCart,
  removeCartItem,
  setCartItemQuantity,
} from './cart.js';

function formatCurrency(value) {
  return new Intl.NumberFormat('en-NZ', {
    style: 'currency',
    currency: 'NZD',
  }).format(value);
}

function calculateCartTotals(cartItems) {
  let subtotal = 0;
  let totalQuantity = 0;

  if (!cartItems || typeof cartItems.forEach !== 'function') {
    return { subtotal: 0, totalQuantity: 0 };
  }

  cartItems.forEach((item) => {
    const quantityNumber = Number(item?.quantity) || 0;
    const unitPriceNumber = Number(item?.unitPrice) || 0;

    if (!Number.isFinite(quantityNumber) || quantityNumber <= 0) {
      return;
    }

    if (!Number.isFinite(unitPriceNumber) || unitPriceNumber < 0) {
      return;
    }

    totalQuantity += quantityNumber;
    subtotal += quantityNumber * unitPriceNumber;
  });

  return { subtotal, totalQuantity };
}

export function initializeOrderReviewPage({ window }) {
  if (!window || !window.document) {
    throw new TypeError('A window with a document is required to initialise the order review page');
  }

  const { cartItems, persist } = createPersistentCart(window);
  const { document } = window;

  const itemsContainer = document.querySelector('[data-cart-items]');
  const emptyState = document.querySelector('[data-empty-state]');
  const cartItemTemplate = document.querySelector('#cart-item-template');
  const subtotalElement = document.querySelector('[data-summary-subtotal]');
  const totalElement = document.querySelector('[data-summary-total]');
  const cartBadge = document.querySelector('[data-cart-count]');
  const cartSummaryText = document.querySelector('[data-cart-summary-text]');
  const cartLink = document.querySelector('[data-cart-link]');
  const placeOrderButton = document.querySelector('[data-place-order]');
  const customerForm = document.querySelector('[data-customer-form]');

  function setPlaceOrderDisabled(disabled) {
    if (!placeOrderButton) {
      return;
    }

    placeOrderButton.classList.toggle('pointer-events-none', disabled);
    placeOrderButton.classList.toggle('opacity-70', disabled);

    if (disabled) {
      placeOrderButton.setAttribute('aria-disabled', 'true');
    } else {
      placeOrderButton.removeAttribute('aria-disabled');
    }

    if ('disabled' in placeOrderButton) {
      placeOrderButton.disabled = disabled;
    }
  }

  function updateSummary() {
    const { totalQuantity, subtotal } = calculateCartTotals(cartItems);
    const total = subtotal;

    if (cartBadge) {
      cartBadge.textContent = String(totalQuantity);
      cartBadge.classList.toggle('hidden', totalQuantity === 0);
    }

    const summaryLabel = totalQuantity === 0
      ? 'Cart (empty)'
      : `Cart (${totalQuantity} ${totalQuantity === 1 ? 'item' : 'items'})`;

    if (cartSummaryText) {
      cartSummaryText.textContent = summaryLabel;
    }

    if (cartLink) {
      cartLink.setAttribute('aria-label', summaryLabel);
    }

    if (subtotalElement) {
      subtotalElement.textContent = formatCurrency(subtotal);
    }

    if (totalElement) {
      totalElement.textContent = formatCurrency(total);
    }

    setPlaceOrderDisabled(totalQuantity === 0);

    if (emptyState) {
      emptyState.classList.toggle('hidden', totalQuantity > 0);
    }
  }

  function renderCartItems() {
    if (!itemsContainer || !cartItemTemplate) {
      return;
    }

    itemsContainer.innerHTML = '';

    const items = Array.from(cartItems.values());
    if (items.length === 0) {
      updateSummary();
      return;
    }

    items.sort((a, b) => {
      const nameComparison = (a.itemName ?? '').localeCompare(b.itemName ?? '');
      if (nameComparison !== 0) {
        return nameComparison;
      }
      return String(a.unitLabel ?? a.size ?? '').localeCompare(String(b.unitLabel ?? b.size ?? ''));
    });

    items.forEach((item) => {
      const fragment = cartItemTemplate.content.cloneNode(true);
      const nameEl = fragment.querySelector('[data-item-name]');
      const sizeEl = fragment.querySelector('[data-item-size]');
      const priceEl = fragment.querySelector('[data-item-unit-price]');
      const quantityEl = fragment.querySelector('[data-item-quantity]');
      const totalEl = fragment.querySelector('[data-item-total]');
      const decreaseButton = fragment.querySelector('[data-item-decrease]');
      const increaseButton = fragment.querySelector('[data-item-increase]');
      const removeButton = fragment.querySelector('[data-item-remove]');

      const unitLabel = item.unitLabel || (item.size ? `${item.size}` : 'each');

      if (nameEl) {
        nameEl.textContent = item.itemName || 'Menu item';
      }

      if (sizeEl) {
        sizeEl.textContent = unitLabel ? `(${unitLabel})` : '';
      }

      if (priceEl) {
        priceEl.textContent = `${formatCurrency(item.unitPrice)} each`;
      }

      if (quantityEl) {
        quantityEl.textContent = String(item.quantity);
      }

      if (totalEl) {
        totalEl.textContent = formatCurrency(item.unitPrice * item.quantity);
      }

      const updateQuantity = (nextQuantity) => {
        setCartItemQuantity(cartItems, {
          itemId: item.itemId,
          size: item.size,
          quantity: nextQuantity,
        });
        persist();
        renderCartItems();
        updateSummary();
      };

      decreaseButton?.addEventListener('click', () => {
        updateQuantity(Number(item.quantity) - 1);
      });

      increaseButton?.addEventListener('click', () => {
        updateQuantity(Number(item.quantity) + 1);
      });

      removeButton?.addEventListener('click', () => {
        removeCartItem(cartItems, { itemId: item.itemId, size: item.size });
        persist();
        renderCartItems();
        updateSummary();
      });

      itemsContainer.appendChild(fragment);
    });

    updateSummary();
  }

  function getCustomerDetails() {
    if (!customerForm || typeof window.FormData !== 'function') {
      return {
        name: '',
        email: '',
        phone: '',
        notes: '',
      };
    }

    const formData = new window.FormData(customerForm);
    const getValue = (key) => {
      const rawValue = formData.get(key);
      return typeof rawValue === 'string' ? rawValue.trim() : '';
    };

    return {
      name: getValue('name'),
      email: getValue('email'),
      phone: getValue('phone'),
      notes: getValue('notes'),
    };
  }

  function buildOrderDetails() {
    const items = Array.from(cartItems.values()).map((item) => {
      const lineTotal = Number(item.unitPrice) * Number(item.quantity);
      return {
        id: item.itemId,
        name: item.itemName,
        unit: item.unitLabel || item.size || 'each',
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        formattedUnitPrice: formatCurrency(item.unitPrice),
        lineTotal,
        formattedLineTotal: formatCurrency(lineTotal),
      };
    });

    const { subtotal, totalQuantity } = calculateCartTotals(cartItems);
    const total = subtotal;

    return {
      items,
      totals: {
        subtotal,
        total,
        formattedSubtotal: formatCurrency(subtotal),
        formattedTotal: formatCurrency(total),
      },
      totalQuantity,
    };
  }

  async function sendConfirmationEmail(payload) {
    if (!placeOrderButton) {
      return;
    }

    if (typeof window.fetch !== 'function') {
      console.warn('Fetch API is not available; unable to send confirmation email.');
      return;
    }

    const endpoint = placeOrderButton.dataset.emailEndpoint || '/api/send-order-email';

    const response = await window.fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Failed to send order confirmation email (status ${response.status})`);
    }
  }

  async function handlePlaceOrder(event) {
    if (event?.preventDefault) {
      event.preventDefault();
    }

    if (!placeOrderButton || placeOrderButton.classList.contains('pointer-events-none')) {
      return;
    }

    if (customerForm?.reportValidity && !customerForm.reportValidity()) {
      return;
    }

    const orderDetails = buildOrderDetails();
    if (!orderDetails.items.length || orderDetails.totals.total <= 0) {
      return;
    }

    const customer = getCustomerDetails();
    if (!customer.email) {
      console.warn('An email address is required to send the confirmation email.');
      return;
    }

    setPlaceOrderDisabled(true);

    try {
      await sendConfirmationEmail({
        customer,
        order: orderDetails,
      });

      cartItems.clear();
      persist();
      renderCartItems();

      const confirmationUrl = placeOrderButton.getAttribute('href') || placeOrderButton.dataset.confirmationUrl || 'order-confirmation.html';
      if (typeof window.setTimeout === 'function') {
        window.setTimeout(() => {
          window.location.href = confirmationUrl;
        }, 0);
      } else {
        window.location.href = confirmationUrl;
      }
    } catch (error) {
      console.error('Failed to send order confirmation email', error);
      updateSummary();
    }
  }

  placeOrderButton?.addEventListener('click', handlePlaceOrder);

  renderCartItems();
  updateSummary();
}

if (typeof window !== 'undefined' && window.document) {
  window.addEventListener('DOMContentLoaded', () => {
    if (window.document.querySelector('[data-order-review-page]')) {
      initializeOrderReviewPage({ window });
    }
  });
}

