import { isCtx, requireMerchant } from '@/lib/core/guard';
import { fail } from '@/lib/core/http';
import { audienceCsv, SEGMENTS, type Segment } from '@/lib/domain/marketing';

export const dynamic = 'force-dynamic';

// Premium: GET ?segment=lapsing → CSV of that segment's customers who accepted marketing in Clover.
export async function GET(req: Request) {
  const c = await requireMerchant(req, 'premium');
  if (!isCtx(c)) return c;
  const segment = new URL(req.url).searchParams.get('segment') as Segment;
  if (!SEGMENTS.includes(segment)) return fail('segment must be new, regular, lapsing or lost');
  const r = await audienceCsv(c.merchantId, segment);
  if (!r.ok) return fail(r.error, 502);
  return new Response(r.csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="m4rketing-${segment}.csv"`, 'cache-control': 'no-store' } });
}
