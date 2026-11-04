// Campaign preparation, human approval and export. This module never sends a message or publishes a promotion.
// Approval binds the exact content, segment and live Clover discount; exports re-read the current consent.
import crypto from 'node:crypto';
import { Pool } from 'pg';
import { cloverGet, mpath } from '../clover/api';
import { normalizePhone } from '../core/phone';
import { getStore } from '../core/store';
import { PREFIX, SEGMENTS, segmentOf, type Segment } from './marketing';

export const CAMPAIGNS = 'campaigns';
export interface Campaign {
  id: string; name: string; segment: Segment; discountName: string | null; discountId?: string | null;
  messageFr: string; messageEn: string; status: 'draft' | 'approved'; createdAt: string; approvedBy: string | null;
  revision?: number; approvedAt?: string | null; approvalHash?: string | null;
  approvedSnapshot?: CampaignSnapshot | null;
}
export interface CampaignDiscount { id: string; name: string; amountCents: number | null; percentage: number | null }
export interface CampaignSnapshot { campaignId: string; revision: number; name: string; segment: Segment; messageFr: string; messageEn: string; discount: CampaignDiscount | null }
type Failure = { ok: false; error: string; code: string; status: number };
type Result<T> = ({ ok: true } & T) | Failure;
const no = (code: string, error: string, status = 400): Failure => ({ ok: false, code, error, status });
const revision = (c: Campaign) => Number.isSafeInteger(c.revision) && c.revision! > 0 ? c.revision! : 1;

// Bound both scans and failure semantics: a malformed response or an incomplete audience is never a known empty list.
async function readList(mid: string, kind: 'orders' | 'customers' | 'discounts', query: Record<string, string> = {}): Promise<Result<{ items: any[] }>> {
  const max = kind === 'customers' ? 50_000 : kind === 'orders' ? 20_000 : 10_000;
  const items: any[] = [];
  for (let offset = 0; offset <= max; offset += 1000) {
    const r = await cloverGet<{ elements?: unknown }>(mid, mpath(mid, `/${kind}`), { ...query, limit: offset === max ? 1 : 1000, offset });
    if (!r.ok || !r.json || !Array.isArray(r.json.elements)) return no('clover_unavailable', 'Clover data could not be verified. Check the connection and try again.', 502);
    if (offset === max && r.json.elements.length) return no('audience_limit', 'This audience exceeds the supported scan limit. Narrow it before exporting.', 422);
    items.push(...r.json.elements);
    if (r.json.elements.length < 1000) return { ok: true, items };
  }
  return { ok: true, items };
}

async function currentDiscount(mid: string, input: { discountId?: unknown; discountName?: unknown }): Promise<Result<{ discount: CampaignDiscount | null }>> {
  const id = input.discountId == null ? '' : typeof input.discountId === 'string' ? input.discountId.trim() : null;
  const name = input.discountName == null ? '' : typeof input.discountName === 'string' ? input.discountName.trim() : null;
  if (id === null || name === null || id.length > 100 || name.length > 100) return no('invalid_discount', 'Choose a M4RKETING discount from this merchant.');
  if (!id && !name) return { ok: true, discount: null };
  const read = await readList(mid, 'discounts');
  if (!read.ok) return read;
  const matches = read.items.filter((d) => d && typeof d.id === 'string' && typeof d.name === 'string' && d.name.startsWith(PREFIX) && (id ? d.id === id : d.name === name));
  if (matches.length !== 1) return no('discount_unavailable', 'The selected M4RKETING discount is missing or ambiguous. Choose a current discount.', 409);
  const d = matches[0];
  const amountCents = Number.isSafeInteger(d.amount) && d.amount < 0 ? -d.amount : null;
  const percentage = Number.isSafeInteger(d.percentage) && d.percentage > 0 && d.percentage <= 100 ? d.percentage : null;
  if ((amountCents === null) === (percentage === null)) return no('invalid_discount', 'The current Clover discount value could not be verified.', 502);
  return { ok: true, discount: { id: d.id, name: d.name, amountCents, percentage } };
}

async function ownedCampaign(mid: string, id: string): Promise<Campaign | null> {
  if (!id || id.length > 100) return null;
  const d = await getStore().get<Campaign>(CAMPAIGNS, id);
  return d?.merchantId === mid && d.data?.id === id ? d.data : null;
}

let campaignPool: Pool | undefined;
let campaignPoolUrl: string | undefined;
const memoryLocks = new Map<string, Promise<unknown>>();
/** Optimistic update prevents an old preview/approval from overwriting a concurrent edit, including across servers. */
async function replaceCampaign(mid: string, previous: Campaign, next: Campaign): Promise<boolean> {
  const store = getStore();
  if (store.mode === 'postgres') {
    const url = process.env.DATABASE_URL!;
    if (!campaignPool || campaignPoolUrl !== url) {
      if (campaignPool) await campaignPool.end();
      campaignPool = new Pool({ connectionString: url, max: 2, allowExitOnIdle: true }); campaignPoolUrl = url;
    }
    const r = await campaignPool.query('UPDATE app_docs SET data = $1::jsonb, updated_at = now() WHERE collection = $2 AND id = $3 AND merchant_id = $4 AND data = $5::jsonb',
      [JSON.stringify(next), CAMPAIGNS, previous.id, mid, JSON.stringify(previous)]);
    return r.rowCount === 1;
  }
  const key = `${mid}:${previous.id}`;
  const before = memoryLocks.get(key) ?? Promise.resolve();
  const work = before.catch(() => undefined).then(async () => {
    const current = await ownedCampaign(mid, previous.id);
    if (!current || JSON.stringify(current) !== JSON.stringify(previous)) return false;
    await store.put(CAMPAIGNS, next.id, mid, next, next.createdAt);
    return true;
  });
  memoryLocks.set(key, work);
  try { return await work; } finally { if (memoryLocks.get(key) === work) memoryLocks.delete(key); }
}

async function content(mid: string, input: Record<string, unknown>): Promise<Result<{ fields: Pick<Campaign, 'name' | 'segment' | 'discountId' | 'discountName' | 'messageFr' | 'messageEn'> }>> {
  const text = (v: unknown, max: number) => typeof v === 'string' && v.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v) ? v.trim() : null;
  const name = text(input.name, 60); const segment = input.segment as Segment;
  const messageFr = text(input.messageFr ?? '', 320); const messageEn = text(input.messageEn ?? '', 320);
  if (!name) return no('invalid_name', 'Name the campaign using 1 to 60 characters.');
  if (!SEGMENTS.includes(segment)) return no('invalid_segment', 'Choose a segment.');
  if (messageFr === null || messageEn === null) return no('invalid_message', 'Each message must contain no more than 320 characters.');
  const d = await currentDiscount(mid, input); if (!d.ok) return d;
  return { ok: true, fields: { name, segment, messageFr, messageEn, discountId: d.discount?.id ?? null, discountName: d.discount?.name ?? null } };
}

export async function saveCampaign(mid: string, input: Record<string, unknown>): Promise<Result<{ campaign: Campaign }>> {
  const checked = await content(mid, input); if (!checked.ok) return checked;
  const campaign: Campaign = { id: crypto.randomUUID(), ...checked.fields, status: 'draft', createdAt: new Date().toISOString(), approvedBy: null, revision: 1, approvedAt: null, approvalHash: null, approvedSnapshot: null };
  await getStore().put(CAMPAIGNS, campaign.id, mid, campaign, campaign.createdAt);
  return { ok: true, campaign };
}

export async function updateCampaign(mid: string, id: string, input: Record<string, unknown>): Promise<Result<{ campaign: Campaign }>> {
  const previous = await ownedCampaign(mid, id); if (!previous) return no('campaign_not_found', 'Campaign not found.', 404);
  if (input.revision !== revision(previous)) return no('campaign_changed', 'This campaign changed. Reload it before editing.', 409);
  const checked = await content(mid, input); if (!checked.ok) return checked;
  const changed = Object.entries(checked.fields).some(([key, value]) => previous[key as keyof Campaign] !== value);
  if (!changed) return { ok: true, campaign: previous };
  const campaign: Campaign = { ...previous, ...checked.fields, revision: revision(previous) + 1, status: 'draft', approvedBy: null, approvedAt: null, approvalHash: null, approvedSnapshot: null };
  if (!await replaceCampaign(mid, previous, campaign)) return no('campaign_changed', 'This campaign changed. Reload it before editing.', 409);
  return { ok: true, campaign };
}

interface Audience { segmentCount: number; rows: string[][] }
async function currentAudience(mid: string, segment: Segment, now = Date.now()): Promise<Result<{ audience: Audience }>> {
  const orders = await readList(mid, 'orders', { filter: `createdTime>=${now - 180 * 86400_000}`, expand: 'customers' });
  if (!orders.ok) return orders;
  const stats = new Map<string, { first: number; last: number }>();
  for (const order of orders.items) {
    if (!order || order.state === 'deleted') continue;
    const id = order.customers?.elements?.[0]?.id; const at = Number(order.createdTime);
    if (typeof id !== 'string' || !Number.isFinite(at) || at <= 0 || at > now) continue;
    const previous = stats.get(id); stats.set(id, { first: Math.min(previous?.first ?? at, at), last: Math.max(previous?.last ?? at, at) });
  }
  const ids = new Set([...stats].filter(([, s]) => segmentOf(s.first, s.last, now) === segment).map(([id]) => id));
  const customers = await readList(mid, 'customers', { expand: 'phoneNumbers,emailAddresses' });
  if (!customers.ok) return customers;
  const rows: string[][] = []; const included = new Set<string>();
  for (const c of customers.items) {
    if (!c || typeof c.id !== 'string' || !ids.has(c.id) || included.has(c.id) || c.marketingAllowed !== true) continue;
    const phone = (Array.isArray(c.phoneNumbers?.elements) ? c.phoneNumbers.elements : []).map((p: any) => normalizePhone(p?.phoneNumber)).find(Boolean) ?? '';
    const email = (Array.isArray(c.emailAddresses?.elements) ? c.emailAddresses.elements : []).map((p: any) => p?.emailAddress)
      .find((v: unknown) => typeof v === 'string' && v.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v)) ?? '';
    if (!phone && !email) continue;
    included.add(c.id);
    rows.push([String(c.firstName ?? '').slice(0, 200), String(c.lastName ?? '').slice(0, 200), phone, email]);
  }
  return { ok: true, audience: { segmentCount: ids.size, rows } };
}

const snapshot = (c: Campaign, discount: CampaignDiscount | null): CampaignSnapshot => ({ campaignId: c.id, revision: revision(c), name: c.name, segment: c.segment, messageFr: c.messageFr, messageEn: c.messageEn, discount });
// PostgreSQL JSONB reorders keys; a persisted snapshot must hash identically after a server restart.
const hashSnapshot = (value: CampaignSnapshot) => crypto.createHash('sha256').update(JSON.stringify({
  campaignId: value.campaignId, revision: value.revision, name: value.name, segment: value.segment, messageFr: value.messageFr, messageEn: value.messageEn,
  discount: value.discount ? { id: value.discount.id, name: value.discount.name, amountCents: value.discount.amountCents, percentage: value.discount.percentage } : null,
})).digest('hex');
const configurationHash = (c: Campaign, discount: CampaignDiscount | null) => hashSnapshot(snapshot(c, discount));
const approvedVersion = (c: Campaign, hash: string) => c.status === 'approved' && c.approvalHash === hash && !!c.approvedSnapshot && hashSnapshot(c.approvedSnapshot) === hash;
export interface CampaignPreview { campaign: Campaign; discount: CampaignDiscount | null; configurationHash: string; audience: { segmentCount: number; consentedCount: number }; approved: boolean; canApprove: boolean; problems: string[] }
async function reviewContent(mid: string, c: Campaign): Promise<Result<{ discount: CampaignDiscount | null; configurationHash: string }>> {
  const checked = await currentDiscount(mid, c); if (!checked.ok) return checked;
  return { ok: true, discount: checked.discount, configurationHash: configurationHash(c, checked.discount) };
}
export async function previewCampaign(mid: string, id: string): Promise<Result<{ preview: CampaignPreview }>> {
  const c = await ownedCampaign(mid, id); if (!c) return no('campaign_not_found', 'Campaign not found.', 404);
  const checked = await reviewContent(mid, c); if (!checked.ok) return checked;
  const a = await currentAudience(mid, c.segment); if (!a.ok) return a;
  const problems = !c.messageFr.trim() && !c.messageEn.trim() ? ['Add a French or English campaign message before approval.'] : [];
  return { ok: true, preview: { campaign: c, discount: checked.discount, configurationHash: checked.configurationHash,
    audience: { segmentCount: a.audience.segmentCount, consentedCount: a.audience.rows.length }, approved: approvedVersion(c, checked.configurationHash),
    canApprove: problems.length === 0, problems } };
}

export async function approveCampaign(mid: string, id: string, by: string, previewHash: unknown): Promise<Result<{ campaign: Campaign }>> {
  if (typeof previewHash !== 'string' || !/^[a-f0-9]{64}$/.test(previewHash)) return no('preview_required', 'Review this campaign before approving it.', 409);
  const read = await previewCampaign(mid, id); if (!read.ok) return read;
  const p = read.preview;
  if (!p.canApprove) return no('incomplete_campaign', p.problems[0], 422);
  if (p.configurationHash !== previewHash) return no('campaign_changed', 'The campaign or Clover discount changed. Review it again before approval.', 409);
  if (p.approved) return no('already_approved', 'This campaign version is already approved.', 409);
  const campaign: Campaign = { ...p.campaign, revision: revision(p.campaign), status: 'approved', approvedBy: by.slice(0, 60), approvedAt: new Date().toISOString(), approvalHash: p.configurationHash, approvedSnapshot: snapshot(p.campaign, p.discount) };
  if (!await replaceCampaign(mid, p.campaign, campaign)) return no('campaign_changed', 'This campaign changed. Review it again before approval.', 409);
  return { ok: true, campaign };
}

export async function listCampaigns(mid: string): Promise<Campaign[]> {
  return (await getStore().list<Campaign>(CAMPAIGNS, { merchantId: mid, limit: 200 })).map((d) => d.data);
}

export async function campaignAudienceCsv(mid: string, id: string): Promise<Result<{ csv: string; count: number; campaign: Campaign }>> {
  const c = await ownedCampaign(mid, id); if (!c) return no('campaign_not_found', 'Campaign not found.', 404);
  const checked = await reviewContent(mid, c); if (!checked.ok) return checked;
  if (!approvedVersion(c, checked.configurationHash) || (!c.messageFr.trim() && !c.messageEn.trim())) return no('approval_required', 'Approve the current campaign and Clover discount before exporting its audience.', 409);
  const read = await currentAudience(mid, c.segment); if (!read.ok) return read;
  // A revocation/edit that happened during the live Clover reads also wins before any contacts leave this route.
  const current = await ownedCampaign(mid, id);
  if (!current || JSON.stringify(current) !== JSON.stringify(c)) return no('campaign_changed', 'This campaign changed. Reload it before exporting.', 409);
  const finalOffer = await reviewContent(mid, current);
  if (!finalOffer.ok) return finalOffer;
  if (finalOffer.configurationHash !== c.approvalHash) return no('approval_required', 'The Clover discount changed. Review and approve it again before exporting.', 409);
  const escape = (value: string, index: number) => {
    const safe = index !== 2 && /^[\s]*[=+@-]/.test(value) ? `'${value}` : value;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return { ok: true, campaign: c, count: read.audience.rows.length, csv: [['first_name', 'last_name', 'phone', 'email'], ...read.audience.rows].map((row) => row.map(escape).join(',')).join('\n') + '\n' };
}
