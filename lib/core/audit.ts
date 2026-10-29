// Activity log (Account → Activity log): every call that needs an authorized action is written here, allowed or
// refused: who (name and role, or the device), what, when. Kept 180 days (/api/cron removes older entries).
import { randomToken } from './crypto';
import type { Role } from './roles';
import { getStore } from './store';

export const AUDIT = 'audit';
export const AUDIT_KEEP_DAYS = 180;

export interface AuditEntry { action: string; outcome: 'allowed' | 'refused'; actor: string; role: Role; verified: boolean; method: string; path: string }

export async function audit(merchantId: string, e: AuditEntry): Promise<void> {
  await getStore().put(AUDIT, `${Date.now().toString(36)}${randomToken(6)}`, merchantId, { ...e, actor: e.actor.slice(0, 80), path: e.path.slice(0, 120) });
}

export async function recentAudit(merchantId: string, limit = 100): Promise<Array<AuditEntry & { at: string }>> {
  return (await getStore().list<AuditEntry>(AUDIT, { merchantId, limit })).map((d) => ({ ...d.data, at: d.at }));
}

/** Drop entries older than the retention (all merchants, at most `max` per run). */
export async function purgeAudit(now = Date.now(), max = 2000): Promise<number> {
  const store = getStore();
  const old = await store.list(AUDIT, { until: new Date(now - AUDIT_KEEP_DAYS * 86400_000).toISOString(), limit: max });
  for (const d of old) await store.remove(AUDIT, d.id);
  return old.length;
}
