import { isCtx, requireMerchant } from '@/lib/core/guard';
import { fail, ok, readJson } from '@/lib/core/http';
import { createDiscount, deleteDiscount, listDiscounts } from '@/lib/domain/marketing';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const c = await requireMerchant(req);
  if (!isCtx(c)) return c;
  const r = await listDiscounts(c.merchantId);
  return r.ok ? ok({ discounts: r.list }) : fail(r.error, 502);
}

// { name, amountCents } or { name, percentage } → a Clover discount named "M4 · <name>".
export async function POST(req: Request) {
  const c = await requireMerchant(req, 'base', { action: 'marketing.discounts' });
  if (!isCtx(c)) return c;
  const b = await readJson(req);
  if (!b) return fail('JSON body required');
  const r = await createDiscount(c.merchantId, b);
  return r.ok ? ok({ id: r.id }) : fail(r.error);
}

export async function DELETE(req: Request) {
  const c = await requireMerchant(req, 'base', { action: 'marketing.discounts' });
  if (!isCtx(c)) return c;
  const r = await deleteDiscount(c.merchantId, new URL(req.url).searchParams.get('id') ?? '');
  return r.ok ? ok() : fail(r.error ?? 'Not removed');
}
