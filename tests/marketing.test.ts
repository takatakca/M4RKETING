// M4RKETING: segments from Clover orders, own discounts only, consent-only export, campaign approval.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { approveCampaign, audienceCsv, createDiscount, customerStats, deleteDiscount, listCampaigns, saveCampaign, segmentCounts, segmentOf } from '@/lib/domain/marketing';
import { connect, fakeClover, MID } from './helpers';

const DAY = 86400_000;
const now = Date.now();
let calls: ReturnType<typeof fakeClover>;
beforeEach(async () => {
  calls = fakeClover([(u, init) => {
    if (u.pathname.endsWith('/orders')) return { elements: [
      { createdTime: now - 5 * DAY, total: 2000, customers: { elements: [{ id: 'CUSTNEW00001' }] }, discounts: { elements: [{ name: 'M4 · Retour' }] } },
      { createdTime: now - 100 * DAY, total: 1000, customers: { elements: [{ id: 'CUSTREG00001' }] } },
      { createdTime: now - 10 * DAY, total: 1500, customers: { elements: [{ id: 'CUSTREG00001' }] } },
      { createdTime: now - 60 * DAY, total: 1000, customers: { elements: [{ id: 'CUSTLAP00001' }] } },
      { createdTime: now - 2 * DAY, total: 900 },
    ] };
    if (u.pathname.endsWith('/customers')) return { elements: [
      { id: 'CUSTLAP00001', firstName: 'Lou', marketingAllowed: true, phoneNumbers: { elements: [{ phoneNumber: '514-555-0199' }] } },
      { id: 'CUSTNEW00001', firstName: 'Nia', marketingAllowed: false },
    ] };
    if (u.pathname.endsWith('/discounts') && init?.method === 'POST') return { id: 'DISC00000009' };
    if (u.pathname.endsWith('/discounts')) return { elements: [{ id: 'DISCOWN00001', name: 'M4 · Retour', amount: -500 }, { id: 'DISCSTAFF001', name: 'Employé', percentage: 50 }] };
    if (u.pathname.includes('/discounts/') && init?.method === 'DELETE') return {};
    return undefined;
  }]);
  await connect();
});
afterEach(() => vi.unstubAllGlobals());

describe('marketing', () => {
  it('segments customers by first and last order', async () => {
    expect(segmentOf(now - 10 * DAY, now - 10 * DAY, now)).toBe('new');
    const s = await customerStats(MID, now);
    if (!s.ok) throw new Error(s.error);
    expect(segmentCounts(s.list)).toEqual({ new: 1, regular: 1, lapsing: 1, lost: 0 });
    expect(s.discountUse).toEqual({ 'M4 · Retour': 1 });
  });

  it('creates its own discounts and never removes the others', async () => {
    expect(await createDiscount(MID, { name: 'X' })).toMatchObject({ ok: false });
    expect(await createDiscount(MID, { name: 'X', amountCents: 500, percentage: 10 })).toMatchObject({ ok: false });
    expect(await createDiscount(MID, { name: 'Retour', amountCents: 500 })).toEqual({ ok: true, id: 'DISC00000009' });
    expect(calls.find((c) => c.method === 'POST' && c.path.endsWith('/discounts'))?.body).toEqual({ name: 'M4 · Retour', amount: -500 });
    expect(await deleteDiscount(MID, 'DISCSTAFF001')).toMatchObject({ ok: false });
    expect(await deleteDiscount(MID, 'DISCOWN00001')).toEqual({ ok: true });
  });

  it('exports only customers who accepted marketing', async () => {
    const lapsing = await audienceCsv(MID, 'lapsing');
    expect(lapsing).toMatchObject({ ok: true, count: 1 });
    expect(lapsing.ok && lapsing.csv).toContain('Lou,,+15145550199,');
    expect(await audienceCsv(MID, 'new')).toMatchObject({ ok: true, count: 0 });
  });

  it('campaigns are drafts until a person approves them', async () => {
    const c = await saveCampaign(MID, { name: 'Reviens', segment: 'lapsing', discountName: 'M4 · Retour' });
    if (!c.ok) throw new Error(c.error);
    expect(c.campaign.status).toBe('draft');
    expect(await approveCampaign(MID, c.campaign.id, 'Matt')).toBe(true);
    expect(await approveCampaign(MID, c.campaign.id, 'Matt')).toBe(false);
    expect((await listCampaigns(MID))[0]).toMatchObject({ status: 'approved', approvedBy: 'Matt' });
    expect(await saveCampaign(MID, { name: 'x', segment: 'all' })).toMatchObject({ ok: false });
  });
});
