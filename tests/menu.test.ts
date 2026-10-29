// Shared Clover menu: reading the real menu, checking a cart, creating the Clover order.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCloverOrder, readMenu, validateCart } from '@/lib/clover/menu';
import { connect, fakeClover, MID } from './helpers';

const ITEMS = { elements: [
  { id: 'ITEMPOUTINE1', name: 'Poutine', price: 1099, priceType: 'FIXED', categories: { elements: [{ id: 'CATMAIN00001' }] }, modifierGroups: { elements: [{ id: 'GRPSIZE00001' }] }, taxRates: { elements: [{ rate: 500000 }, { rate: 997500 }] } },
  { id: 'ITEMSODA0001', name: 'Soda', price: 250, priceType: 'FIXED', categories: { elements: [{ id: 'CATMAIN00001' }] }, taxRates: { elements: [{ rate: 500000 }, { rate: 997500 }] } },
  { id: 'ITEMHIDDEN01', name: 'Secret', price: 1, hidden: true },
  { id: 'ITEMOPEN0001', name: 'Open price', price: 0, priceType: 'VARIABLE' },
] };
const GROUPS = { elements: [{ id: 'GRPSIZE00001', name: 'Taille', minRequired: 1, maxAllowed: 1, modifiers: { elements: [{ id: 'MODLARGE0001', name: 'Grande', price: 300 }, { id: 'MODSMALL0001', name: 'Petite', price: 0 }] } }] };

let calls: ReturnType<typeof fakeClover>;
beforeEach(async () => {
  calls = fakeClover([(u) => u.pathname.endsWith('/items') ? ITEMS : u.pathname.endsWith('/modifier_groups') ? GROUPS : u.pathname.endsWith('/categories') ? { elements: [{ id: 'CATMAIN00001', name: 'Menu', sortOrder: 1 }] }
    : u.pathname.endsWith('/atomic_order/orders') ? { id: 'ORDER0000001', total: 1460 } : undefined]);
  await connect();
});
afterEach(() => vi.unstubAllGlobals());

describe('Clover menu', () => {
  it('reads items, groups and taxes; hides hidden items', async () => {
    const m = await readMenu(MID);
    if (!m.ok) throw new Error(m.error);
    expect(Object.keys(m.menu.items).sort()).toEqual(['ITEMOPEN0001', 'ITEMPOUTINE1', 'ITEMSODA0001']);
    expect(m.menu.items.ITEMPOUTINE1.taxPct).toBeCloseTo(14.975);
    expect(m.menu.items.ITEMPOUTINE1.groups[0].modifiers).toHaveLength(2);
    expect(m.menu.categories[0].itemIds).toContain('ITEMSODA0001');
  });

  it('checks every line against the real menu', async () => {
    const m = await readMenu(MID);
    if (!m.ok) throw new Error(m.error);
    expect(validateCart(m.menu, [])).toMatchObject({ ok: false });
    expect(validateCart(m.menu, [{ itemId: 'NOPE', quantity: 1 }])).toMatchObject({ ok: false });
    expect(validateCart(m.menu, [{ itemId: 'ITEMPOUTINE1', quantity: 1 }])).toMatchObject({ ok: false, error: expect.stringMatching(/at least 1/) });
    expect(validateCart(m.menu, [{ itemId: 'ITEMPOUTINE1', quantity: 1, modifierIds: ['MODLARGE0001', 'MODSMALL0001'] }])).toMatchObject({ ok: false, error: expect.stringMatching(/at most 1/) });
    expect(validateCart(m.menu, [{ itemId: 'ITEMSODA0001', quantity: 1, modifierIds: ['MODLARGE0001'] }])).toMatchObject({ ok: false });
    expect(validateCart(m.menu, [{ itemId: 'ITEMOPEN0001', quantity: 1 }])).toMatchObject({ ok: false });
    expect(validateCart(m.menu, [{ itemId: 'ITEMSODA0001', quantity: 0 }])).toMatchObject({ ok: false });
    expect(validateCart(m.menu, [{ itemId: 'ITEMPOUTINE1', quantity: 1, modifierIds: ['MODLARGE0001'] }, { itemId: 'ITEMSODA0001', quantity: 2 }]))
      .toEqual({ ok: true, subtotalCents: 1399 + 500, taxCents: Math.round(1399 * 0.14975) + Math.round(500 * 0.14975) });
  });

  it('creates the Clover order with one line item per unit', async () => {
    const r = await createCloverOrder(MID, [{ itemId: 'ITEMSODA0001', quantity: 2 }, { itemId: 'ITEMPOUTINE1', quantity: 1, modifierIds: ['MODLARGE0001'] }], { title: 'Test' });
    expect(r).toEqual({ ok: true, orderId: 'ORDER0000001', totalCents: 1460 });
    const body = calls.find((c) => c.path.endsWith('/atomic_order/orders'))!.body;
    expect(body.orderCart.lineItems).toHaveLength(3);
    expect(body.orderCart.lineItems[2]).toEqual({ item: { id: 'ITEMPOUTINE1' }, modifications: [{ modifier: { id: 'MODLARGE0001' } }] });
    expect(body.orderCart.title).toBe('Test');
  });
});
