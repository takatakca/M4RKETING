// Server pages: language, the signed-in merchant, its plan, and who is looking (role, name, what they may do).
import { cookies, headers } from 'next/headers';
import { getMerchant, merchantTier, type MerchantRecord } from '../clover/oauth';
import type { Tier } from '../app';
import { allowed, effectiveRole, getPolicy, type AccessPolicy } from './access';
import { langFrom, type Lang } from './i18n';
import type { Role } from './roles';
import { sessionCookieName, verifySession, type Session } from './session';

export interface PageCtx {
  lang: Lang;
  merchantId: string | null;
  merchant: MerchantRecord | null;
  tier: Tier;
  session: Session | null;
  role: Role;
  roleVerified: boolean;
  /** The person's name from Clover, when known. */
  person: string | null;
  policy: AccessPolicy | null;
  /** May this person do (or see) this action? */
  can: (action: string) => boolean;
}

export async function pageContext(): Promise<PageCtx> {
  const c = await cookies();
  const h = await headers();
  const lang = langFrom(c.get('lang')?.value, h.get('accept-language'));
  const s = verifySession(c.get(sessionCookieName())?.value);
  const merchant = s ? await getMerchant(s.merchantId) : null;
  const active = merchant?.status === 'active' ? merchant : null;
  const policy = active ? await getPolicy(active.merchantId) : null;
  const who = policy ? effectiveRole(s?.role, policy) : { role: 'employee' as Role, verified: false };
  return {
    lang, merchantId: active?.merchantId ?? null, merchant: active, tier: merchantTier(active), session: active ? s : null,
    role: who.role, roleVerified: who.verified, person: active ? s?.name ?? null : null, policy,
    can: (action) => !!policy && allowed(policy, who.role, action),
  };
}
