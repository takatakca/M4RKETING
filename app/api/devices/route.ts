import { createDeviceKey, listDeviceKeys, revokeDeviceKey } from '@/lib/core/devices';
import { isCtx, requireMerchant } from '@/lib/core/guard';
import { fail, ok, readJson } from '@/lib/core/http';
import { deviceKinds } from '@/lib/domain';

export const dynamic = 'force-dynamic';

// The merchant's device keys (Clover devices, kiosks): list, create (key shown once), revoke.
// Creating and revoking is an authorized action (account.devices, manager by default).
export async function GET(req: Request) {
  const c = await requireMerchant(req);
  if (!isCtx(c)) return c;
  return ok({ devices: await listDeviceKeys(c.merchantId) });
}

export async function POST(req: Request) {
  const c = await requireMerchant(req, 'base', { action: 'account.devices' });
  if (!isCtx(c)) return c;
  const b = await readJson(req);
  if (!b) return fail('JSON body required');
  if (!deviceKinds.length) return fail('This app uses no device keys.', 404);
  const kind = String(b.kind ?? deviceKinds[0].kind);
  if (!deviceKinds.some((k) => k.kind === kind)) return fail(`Unknown device kind: ${kind.slice(0, 20)}`);
  if ((await listDeviceKeys(c.merchantId)).length >= 50) return fail('Too many devices (50).');
  return ok(await createDeviceKey(c.merchantId, String(b.name ?? ''), kind));
}

export async function DELETE(req: Request) {
  const c = await requireMerchant(req, 'base', { action: 'account.devices' });
  if (!isCtx(c)) return c;
  const id = new URL(req.url).searchParams.get('id') ?? '';
  return (await revokeDeviceKey(c.merchantId, id)) ? ok() : fail('Not found', 404);
}
