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
    return Promise.all(handlers.map((handler) => handler.call(this, event)));
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
    if (this.named[selector]) {
      return this.named[selector];
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
    if (this.named[selector]) {
      results.push(this.named[selector]);
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
  strictEqual(total.textContent, '$68.00');

  strictEqual(cartCount.textContent, '3');
  ok(!cartCount.classList.contains('hidden'));

  strictEqual(cartSummaryText.textContent, 'Cart (3 items)');

  ok(!placeOrder.classList.contains('pointer-events-none'));
  ok(!placeOrder.classList.contains('opacity-70'));
  strictEqual(Object.prototype.hasOwnProperty.call(placeOrder.attributes, 'aria-disabled'), false);

  ok(emptyState.classList.contains('hidden'));
});

test('placing an order sends a confirmation email and clears the cart', async () => {
  const itemsContainer = new FakeElement();
  const emptyState = new FakeElement({ classNames: ['hidden'] });
  const cartSummaryText = new FakeElement();
  const cartCount = new FakeElement({ classNames: ['hidden'] });
  const cartLink = new FakeElement();
  const subtotal = new FakeElement();
  const total = new FakeElement();
  const placeOrder = new FakeElement({ classNames: ['pointer-events-none', 'opacity-70'], dataset: { emailEndpoint: '/api/send-order-email' } });
  placeOrder.attributes.href = 'order-confirmation.html';
  placeOrder.attributes['aria-disabled'] = 'true';
  const customerForm = new FakeElement();
  customerForm.reportValidity = () => true;
  const template = new FakeTemplate();

  const document = new FakeDocument({
    '[data-cart-items]': itemsContainer,
    '[data-empty-state]': emptyState,
    '#cart-item-template': template,
    '[data-summary-subtotal]': subtotal,
    '[data-summary-total]': total,
    '[data-cart-count]': cartCount,
    '[data-cart-summary-text]': cartSummaryText,
    '[data-cart-link]': cartLink,
    '[data-place-order]': placeOrder,
    '[data-customer-form]': customerForm,
  });

  const window = {
    document,
    location: { href: '' },
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

  const formValues = {
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: '021 123 4567',
    notes: 'No peanuts, please.',
  };

  window.FormData = class {
    constructor() {
      this.store = formValues;
    }

    get(key) {
      return this.store[key] ?? null;
    }
  };

  let fetchCall = null;
  window.fetch = (url, options) => {
    fetchCall = { url, options };
    return Promise.resolve({ ok: true });
  };

  initializeOrderReviewPage({ window });

  strictEqual(placeOrder.classList.contains('pointer-events-none'), false);

  await placeOrder.dispatchEvent({ type: 'click', preventDefault() {} });

  ok(fetchCall, 'fetch should be called to send the confirmation email');
  strictEqual(fetchCall.url, '/api/send-order-email');
  strictEqual(fetchCall.options.method, 'POST');
  strictEqual(fetchCall.options.headers['Content-Type'], 'application/json');

  const payload = JSON.parse(fetchCall.options.body);
  strictEqual(payload.customer.email, 'jane@example.com');
  strictEqual(payload.customer.name, 'Jane Doe');
  strictEqual(payload.order.items.length, 2);
  strictEqual(payload.order.totals.total, 68);
  strictEqual(payload.order.totals.formattedTotal, '$68.00');

  strictEqual(window.location.href, 'order-confirmation.html');
  strictEqual(itemsContainer.children.length, 0);
  strictEqual(cartCount.textContent, '0');
  ok(cartCount.classList.contains('hidden'));
  strictEqual(emptyState.classList.contains('hidden'), false);
  strictEqual(window.localStorage.getItem('kiwi-curry-cart'), '[]');
});
