// Who is calling a merchant API: the signed-in person (session cookie set by the Clover callback) or a device key.
// Then two checks, both on the server: the plan (tier) and, for sensitive actions, the person's role
// (lib/core/access.ts). The activity log gets every refusal and every allowed change (POST, PUT, PATCH, DELETE);
// an allowed read only when the route asks for it (`audit: 'always'`, e.g. a data export).
import { fail } from './http';
import { sessionFromRequest } from './session';
import { getMerchant, merchantTier, type MerchantRecord } from '../clover/oauth';
import { tierAtLeast, type Tier } from '../app';
import { allowed, effectiveRole, getPolicy, type AccessPolicy } from './access';
import { audit } from './audit';
import { deviceFromKey } from './devices';
import { ROLE_LABEL, type Role } from './roles';

export type MerchantCtx = {
  merchantId: string;
  merchant: MerchantRecord;
  tier: Tier;
  role: Role;
  /** false: Clover did not confirm the role (see Account → Authorized actions). */
  verified: boolean;
  /** Name for notes and the activity log: the person, or "Device: <name>". */
  actor: string;
  device: boolean;
};

const planRefusal = (need: Tier) => fail(`This feature is part of the ${need === 'vip' ? 'VIP' : 'Premium'} plan.`, 402, { need });

export type ActionOpts = { action?: string; audit?: 'always' | 'changes' };

async function checkAction(req: Request, ctx: MerchantCtx, opts: ActionOpts, known?: AccessPolicy): Promise<MerchantCtx | Response> {
  const { action } = opts;
  if (!action) return ctx;
  const policy = known ?? await getPolicy(ctx.merchantId);
  const ok = allowed(policy, ctx.role, action);
  if (!ok || req.method !== 'GET' || opts.audit === 'always') {
    await audit(ctx.merchantId, { action, outcome: ok ? 'allowed' : 'refused', actor: ctx.actor, role: ctx.role, verified: ctx.verified, method: req.method, path: new URL(req.url).pathname })
      .catch((e) => console.error('[audit] write failed', e instanceof Error ? e.message : e));
  }
  if (ok) return ctx;
  const need = policy.min[action] ?? 'owner';
  return fail(`Your role (${ROLE_LABEL[ctx.role][1]}) cannot do this; ${ROLE_LABEL[need][1]} or higher can. The owner can change it in Account → Authorized actions.`, 403, { action, need });
}

export async function requireMerchant(req: Request, need: Tier = 'base', opts: ActionOpts = {}): Promise<MerchantCtx | Response> {
  const s = sessionFromRequest(req);
  if (!s) return fail('Not signed in: open the app from your Clover dashboard.', 401);
  const merchant = await getMerchant(s.merchantId);
  if (!merchant || merchant.status !== 'active') return fail('This merchant is not connected: open the app from Clover again.', 401);
  const tier = merchantTier(merchant);
  if (!tierAtLeast(tier, need)) return planRefusal(need);
  const policy = await getPolicy(s.merchantId);
  const who = effectiveRole(s.role, policy);
  const actor = s.name || `${ROLE_LABEL[who.role][1]}${s.employeeId ? ` ${s.employeeId}` : ''}`;
  return checkAction(req, { merchantId: s.merchantId, merchant, tier, role: who.role, verified: who.verified, actor, device: false }, opts, policy);
}

export const isCtx = (x: MerchantCtx | Response): x is MerchantCtx => !(x instanceof Response);

/** A signed-in person, or a device key of that merchant (Clover device, kiosk). A device acts as an employee. */
export async function requireMerchantOrDevice(req: Request, need: Tier = 'base', opts: ActionOpts & { kind?: string } = {}): Promise<MerchantCtx | Response> {
  const auth = req.headers.get('authorization');
  if (auth && /^Bearer\s+dk_/.test(auth)) {
    const d = await deviceFromKey(auth);
    if (!d || (opts.kind && d.kind !== opts.kind)) return fail('Unknown or revoked device key.', 401);
    const merchant = await getMerchant(d.merchantId);
    if (!merchant || merchant.status !== 'active') return fail('This merchant is not connected.', 401);
    const tier = merchantTier(merchant);
    if (!tierAtLeast(tier, need)) return planRefusal(need);
    return checkAction(req, { merchantId: d.merchantId, merchant, tier, role: 'employee', verified: true, actor: `Device: ${d.name}`, device: true }, opts);
  }
  return requireMerchant(req, need, opts);
}
