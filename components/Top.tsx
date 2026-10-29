import Link from 'next/link';
import { APP } from '@/lib/app';
import { pick, type Lang } from '@/lib/core/i18n';
import { selfMono } from '@/lib/suite-catalog';

// Header of the public pages (home, legal). Signed-in screens use the Shell.
export function Top({ lang, back = '/' }: { lang: Lang; back?: string }) {
  const other = lang === 'en' ? 'fr' : 'en';
  return (
    <header className="top">
      <Link href="/" className="side-brand"><span className="mono">{selfMono(APP.key, APP.name)}</span><span><strong>{APP.short}</strong><small>GROUPE TAKATAK</small></span></Link>
      <a href={`/api/session/lang?lang=${other}&back=${encodeURIComponent(back)}`} className="btn ghost" hrefLang={other}>{pick(lang, 'English', 'Français')}</a>
    </header>
  );
}
