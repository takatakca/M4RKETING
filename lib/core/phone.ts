// North American phone numbers → E.164 (+15145551234). The one customer key of the suite (LOY4LTY, REW4RDS, CH4T).
export function normalizePhone(raw: unknown): string | null {
  const d = String(raw ?? '').replace(/[^\d]/g, '');
  if (d.length === 10 && /^[2-9]/.test(d)) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1') && /^[2-9]/.test(d.slice(1))) return `+${d}`;
  return null;
}

export const maskPhone = (e164: string) => e164.replace(/^(\+1)(\d{3})(\d{3})(\d{4})$/, '$1 $2 •••-$4');
