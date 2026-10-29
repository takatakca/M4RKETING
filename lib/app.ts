// This app's identity (config/app.config.json) and its tiers. Every TAKATAK Suite app has the same kit
// (lib/core, lib/clover, lib/suite.ts) and its own features under lib/domain/.
import config from '@/config/app.config.json';

export type Tier = 'base' | 'premium' | 'vip';
const RANK: Record<Tier, number> = { base: 1, premium: 2, vip: 3 };

type Config = typeof config & { key: string; summaryFr?: string; summaryEn?: string };
const c = config as Config;

export const APP = {
  key: c.key,
  name: c.name,
  /** The name without " by TAKATAK" (menus, where GROUPE TAKATAK already shows under it). */
  short: c.name.replace(/\s+by\s+TAKATAK$/i, ''),
  cloverAppId: (process.env.CLOVER_APP_ID ?? '').trim() || c.cloverAppId,
  summaryFr: c.summaryFr ?? '',
  summaryEn: c.summaryEn ?? '',
  tiers: c.tiers as Array<{ name: string; priceCadPerMonth: number }>,
  permissions: c.permissions,
  webhookEvents: c.webhookEvents as string[],
};

/** Plan name from Clover billing ("VIP", "Premium 100 $"…) → tier. Unknown or none → base. */
export function tierFromPlan(plan: string | null | undefined): Tier {
  const p = String(plan ?? '').toLowerCase();
  if (/\bvip\b/.test(p)) return 'vip';
  if (/premium/.test(p)) return 'premium';
  return 'base';
}

export const tierAtLeast = (have: Tier, need: Tier) => RANK[have] >= RANK[need];

/** Our own restaurants (OWN_MERCHANTS, comma-separated Clover merchant IDs) get every feature and are never billed. */
export function ownMerchants(): Set<string> {
  return new Set((process.env.OWN_MERCHANTS ?? '').split(',').map((s) => s.trim()).filter(Boolean));
}

/**
 * Merchants the app may READ but never write to (NEVER_WRITE_MERCHANTS, default: the dormant On2GO.ca account
 * RNVTBYMCKXEJ1, owner's standing order "ne jamais modifier").
 */
export function readOnlyMerchants(): Set<string> {
  const raw = process.env.NEVER_WRITE_MERCHANTS ?? 'RNVTBYMCKXEJ1';
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}
