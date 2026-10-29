import { APP } from '@/lib/app';
import { cloverMissing } from '@/lib/clover/config';
import { ok } from '@/lib/core/http';
import { getStore } from '@/lib/core/store';
import { suiteConfig } from '@/lib/suite';

export const dynamic = 'force-dynamic';

// Coolify health check: 200 when the app runs and its storage answers. Names what is not set yet (never values).
export async function GET() {
  let storage = 'ok';
  try { await getStore().getKv('health'); } catch { storage = 'down'; }
  const body = { app: APP.key, cloverAppId: APP.cloverAppId, storage, storageMode: getStore().mode, missing: cloverMissing(), suite: suiteConfig() ? 'connected' : 'off', commit: process.env.SOURCE_COMMIT ?? null };
  return storage === 'ok' ? ok(body) : ok({ ...body, ok: false }, 503);
}
