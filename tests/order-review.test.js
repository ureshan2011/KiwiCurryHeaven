import { strictEqual, ok } from 'node:assert';
import test from 'node:test';

import { initializeOrderReviewPage } from '../scripts/order-review.js';

class FakeClassList {
  constructor(initial = []) {
    this.set = new Set(initial);
  }

  add(...classes) {
    classes.forEach((cls) => this.set.add(cls));
  }

  remove(...classes) {
    classes.forEach((cls) => this.set.delete(cls));
  }

  toggle(className, force) {
    if (force === undefined) {
      if (this.set.has(className)) {
        this.set.delete(className);
        return false;
      }
      this.set.add(className);
      return true;
    }

    if (force) {
      this.set.add(className);
      return true;
    }

    this.set.delete(className);
    return false;
  }

  contains(className) {
    return this.set.has(className);
  }
}

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type).push(handler);
  }

  dispatchEvent(event) {
    const handlers = this.listeners.get(event.type) ?? [];
    handlers.forEach((handler) => handler.call(this, event));
  }
}

class FakeElement extends FakeEventTarget {
  constructor({ dataset = {}, classNames = [], textContent = '' } = {}) {
    super();
    this.dataset = { ...dataset };
    this.classList = new FakeClassList(classNames);
    this.textContent = textContent;
    this.attributes = {};
    this.children = [];
    this.named = Object.create(null);
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  querySelector(selector) {
    const namedMatch = this.named[selector];
    if (Array.isArray(namedMatch)) {
      return namedMatch[0] ?? null;
    }

    if (namedMatch) {
      return namedMatch;
    }
    for (const child of this.children) {
      const match = child.querySelector(selector);
      if (match) {
        return match;
      }
    }
    return null;
  }

  querySelectorAll(selector) {
    const results = [];
    const namedMatch = this.named[selector];
    if (Array.isArray(namedMatch)) {
      results.push(...namedMatch);
    } else if (namedMatch) {
      results.push(namedMatch);
    }
    for (const child of this.children) {
      results.push(...child.querySelectorAll(selector));
    }
    return results;
  }

  appendChild(child) {
    if (child instanceof FakeCartItemFragment) {
      const node = child.root;
      this.children.push(node);
      return node;
    }
    this.children.push(child);
    return child;
  }

  set innerHTML(_value) {
    this.children = [];
  }

  get innerHTML() {
    return '';
  }
}

class FakeCartItemFragment {
  constructor() {
    this.root = new FakeElement({ dataset: { cartItem: '' } });

    this.nameEl = new FakeElement();
    this.sizeEl = new FakeElement();
    this.priceEl = new FakeElement();
    this.quantityEl = new FakeElement();
    this.totalEl = new FakeElement();
    this.decreaseButton = new FakeElement();
    this.increaseButton = new FakeElement();
    this.removeButton = new FakeElement();

    this.root.named['[data-item-name]'] = this.nameEl;
    this.root.named['[data-item-size]'] = this.sizeEl;
    this.root.named['[data-item-unit-price]'] = this.priceEl;
    this.root.named['[data-item-quantity]'] = this.quantityEl;
    this.root.named['[data-item-total]'] = this.totalEl;
    this.root.named['[data-item-decrease]'] = this.decreaseButton;
    this.root.named['[data-item-increase]'] = this.increaseButton;
    this.root.named['[data-item-remove]'] = this.removeButton;
  }

  querySelector(selector) {
    return this.root.querySelector(selector);
  }
}

class FakeTemplate {
  constructor() {
    this.content = {
      cloneNode: () => new FakeCartItemFragment(),
    };
  }
}

class MemoryStorage {
  constructor(initial = {}) {
    this.store = new Map(Object.entries(initial));
  }

  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }

  setItem(key, value) {
    this.store.set(key, String(value));
  }

  removeItem(key) {
    this.store.delete(key);
  }
}

class FakeDocument {
  constructor(nodes) {
    this.nodes = nodes;
  }

  querySelector(selector) {
    return this.nodes[selector] ?? null;
  }
}

test('order review renders stored cart items and updates summary', () => {
  const itemsContainer = new FakeElement();
  const emptyState = new FakeElement({ classNames: ['hidden'] });
  const cartSummaryText = new FakeElement();
  const cartCount = new FakeElement({ classNames: ['hidden'] });
  const cartLink = new FakeElement();
  const subtotal = new FakeElement();
  const serviceFee = new FakeElement({ dataset: { fee: '2' }, textContent: '$2.00' });
  const total = new FakeElement();
  const placeOrder = new FakeElement({ classNames: ['pointer-events-none', 'opacity-70'] });
  placeOrder.attributes['aria-disabled'] = 'true';
  const template = new FakeTemplate();

  const document = new FakeDocument({
    '[data-cart-items]': itemsContainer,
    '[data-empty-state]': emptyState,
    '#cart-item-template': template,
    '[data-summary-subtotal]': subtotal,
    '[data-summary-total]': total,
    '[data-service-fee]': serviceFee,
    '[data-cart-count]': cartCount,
    '[data-cart-summary-text]': cartSummaryText,
    '[data-cart-link]': cartLink,
    '[data-place-order]': placeOrder,
  });

  const window = {
    document,
    localStorage: new MemoryStorage({
      'kiwi-curry-cart': JSON.stringify([
        {
          itemId: 'butter-chicken',
          itemName: 'Butter Chicken',
          size: '500ml',
          unitLabel: '500 ml',
          unitPrice: 18,
          quantity: 2,
        },
        {
          itemId: 'butter-chicken',
          itemName: 'Butter Chicken',
          size: '1l',
          unitLabel: '1 L',
          unitPrice: 32,
          quantity: 1,
        },
      ]),
    }),
    setTimeout(fn) {
      fn();
      return 1;
    },
  };

  initializeOrderReviewPage({ window });

  strictEqual(itemsContainer.children.length, 2);

  const [firstItem] = itemsContainer.children;
  strictEqual(firstItem.querySelector('[data-item-name]').textContent, 'Butter Chicken');
  ok(firstItem.querySelector('[data-item-unit-price]').textContent.startsWith('$'));
  strictEqual(firstItem.querySelector('[data-item-quantity]').textContent, '1');

  strictEqual(subtotal.textContent, '$68.00');
  strictEqual(serviceFee.textContent, '$2.00');
  strictEqual(total.textContent, '$70.00');

  strictEqual(cartCount.textContent, '3');
  ok(!cartCount.classList.contains('hidden'));

  strictEqual(cartSummaryText.textContent, 'Cart (3 items)');

  ok(!placeOrder.classList.contains('pointer-events-none'));
  ok(!placeOrder.classList.contains('opacity-70'));
  strictEqual(placeOrder.hasOwnProperty('attributes') && 'aria-disabled' in placeOrder.attributes, false);

  ok(emptyState.classList.contains('hidden'));
});

test('fulfillment selection toggles delivery address requirements', () => {
  const itemsContainer = new FakeElement();
  const emptyState = new FakeElement({ classNames: ['hidden'] });
  const cartSummaryText = new FakeElement();
  const cartCount = new FakeElement({ classNames: ['hidden'] });
  const cartLink = new FakeElement();
  const subtotal = new FakeElement();
  const serviceFee = new FakeElement({ dataset: { fee: '2' }, textContent: '$2.00' });
  const total = new FakeElement();
  const placeOrder = new FakeElement({ classNames: ['pointer-events-none', 'opacity-70'] });
  placeOrder.attributes['aria-disabled'] = 'true';
  const template = new FakeTemplate();

  const customerForm = new FakeElement();
  const pickupRadio = new FakeElement();
  pickupRadio.value = 'pickup';
  pickupRadio.checked = true;

  const deliveryRadio = new FakeElement();
  deliveryRadio.value = 'delivery';

  const addressField = new FakeElement({ classNames: ['hidden'] });
  const addressInput = new FakeElement();
  addressInput.attributes.disabled = '';

  customerForm.named['[data-fulfillment-option]'] = [pickupRadio, deliveryRadio];
  customerForm.named['[data-delivery-address-field]'] = addressField;
  customerForm.named['[data-delivery-address-input]'] = addressInput;

  const document = new FakeDocument({
    '[data-cart-items]': itemsContainer,
    '[data-empty-state]': emptyState,
    '#cart-item-template': template,
    '[data-summary-subtotal]': subtotal,
    '[data-summary-total]': total,
    '[data-service-fee]': serviceFee,
    '[data-cart-count]': cartCount,
    '[data-cart-summary-text]': cartSummaryText,
    '[data-cart-link]': cartLink,
    '[data-place-order]': placeOrder,
    '[data-customer-form]': customerForm,
  });

  const window = {
    document,
    localStorage: new MemoryStorage(),
    setTimeout(fn) {
      fn();
      return 1;
    },
  };

  initializeOrderReviewPage({ window });

  ok(addressField.classList.contains('hidden'));
  ok('disabled' in addressInput.attributes);
  ok(!('required' in addressInput.attributes));

  pickupRadio.checked = false;
  deliveryRadio.checked = true;
  deliveryRadio.dispatchEvent({ type: 'change' });

  ok(!addressField.classList.contains('hidden'));
  ok(!('disabled' in addressInput.attributes));
  strictEqual(addressInput.attributes.required, '');
  strictEqual(addressInput.attributes['aria-required'], 'true');

  deliveryRadio.checked = false;
  pickupRadio.checked = true;
  pickupRadio.dispatchEvent({ type: 'change' });

  ok(addressField.classList.contains('hidden'));
  ok('disabled' in addressInput.attributes);
  ok(!('required' in addressInput.attributes));
});
