import { isCtx, requireMerchant } from '@/lib/core/guard';
import { fail } from '@/lib/core/http';
import { campaignAudienceCsv } from '@/lib/domain/marketing';

export const dynamic = 'force-dynamic';

// Premium: only an approved merchant-owned campaign may export its current consenting audience.
export async function GET(req: Request) {
  const c = await requireMerchant(req, 'premium', { action: 'marketing.export', audit: 'always' });
  if (!isCtx(c)) return c;
  const id = new URL(req.url).searchParams.get('campaign');
  if (!id) return fail('Choose an approved campaign before exporting an audience.', 400, { code: 'campaign_required' });
  const r = await campaignAudienceCsv(c.merchantId, id);
  if (!r.ok) return fail(r.error, r.status, { code: r.code });
  return new Response(r.csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="m4rketing-${r.campaign.id}.csv"`, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}
