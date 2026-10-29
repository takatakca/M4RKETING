// The merchant's real Clover menu (categories, items, modifier groups, tax rates) and orders built from it.
// Used by the register (C4ISSE) and the kiosk (T4CTILE); any suite app may read it.
//   Clover: GET items?expand=categories,modifierGroups,taxRates · GET modifier_groups?expand=modifiers
//           POST atomic_order/orders { orderCart: { lineItems: [{ item: { id }, modifications: [{ modifier: { id } }] }] } }
//   Tax rates: Clover `rate` is a percentage × 100 000 (5 % = 500000, 9.975 % = 997500).
import { cloverGetAll, cloverPost, mpath } from './api';

export interface MenuModifier { id: string; name: string; priceCents: number; available: boolean }
export interface MenuGroup { id: string; name: string; min: number; max: number | null; modifiers: MenuModifier[] }
export interface MenuItem { id: string; name: string; priceCents: number; priceType: string; taxPct: number; available: boolean; categoryIds: string[]; groups: MenuGroup[]; sku: string | null }
export interface MenuCategory { id: string; name: string; sortOrder: number; itemIds: string[] }
export interface Menu { categories: MenuCategory[]; items: Record<string, MenuItem>; readAt: string }

const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; menu: Menu }>();

export const taxPctFromRate = (rate: unknown) => (Number(rate) || 0) / 100_000;

export async function readMenu(merchantId: string, opts: { fresh?: boolean } = {}): Promise<{ ok: true; menu: Menu } | { ok: false; error: string }> {
  const hit = cache.get(merchantId);
  if (hit && !opts.fresh && Date.now() - hit.at < CACHE_MS) return { ok: true, menu: hit.menu };
  const [items, groups, cats] = await Promise.all([
    cloverGetAll<any>(merchantId, mpath(merchantId, '/items'), { expand: 'categories,modifierGroups,taxRates' }),
    cloverGetAll<any>(merchantId, mpath(merchantId, '/modifier_groups'), { expand: 'modifiers' }),
    cloverGetAll<any>(merchantId, mpath(merchantId, '/categories')),
  ]);
  if (!items.ok) return { ok: false, error: items.error ?? 'Could not read the Clover items.' };
  const groupById = new Map<string, MenuGroup>();
  for (const g of groups.items) {
    groupById.set(String(g.id), {
      id: String(g.id), name: String(g.name ?? ''), min: Number(g.minRequired ?? 0) || 0, max: g.maxAllowed ? Number(g.maxAllowed) : null,
      modifiers: (g.modifiers?.elements ?? []).map((m: any) => ({ id: String(m.id), name: String(m.name ?? ''), priceCents: Number(m.price ?? 0) || 0, available: m.available !== false })),
    });
  }
  const menuItems: Record<string, MenuItem> = {};
  for (const it of items.items) {
    if (it.hidden || it.isRevenue === false) continue;
    const taxes = (it.taxRates?.elements ?? []) as any[];
    menuItems[String(it.id)] = {
      id: String(it.id), name: String(it.name ?? ''), priceCents: Number(it.price ?? 0) || 0, priceType: String(it.priceType ?? 'FIXED'),
      taxPct: taxes.reduce((s, t) => s + taxPctFromRate(t.rate), 0), available: it.available !== false,
      categoryIds: (it.categories?.elements ?? []).map((c: any) => String(c.id)),
      groups: (it.modifierGroups?.elements ?? []).map((g: any) => groupById.get(String(g.id))).filter(Boolean) as MenuGroup[],
      sku: it.sku ? String(it.sku) : null,
    };
  }
  const categories: MenuCategory[] = cats.items.map((c: any) => ({
    id: String(c.id), name: String(c.name ?? ''), sortOrder: Number(c.sortOrder ?? 0) || 0,
    itemIds: Object.values(menuItems).filter((i) => i.categoryIds.includes(String(c.id))).map((i) => i.id),
  })).filter((c) => c.itemIds.length).sort((a, b) => a.sortOrder - b.sortOrder);
  const menu: Menu = { categories, items: menuItems, readAt: new Date().toISOString() };
  cache.set(merchantId, { at: Date.now(), menu });
  return { ok: true, menu };
}

export interface CartLine { itemId: string; quantity: number; modifierIds?: string[]; note?: string }

/** Every line must be a real, available item; options must belong to its groups and respect each group's min/max. */
export function validateCart(menu: Menu, lines: CartLine[]): { ok: true; subtotalCents: number; taxCents: number } | { ok: false; error: string } {
  if (!Array.isArray(lines) || !lines.length) return { ok: false, error: 'The cart is empty.' };
  if (lines.length > 60) return { ok: false, error: 'Too many lines.' };
  let subtotal = 0; let tax = 0;
  for (const [i, l] of lines.entries()) {
    const item = menu.items[String(l?.itemId)];
    if (!item) return { ok: false, error: `Line ${i + 1}: unknown item.` };
    if (!item.available) return { ok: false, error: `${item.name} is not available.` };
    if (item.priceType === 'VARIABLE') return { ok: false, error: `${item.name} has a variable price: ring it at the register.` };
    const q = Number(l.quantity);
    if (!Number.isInteger(q) || q < 1 || q > 50) return { ok: false, error: `${item.name}: quantity must be 1 to 50.` };
    const mods = [...new Set((l.modifierIds ?? []).map(String))];
    let unit = item.priceCents;
    for (const g of item.groups) {
      const chosen = g.modifiers.filter((m) => mods.includes(m.id));
      if (chosen.length < g.min) return { ok: false, error: `${item.name}: choose at least ${g.min} in “${g.name}”.` };
      if (g.max !== null && chosen.length > g.max) return { ok: false, error: `${item.name}: at most ${g.max} in “${g.name}”.` };
      if (chosen.some((m) => !m.available)) return { ok: false, error: `${item.name}: an option is not available.` };
      unit += chosen.reduce((s, m) => s + m.priceCents, 0);
    }
    const known = new Set(item.groups.flatMap((g) => g.modifiers.map((m) => m.id)));
    if (mods.some((m) => !known.has(m))) return { ok: false, error: `${item.name}: an option does not belong to this item.` };
    subtotal += unit * q;
    tax += Math.round((unit * q * item.taxPct) / 100);
  }
  return { ok: true, subtotalCents: subtotal, taxCents: tax };
}

/** Create the order in Clover (Clover computes the real taxes and total). One line item per unit, as Clover expects. */
export async function createCloverOrder(merchantId: string, lines: CartLine[], opts: { title?: string; note?: string; orderTypeId?: string | null } = {}): Promise<{ ok: true; orderId: string; totalCents: number | null } | { ok: false; error: string }> {
  const lineItems = lines.flatMap((l) => Array.from({ length: Number(l.quantity) }, () => ({
    item: { id: l.itemId },
    ...(l.modifierIds?.length ? { modifications: [...new Set(l.modifierIds)].map((id) => ({ modifier: { id } })) } : {}),
    ...(l.note ? { note: String(l.note).slice(0, 120) } : {}),
  })));
  const r = await cloverPost<any>(merchantId, mpath(merchantId, '/atomic_order/orders'), {
    orderCart: { lineItems, ...(opts.title ? { title: opts.title.slice(0, 120) } : {}), ...(opts.note ? { note: opts.note.slice(0, 255) } : {}), ...(opts.orderTypeId ? { orderType: { id: opts.orderTypeId } } : {}) },
  });
  if (!r.ok || !r.json?.id) return { ok: false, error: r.error ?? 'Clover did not return an order id.' };
  return { ok: true, orderId: String(r.json.id), totalCents: Number.isFinite(Number(r.json.total)) ? Number(r.json.total) : null };
}

/** Print the order on the merchant's order printer (kitchen ticket). */
export async function printOrder(merchantId: string, orderId: string): Promise<boolean> {
  return (await cloverPost(merchantId, mpath(merchantId, '/print_event'), { orderRef: { id: orderId } })).ok;
}

/** Tests: forget cached menus. */
export const clearMenuCache = () => cache.clear();
