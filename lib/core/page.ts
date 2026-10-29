// Server pages: language, signed-in merchant and tier, from the request cookies.
import { cookies, headers } from 'next/headers';
import { getMerchant, merchantTier, type MerchantRecord } from '../clover/oauth';
import type { Tier } from '../app';
import { langFrom, type Lang } from './i18n';
import { sessionCookieName, verifySession } from './session';

export interface PageCtx { lang: Lang; merchantId: string | null; merchant: MerchantRecord | null; tier: Tier }

export async function pageContext(): Promise<PageCtx> {
  const c = await cookies();
  const h = await headers();
  const lang = langFrom(c.get('lang')?.value, h.get('accept-language'));
  const s = verifySession(c.get(sessionCookieName())?.value);
  const merchant = s ? await getMerchant(s.merchantId) : null;
  const active = merchant?.status === 'active' ? merchant : null;
  return { lang, merchantId: active?.merchantId ?? null, merchant: active, tier: merchantTier(active) };
}
