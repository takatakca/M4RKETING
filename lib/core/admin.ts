// Operator endpoints (webhook verification code, cron): Authorization: Bearer <ADMIN_TOKEN> (24+ characters).
import { safeEqual } from './crypto';

export function adminAuthorized(req: Request): boolean {
  const token = (process.env.ADMIN_TOKEN ?? '').trim();
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '');
  return token.length >= 24 && !!m && safeEqual(m[1].trim(), token);
}
