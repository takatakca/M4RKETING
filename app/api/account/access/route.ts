import { allActions, getPolicy, setPolicy } from '@/lib/core/access';
import { isCtx, requireMerchant } from '@/lib/core/guard';
import { fail, ok, readJson } from '@/lib/core/http';

export const dynamic = 'force-dynamic';

// Account → Authorized actions. Reading: anyone signed in. Changing: account.access (owner by default, admin at least).
// Body: { min: { "<action>": "employee" | "manager" | "admin" | "owner" }, unverified?: "owner" | "employee" }
// (the form also sends "min.<action>" keys flat; both are accepted).
export async function GET(req: Request) {
  const c = await requireMerchant(req);
  if (!isCtx(c)) return c;
  return ok({ policy: await getPolicy(c.merchantId), actions: allActions(), you: { role: c.role, verified: c.verified } });
}

export async function PUT(req: Request) {
  const c = await requireMerchant(req, 'base', { action: 'account.access' });
  if (!isCtx(c)) return c;
  const b = await readJson(req);
  if (!b) return fail('JSON body required');
  const min: Record<string, unknown> = { ...(b.min && typeof b.min === 'object' ? b.min : {}) };
  for (const [k, v] of Object.entries(b)) if (k.startsWith('min.')) min[k.slice(4)] = v;
  if (!c.verified && b.unverified === 'employee') return fail('Your own role is not confirmed by Clover: you would lock yourself out. Give the app the Employees permission first.', 409);
  const r = await setPolicy(c.merchantId, { min, unverified: b.unverified });
  return 'error' in r ? fail(r.error) : ok({ policy: r });
}
