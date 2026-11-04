import { isCtx, requireMerchant } from '@/lib/core/guard';
import { fail, ok, readJson } from '@/lib/core/http';
import { approveCampaign, listCampaigns, previewCampaign, saveCampaign, updateCampaign } from '@/lib/domain/marketing';

export const dynamic = 'force-dynamic';

// Premium: campaign drafts; a person approves each one. Nothing is sent from this app.
export async function GET(req: Request) {
  const c = await requireMerchant(req, 'premium');
  if (!isCtx(c)) return c;
  const id = new URL(req.url).searchParams.get('preview');
  if (id) {
    const r = await previewCampaign(c.merchantId, id);
    return r.ok ? ok({ preview: r.preview }) : fail(r.error, r.status, { code: r.code });
  }
  return ok({ campaigns: await listCampaigns(c.merchantId) });
}

// POST { name, segment, … } saves a draft (marketing.campaigns); POST { approve: id } approves it (marketing.approve).
export async function POST(req: Request) {
  const b = await readJson(req);
  const c = await requireMerchant(req, 'premium', { action: b?.approve ? 'marketing.approve' : 'marketing.campaigns' });
  if (!isCtx(c)) return c;
  if (!b) return fail('JSON body required');
  if (b.approve) {
    const r = await approveCampaign(c.merchantId, String(b.approve), c.actor, b.previewHash);
    return r.ok ? ok({ campaign: r.campaign }) : fail(r.error, r.status, { code: r.code });
  }
  const r = await saveCampaign(c.merchantId, b);
  return r.ok ? ok({ campaign: r.campaign }) : fail(r.error, r.status, { code: r.code });
}

export async function PATCH(req: Request) {
  const c = await requireMerchant(req, 'premium', { action: 'marketing.campaigns' });
  if (!isCtx(c)) return c;
  const b = await readJson(req);
  if (!b || typeof b.id !== 'string') return fail('Campaign JSON body required');
  const r = await updateCampaign(c.merchantId, b.id, b);
  return r.ok ? ok({ campaign: r.campaign }) : fail(r.error, r.status, { code: r.code });
}
