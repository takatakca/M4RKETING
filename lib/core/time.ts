// Dates in the merchant's time zone (APP_TIMEZONE, default America/Toronto = Montréal).
export const appTimeZone = () => (process.env.APP_TIMEZONE ?? '').trim() || 'America/Toronto';

/** Offset (ms) of a time zone from UTC at a given instant. */
function offsetMs(tz: string, at: number): number {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(at)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return asUtc - Math.floor(at / 1000) * 1000;
}

/** "2026-10-28" in the time zone → [start, end) in epoch ms (handles daylight-saving days of 23 or 25 hours). */
export function localDayRange(date: string, tz = appTimeZone()): [number, number] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new Error('Date must be YYYY-MM-DD');
  const wall = (d: number) => Date.UTC(Number(m[1]), Number(m[2]) - 1, d);
  const at = (wallMs: number) => { const guess = wallMs - offsetMs(tz, wallMs); return wallMs - offsetMs(tz, guess); };
  return [at(wall(Number(m[3]))), at(wall(Number(m[3]) + 1))];
}

/** Today's (or a given instant's) date in the time zone, YYYY-MM-DD. */
export function localDate(at = Date.now(), tz = appTimeZone()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(at));
}

export const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
