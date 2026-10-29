// Test helpers shared by every suite app: a fake Clover (fetch stub) and a connected merchant.
import { vi } from 'vitest';
import { resetStore } from '@/lib/core/store';
import { clearMenuCache } from '@/lib/clover/menu';
import { finishConnect } from '@/lib/clover/oauth';

export const MID = 'MERCHANT0001';
export type Route = (url: URL, init?: RequestInit) => unknown | Response | undefined;
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Fresh memory store + env; `routes` answers Clover API paths (return undefined to fall through). */
export function fakeClover(routes: Route[] = []) {
  resetStore();
  clearMenuCache();
  delete process.env.DATABASE_URL; delete process.env.TOKEN_ENCRYPTION_KEY;
  Object.assign(process.env, { CLOVER_CLIENT_SECRET: 'app-secret-for-tests', APP_BASE_URL: 'https://app.example.ca', CLOVER_WEBHOOK_AUTH: 'webhook-auth-code', CLOVER_API_BASE: 'https://api.clover.test' });
  delete process.env.OWN_MERCHANTS; delete process.env.FOODHUB_URL; delete process.env.FOODHUB_SUITE_SECRET;
  const calls: Array<{ method: string; path: string; search: string; body: any }> = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(String(input));
    const body = init?.body ? (() => { try { return JSON.parse(String(init.body)); } catch { return init.body; } })() : undefined;
    calls.push({ method: init?.method ?? 'GET', path: url.pathname, search: url.search, body });
    if (url.pathname === '/oauth/v2/token') return json({ access_token: 'AT', access_token_expiration: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'RT' });
    for (const r of routes) {
      const out = await r(url, init);
      if (out instanceof Response) return out;
      if (out !== undefined) return json(out);
    }
    if (url.pathname.endsWith('/billing_info')) return json({ status: 'ACTIVE', appSubscription: { name: 'VIP' } });
    if (url.pathname === `/v3/merchants/${MID}`) return json({ id: MID, name: 'Test Resto' });
    return json({ elements: [] });
  }));
  return calls;
}

export async function connect(mid = MID) {
  const r = await finishConnect({ code: 'code', merchantId: mid });
  if (!r.ok) throw new Error(r.error);
}
