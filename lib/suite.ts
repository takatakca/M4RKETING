// The TAKATAK Suite link (contract: foodhubca docs/TAKATAK_SUITE.md). This app works alone; with these variables it
// also takes Food Hub's order events and talks to the other suite apps through Food Hub:
//   FOODHUB_URL           Food Hub address (https://foodhub.on2go.ca)
//   FOODHUB_SUITE_SECRET  32+ characters; the same value as FOODHUB_SUITE_<APP>_SECRET in Food Hub
// Food Hub POSTs signed events to APP_BASE_URL/api/suite/events; this app signs its own calls the same way:
//   X-Takatak-Signature: t=<unix s>,v1=<hex HMAC-SHA256(secret, "<t>.<body or path+query>")>, 5-minute window.
import crypto from 'node:crypto';
import { APP } from './app';
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
  return { status: 200, json: { ok: true } };
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
    if (res.ok) return { sent: true };
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
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) { await store.remove('suite_outbox', d.id); if (res.ok) sent++; continue; }
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
