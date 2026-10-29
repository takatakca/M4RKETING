// Clover OAuth v2 (expiring tokens) for this app.
//  - The merchant installs or opens the app in Clover → Clover sends the browser to APP_BASE_URL + the callback with
//    ?merchant_id=…&client_id=…&code=… → we exchange the code (server side, with the App Secret) for an access token
//    and a single-use refresh token, store them sealed (TOKEN_ENCRYPTION_KEY), and sign the merchant in.
//  - Opened without a code (left-hand menu of the Clover dashboard): the callback sends the browser to Clover's
//    authorize page with a signed, stateless "state" and Clover comes back with the code.
//  - The access token is refreshed 5 minutes before it expires (one refresh at a time per merchant: Clover's refresh
//    tokens are single-use). Uninstall (webhook A DELETE) deletes the tokens.
// Same flow as TAKATAK Food Hub (foodhubca lib/foodhub/pos/clover-oauth.ts), reduced to one app.
import crypto from 'node:crypto';
import { APP, ownMerchants, tierFromPlan, type Tier } from '../app';
import { hmacHex, openSecret, safeEqual, sealSecret } from '../core/crypto';
import { roleFromClover, type Role } from '../core/roles';
import { getStore } from '../core/store';
import { cloverConfig, cloverConfigured, redirectUri } from './config';
import { cloverFetch } from './http';

export const MERCHANTS = '_merchants';
const REFRESH_MARGIN_S = 5 * 60;
const STATE_TTL_S = 15 * 60;
const MERCHANT_ID = /^[A-Z0-9]{8,20}$/;

export interface Billing { status: string | null; plan: string | null; inTrial: boolean; checkedAt: string }

export interface MerchantRecord {
  merchantId: string;
  name: string | null;
  accessToken: string;              // sealed
  accessTokenExpiration: number | null;   // unix seconds
  refreshToken: string | null;      // sealed
  refreshTokenExpiration: number | null;  // unix seconds
  installedAt: string;
  refreshedAt: string | null;
  billing: Billing | null;
  status: 'active' | 'uninstalled';
}

export type ConnectError = 'not_configured' | 'no_code' | 'bad_merchant' | 'wrong_app' | 'bad_state' | 'code_refused';
export type ConnectResult = { ok: true; merchantId: string; name: string | null } | { ok: false; code: ConnectError; error: string };

// ---- state (stateless: nothing is written before Clover answers) ----
export function makeState(now = Date.now()): string {
  const body = `${crypto.randomBytes(8).toString('hex')}${Math.floor(now / 1000 + STATE_TTL_S).toString(16).padStart(8, '0')}`;
  return `${body}${hmacHex(cloverConfig.clientSecret, `state:${APP.key}:${body}`).slice(0, 16)}`;
}

export function stateValid(state: string, now = Date.now()): boolean {
  if (!/^[a-f0-9]{40}$/.test(state)) return false;
  const body = state.slice(0, 24);
  if (!safeEqual(state.slice(24), hmacHex(cloverConfig.clientSecret, `state:${APP.key}:${body}`).slice(0, 16))) return false;
  return parseInt(body.slice(16), 16) * 1000 > now;
}

export function authorizeUrl(state = makeState()): string {
  const qs = new URLSearchParams({ client_id: cloverConfig.clientId, redirect_uri: redirectUri(), state });
  return `${cloverConfig.webUrl}/oauth/v2/authorize?${qs}`;
}

// ---- token calls ----
type TokenJson = { access_token?: string; access_token_expiration?: number; refresh_token?: string; refresh_token_expiration?: number; message?: string };

async function postToken(path: '/oauth/v2/token' | '/oauth/v2/refresh', body: Record<string, string>) {
  const res = await cloverFetch(`${cloverConfig.apiBase}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, json: (await res.json().catch(() => ({}))) as TokenJson };
}

async function getJson(token: string, path: string): Promise<any | null> {
  try {
    const res = await cloverFetch(`${cloverConfig.apiBase}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    return res.ok ? await res.json().catch(() => null) : null;
  } catch {
    return null;
  }
}

/** The merchant's App Market subscription to this app (plan name decides the tier). */
export async function readBilling(merchantId: string, token: string): Promise<Billing | null> {
  const j = await getJson(token, `/v3/apps/${encodeURIComponent(APP.cloverAppId)}/merchants/${encodeURIComponent(merchantId)}/billing_info`);
  if (!j) return null;
  const plan = j.appSubscription?.name ?? j.subscription?.name ?? j.plan?.name ?? null;
  return { status: j.status ?? null, plan: plan ? String(plan).slice(0, 80) : null, inTrial: Boolean(j.isInTrial ?? j.inTrial), checkedAt: new Date().toISOString() };
}

export async function finishConnect(p: { code?: string | null; merchantId?: string | null; clientId?: string | null; state?: string | null }): Promise<ConnectResult> {
  const fail = (code: ConnectError, error: string): ConnectResult => ({ ok: false, code, error });
  if (!cloverConfigured()) return fail('not_configured', 'CLOVER_CLIENT_SECRET / APP_BASE_URL are not set (DEPLOY.md).');
  const code = String(p.code ?? '');
  const mid = String(p.merchantId ?? '').trim();
  if (!code) return fail('no_code', 'Clover did not return a code.');
  if (!MERCHANT_ID.test(mid)) return fail('bad_merchant', 'Clover did not return a valid merchant ID.');
  if (p.clientId && p.clientId !== cloverConfig.clientId) return fail('wrong_app', 'This Clover link is for another app.');
  if (p.state && !stateValid(p.state)) return fail('bad_state', 'This link expired. Open the app again from Clover.');
  const r = await postToken('/oauth/v2/token', { client_id: cloverConfig.clientId, client_secret: cloverConfig.clientSecret, code });
  if (!r.ok || !r.json.access_token) return fail('code_refused', `Clover refused the code (HTTP ${r.status}${r.json.message ? `: ${String(r.json.message).slice(0, 120)}` : ''}).`);
  const token = r.json.access_token;
  const [merchant, billing] = await Promise.all([getJson(token, `/v3/merchants/${mid}`), readBilling(mid, token)]);
  const prev = await getMerchant(mid);
  const rec: MerchantRecord = {
    merchantId: mid,
    name: typeof merchant?.name === 'string' ? merchant.name.slice(0, 120) : prev?.name ?? null,
    accessToken: sealSecret(token),
    accessTokenExpiration: r.json.access_token_expiration ?? null,
    refreshToken: r.json.refresh_token ? sealSecret(r.json.refresh_token) : null,
    refreshTokenExpiration: r.json.refresh_token_expiration ?? null,
    installedAt: prev?.status === 'active' ? prev.installedAt : new Date().toISOString(),
    refreshedAt: new Date().toISOString(),
    billing: billing ?? prev?.billing ?? null,
    status: 'active',
  };
  await getStore().put(MERCHANTS, mid, mid, rec);
  return { ok: true, merchantId: mid, name: rec.name };
}

export async function getMerchant(merchantId: string): Promise<MerchantRecord | null> {
  return (await getStore().get<MerchantRecord>(MERCHANTS, merchantId))?.data ?? null;
}

export async function listMerchants(): Promise<MerchantRecord[]> {
  return (await getStore().list<MerchantRecord>(MERCHANTS, { limit: 10_000 })).map((d) => d.data).filter((m) => m.status === 'active');
}

export function merchantTier(m: Pick<MerchantRecord, 'merchantId' | 'billing'> | null): Tier {
  if (!m) return 'base';
  if (ownMerchants().has(m.merchantId)) return 'vip';
  return tierFromPlan(m.billing?.plan);
}

const locks = new Map<string, Promise<string | null>>();

/** A valid access token for this merchant (refreshed when it expires within 5 minutes), or null. */
export async function accessToken(merchantId: string, opts: { force?: boolean } = {}): Promise<string | null> {
  const m = await getMerchant(merchantId);
  if (!m || m.status !== 'active') return null;
  const now = Math.floor(Date.now() / 1000);
  const fresh = !m.accessTokenExpiration || m.accessTokenExpiration - now > REFRESH_MARGIN_S;
  if (fresh && !opts.force) return openSecret(m.accessToken);
  const running = locks.get(merchantId);
  if (running) return running;
  const job = (async () => {
    const cur = await getMerchant(merchantId);
    if (!cur || cur.status !== 'active') return null;
    // Another refresh finished while we waited.
    if (!opts.force && cur.accessTokenExpiration && cur.accessTokenExpiration - Math.floor(Date.now() / 1000) > REFRESH_MARGIN_S) return openSecret(cur.accessToken);
    const refresh = openSecret(cur.refreshToken);
    if (!refresh || (cur.refreshTokenExpiration && cur.refreshTokenExpiration < Math.floor(Date.now() / 1000))) return fresh ? openSecret(cur.accessToken) : null;
    const r = await postToken('/oauth/v2/refresh', { client_id: cloverConfig.clientId, refresh_token: refresh });
    if (!r.ok || !r.json.access_token) return fresh ? openSecret(cur.accessToken) : null;
    await getStore().put(MERCHANTS, merchantId, merchantId, {
      ...cur,
      accessToken: sealSecret(r.json.access_token),
      accessTokenExpiration: r.json.access_token_expiration ?? null,
      refreshToken: r.json.refresh_token ? sealSecret(r.json.refresh_token) : cur.refreshToken,
      refreshTokenExpiration: r.json.refresh_token_expiration ?? cur.refreshTokenExpiration,
      refreshedAt: new Date().toISOString(),
    } satisfies MerchantRecord);
    return r.json.access_token;
  })().finally(() => locks.delete(merchantId));
  locks.set(merchantId, job);
  return job;
}

/** The person who opened the app: name and Clover role (null when Clover does not share employees with this app). */
export async function readEmployee(merchantId: string, employeeId: string | null | undefined): Promise<{ name: string | null; role: Role | null } | null> {
  if (!employeeId || !MERCHANT_ID.test(employeeId)) return null;
  const token = await accessToken(merchantId);
  if (!token) return null;
  const j = await getJson(token, `/v3/merchants/${encodeURIComponent(merchantId)}/employees/${encodeURIComponent(employeeId)}`);
  if (!j || typeof j !== 'object') return null;
  return { name: typeof j.name === 'string' && j.name.trim() ? j.name.trim().slice(0, 60) : null, role: roleFromClover(j) };
}

/** App uninstalled: tokens are deleted at once. The app's own records stay (some are legal records, e.g. gift cards). */
export async function disconnectMerchant(merchantId: string): Promise<boolean> {
  const m = await getMerchant(merchantId);
  if (!m) return false;
  await getStore().put(MERCHANTS, merchantId, merchantId, { ...m, accessToken: '', refreshToken: null, accessTokenExpiration: null, refreshTokenExpiration: null, status: 'uninstalled' } satisfies MerchantRecord);
  return true;
}

/** Re-read the subscription (App webhook UPDATE, or the dashboard asks). */
export async function refreshBilling(merchantId: string): Promise<Billing | null> {
  const token = await accessToken(merchantId);
  const m = await getMerchant(merchantId);
  if (!token || !m) return null;
  const billing = await readBilling(merchantId, token);
  if (billing) await getStore().put(MERCHANTS, merchantId, merchantId, { ...m, billing });
  return billing;
}
