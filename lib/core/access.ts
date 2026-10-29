// Authorized actions: each sensitive action has a lowest Clover role (owner > admin > manager > employee). The app
// declares its actions with defaults (lib/domain `actions`); the owner can raise or lower each one in Account →
// Authorized actions. Checked on the server for every call (lib/core/guard.ts), never only hidden in the screen.
// A device key (register, kiosk) acts as an employee. When Clover did not tell the person's role (the app lacks the
// Employees read permission, or no employee ID came back), the person counts as `unverified` (owner by default, so the
// app keeps working; the owner can set it to employee once roles show).
import { actions as appActions } from '@/lib/domain';
import type { AppAction } from '../nav';
import { isRole, roleAtLeast, type Role } from './roles';
import { getStore } from './store';

export const SHARED_ACTIONS: AppAction[] = [
  { key: 'account.access', fr: 'Changer les actions autorisées', en: 'Change authorized actions', min: 'owner' },
  { key: 'account.devices', fr: 'Créer et retirer des clés d’appareil', en: 'Create and revoke device keys', min: 'manager' },
  { key: 'account.export', fr: 'Exporter les données du compte', en: 'Export the account data', min: 'admin' },
];
/** Lowest setting allowed for some actions (the policy page itself always stays with admins or the owner). */
const FLOOR: Record<string, Role> = { 'account.access': 'admin' };

export const allActions = (): AppAction[] => [...SHARED_ACTIONS, ...appActions];

export interface AccessPolicy { min: Record<string, Role>; unverified: Role }

const key = (merchantId: string) => `m:${merchantId}:access`;

export async function getPolicy(merchantId: string): Promise<AccessPolicy> {
  const saved = await getStore().getKv<Partial<AccessPolicy>>(key(merchantId));
  const min: Record<string, Role> = {};
  for (const a of allActions()) {
    const v = saved?.min?.[a.key];
    min[a.key] = isRole(v) && (!FLOOR[a.key] || roleAtLeast(v, FLOOR[a.key])) ? v : a.min;
  }
  return { min, unverified: saved?.unverified === 'employee' ? 'employee' : 'owner' };
}

export async function setPolicy(merchantId: string, patch: { min?: Record<string, unknown>; unverified?: unknown }): Promise<AccessPolicy | { error: string }> {
  const cur = await getPolicy(merchantId);
  const known = new Set(allActions().map((a) => a.key));
  for (const [k, v] of Object.entries(patch.min ?? {})) {
    if (!known.has(k)) return { error: `Unknown action: ${k}` };
    if (!isRole(v)) return { error: `Unknown role for ${k}` };
    if (FLOOR[k] && !roleAtLeast(v, FLOOR[k])) return { error: `${k} stays with ${FLOOR[k]} or higher.` };
    cur.min[k] = v;
  }
  if (patch.unverified !== undefined) {
    if (patch.unverified !== 'owner' && patch.unverified !== 'employee') return { error: 'unverified must be owner or employee' };
    cur.unverified = patch.unverified;
  }
  await getStore().setKv(key(merchantId), cur);
  return cur;
}

/** The role used for checks: the Clover role, or the policy's choice for an unverified person. */
export function effectiveRole(role: Role | null | undefined, policy: AccessPolicy): { role: Role; verified: boolean } {
  return isRole(role) ? { role, verified: true } : { role: policy.unverified, verified: false };
}

/** Unknown actions are refused (a typo never opens a door). */
export function allowed(policy: AccessPolicy, role: Role, action: string): boolean {
  const need = policy.min[action];
  return !!need && roleAtLeast(role, need);
}
