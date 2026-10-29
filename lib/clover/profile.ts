// The merchant's business as Clover knows it (Account → Profile). Read live, kept 10 minutes; never stored.
import { cloverGet, mpath } from './api';

export interface MerchantProfile {
  name: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  currency: string | null;
  tipsEnabled: boolean | null;
  createdAt: string | null;
}

const TTL_MS = 10 * 60_000;
const cache = new Map<string, { at: number; profile: MerchantProfile }>();

export async function merchantProfile(merchantId: string, now = Date.now()): Promise<MerchantProfile | null> {
  const hit = cache.get(merchantId);
  if (hit && now - hit.at < TTL_MS) return hit.profile;
  const r = await cloverGet(merchantId, mpath(merchantId, ''), { expand: 'address' });
  if (!r.ok || !r.json) return hit?.profile ?? null;
  const j = r.json;
  const a = j.address ?? {};
  const address = [a.address1, a.address2, a.city, a.state, a.zip, a.country].map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean).join(', ');
  const str = (x: unknown) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, 160) : null);
  const profile: MerchantProfile = {
    name: str(j.name), address: address || null, phone: str(j.phoneNumber), website: str(j.website), currency: str(j.defaultCurrency),
    tipsEnabled: typeof j.tipsEnabled === 'boolean' ? j.tipsEnabled : null,
    createdAt: Number.isFinite(Number(j.createdTime)) && Number(j.createdTime) > 0 ? new Date(Number(j.createdTime)).toISOString() : null,
  };
  cache.set(merchantId, { at: now, profile });
  return profile;
}

export const clearProfileCache = () => cache.clear();
