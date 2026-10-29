import { createDeviceKey, listDeviceKeys, revokeDeviceKey } from '@/lib/core/devices';
import { isCtx, requireMerchant } from '@/lib/core/guard';
import { fail, ok, readJson } from '@/lib/core/http';

export const dynamic = 'force-dynamic';

// The merchant's device keys (Clover devices, kiosks): list, create (key shown once), revoke.
export async function GET(req: Request) {
  const c = await requireMerchant(req);
  if (!isCtx(c)) return c;
  return ok({ devices: await listDeviceKeys(c.merchantId) });
}

export async function POST(req: Request) {
  const c = await requireMerchant(req);
  if (!isCtx(c)) return c;
  const b = await readJson(req);
  if (!b) return fail('JSON body required');
  if ((await listDeviceKeys(c.merchantId)).length >= 50) return fail('Too many devices (50).');
  return ok(await createDeviceKey(c.merchantId, String(b.name ?? ''), String(b.kind ?? 'device').slice(0, 20)));
}

export async function DELETE(req: Request) {
  const c = await requireMerchant(req);
  if (!isCtx(c)) return c;
  const id = new URL(req.url).searchParams.get('id') ?? '';
  return (await revokeDeviceKey(c.merchantId, id)) ? ok() : fail('Not found', 404);
}
