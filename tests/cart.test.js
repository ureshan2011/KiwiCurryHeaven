import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  addOrUpdateCartItem,
  calculateCartTotals,
  createCartCollection,
  removeCartItem,
  setCartItemQuantity,
} from '../scripts/cart.js';

describe('addOrUpdateCartItem', () => {
  it('adds a new item to the collection when it does not already exist', () => {
    const cartItems = new Map();

    const added = addOrUpdateCartItem(cartItems, {
      itemId: 'potato-pea-curry',
      itemName: 'Potato & Pea Curry',
      size: '500',
      unitLabel: '500 ml',
      unitPrice: 12,
      quantity: 2,
    });

    assert.equal(cartItems.size, 1);
    assert.equal(added.quantity, 2);
    assert.deepEqual(cartItems.get('potato-pea-curry-500'), added);
  });

  it('increments the quantity for an existing cart entry with the same key', () => {
    const cartItems = new Map();

    addOrUpdateCartItem(cartItems, {
      itemId: 'spinach-lentil-curry',
      itemName: 'Spinach & Lentil Curry',
      size: '1000',
      unitLabel: '1 L',
      unitPrice: 24,
      quantity: 1,
    });

    const updated = addOrUpdateCartItem(cartItems, {
      itemId: 'spinach-lentil-curry',
      itemName: 'Spinach & Lentil Curry',
      size: '1000',
      unitLabel: '1 L',
      unitPrice: 24,
      quantity: 3,
    });

    assert.equal(cartItems.size, 1);
    assert.equal(updated.quantity, 4);
  });

  it('stores separate entries for different portion sizes', () => {
    const cartItems = new Map();

    addOrUpdateCartItem(cartItems, {
      itemId: 'cauliflower-chickpea-curry',
      itemName: 'Cauliflower & Chickpea Curry',
      size: '500',
      unitLabel: '500 ml',
      unitPrice: 13,
      quantity: 1,
    });

    addOrUpdateCartItem(cartItems, {
      itemId: 'cauliflower-chickpea-curry',
      itemName: 'Cauliflower & Chickpea Curry',
      size: '1000',
      unitLabel: '1 L',
      unitPrice: 24,
      quantity: 2,
    });

    assert.equal(cartItems.size, 2);
    assert.equal(cartItems.get('cauliflower-chickpea-curry-500').quantity, 1);
    assert.equal(cartItems.get('cauliflower-chickpea-curry-1000').quantity, 2);
  });

  it('ignores non-positive quantity updates for new entries', () => {
    const cartItems = new Map();

    const result = addOrUpdateCartItem(cartItems, {
      itemId: 'prawn-curry',
      itemName: 'Prawn Curry',
      size: '500',
      unitLabel: '500 ml',
      unitPrice: 17,
      quantity: 0,
    });

    assert.equal(result, null);
    assert.equal(cartItems.size, 0);
  });
});

describe('createCartCollection', () => {
  it('hydrates a collection from serialised cart items', () => {
    const initialItems = [
      {
        itemId: 'chefs-special',
        itemName: "Chef's Special",
        size: '1000',
        unitLabel: '1 L',
        unitPrice: 18,
        quantity: 2,
      },
      {
        itemId: 'chefs-special',
        itemName: "Chef's Special",
        size: '1000',
        unitLabel: '1 L',
        unitPrice: 18,
        quantity: 1,
      },
      // @ts-ignore - intentionally invalid entry to ensure it is skipped
      null,
    ];

    const collection = createCartCollection(initialItems);

    assert.equal(collection.size, 1);
    assert.equal(collection.get("chefs-special-1000").quantity, 3);
  });
});

describe('calculateCartTotals', () => {
  it('returns the total quantity and subtotal for valid entries', () => {
    const cartItems = new Map([
      ['potato-pea-curry-500', { quantity: 2, unitPrice: 12 }],
      ['chefs-special-1000', { quantity: 1, unitPrice: 18 }],
      // Invalid quantity should be ignored
      ['invalid-entry', { quantity: -1, unitPrice: 10 }],
    ]);

    const result = calculateCartTotals(cartItems);

    assert.equal(result.totalQuantity, 3);
    assert.equal(result.subtotal, 42);
  });
});

describe('setCartItemQuantity', () => {
  it('updates the quantity for an existing entry and persists positive values', () => {
    const cartItems = new Map([
      ['spinach-lentil-500', {
        itemId: 'spinach-lentil',
        size: '500',
        quantity: 2,
        unitPrice: 13,
      }],
    ]);

    const updated = setCartItemQuantity(cartItems, {
      itemId: 'spinach-lentil',
      size: '500',
      quantity: 5,
    });

    assert.equal(updated.quantity, 5);
    assert.equal(cartItems.get('spinach-lentil-500').quantity, 5);
  });

  it('removes items when the new quantity is zero or negative', () => {
    const cartItems = new Map([
      ['chefs-special-1000', {
        itemId: 'chefs-special',
        size: '1000',
        quantity: 2,
        unitPrice: 18,
      }],
    ]);

    const result = setCartItemQuantity(cartItems, {
      itemId: 'chefs-special',
      size: '1000',
      quantity: 0,
    });

    assert.equal(result, null);
    assert.equal(cartItems.size, 0);
  });
});

describe('removeCartItem', () => {
  it('deletes the matching cart entry', () => {
    const cartItems = new Map([
      ['tikka-masala-500', {
        itemId: 'tikka-masala',
        size: '500',
        quantity: 1,
        unitPrice: 12,
      }],
    ]);

    removeCartItem(cartItems, { itemId: 'tikka-masala', size: '500' });

    assert.equal(cartItems.has('tikka-masala-500'), false);
  });
});
