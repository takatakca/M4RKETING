// Clover configuration — server variables only, no secret in this file (see .env.example and DEPLOY.md).
//   CLOVER_APP_ID         this app's Clover App ID (defaults to config/app.config.json)
//   CLOVER_CLIENT_ID      OAuth client id = the App ID for Clover apps (defaults to CLOVER_APP_ID)
//   CLOVER_CLIENT_SECRET  App Secret (Developer Dashboard → app → App settings)
//   CLOVER_WEBHOOK_AUTH   webhook auth code shown by Clover after verification (X-Clover-Auth)
//   CLOVER_API_BASE       https://api.clover.com (North America), https://apisandbox.dev.clover.com (sandbox)
//   CLOVER_WEB_URL        authorize page; derived: sandbox → https://sandbox.dev.clover.com, else https://www.clover.com
//   APP_BASE_URL          this app's public https address (OAuth redirect = APP_BASE_URL/api/clover/connect/callback)
import { APP } from '../app';

const env = (k: string) => (process.env[k] ?? '').trim();
const strip = (u: string) => u.replace(/\/+$/, '');

export const cloverConfig = {
  get appId() { return APP.cloverAppId; },
  get clientId() { return env('CLOVER_CLIENT_ID') || APP.cloverAppId; },
  get clientSecret() { return env('CLOVER_CLIENT_SECRET'); },
  get webhookAuth() { return env('CLOVER_WEBHOOK_AUTH'); },
  get apiBase() { return strip(env('CLOVER_API_BASE') || 'https://api.clover.com'); },
  get webUrl() {
    const w = env('CLOVER_WEB_URL');
    if (w) return strip(w);
    return /sandbox/.test(this.apiBase) ? 'https://sandbox.dev.clover.com' : 'https://www.clover.com';
  },
  get appBaseUrl() { return strip(env('APP_BASE_URL')); },
};

export function cloverConfigured(): boolean {
  return Boolean(cloverConfig.clientId && cloverConfig.clientSecret && cloverConfig.appBaseUrl);
}

export const CALLBACK_PATH = '/api/clover/connect/callback';
export const WEBHOOK_PATH = '/api/clover/webhooks';
export const redirectUri = () => `${cloverConfig.appBaseUrl}${CALLBACK_PATH}`;

/** What is missing before merchants can connect (names only). */
export function cloverMissing(): string[] {
  const out: string[] = [];
  if (!cloverConfig.clientSecret) out.push('CLOVER_CLIENT_SECRET');
  if (!cloverConfig.appBaseUrl) out.push('APP_BASE_URL');
  if (!cloverConfig.webhookAuth) out.push('CLOVER_WEBHOOK_AUTH');
  return out;
}
