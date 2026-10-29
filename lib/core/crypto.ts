// Small crypto helpers shared by the app: constant-time compare, HMAC, random tokens, and AES-256-GCM for the
// merchant's Clover tokens at rest (TOKEN_ENCRYPTION_KEY: 32 bytes as 64 hex characters or base64).
import crypto from 'node:crypto';

export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export const hmacHex = (secret: string, data: string) => crypto.createHmac('sha256', secret).update(data).digest('hex');
export const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString('base64url');

function encryptionKey(): Buffer | null {
  const raw = (process.env.TOKEN_ENCRYPTION_KEY ?? '').trim();
  if (!raw) return null;
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  return key.length === 32 ? key : null;
}

/** True when tokens can be stored: a valid key, or a dev/test run without a database. */
export function canStoreSecrets(): boolean {
  return !!encryptionKey() || !process.env.DATABASE_URL;
}

/** "enc:v1:<iv>.<tag>.<data>" with a key; plain text only when there is no key AND no database (dev, tests). */
export function sealSecret(plain: string): string {
  const key = encryptionKey();
  if (!key) {
    if (process.env.DATABASE_URL) throw new Error('TOKEN_ENCRYPTION_KEY (32 bytes, hex or base64) is required to store Clover tokens.');
    return `plain:${plain}`;
  }
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `enc:v1:${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${data.toString('base64url')}`;
}

export function openSecret(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  if (sealed.startsWith('plain:')) return sealed.slice(6);
  if (!sealed.startsWith('enc:v1:')) return null;
  const key = encryptionKey();
  if (!key) return null;
  try {
    const [iv, tag, data] = sealed.slice(7).split('.').map((p) => Buffer.from(p, 'base64url'));
    const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(data), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}
