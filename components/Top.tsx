import Link from 'next/link';
import { APP } from '@/lib/app';
import { pick, type Lang } from '@/lib/core/i18n';

export function Top({ lang, back = '/' }: { lang: Lang; back?: string }) {
  const other = lang === 'en' ? 'fr' : 'en';
  return (
    <header className="top">
      <Link href="/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}>{APP.name}<small>GROUPE TAKATAK</small></Link>
      <a href={`/api/session/lang?lang=${other}&back=${encodeURIComponent(back)}`} className="btn ghost">{pick(lang, 'English', 'Français')}</a>
    </header>
  );
}
