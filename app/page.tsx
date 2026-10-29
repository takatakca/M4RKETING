import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import { APP } from '@/lib/app';
import { Top } from '@/components/Top';
import { Banner, Card } from '@/components/ui';
import { pick } from '@/lib/core/i18n';
import { pageContext } from '@/lib/core/page';
import { LEGAL_DOCS } from '@/lib/legal';

export const dynamic = 'force-dynamic';

const ERRORS: Record<string, [string, string]> = {
  not_configured: ['L’app n’est pas encore configurée sur ce serveur.', 'The app is not configured on this server yet.'],
  bad_state: ['Ce lien a expiré. Ouvrez l’app de nouveau depuis Clover.', 'This link expired. Open the app again from Clover.'],
  code_refused: ['Clover a refusé la connexion. Ouvrez l’app de nouveau depuis Clover.', 'Clover refused the connection. Open the app again from Clover.'],
  wrong_app: ['Ce lien Clover est pour une autre app.', 'This Clover link is for another app.'],
  session_secret: ['Le serveur n’a pas de SESSION_SECRET : connexion impossible.', 'The server has no SESSION_SECRET: sign-in is not possible.'],
};

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { lang, merchant } = await pageContext();
  const err = (await searchParams).error;
  const legal = LEGAL_DOCS.filter((d) => d.lang === lang && fs.existsSync(path.join(process.cwd(), 'docs', 'legal', d.file)));
  return (
    <>
      <Top lang={lang} />
      <main>
        <p className="muted" style={{ letterSpacing: '0.2em', fontSize: 12 }}>CLOVER APP MARKET · TAKATAK SUITE</p>
        <h1>{APP.name}</h1>
        <p style={{ fontSize: 18, maxWidth: 760 }}>{pick(lang, APP.summaryFr, APP.summaryEn || APP.summaryFr)}</p>
        {err && <Banner tone="stop">{pick(lang, ...(ERRORS[err] ?? ['Connexion impossible.', 'Could not connect.']))}</Banner>}
        <div className="row" style={{ margin: '16px 0' }}>
          {merchant
            ? <Link className="btn" href="/app">{pick(lang, 'Ouvrir mon tableau de bord', 'Open my dashboard')}</Link>
            : <a className="btn" href="/api/clover/connect/start">{pick(lang, 'Se connecter avec Clover', 'Sign in with Clover')}</a>}
        </div>
        <Card title={pick(lang, 'Forfaits', 'Plans')}>
          <div className="tiers">
            {APP.tiers.map((t) => (
              <div key={t.name} className="stat"><div className="stat-label">{t.name}</div><div className="stat-value">{t.priceCadPerMonth} $<span className="muted" style={{ fontSize: 14 }}> /{pick(lang, 'mois', 'month')}</span></div></div>
            ))}
          </div>
          <p className="muted">{pick(lang, 'Facturé par Clover dans l’App Market. Fonctionne seule, ou avec les autres apps de la suite TAKATAK et Food Hub.', 'Billed by Clover in the App Market. Works alone, or with the other TAKATAK Suite apps and Food Hub.')}</p>
        </Card>
        {legal.length > 0 && <p className="muted">{legal.map((d, i) => <span key={d.slug}>{i > 0 && ' · '}<Link href={`/legal/${d.slug}`}>{d.title}</Link></span>)}</p>}
      </main>
    </>
  );
}
