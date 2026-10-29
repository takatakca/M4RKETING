// French first (Québec), English alongside. The language comes from the "lang" cookie, then the browser.
export type Lang = 'fr' | 'en';
export const pick = (lang: Lang, fr: string, en: string) => (lang === 'en' ? en : fr);

export function langFrom(cookie: string | undefined | null, acceptLanguage?: string | null): Lang {
  if (cookie === 'en' || cookie === 'fr') return cookie;
  return /^en\b/i.test(String(acceptLanguage ?? '').trim()) ? 'en' : 'fr';
}

export const money = (cents: number, lang: Lang = 'fr') =>
  new Intl.NumberFormat(lang === 'en' ? 'en-CA' : 'fr-CA', { style: 'currency', currency: 'CAD' }).format((cents || 0) / 100);
