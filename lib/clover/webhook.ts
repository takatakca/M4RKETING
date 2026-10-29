// This app's Clover webhook (Developer Dashboard → app → Webhooks → APP_BASE_URL/api/clover/webhooks).
//  1. Clover first POSTs { verificationCode }: it is kept (GET /api/clover/webhooks with the ADMIN_TOKEN shows it, and
//     the server log prints it once) to paste back in the Developer Dashboard.
//  2. Every other POST must carry X-Clover-Auth = CLOVER_WEBHOOK_AUTH. Anything else is refused (401).
//  3. Body: { appId, merchants: { <merchantId>: [{ objectId: "O:ABC", type: "CREATE", ts }] } }. Each event is handled
//     once (Clover retries), events of other apps are ignored, A (app) DELETE = uninstalled → tokens deleted.
import type { AppHooks, CloverEvent } from '../hooks';
import { APP } from '../app';
import { safeEqual } from '../core/crypto';
import { getStore } from '../core/store';
import { cloverConfig } from './config';
import { announceUninstall } from '../suite';
import { disconnectMerchant, getMerchant, refreshBilling } from './oauth';

export const VERIFICATION_KEY = 'clover:webhook-verification';

export type Gate = { done: true; status: number; json: Record<string, unknown> } | { done: false; body: any };

export async function webhookGate(raw: string, authHeader: string | null): Promise<Gate> {
  let body: any;
  try { body = JSON.parse(raw); } catch { return { done: true, status: 400, json: { ok: false, error: 'Invalid JSON' } }; }
  if (body && typeof body.verificationCode === 'string') {
    const code = body.verificationCode.slice(0, 200);
    const store = getStore();
    const cur = await store.getKv<{ code: string }>(VERIFICATION_KEY);
    if (cur?.code !== code) {
      await store.setKv(VERIFICATION_KEY, { code, at: new Date().toISOString() });
      console.log(`[${APP.key}] Clover webhook verification code: ${code} — paste it in the Developer Dashboard (app ${APP.cloverAppId} → Webhooks).`);
    }
    return { done: true, status: 200, json: { ok: true } };
  }
  const expected = cloverConfig.webhookAuth;
  if (!expected || !safeEqual(authHeader ?? '', expected)) return { done: true, status: 401, json: { ok: false, error: 'X-Clover-Auth check failed (CLOVER_WEBHOOK_AUTH).' } };
  return { done: false, body };
}

/** Flatten the body into events for connected merchants, each once. */
export async function dispatchWebhook(body: any, hooks: AppHooks): Promise<{ handled: number; skipped: number; uninstalled: string[] }> {
  const out = { handled: 0, skipped: 0, uninstalled: [] as string[] };
  if (body?.appId && String(body.appId) !== APP.cloverAppId) return out; // another app's event
  const store = getStore();
  for (const [merchantId, events] of Object.entries((body?.merchants ?? {}) as Record<string, any[]>)) {
    for (const ev of Array.isArray(events) ? events : []) {
      const [prefix, objectId = ''] = String(ev?.objectId ?? '').split(':');
      const type = String(ev?.type ?? '').toUpperCase();
      const ts = Number.isFinite(Number(ev?.ts)) ? Number(ev.ts) : null;
      if (!prefix || !(await store.claim(`m:${merchantId}:wh:${prefix}:${objectId}:${type}:${ts ?? ''}`, Date.now()))) { out.skipped++; continue; }
      if (prefix === 'A') {
        if (type === 'DELETE' && (await disconnectMerchant(merchantId))) {
          out.uninstalled.push(merchantId);
          await announceUninstall(merchantId).catch(() => null);
        }
        else if (type === 'UPDATE') await refreshBilling(merchantId).catch(() => null);
        out.handled++;
        continue;
      }
      if ((await getMerchant(merchantId))?.status !== 'active') { out.skipped++; continue; }
      const e: CloverEvent = { merchantId, prefix, objectId, type, ts };
      try { await hooks.onCloverEvent?.(e); out.handled++; }
      catch (err) { console.error(`[${APP.key}] webhook ${prefix}:${objectId} ${type} failed`, err instanceof Error ? err.message : err); }
    }
  }
  return out;
}
