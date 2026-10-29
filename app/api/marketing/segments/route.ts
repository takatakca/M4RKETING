import { isCtx, requireMerchant } from '@/lib/core/guard';
import { fail, ok } from '@/lib/core/http';
import { customerStats, segmentCounts } from '@/lib/domain/marketing';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const c = await requireMerchant(req);
  if (!isCtx(c)) return c;
  const s = await customerStats(c.merchantId);
  return s.ok ? ok({ segments: segmentCounts(s.list), discountUse: s.discountUse }) : fail(s.error, 502);
}
