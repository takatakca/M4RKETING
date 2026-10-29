// Calls to the Clover REST API for one merchant, with its own token (refreshed when needed, once more on a 401).
// Writes are refused for the read-only merchants (NEVER_WRITE_MERCHANTS, see lib/app.ts).
import { readOnlyMerchants } from '../app';
import { cloverConfig } from './config';
import { cloverFetch } from './http';
import { accessToken } from './oauth';

export interface CloverResult<T = any> { ok: boolean; status: number; json: T | null; error?: string }
/** Query values; an array repeats the key (Clover filters: filter=createdTime>=… & filter=createdTime<…). */
export type Query = Record<string, string | number | undefined | Array<string | number>>;

export async function cloverRequest<T = any>(merchantId: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, opts: { query?: Query; body?: unknown } = {}): Promise<CloverResult<T>> {
  if (method !== 'GET' && readOnlyMerchants().has(merchantId)) return { ok: false, status: 0, json: null, error: `Merchant ${merchantId} is read-only for TAKATAK apps (NEVER_WRITE_MERCHANTS).` };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.query ?? {})) for (const one of Array.isArray(v) ? v : [v]) if (one !== undefined && one !== '') qs.append(k, String(one));
  const url = `${cloverConfig.apiBase}${path}${qs.size ? `?${qs}` : ''}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await accessToken(merchantId, { force: attempt > 0 });
    if (!token) return { ok: false, status: 0, json: null, error: 'This merchant is not connected (open the app from Clover once).' };
    let res: Response;
    try {
      res = await cloverFetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
      });
    } catch (e) {
      return { ok: false, status: 0, json: null, error: `Clover network error: ${e instanceof Error ? e.message : String(e)}` };
    }
    if (res.status === 401 && attempt === 0) { await res.body?.cancel().catch(() => undefined); continue; }
    const text = await res.text();
    let json: any = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return res.ok ? { ok: true, status: res.status, json } : { ok: false, status: res.status, json, error: `Clover HTTP ${res.status}: ${text.slice(0, 200)}` };
  }
  return { ok: false, status: 401, json: null, error: 'Clover refused the token.' };
}

export const cloverGet = <T = any>(mid: string, path: string, query?: Query) => cloverRequest<T>(mid, 'GET', path, { query });
export const cloverPost = <T = any>(mid: string, path: string, body: unknown) => cloverRequest<T>(mid, 'POST', path, { body });
export const cloverDelete = <T = any>(mid: string, path: string) => cloverRequest<T>(mid, 'DELETE', path);

/** Every element of a list endpoint (Clover pages with limit/offset; 1000 per page, at most `max`). */
export async function cloverGetAll<T = any>(mid: string, path: string, query: Query = {}, max = 10_000): Promise<{ ok: boolean; items: T[]; error?: string }> {
  const items: T[] = [];
  for (let offset = 0; offset < max; offset += 1000) {
    const r = await cloverGet<{ elements?: T[] }>(mid, path, { ...query, limit: 1000, offset });
    if (!r.ok) return { ok: false, items, error: r.error };
    const page = r.json?.elements ?? [];
    items.push(...page);
    if (page.length < 1000) break;
  }
  return { ok: true, items };
}

export const mpath = (mid: string, rest: string) => `/v3/merchants/${encodeURIComponent(mid)}${rest}`;
