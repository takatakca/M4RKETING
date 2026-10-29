// M4RKETING — marketing on the merchant's real Clover data.
//  - Segments from the last 180 days of Clover orders with a customer: new (first order ≤ 30 days), regular
//    (last order ≤ 30 days, not new), lapsing (31–90 days), lost (> 90 days).
//  - Discounts: Clover inventory discounts this app manages, named "M4 · …" (other discounts are never touched).
//  - Campaigns (Premium): a draft (segment + discount + message) that a person approves. Nothing is sent from here:
//    the audience export lists only customers who accepted marketing in Clover (marketingAllowed).
//  - Measure: orders that used the campaign's discount.
import crypto from 'node:crypto';
import { cloverDelete, cloverGetAll, cloverPost, mpath } from '../clover/api';
import { normalizePhone } from '../core/phone';
import { getStore } from '../core/store';

export type Segment = 'new' | 'regular' | 'lapsing' | 'lost';
export const SEGMENTS: Segment[] = ['new', 'regular', 'lapsing', 'lost'];
export const PREFIX = 'M4 · ';
const DAY = 86400_000;

export interface CustomerStat { customerId: string; first: number; last: number; orders: number; spentCents: number; segment: Segment }

export function segmentOf(first: number, last: number, now = Date.now()): Segment {
  if (now - first <= 30 * DAY) return 'new';
  if (now - last <= 30 * DAY) return 'regular';
  if (now - last <= 90 * DAY) return 'lapsing';
  return 'lost';
}

export async function customerStats(mid: string, now = Date.now()): Promise<{ ok: true; list: CustomerStat[]; discountUse: Record<string, number> } | { ok: false; error: string }> {
  const r = await cloverGetAll<any>(mid, mpath(mid, '/orders'), { filter: `createdTime>=${now - 180 * DAY}`, expand: 'customers,discounts' }, 20_000);
  if (!r.ok) return { ok: false, error: r.error ?? 'Could not read Clover orders.' };
  const by = new Map<string, Omit<CustomerStat, 'segment'>>();
  const discountUse: Record<string, number> = {};
  for (const o of r.items) {
    for (const d of (o.discounts?.elements ?? []) as any[]) if (String(d.name ?? '').startsWith(PREFIX)) discountUse[d.name] = (discountUse[d.name] ?? 0) + 1;
    const cid = o.customers?.elements?.[0]?.id;
    if (!cid || o.state === 'deleted') continue;
    const at = Number(o.createdTime) || 0;
    const x = by.get(cid) ?? { customerId: String(cid), first: at, last: at, orders: 0, spentCents: 0 };
    x.first = Math.min(x.first, at); x.last = Math.max(x.last, at); x.orders++; x.spentCents += Number(o.total) || 0;
    by.set(cid, x);
  }
  return { ok: true, list: [...by.values()].map((x) => ({ ...x, segment: segmentOf(x.first, x.last, now) })), discountUse };
}

export function segmentCounts(list: CustomerStat[]): Record<Segment, number> {
  const out = { new: 0, regular: 0, lapsing: 0, lost: 0 } as Record<Segment, number>;
  for (const c of list) out[c.segment]++;
  return out;
}

// ---- discounts ----
export async function listDiscounts(mid: string): Promise<{ ok: true; list: Array<{ id: string; name: string; amountCents: number | null; percentage: number | null }> } | { ok: false; error: string }> {
  const r = await cloverGetAll<any>(mid, mpath(mid, '/discounts'));
  if (!r.ok) return { ok: false, error: r.error ?? 'Could not read Clover discounts.' };
  return { ok: true, list: r.items.filter((d) => String(d.name ?? '').startsWith(PREFIX)).map((d) => ({ id: String(d.id), name: String(d.name), amountCents: d.amount !== undefined ? -Number(d.amount) : null, percentage: d.percentage !== undefined ? Number(d.percentage) : null })) };
}

export async function createDiscount(mid: string, input: { name?: unknown; amountCents?: unknown; percentage?: unknown }): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = String(input.name ?? '').trim().slice(0, 50);
  if (!name) return { ok: false, error: 'Name the discount.' };
  const amount = input.amountCents !== undefined && input.amountCents !== '' ? Number(input.amountCents) : null;
  const pct = input.percentage !== undefined && input.percentage !== '' ? Number(input.percentage) : null;
  if ((amount === null) === (pct === null)) return { ok: false, error: 'Give either an amount or a percentage.' };
  if (amount !== null && (!Number.isInteger(amount) || amount < 1 || amount > 50_000)) return { ok: false, error: 'Amount: 0.01 $ to 500 $.' };
  if (pct !== null && (!Number.isInteger(pct) || pct < 1 || pct > 100)) return { ok: false, error: 'Percentage: 1 to 100.' };
  const r = await cloverPost<any>(mid, mpath(mid, '/discounts'), amount !== null ? { name: `${PREFIX}${name}`, amount: -amount } : { name: `${PREFIX}${name}`, percentage: pct });
  return r.ok && r.json?.id ? { ok: true, id: String(r.json.id) } : { ok: false, error: r.error ?? 'Clover refused the discount.' };
}

export async function deleteDiscount(mid: string, id: string): Promise<{ ok: boolean; error?: string }> {
  const own = await listDiscounts(mid);
  if (!own.ok) return own;
  if (!own.list.some((d) => d.id === id)) return { ok: false, error: 'Only M4RKETING discounts can be removed here.' };
  const r = await cloverDelete(mid, mpath(mid, `/discounts/${encodeURIComponent(id)}`));
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

// ---- campaigns (Premium) ----
export interface Campaign { id: string; name: string; segment: Segment; discountName: string | null; messageFr: string; messageEn: string; status: 'draft' | 'approved'; createdAt: string; approvedBy: string | null }
export const CAMPAIGNS = 'campaigns';

export async function saveCampaign(mid: string, input: Record<string, unknown>): Promise<{ ok: true; campaign: Campaign } | { ok: false; error: string }> {
  const segment = String(input.segment ?? '') as Segment;
  if (!SEGMENTS.includes(segment)) return { ok: false, error: 'Choose a segment.' };
  const name = String(input.name ?? '').trim().slice(0, 60);
  if (!name) return { ok: false, error: 'Name the campaign.' };
  const c: Campaign = { id: crypto.randomUUID(), name, segment, discountName: input.discountName ? String(input.discountName).slice(0, 60) : null, messageFr: String(input.messageFr ?? '').slice(0, 320), messageEn: String(input.messageEn ?? '').slice(0, 320), status: 'draft', createdAt: new Date().toISOString(), approvedBy: null };
  await getStore().put(CAMPAIGNS, c.id, mid, c, c.createdAt);
  return { ok: true, campaign: c };
}

export async function approveCampaign(mid: string, id: string, by: string): Promise<boolean> {
  const d = await getStore().get<Campaign>(CAMPAIGNS, id);
  if (!d || d.merchantId !== mid || d.data.status === 'approved') return false;
  await getStore().put(CAMPAIGNS, id, mid, { ...d.data, status: 'approved', approvedBy: by.slice(0, 60) }, d.at);
  return true;
}

export async function listCampaigns(mid: string): Promise<Campaign[]> {
  return (await getStore().list<Campaign>(CAMPAIGNS, { merchantId: mid, limit: 200 })).map((d) => d.data);
}

/** Audience CSV: only customers who accepted marketing in Clover, with their phone / email. */
export async function audienceCsv(mid: string, segment: Segment): Promise<{ ok: true; csv: string; count: number } | { ok: false; error: string }> {
  const s = await customerStats(mid);
  if (!s.ok) return s;
  const ids = new Set(s.list.filter((c) => c.segment === segment).map((c) => c.customerId));
  const cust = await cloverGetAll<any>(mid, mpath(mid, '/customers'), { expand: 'phoneNumbers,emailAddresses' }, 50_000);
  if (!cust.ok) return { ok: false, error: cust.error ?? 'Could not read Clover customers.' };
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = cust.items.filter((c) => ids.has(String(c.id)) && c.marketingAllowed === true).map((c) => [
    String(c.firstName ?? ''), String(c.lastName ?? ''),
    normalizePhone(c.phoneNumbers?.elements?.[0]?.phoneNumber) ?? '', String(c.emailAddresses?.elements?.[0]?.emailAddress ?? ''),
  ]);
  return { ok: true, count: rows.length, csv: [['first_name', 'last_name', 'phone', 'email'], ...rows].map((r) => r.map(esc).join(',')).join('\n') + '\n' };
}
