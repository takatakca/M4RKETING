// The TAKATAK Suite link (contract: foodhubca docs/TAKATAK_SUITE.md). This app works alone; with these variables it
// also takes Food Hub's order events and talks to the other suite apps through Food Hub:
//   FOODHUB_URL           Food Hub address (https://foodhub.on2go.ca)
//   FOODHUB_SUITE_SECRET  32+ characters; the same value as FOODHUB_SUITE_<APP>_SECRET in Food Hub
// Food Hub POSTs signed events to APP_BASE_URL/api/suite/events; this app signs its own calls the same way:
//   X-Takatak-Signature: t=<unix s>,v1=<hex HMAC-SHA256(secret, "<t>.<body or path+query>")>, 5-minute window.
//
// Food Hub also keeps the suite's directory: which TAKATAK apps each restaurant has. This app tells it when a merchant
// connects ("<app>.installed", with this app's address) or uninstalls ("<app>.uninstalled"), and reads the directory
// for its Suite page and app switcher (GET /api/suite/v1/directory?merchant=…, kept 5 minutes).
import crypto from 'node:crypto';
import { APP } from './app';
import { cloverConfig } from './clover/config';
import { getMerchant, listMerchants } from './clover/oauth';
import { hmacHex, safeEqual } from './core/crypto';
import { getStore } from './core/store';
import type { AppHooks, SuiteEvent } from './hooks';

const TOLERANCE_S = 300;
const env = (k: string) => (process.env[k] ?? '').trim();

export function suiteConfig(): { url: string; secret: string } | null {
  const url = env('FOODHUB_URL').replace(/\/+$/, '');
  const secret = env('FOODHUB_SUITE_SECRET');
  if (!/^https:\/\//.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(url)) return null;
  return secret.length >= 32 ? { url, secret } : null;
}

export function signSuite(secret: string, payload: string, now = Date.now()): string {
  const t = Math.floor(now / 1000);
  return `t=${t},v1=${hmacHex(secret, `${t}.${payload}`)}`;
}

export function verifySuite(secret: string, header: string | null | undefined, payload: string, now = Date.now()): boolean {
  const p = Object.fromEntries(String(header ?? '').split(',').map((s) => s.trim().split('=') as [string, string]).filter((x) => x.length === 2));
  const t = Number(p.t);
  if (!Number.isInteger(t) || !/^[0-9a-f]{64}$/.test(p.v1 ?? '') || Math.abs(Math.floor(now / 1000) - t) > TOLERANCE_S) return false;
  return safeEqual(p.v1, hmacHex(secret, `${t}.${payload}`));
}

/** Food Hub → this app. Each event id is handled once. */
export async function receiveSuiteEvent(raw: string, signature: string | null, hooks: AppHooks): Promise<{ status: number; json: Record<string, unknown> }> {
  const cfg = suiteConfig();
  if (!cfg) return { status: 503, json: { ok: false, error: 'Not connected to Food Hub (FOODHUB_URL / FOODHUB_SUITE_SECRET).' } };
  if (!verifySuite(cfg.secret, signature, raw)) return { status: 401, json: { ok: false, error: 'Bad or expired signature' } };
  let ev: SuiteEvent;
  try { ev = JSON.parse(raw); } catch { return { status: 400, json: { ok: false, error: 'Invalid JSON' } }; }
  if (!ev || typeof ev.id !== 'string' || typeof ev.type !== 'string') return { status: 400, json: { ok: false, error: 'Invalid event' } };
  if (!(await getStore().claim(`suite:in:${ev.id}`, Date.now()))) return { status: 200, json: { ok: true, duplicate: true } };
  try {
    await hooks.onSuiteEvent?.(ev);
  } catch (e) {
    await getStore().deleteKv(`suite:in:${ev.id}`); // let Food Hub's retry try again
    return { status: 500, json: { ok: false, error: e instanceof Error ? e.message : String(e) } };
  }
  if (ev.type === 'app.event' && /\.(un)?installed$/.test(String(ev.data?.type ?? ''))) directoryCache.delete(String(ev.data?.data?.cloverMerchantId ?? ''));
  await bump('received');
  return { status: 200, json: { ok: true } };
}

// ---- counters for the Suite page ----
const STATS = 'suite:stats';
export interface SuiteStats { received: number; emitted: number; lastReceivedAt: string | null; lastEmittedAt: string | null }

async function bump(kind: 'received' | 'emitted'): Promise<void> {
  const store = getStore();
  const cur = (await store.getKv<SuiteStats>(STATS)) ?? { received: 0, emitted: 0, lastReceivedAt: null, lastEmittedAt: null };
  const at = new Date().toISOString();
  await store.setKv(STATS, kind === 'received' ? { ...cur, received: cur.received + 1, lastReceivedAt: at } : { ...cur, emitted: cur.emitted + 1, lastEmittedAt: at });
}

export async function suiteStats(): Promise<SuiteStats & { waiting: number }> {
  const store = getStore();
  const cur = (await store.getKv<SuiteStats>(STATS)) ?? { received: 0, emitted: 0, lastReceivedAt: null, lastEmittedAt: null };
  return { ...cur, waiting: (await store.list('suite_outbox', { limit: 1000 })).length };
}

/** This app → the other suite apps (through Food Hub). Type must be "<app key>.<name>". Kept for retry when it fails. */
export async function emitSuite(name: string, data: unknown, id: string = crypto.randomUUID()): Promise<{ sent: boolean; reason?: string }> {
  const cfg = suiteConfig();
  if (!cfg) return { sent: false, reason: 'not connected to Food Hub' };
  const body = JSON.stringify({ id, type: `${APP.key}.${name}`, data });
  try {
    const res = await fetch(`${cfg.url}/api/suite/v1/events`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-takatak-app': APP.key, 'x-takatak-signature': signSuite(cfg.secret, body) }, body,
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) { await bump('emitted'); return { sent: true }; }
    if (res.status >= 400 && res.status < 500 && res.status !== 429) return { sent: false, reason: `Food Hub refused it (HTTP ${res.status})` };
  } catch { /* kept below */ }
  await getStore().put('suite_outbox', id, '_suite', { body, tries: 1 });
  return { sent: false, reason: 'kept for retry' };
}

/** /api/cron: send what failed before. */
export async function flushSuiteOutbox(): Promise<{ sent: number; left: number }> {
  const cfg = suiteConfig();
  const store = getStore();
  const items = await store.list<{ body: string; tries: number }>('suite_outbox', { limit: 100 });
  if (!cfg) return { sent: 0, left: items.length };
  let sent = 0;
  for (const d of items) {
    try {
      const res = await fetch(`${cfg.url}/api/suite/v1/events`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-takatak-app': APP.key, 'x-takatak-signature': signSuite(cfg.secret, d.data.body) }, body: d.data.body,
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) { await store.remove('suite_outbox', d.id); if (res.ok) { sent++; await bump('emitted'); } continue; }
    } catch { /* retry next time */ }
    if (d.data.tries >= 50) await store.remove('suite_outbox', d.id);
    else await store.put('suite_outbox', d.id, '_suite', { ...d.data, tries: d.data.tries + 1 }, d.at);
  }
  return { sent, left: (await store.list('suite_outbox', { limit: 1000 })).length };
}

/** Catch up on Food Hub orders (GET /api/suite/v1/orders), e.g. right after connecting. */
export async function suiteOrders(since?: string): Promise<{ ok: boolean; orders: any[]; error?: string }> {
  const cfg = suiteConfig();
  if (!cfg) return { ok: false, orders: [], error: 'not connected to Food Hub' };
  const path = `/api/suite/v1/orders?limit=500${since ? `&since=${encodeURIComponent(since)}` : ''}`;
  try {
    const res = await fetch(`${cfg.url}${path}`, { headers: { 'x-takatak-app': APP.key, 'x-takatak-signature': signSuite(cfg.secret, path) }, signal: AbortSignal.timeout(10_000) });
    const j = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, orders: Array.isArray(j.orders) ? j.orders : [] } : { ok: false, orders: [], error: j.error ?? `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, orders: [], error: e instanceof Error ? e.message : String(e) };
  }
}

// ---- the suite directory (kept by Food Hub) ----
const announcedKey = (mid: string) => `m:${mid}:suite:announced`;
const triedKey = (mid: string) => `m:${mid}:suite:announce-tried`;

/** Tell the suite this merchant has this app (once per installation; retried by /api/cron). */
export async function announceInstall(merchantId: string): Promise<{ sent: boolean; reason?: string }> {
  const m = await getMerchant(merchantId);
  if (!m || m.status !== 'active') return { sent: false, reason: 'not connected' };
  const store = getStore();
  if ((await store.getKv<string>(announcedKey(merchantId))) === m.installedAt) return { sent: true, reason: 'already told' };
  await store.setKv(triedKey(merchantId), Date.now());
  const r = await emitSuite('installed', { cloverMerchantId: merchantId, appUrl: cloverConfig.appBaseUrl || null }, `installed:${merchantId}:${m.installedAt}`);
  if (r.sent || r.reason === 'kept for retry') await store.setKv(announcedKey(merchantId), m.installedAt);
  return r;
}

/** Tell the suite this merchant removed this app (Clover webhook A DELETE). */
export async function announceUninstall(merchantId: string): Promise<{ sent: boolean; reason?: string }> {
  await getStore().deleteKv(announcedKey(merchantId));
  directoryCache.delete(merchantId);
  return emitSuite('uninstalled', { cloverMerchantId: merchantId }, `uninstalled:${merchantId}:${Date.now()}`);
}

/** /api/cron: merchants not yet in the directory (connected before the link, or Food Hub was down). Hourly per merchant. */
export async function announceAll(now = Date.now()): Promise<{ sent: number }> {
  if (!suiteConfig()) return { sent: 0 };
  const store = getStore();
  let sent = 0;
  for (const m of await listMerchants()) {
    if ((await store.getKv<string>(announcedKey(m.merchantId))) === m.installedAt) continue;
    if (now - Number((await store.getKv<number>(triedKey(m.merchantId))) ?? 0) < 3600_000) continue;
    if ((await announceInstall(m.merchantId)).sent) sent++;
  }
  return { sent };
}

export interface DirectoryEntry { key: string; installed: boolean; url: string | null; at: string | null }
const DIRECTORY_TTL_MS = 5 * 60_000;
const DIRECTORY_RETRY_MS = 60_000;
// `until`: when to ask Food Hub again. A failure keeps the last good answer (or none) for a minute, so a Food Hub
// outage never slows every page of this app down.
const directoryCache = new Map<string, { until: number; apps: DirectoryEntry[] | null }>();

/** Which suite apps this restaurant has, from Food Hub (null when this app is not connected or Food Hub is down). */
export async function suiteDirectory(merchantId: string, now = Date.now()): Promise<DirectoryEntry[] | null> {
  const cfg = suiteConfig();
  if (!cfg || !merchantId) return null;
  const hit = directoryCache.get(merchantId);
  if (hit && now < hit.until) return hit.apps;
  const path = `/api/suite/v1/directory?merchant=${encodeURIComponent(merchantId)}`;
  const failed = () => { directoryCache.set(merchantId, { until: now + DIRECTORY_RETRY_MS, apps: hit?.apps ?? null }); return hit?.apps ?? null; };
  try {
    const res = await fetch(`${cfg.url}${path}`, { headers: { 'x-takatak-app': APP.key, 'x-takatak-signature': signSuite(cfg.secret, path) }, signal: AbortSignal.timeout(5000) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray(j.apps)) return failed();
    const apps: DirectoryEntry[] = j.apps
      .filter((a: any) => a && typeof a.key === 'string')
      .map((a: any) => ({ key: a.key, installed: a.installed === true, url: typeof a.url === 'string' && /^https?:\/\//.test(a.url) ? a.url : null, at: typeof a.at === 'string' ? a.at : null }));
    directoryCache.set(merchantId, { until: now + DIRECTORY_TTL_MS, apps });
    return apps;
  } catch {
    return failed();
  }
}

export const clearDirectoryCache = () => directoryCache.clear();
