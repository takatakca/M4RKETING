// Storage: PostgreSQL when DATABASE_URL is set (tables created on first use), memory otherwise (dev and tests only:
// everything is lost at restart, so production always sets DATABASE_URL).
//   merchants  one record per Clover merchant that installed the app (tokens sealed, see crypto.ts)
//   kv         small settings and one-time claims (webhook idempotency)
//   docs       the app's own records, by collection, merchant and time
import type { Pool } from 'pg';

export interface Doc<T = Record<string, unknown>> { collection: string; id: string; merchantId: string; at: string; data: T }
export interface DocQuery { merchantId?: string; since?: string; until?: string; limit?: number }

export interface Store {
  mode: 'postgres' | 'memory';
  getKv<T>(key: string): Promise<T | null>;
  setKv(key: string, value: unknown): Promise<void>;
  deleteKv(key: string): Promise<void>;
  /** Writes only if the key is new; true = this caller got it (idempotency, once-only work). */
  claim(key: string, value?: unknown): Promise<boolean>;
  put<T>(collection: string, id: string, merchantId: string, data: T, at?: string): Promise<Doc<T>>;
  get<T>(collection: string, id: string): Promise<Doc<T> | null>;
  list<T>(collection: string, q?: DocQuery): Promise<Array<Doc<T>>>;
  remove(collection: string, id: string): Promise<void>;
  /** Every record of one merchant (app uninstalled, or the merchant asked for deletion). */
  purgeMerchant(merchantId: string): Promise<void>;
}

const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const nowIso = () => new Date().toISOString();

function memoryStore(): Store {
  const kv = new Map<string, unknown>();
  const docs = new Map<string, Doc>();
  const k = (c: string, id: string) => `${c}\u0000${id}`;
  return {
    mode: 'memory',
    async getKv<T>(key: string) { return (kv.has(key) ? clone(kv.get(key)) : null) as T | null; },
    async setKv(key, value) { kv.set(key, clone(value)); },
    async deleteKv(key) { kv.delete(key); },
    async claim(key, value = true) { if (kv.has(key)) return false; kv.set(key, clone(value)); return true; },
    async put<T>(collection: string, id: string, merchantId: string, data: T, at = nowIso()) {
      const d = { collection, id, merchantId, at, data: clone(data) } as Doc<T>;
      docs.set(k(collection, id), d as Doc);
      return clone(d);
    },
    async get<T>(collection: string, id: string) { return (clone(docs.get(k(collection, id))) ?? null) as Doc<T> | null; },
    async list<T>(collection: string, q: DocQuery = {}) {
      return [...docs.values()]
        .filter((d) => d.collection === collection && (!q.merchantId || d.merchantId === q.merchantId) && (!q.since || d.at >= q.since) && (!q.until || d.at < q.until))
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, q.limit ?? 1000)
        .map((d) => clone(d)) as Array<Doc<T>>;
    },
    async remove(collection, id) { docs.delete(k(collection, id)); },
    async purgeMerchant(merchantId) {
      for (const [key, d] of docs) if (d.merchantId === merchantId) docs.delete(key);
      for (const key of [...kv.keys()]) if (key.startsWith(`m:${merchantId}:`)) kv.delete(key);
    },
  };
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS app_kv (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS app_docs (
  collection text NOT NULL, id text NOT NULL, merchant_id text NOT NULL, at timestamptz NOT NULL, data jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (collection, id));
CREATE INDEX IF NOT EXISTS app_docs_merchant ON app_docs (collection, merchant_id, at DESC);`;

function pgStore(url: string): Store {
  let pool: Pool | null = null;
  let ready: Promise<void> | null = null;
  async function db(): Promise<Pool> {
    if (!pool) {
      const { Pool } = await import('pg');
      const ssl = /sslmode=(require|verify)/.test(url) ? { rejectUnauthorized: !/sslmode=require/.test(url) } : undefined;
      pool = new Pool({ connectionString: url, max: 5, ssl });
    }
    if (!ready) ready = pool.query(SCHEMA).then(() => undefined);
    await ready;
    return pool;
  }
  const row = <T,>(r: any): Doc<T> => ({ collection: r.collection, id: r.id, merchantId: r.merchant_id, at: new Date(r.at).toISOString(), data: r.data });
  return {
    mode: 'postgres',
    async getKv<T>(key: string) { const r = await (await db()).query('SELECT value FROM app_kv WHERE key = $1', [key]); return (r.rows[0]?.value ?? null) as T | null; },
    async setKv(key, value) { await (await db()).query('INSERT INTO app_kv (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()', [key, JSON.stringify(value)]); },
    async deleteKv(key) { await (await db()).query('DELETE FROM app_kv WHERE key = $1', [key]); },
    async claim(key, value = true) { const r = await (await db()).query('INSERT INTO app_kv (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, JSON.stringify(value)]); return r.rowCount === 1; },
    async put<T>(collection: string, id: string, merchantId: string, data: T, at = nowIso()) {
      await (await db()).query(
        `INSERT INTO app_docs (collection, id, merchant_id, at, data) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (collection, id) DO UPDATE SET merchant_id = EXCLUDED.merchant_id, at = EXCLUDED.at, data = EXCLUDED.data, updated_at = now()`,
        [collection, id, merchantId, at, JSON.stringify(data)]);
      return { collection, id, merchantId, at, data };
    },
    async get<T>(collection: string, id: string) { const r = await (await db()).query('SELECT * FROM app_docs WHERE collection = $1 AND id = $2', [collection, id]); return r.rows[0] ? row<T>(r.rows[0]) : null; },
    async list<T>(collection: string, q: DocQuery = {}) {
      const where = ['collection = $1'];
      const args: unknown[] = [collection];
      if (q.merchantId) { args.push(q.merchantId); where.push(`merchant_id = $${args.length}`); }
      if (q.since) { args.push(q.since); where.push(`at >= $${args.length}`); }
      if (q.until) { args.push(q.until); where.push(`at < $${args.length}`); }
      args.push(Math.min(q.limit ?? 1000, 10_000));
      const r = await (await db()).query(`SELECT * FROM app_docs WHERE ${where.join(' AND ')} ORDER BY at DESC LIMIT $${args.length}`, args);
      return r.rows.map((x) => row<T>(x));
    },
    async remove(collection, id) { await (await db()).query('DELETE FROM app_docs WHERE collection = $1 AND id = $2', [collection, id]); },
    async purgeMerchant(merchantId) {
      const p = await db();
      await p.query('DELETE FROM app_docs WHERE merchant_id = $1', [merchantId]);
      await p.query('DELETE FROM app_kv WHERE key LIKE $1', [`m:${merchantId}:%`]);
    },
  };
}

export function getStore(): Store {
  const g = globalThis as unknown as { __appStore?: Store; __appStoreUrl?: string };
  const url = (process.env.DATABASE_URL ?? '').trim();
  if (!g.__appStore || g.__appStoreUrl !== url) {
    g.__appStore = url ? pgStore(url) : memoryStore();
    g.__appStoreUrl = url;
  }
  return g.__appStore;
}

/** Tests: start from an empty memory store. */
export function resetStore(): void {
  (globalThis as unknown as { __appStore?: Store }).__appStore = undefined;
}
