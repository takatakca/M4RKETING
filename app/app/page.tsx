import Link from 'next/link';
import { APP } from '@/lib/app';
import { Top } from '@/components/Top';
import { Badge, Banner, Card } from '@/components/ui';
import { Panel } from '@/components/Panel';
import { pick } from '@/lib/core/i18n';
import { pageContext } from '@/lib/core/page';
import { suiteConfig } from '@/lib/suite';

export const dynamic = 'force-dynamic';

// The merchant's dashboard for this app (signed in by the Clover callback).
export default async function Dashboard() {
  const ctx = await pageContext();
  const { lang, merchant, tier } = ctx;
  if (!merchant) {
    return (
      <>
        <Top lang={lang} back="/app" />
        <main>
          <h1>{APP.name}</h1>
          <Banner tone="warn">{pick(lang, 'Ouvrez l’app depuis votre tableau de bord Clover pour vous connecter.', 'Open the app from your Clover dashboard to sign in.')}</Banner>
          <a className="btn" href="/api/clover/connect/start">{pick(lang, 'Se connecter avec Clover', 'Sign in with Clover')}</a>
        </main>
      </>
    );
  }
  const plan = merchant.billing?.plan;
  return (
    <>
      <Top lang={lang} back="/app" />
      <main>
        <div className="card-head" style={{ marginTop: 8 }}>
          <div>
            <p className="muted" style={{ margin: 0 }}>{APP.name}</p>
            <h1>{merchant.name ?? merchant.merchantId}</h1>
          </div>
          <div className="row">
            <Badge tone="brand">{tier === 'vip' ? 'VIP' : tier === 'premium' ? 'Premium' : 'Base'}</Badge>
            {merchant.billing?.inTrial && <Badge tone="warn">{pick(lang, 'Essai', 'Trial')}</Badge>}
            <Badge tone={suiteConfig() ? 'ok' : 'plain'}>{suiteConfig() ? pick(lang, 'Suite TAKATAK branchée', 'TAKATAK Suite connected') : pick(lang, 'Seule', 'Standalone')}</Badge>
          </div>
        </div>
        {!plan && <p className="muted">{pick(lang, 'Forfait : Base (Clover n’a pas encore indiqué votre forfait).', 'Plan: Base (Clover has not reported your plan yet).')}</p>}
        <Panel ctx={ctx} />
        <Card title={pick(lang, 'Compte', 'Account')}>
          <p className="muted">{pick(lang, 'Marchand Clover', 'Clover merchant')} {merchant.merchantId} · {pick(lang, 'connecté le', 'connected on')} {new Date(merchant.installedAt).toLocaleDateString(lang === 'en' ? 'en-CA' : 'fr-CA')}</p>
          <p className="muted"><Link href="/">{pick(lang, 'Forfaits et conditions', 'Plans and terms')}</Link></p>
        </Card>
      </main>
    </>
  );
}
