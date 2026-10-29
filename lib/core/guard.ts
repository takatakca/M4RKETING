// The signed-in merchant for an API call (session cookie set by the Clover callback).
import { fail } from './http';
import { sessionFromRequest } from './session';
import { getMerchant, merchantTier, type MerchantRecord } from '../clover/oauth';
import { tierAtLeast, type Tier } from '../app';
import { deviceFromKey } from './devices';

export type MerchantCtx = { merchantId: string; merchant: MerchantRecord; tier: Tier };

export async function requireMerchant(req: Request, need: Tier = 'base'): Promise<MerchantCtx | Response> {
  const s = sessionFromRequest(req);
  if (!s) return fail('Not signed in: open the app from your Clover dashboard.', 401);
  const merchant = await getMerchant(s.merchantId);
  if (!merchant || merchant.status !== 'active') return fail('This merchant is not connected: open the app from Clover again.', 401);
  const tier = merchantTier(merchant);
  if (!tierAtLeast(tier, need)) return fail(`This feature is part of the ${need === 'vip' ? 'VIP' : 'Premium'} plan.`, 402, { need });
  return { merchantId: s.merchantId, merchant, tier };
}

export const isCtx = (x: MerchantCtx | Response): x is MerchantCtx => !(x instanceof Response);

/** A signed-in merchant, or a device key of that merchant (Clover device, kiosk). */
export async function requireMerchantOrDevice(req: Request, need: Tier = 'base', kind?: string): Promise<MerchantCtx | Response> {
  const auth = req.headers.get('authorization');
  if (auth && /^Bearer\s+dk_/.test(auth)) {
    const d = await deviceFromKey(auth);
    if (!d || (kind && d.kind !== kind)) return fail('Unknown or revoked device key.', 401);
    const merchant = await getMerchant(d.merchantId);
    if (!merchant || merchant.status !== 'active') return fail('This merchant is not connected.', 401);
    const tier = merchantTier(merchant);
    if (!tierAtLeast(tier, need)) return fail(`This feature is part of the ${need === 'vip' ? 'VIP' : 'Premium'} plan.`, 402, { need });
    return { merchantId: d.merchantId, merchant, tier };
  }
  return requireMerchant(req, need);
}
