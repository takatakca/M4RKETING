import crypto from 'node:crypto';

// North American phone numbers → E.164 (+15145551234). The one customer key of the suite (LOY4LTY, REW4RDS, CH4T).
export function normalizePhone(raw: unknown): string | null {
  const d = String(raw ?? '').replace(/[^\d]/g, '');
  if (d.length === 10 && /^[2-9]/.test(d)) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1') && /^[2-9]/.test(d.slice(1))) return `+${d}`;
  return null;
}

export const maskPhone = (e164: string) => e164.replace(/^(\+1)(\d{3})(\d{3})(\d{4})$/, '$1 $2 •••-$4');

/**
 * The same customer in every suite app of one merchant, without sending the phone around: sha256("<merchant>:<phone>").
 * LOY4LTY and REW4RDS compute it from the phone the customer gives at the counter; events carry only this.
 */
export function customerRef(merchantId: string, e164: string): string {
  return crypto.createHash('sha256').update(`${merchantId}:${e164}`).digest('hex').slice(0, 32);
}
