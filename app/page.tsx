import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import { APP } from '@/lib/app';
import { Icon } from '@/components/icons';
import { Top } from '@/components/Top';
import { Banner, tierName } from '@/components/ui';
import { money, pick } from '@/lib/core/i18n';
import { pageContext } from '@/lib/core/page';
import { tierFeatures } from '@/lib/domain';
import { LEGAL_DOCS } from '@/lib/legal';
import { appMarketUrl, SUITE_CATALOG } from '@/lib/suite-catalog';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, [string, string]> = {
  not_configured: ['L’app n’est pas encore configurée sur ce serveur.', 'The app is not configured on this server yet.'],
  bad_state: ['Ce lien a expiré. Ouvrez l’app de nouveau depuis Clover.', 'This link expired. Open the app again from Clover.'],
  code_refused: ['Clover a refusé la connexion. Ouvrez l’app de nouveau depuis Clover.', 'Clover refused the connection. Open the app again from Clover.'],
  wrong_app: ['Ce lien Clover est pour une autre app.', 'This Clover link is for another app.'],
  session_secret: ['Le serveur n’a pas de SESSION_SECRET : connexion impossible.', 'The server has no SESSION_SECRET: sign-in is not possible.'],
};
const TIERS = ['base', 'premium', 'vip'] as const;

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { lang, merchant } = await pageContext();
  const t = (fr: string, en: string) => pick(lang, fr, en);
  const err = (await searchParams).error;
  const legal = LEGAL_DOCS.filter((d) => d.lang === lang && fs.existsSync(path.join(process.cwd(), 'docs', 'legal', d.file)));
  return (
    <>
      <Top lang={lang} />
      <main className="public">
        <section className="hero">
          <p className="eyebrow">CLOVER APP MARKET · TAKATAK SUITE</p>
          <h1>{APP.name}</h1>
          <p className="hero-text">{t(APP.summaryFr, APP.summaryEn || APP.summaryFr)}</p>
          {err && <Banner tone="stop">{t(...(ERRORS[err] ?? ['Connexion impossible.', 'Could not connect.'] as [string, string]))}</Banner>}
          <div className="row">
            {merchant
              ? <Link className="btn" href="/app">{t('Ouvrir mon tableau de bord', 'Open my dashboard')}</Link>
              : <a className="btn" href="/api/clover/connect/start">{t('Se connecter avec Clover', 'Sign in with Clover')}</a>}
            <a className="btn ghost" href={appMarketUrl(APP.cloverAppId)} target="_blank" rel="noopener noreferrer">{t('Installer depuis Clover', 'Install from Clover')}</a>
          </div>
        </section>
        <div className="plans">
          {TIERS.map((k, i) => (
            <section key={k} className={`plan${k === 'premium' ? ' is-featured' : ''}`}>
              <header><h3>{tierName(k)}</h3>{k === 'premium' && <span className="badge badge-brand">{t('Le plus choisi', 'Most chosen')}</span>}</header>
              <p className="plan-price">{APP.tiers[i] ? money(APP.tiers[i].priceCadPerMonth * 100, lang) : '—'}<small> / {t('mois', 'month')}</small></p>
              {i > 0 && <p className="muted small">{t(`Tout ${tierName(TIERS[i - 1])}, plus :`, `Everything in ${tierName(TIERS[i - 1])}, plus:`)}</p>}
              <ul className="checks">{(tierFeatures[k] ?? []).map(([fr, en]) => <li key={fr}><Icon name="check" size={16} />{t(fr, en)}</li>)}</ul>
            </section>
          ))}
        </div>
        <p className="muted small center">{t('Facturé par Clover dans l’App Market. Fonctionne seule, ou avec les autres apps de la suite TAKATAK et Food Hub.', 'Billed by Clover in the App Market. Works alone, or with the other TAKATAK Suite apps and Food Hub.')}</p>
        <section className="suite-strip">
          <p className="eyebrow">{t('La suite TAKATAK', 'The TAKATAK Suite')}</p>
          <div className="suite-strip-row">
            {SUITE_CATALOG.map((a) => (
              <a key={a.key} className={`strip-app${a.key === APP.key ? ' is-here' : ''}`} href={appMarketUrl(a.appId)} target="_blank" rel="noopener noreferrer" title={t(a.fr, a.en)}>
                <span className="mono">{a.mono}</span><span>{a.name}</span>
              </a>
            ))}
          </div>
        </section>
        {legal.length > 0 && <p className="muted small center">{legal.map((d, i) => <span key={d.slug}>{i > 0 && ' · '}<Link href={`/legal/${d.slug}`}>{d.title}</Link></span>)}</p>}
      </main>
    </>
  );
}
