import { isCtx, requireMerchant } from '@/lib/core/guard';
import { fail, ok, readJson } from '@/lib/core/http';
import { approveCampaign, listCampaigns, saveCampaign } from '@/lib/domain/marketing';

export const dynamic = 'force-dynamic';

// Premium: campaign drafts; a person approves each one. Nothing is sent from this app.
export async function GET(req: Request) {
  const c = await requireMerchant(req, 'premium');
  if (!isCtx(c)) return c;
  return ok({ campaigns: await listCampaigns(c.merchantId) });
}

export async function POST(req: Request) {
  const c = await requireMerchant(req, 'premium');
  if (!isCtx(c)) return c;
  const b = await readJson(req);
  if (!b) return fail('JSON body required');
  if (b.approve) return (await approveCampaign(c.merchantId, String(b.approve), c.merchant.name ?? 'Gérant')) ? ok() : fail('Not found or already approved', 404);
  const r = await saveCampaign(c.merchantId, b);
  return r.ok ? ok({ campaign: r.campaign }) : fail(r.error);
}
