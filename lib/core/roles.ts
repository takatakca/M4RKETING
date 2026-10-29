// Clover roles, lowest to highest. The Clover employee record says ADMIN, MANAGER or EMPLOYEE, and isOwner for the owner.
export const ROLES = ['employee', 'manager', 'admin', 'owner'] as const;
export type Role = (typeof ROLES)[number];

export const isRole = (x: unknown): x is Role => typeof x === 'string' && (ROLES as readonly string[]).includes(x);
export const roleAtLeast = (have: Role, need: Role) => ROLES.indexOf(have) >= ROLES.indexOf(need);

export const ROLE_LABEL: Record<Role, [string, string]> = {
  employee: ['Employé', 'Employee'], manager: ['Gérant', 'Manager'], admin: ['Administrateur', 'Admin'], owner: ['Propriétaire', 'Owner'],
};

/** Clover employee JSON → role (null when Clover gave nothing usable). */
export function roleFromClover(e: { role?: unknown; isOwner?: unknown } | null | undefined): Role | null {
  if (!e) return null;
  if (e.isOwner === true) return 'owner';
  const r = String(e.role ?? '').toUpperCase();
  return r === 'ADMIN' ? 'admin' : r === 'MANAGER' ? 'manager' : r === 'EMPLOYEE' ? 'employee' : null;
}
