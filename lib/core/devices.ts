// Device keys: a Clover device, kiosk or courier phone calls this app with "Authorization: Bearer dk_<id>.<secret>".
// The merchant creates and revokes them in the dashboard; only a hash of the secret is stored; the key is shown once.
import crypto from 'node:crypto';
import { randomToken, safeEqual } from './crypto';
import { getStore } from './store';

export const DEVICES = 'devices';
export interface DeviceKey { id: string; merchantId: string; name: string; hash: string; createdAt: string; lastUsedAt: string | null; revoked: boolean; kind: string }

const hash = (secret: string) => crypto.createHash('sha256').update(secret).digest('hex');

export async function createDeviceKey(merchantId: string, name: string, kind = 'device'): Promise<{ key: string; device: Omit<DeviceKey, 'hash'> }> {
  const id = randomToken(9);
  const secret = randomToken(24);
  const device: DeviceKey = { id, merchantId, name: name.trim().slice(0, 60) || 'Appareil', hash: hash(secret), createdAt: new Date().toISOString(), lastUsedAt: null, revoked: false, kind };
  await getStore().put(DEVICES, id, merchantId, device);
  const { hash: _h, ...pub } = device;
  return { key: `dk_${id}.${secret}`, device: pub };
}

export async function listDeviceKeys(merchantId: string, kind?: string): Promise<Array<Omit<DeviceKey, 'hash'>>> {
  return (await getStore().list<DeviceKey>(DEVICES, { merchantId })).map((d) => d.data).filter((d) => !d.revoked && (!kind || d.kind === kind)).map(({ hash: _h, ...pub }) => pub);
}

export async function revokeDeviceKey(merchantId: string, id: string): Promise<boolean> {
  const d = (await getStore().get<DeviceKey>(DEVICES, id))?.data;
  if (!d || d.merchantId !== merchantId) return false;
  await getStore().put(DEVICES, id, merchantId, { ...d, revoked: true });
  return true;
}

/** The device behind a key (also accepts the raw key without "Bearer", e.g. from a kiosk address). */
export async function deviceFromKey(raw: string | null | undefined): Promise<DeviceKey | null> {
  const m = /^(?:Bearer\s+)?dk_([A-Za-z0-9_-]{8,20})\.([A-Za-z0-9_-]{20,64})$/.exec(String(raw ?? '').trim());
  if (!m) return null;
  const d = (await getStore().get<DeviceKey>(DEVICES, m[1]))?.data;
  if (!d || d.revoked || !safeEqual(d.hash, hash(m[2]))) return null;
  if (!d.lastUsedAt || Date.now() - Date.parse(d.lastUsedAt) > 5 * 60_000) await getStore().put(DEVICES, d.id, d.merchantId, { ...d, lastUsedAt: new Date().toISOString() });
  return d;
}
