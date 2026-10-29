// Merchant session: after Clover sends the merchant here (install or "Open app"), the OAuth callback sets a signed
// cookie naming the merchant, and the person who opened the app (Clover employee ID, name and role: owner, admin,
// manager or employee). Every dashboard page and merchant API reads it. SESSION_SECRET (32+ characters) signs it;
// production without it refuses to sign anyone in. A role change in Clover applies at the next sign-in.
import crypto from 'node:crypto';
import { APP } from '../app';
import { hmacHex, safeEqual } from './crypto';
import { isRole, type Role } from './roles';

export const SESSION_DAYS = 7;
export const sessionCookieName = () => `${APP.key}_session`;

export interface Session {
  merchantId: string;
  employeeId?: string | null;
  /** Clover role of the person, or null when Clover did not tell it (see Account → Authorized actions). */
  role?: Role | null;
  name?: string | null;
  exp: number;
}

let devSecret: string | null = null;
function secret(): string | null {
  const s = (process.env.SESSION_SECRET ?? '').trim();
  if (s.length >= 32) return s;
  if (process.env.NODE_ENV === 'production' || process.env.DATABASE_URL) return null;
  devSecret ??= crypto.randomBytes(32).toString('hex'); // dev and tests only
  return devSecret;
}

export function signSession(s: Omit<Session, 'exp'>, days = SESSION_DAYS, now = Date.now()): string | null {
  const key = secret();
  if (!key) return null;
  const body = Buffer.from(JSON.stringify({
    m: s.merchantId, e: s.employeeId ?? null, r: s.role ?? null, n: s.name ? s.name.slice(0, 60) : null, x: Math.floor(now / 1000) + days * 86400,
  })).toString('base64url');
  return `${body}.${hmacHex(key, `session:${body}`)}`;
}

export function verifySession(token: string | null | undefined, now = Date.now()): Session | null {
  const key = secret();
  if (!key || !token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig || !safeEqual(sig, hmacHex(key, `session:${body}`))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (typeof p.m !== 'string' || typeof p.x !== 'number' || p.x * 1000 < now) return null;
    return { merchantId: p.m, employeeId: p.e ?? null, role: isRole(p.r) ? p.r : null, name: typeof p.n === 'string' ? p.n : null, exp: p.x };
  } catch {
    return null;
  }
}

export function readCookie(header: string | null | undefined, name: string): string | null {
  for (const part of String(header ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export const sessionFromRequest = (req: Request) => verifySession(readCookie(req.headers.get('cookie'), sessionCookieName()));

export function sessionCookie(token: string, days = SESSION_DAYS): string {
  const secure = (process.env.APP_BASE_URL ?? '').startsWith('https://') ? '; Secure' : '';
  return `${sessionCookieName()}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${days * 86400}${secure}`;
}

export const clearSessionCookie = () => `${sessionCookieName()}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
