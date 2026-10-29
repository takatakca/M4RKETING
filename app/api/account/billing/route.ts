import { refreshBilling } from '@/lib/clover/oauth';
import { isCtx, requireMerchant } from '@/lib/core/guard';
import { fail, ok } from '@/lib/core/http';

export const dynamic = 'force-dynamic';

// Account → Plan: read the subscription again from Clover (after a plan change in the App Market).
export async function POST(req: Request) {
  const c = await requireMerchant(req);
  if (!isCtx(c)) return c;
  const billing = await refreshBilling(c.merchantId);
  return billing ? ok({ billing }) : fail('Clover did not answer; try again in a minute.', 502);
}
