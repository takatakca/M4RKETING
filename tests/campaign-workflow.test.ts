import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { approveCampaign, campaignAudienceCsv, listCampaigns, previewCampaign, saveCampaign, updateCampaign } from '@/lib/domain/campaigns';
import { GET as campaignGet, PATCH as campaignPatch, POST as campaignPost } from '@/app/api/marketing/campaigns/route';
import { GET as exportGet } from '@/app/api/marketing/export/route';
import { sessionCookieName, signSession } from '@/lib/core/session';
import { connect, fakeClover, MID } from './helpers';

const OTHER = 'MERCHANT0002';
const DISCOUNT = 'DISCOWN00001';
let consent: boolean; let amount: number; let malformed: string; let calls: ReturnType<typeof fakeClover>;
const draft = (extra: Record<string, unknown> = {}) => ({ name: 'Retour du quartier', segment: 'lapsing', discountId: DISCOUNT, messageFr: 'Découvrez notre offre de retour.', messageEn: 'Discover our return offer.', ...extra });
const req = (url: string, role: 'owner' | 'admin' | 'manager' | 'employee' | null = 'owner', body?: unknown, method = body ? 'POST' : 'GET', mid = MID) => new Request(`https://app.example.ca${url}`, {
  method, headers: { ...(role ? { cookie: `${sessionCookieName()}=${signSession({ merchantId: mid, role, name: `Test ${role}` })}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
});
const create = async () => { const r = await saveCampaign(MID, draft()); if (!r.ok) throw new Error(r.error); return r.campaign; };
const review = async (id: string) => { const r = await previewCampaign(MID, id); if (!r.ok) throw new Error(r.error); return r.preview; };
const approve = async (id: string) => approveCampaign(MID, id, 'Test owner', (await review(id)).configurationHash);

beforeEach(async () => {
  consent = true; amount = -500; malformed = '';
  calls = fakeClover([(u) => {
    const name = u.pathname.split('/').at(-1)!;
    if (name === malformed) return new Response('not JSON', { status: 200 });
    if (name === 'discounts') return { elements: u.pathname.includes(OTHER) ? [{ id: 'DISCFOREIGN01', name: 'M4 · Foreign', amount: -100 }] : [
      { id: DISCOUNT, name: 'M4 · Retour', amount }, { id: 'STAFFDISCOUNT', name: 'Employee', amount: -500 },
    ] };
    if (name === 'orders') return { elements: ['C1', 'C2', 'C3', 'C4'].map((id) => ({ createdTime: Date.now() - 60 * 86400_000, customers: { elements: [{ id }] } })) };
    if (name === 'customers') return { elements: [
      { id: 'C1', firstName: 'Lou', marketingAllowed: consent, phoneNumbers: { elements: [{ phoneNumber: '514-555-0199' }] }, emailAddresses: { elements: [{ emailAddress: 'lou@example.test' }] } },
      { id: 'C2', firstName: 'No consent', marketingAllowed: false, phoneNumbers: { elements: [{ phoneNumber: '514-555-0198' }] } },
      { id: 'C3', firstName: 'No contact', marketingAllowed: true },
      { id: 'C4', firstName: '=HYPERLINK("bad")', marketingAllowed: true, phoneNumbers: { elements: [{ phoneNumber: 'invalid' }, { phoneNumber: '514-555-0197' }] } },
      { id: 'C4', firstName: 'Duplicate', marketingAllowed: true, phoneNumbers: { elements: [{ phoneNumber: '514-555-0197' }] } },
    ] };
    return undefined;
  }]);
  await connect(); await connect(OTHER);
});
afterEach(() => vi.unstubAllGlobals());

describe('campaign approval and audience contract', () => {
  it('accepts only the current merchant’s own unambiguous Clover discount', async () => {
    expect(await saveCampaign(MID, draft({ discountId: 'DISCFOREIGN01' }))).toMatchObject({ ok: false, code: 'discount_unavailable' });
    expect(await saveCampaign(MID, draft({ discountId: 'STAFFDISCOUNT' }))).toMatchObject({ ok: false });
    expect(await saveCampaign(MID, draft({ discountId: null, discountName: 'Made up' }))).toMatchObject({ ok: false });
    expect(await listCampaigns(MID)).toEqual([]);
    expect(await saveCampaign(MID, draft({ status: 'approved', approvedBy: 'Forged', approvalHash: 'f'.repeat(64) }))).toMatchObject({ ok: true, campaign: { status: 'draft', approvedBy: null, approvalHash: null, discountId: DISCOUNT, discountName: 'M4 · Retour' } });
  });
  it('previews counts without contacts, then approves an exact version and exports its consented audience', async () => {
    const campaign = await create(); const p = await review(campaign.id);
    expect(p).toMatchObject({ approved: false, canApprove: true, audience: { segmentCount: 4, consentedCount: 2 }, discount: { amountCents: 500 } });
    expect(JSON.stringify(p)).not.toMatch(/1514555|lou@example|HYPERLINK|No consent/);
    expect(await campaignAudienceCsv(MID, campaign.id)).toMatchObject({ ok: false, code: 'approval_required' });
    expect(await approveCampaign(MID, campaign.id, 'Test owner', p.configurationHash)).toMatchObject({ ok: true, campaign: { approvedBy: 'Test owner', approvalHash: p.configurationHash, approvedSnapshot: { discount: { id: DISCOUNT, amountCents: 500 } } } });
    const exported = await campaignAudienceCsv(MID, campaign.id);
    expect(exported).toMatchObject({ ok: true, count: 2 });
    if (!exported.ok) throw new Error(exported.error);
    expect(exported.csv).toContain('Lou,,+15145550199,lou@example.test');
    expect(exported.csv).toContain("'=HYPERLINK"); // Spreadsheet formulas stay literal.
    expect(exported.csv).not.toMatch(/No consent|No contact|Duplicate|0198/);
    expect(calls.filter((c) => !['GET', 'POST'].includes(c.method))).toEqual([]);
    expect(calls.filter((c) => c.method === 'POST' && !c.path.startsWith('/oauth/'))).toEqual([]);
  });
  it('requires a preview hash and rejects a stale offer before approval', async () => {
    const c = await create(); const p = await review(c.id);
    expect(await approveCampaign(MID, c.id, 'Owner', undefined)).toMatchObject({ ok: false, code: 'preview_required' });
    amount = -700;
    expect(await approveCampaign(MID, c.id, 'Owner', p.configurationHash)).toMatchObject({ ok: false, code: 'campaign_changed' });
    expect((await listCampaigns(MID))[0].status).toBe('draft');
  });
  it('does not reuse one campaign’s preview to approve another campaign', async () => {
    const a = await create(); const b = await create();
    expect(await approveCampaign(MID, b.id, 'Owner', (await review(a.id)).configurationHash)).toMatchObject({ ok: false, code: 'campaign_changed' });
  });
  it('requires campaign copy, while allowing an incomplete draft to be saved and edited', async () => {
    const result = await saveCampaign(MID, draft({ messageFr: '', messageEn: '' })); if (!result.ok) throw new Error(result.error);
    const p = await review(result.campaign.id); expect(p.canApprove).toBe(false);
    expect(await approveCampaign(MID, result.campaign.id, 'Owner', p.configurationHash)).toMatchObject({ ok: false, code: 'incomplete_campaign' });
  });
  it('re-reads consent for every export, excluding later withdrawals', async () => {
    const c = await create(); expect(await approve(c.id)).toMatchObject({ ok: true });
    expect(await campaignAudienceCsv(MID, c.id)).toMatchObject({ ok: true, count: 2 });
    consent = false;
    const exported = await campaignAudienceCsv(MID, c.id);
    expect(exported).toMatchObject({ ok: true, count: 1 });
    expect(exported.ok && exported.csv).not.toContain('lou@example.test');
  });
  it('holds approved exports after an external Clover offer change until reapproval', async () => {
    const c = await create(); expect(await approve(c.id)).toMatchObject({ ok: true }); amount = -800;
    expect(await campaignAudienceCsv(MID, c.id)).toMatchObject({ ok: false, code: 'approval_required' });
    const p = await review(c.id); expect(p.approved).toBe(false);
    expect(await approveCampaign(MID, c.id, 'Owner', p.configurationHash)).toMatchObject({ ok: true });
    expect(await campaignAudienceCsv(MID, c.id)).toMatchObject({ ok: true });
  });
  it('clears approval after a meaningful edit and refuses old revisions', async () => {
    const c = await create(); expect(await approve(c.id)).toMatchObject({ ok: true });
    const result = await updateCampaign(MID, c.id, { ...draft(), name: 'New campaign', revision: 1 });
    expect(result).toMatchObject({ ok: true, campaign: { revision: 2, status: 'draft', approvalHash: null, approvedBy: null } });
    expect(await campaignAudienceCsv(MID, c.id)).toMatchObject({ ok: false, code: 'approval_required' });
    expect(await updateCampaign(MID, c.id, { ...draft(), revision: 1 })).toMatchObject({ ok: false, code: 'campaign_changed' });
  });
  it('preserves approval on an unchanged edit', async () => {
    const c = await create(); expect(await approve(c.id)).toMatchObject({ ok: true });
    expect(await updateCampaign(MID, c.id, { ...draft(), revision: 1 })).toMatchObject({ ok: true, campaign: { revision: 1, status: 'approved' } });
  });
  it('serializes competing edits without silently overwriting one', async () => {
    const c = await create();
    const responses = await Promise.all(['A', 'B'].map((name) => updateCampaign(MID, c.id, { ...draft(), name, revision: 1 })));
    expect(responses.filter((r) => r.ok)).toHaveLength(1);
    expect(responses.filter((r) => !r.ok)).toEqual([expect.objectContaining({ code: 'campaign_changed' })]);
  });
  it('does not let a delayed approval overwrite an edit made during its Clover read', async () => {
    const c = await create(); const hash = (await review(c.id)).configurationHash;
    const before = globalThis.fetch; let arrived!: () => void; let resume!: () => void;
    const waiting = new Promise<void>((resolve) => { arrived = resolve; }); const hold = new Promise<void>((resolve) => { resume = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => { if (new URL(String(input)).pathname.endsWith('/customers')) { arrived(); await hold; } return before(input, init); }));
    const approval = approveCampaign(MID, c.id, 'Owner', hash); await waiting;
    expect(await updateCampaign(MID, c.id, { ...draft(), name: 'Changed during review', revision: 1 })).toMatchObject({ ok: true });
    resume(); expect(await approval).toMatchObject({ ok: false, code: 'campaign_changed' });
    expect((await listCampaigns(MID))[0]).toMatchObject({ name: 'Changed during review', status: 'draft', revision: 2 });
  });
  it.each(['edit', 'offer'])('does not leak contacts if an %s changes while Clover audience reads are in flight', async (change) => {
    const c = await create(); expect(await approve(c.id)).toMatchObject({ ok: true });
    const before = globalThis.fetch; let arrived!: () => void; let resume!: () => void;
    const waiting = new Promise<void>((resolve) => { arrived = resolve; }); const hold = new Promise<void>((resolve) => { resume = resolve; });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => { if (new URL(String(input)).pathname.endsWith('/customers')) { arrived(); await hold; } return before(input, init); }));
    const exporting = campaignAudienceCsv(MID, c.id); await waiting;
    if (change === 'edit') expect(await updateCampaign(MID, c.id, { ...draft(), segment: 'regular', revision: 1 })).toMatchObject({ ok: true });
    else amount = -999;
    resume(); const result = await exporting; expect(result).toMatchObject({ ok: false }); expect(result).not.toHaveProperty('csv');
  });
  it.each(['orders', 'customers', 'discounts'])('fails closed instead of presenting malformed %s as an empty audience', async (kind) => {
    const c = await create(); malformed = kind;
    expect(await previewCampaign(MID, c.id)).toMatchObject({ ok: false, code: 'clover_unavailable' });
  });
  it('does not disclose, approve, edit or export another merchant’s campaign', async () => {
    const c = await create(); const hash = (await review(c.id)).configurationHash;
    expect(await previewCampaign(OTHER, c.id)).toMatchObject({ ok: false, status: 404 });
    expect(await approveCampaign(OTHER, c.id, 'Other owner', hash)).toMatchObject({ ok: false, status: 404 });
    expect(await updateCampaign(OTHER, c.id, { ...draft(), revision: 1 })).toMatchObject({ ok: false, status: 404 });
    expect(await campaignAudienceCsv(OTHER, c.id)).toMatchObject({ ok: false, status: 404 });
  });
});

describe('campaign routes enforce plan/role/approval boundaries', () => {
  it('refuses anonymous reads and writes', async () => {
    expect((await campaignGet(req('/api/marketing/campaigns', null))).status).toBe(401);
    expect((await campaignPost(req('/api/marketing/campaigns', null, draft()))).status).toBe(401);
    expect((await exportGet(req('/api/marketing/export?segment=lapsing', null))).status).toBe(401);
  });
  it('lets a manager prepare but reserves approval and contact export for an admin', async () => {
    const created = await campaignPost(req('/api/marketing/campaigns', 'manager', draft())); expect(created.status).toBe(200);
    const c = (await created.json()).campaign; const p = await review(c.id);
    expect((await campaignPost(req('/api/marketing/campaigns', 'manager', { approve: c.id, previewHash: p.configurationHash }))).status).toBe(403);
    expect((await exportGet(req(`/api/marketing/export?campaign=${c.id}`, 'manager'))).status).toBe(403);
    expect((await campaignPost(req('/api/marketing/campaigns', 'employee', draft()))).status).toBe(403);
    expect((await campaignPost(req('/api/marketing/campaigns', 'admin', { approve: c.id, previewHash: p.configurationHash }))).status).toBe(200);
    const exported = await exportGet(req(`/api/marketing/export?campaign=${c.id}`, 'admin'));
    expect(exported.status).toBe(200); expect(exported.headers.get('cache-control')).toBe('no-store'); expect(exported.headers.get('x-content-type-options')).toBe('nosniff');
  });
  it('requires an approved campaign even when a legacy segment URL is supplied', async () => {
    const response = await exportGet(req('/api/marketing/export?segment=lapsing'));
    expect(response.status).toBe(400); expect(await response.json()).toMatchObject({ code: 'campaign_required' });
  });
  it('uses guarded preview and optimistic edit APIs with safe error codes', async () => {
    const c = await create();
    const preview = await campaignGet(req(`/api/marketing/campaigns?preview=${c.id}`, 'manager'));
    expect(preview.status).toBe(200); expect(JSON.stringify(await preview.json())).not.toMatch(/lou@example|15145550199/);
    const edited = await campaignPatch(req('/api/marketing/campaigns', 'manager', { ...draft(), id: c.id, revision: 1, name: 'New version' }, 'PATCH'));
    expect(edited.status).toBe(200);
    const stale = await campaignPatch(req('/api/marketing/campaigns', 'manager', { ...draft(), id: c.id, revision: 1 }, 'PATCH'));
    expect(stale.status).toBe(409);
    const foreign = await exportGet(req(`/api/marketing/export?campaign=${c.id}`, 'owner', undefined, 'GET', OTHER));
    expect(foreign.status).toBe(404);
  });
});
