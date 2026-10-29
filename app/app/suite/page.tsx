import { APP } from '@/lib/app';
import { Icon } from '@/components/icons';
import { Shell } from '@/components/Shell';
import { Badge, Card, KV, PageHead, SignIn } from '@/components/ui';
import { pick } from '@/lib/core/i18n';
import { pageContext } from '@/lib/core/page';
import { appMarketUrl, openAppUrl, SUITE_CATALOG } from '@/lib/suite-catalog';
import { suiteConfig, suiteDirectory, suiteStats } from '@/lib/suite';

export const dynamic = 'force-dynamic';

// TAKATAK Suite: the nine apps, which ones this restaurant has (Food Hub's directory), open one in a click.
export default async function Suite() {
  const ctx = await pageContext();
  if (!ctx.merchant) return <SignIn lang={ctx.lang} />;
  const { lang } = ctx;
  const t = (fr: string, en: string) => pick(lang, fr, en);
  const cfg = suiteConfig();
  const [dir, stats] = await Promise.all([suiteDirectory(ctx.merchant.merchantId), suiteStats()]);
  const byKey = new Map((dir ?? []).map((a) => [a.key, a]));
  const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(lang === 'en' ? 'en-CA' : 'fr-CA') : '—');
  return (
    <Shell ctx={ctx} active="suite" crumbs={[{ label: 'TAKATAK Suite', href: '/app/suite' }]}>
      <PageHead title="TAKATAK Suite" icon="grid" sub={t('Chaque app fonctionne seule. Ensemble, elles partagent vos commandes par Food Hub, sans jamais partager le nom ou le téléphone d’un client.', 'Each app works alone. Together they share your orders through Food Hub, never a customer’s name or phone.')} />
      <div className="suite-grid">
        {SUITE_CATALOG.map((a) => {
          const me = a.key === APP.key;
          const d = byKey.get(a.key);
          const status = me ? <Badge tone="brand">{t('Vous êtes ici', 'You are here')}</Badge> : d?.installed ? <Badge tone="ok">{t('Installée', 'Installed')}</Badge> : dir ? <Badge>{t('Disponible', 'Available')}</Badge> : null;
          return (
            <section key={a.key} className={`suite-app${me ? ' is-here' : d?.installed ? ' is-installed' : ''}`}>
              <header><span className="mono">{a.mono}</span><div><h3>{a.name}</h3>{status}</div></header>
              <p className="muted">{t(a.fr, a.en)}</p>
              <div className="row">
                {me ? null : d?.installed && d.url
                  ? <a className="btn" href={openAppUrl(d.url)} target="_blank" rel="noopener noreferrer">{t('Ouvrir', 'Open')}</a>
                  : <a className="btn ghost" href={appMarketUrl(a.appId)} target="_blank" rel="noopener noreferrer">{d?.installed ? t('Voir dans Clover', 'See in Clover') : t('Découvrir dans Clover', 'Discover in Clover')}</a>}
              </div>
            </section>
          );
        })}
        <section className={`suite-app hub${cfg ? ' is-installed' : ''}`}>
          <header><span className="mono"><Icon name="store" size={20} /></span><div><h3>Food Hub</h3>{cfg ? <Badge tone="ok">{t('Branchée', 'Connected')}</Badge> : <Badge>{t('Non branchée', 'Not connected')}</Badge>}</div></header>
          <p className="muted">{t('Le tableau de bord des commandes : Uber Eats, DoorDash, Skip, Clover, cuisine. Le lien entre toutes les apps.', 'The orders dashboard: Uber Eats, DoorDash, Skip, Clover, kitchen. The link between all the apps.')}</p>
          {cfg && <div className="row"><a className="btn ghost" href={cfg.url} target="_blank" rel="noopener noreferrer">{t('Ouvrir Food Hub', 'Open Food Hub')}</a></div>}
        </section>
      </div>
      <Card title={t('Lien avec Food Hub', 'Link with Food Hub')} icon="link">
        {cfg ? (
          <KV rows={[
            [t('Événements reçus', 'Events received'), `${stats.received} · ${t('dernier', 'last')} ${when(stats.lastReceivedAt)}`],
            [t('Événements envoyés', 'Events sent'), `${stats.emitted} · ${t('dernier', 'last')} ${when(stats.lastEmittedAt)}`],
            [t('En attente de renvoi', 'Waiting to be resent'), String(stats.waiting)],
            [t('Annuaire de la suite', 'Suite directory'), dir ? t('À jour', 'Up to date') : t('Food Hub ne répond pas pour l’instant', 'Food Hub is not answering right now')],
          ]} />
        ) : <p className="muted">{t(`${APP.name} fonctionne seule. Pour la brancher à la suite, TAKATAK ajoute deux réglages serveur (FOODHUB_URL et le secret partagé, voir DEPLOY.md) : rien à faire de votre côté.`, `${APP.name} works alone. To plug it into the suite, TAKATAK adds two server settings (FOODHUB_URL and the shared secret, see DEPLOY.md): nothing to do on your side.`)}</p>}
      </Card>
      <Card title={t('Comment elles travaillent ensemble', 'How they work together')} icon="spark">
        <ul className="checks">
          <li><Icon name="check" size={16} />{t('Une seule connexion : Clover. Ouvrir une autre app de la suite passe par Clover, qui sait déjà qui vous êtes.', 'One sign-in: Clover. Opening another suite app goes through Clover, which already knows who you are.')}</li>
          <li><Icon name="check" size={16} />{t('Un seul menu et une seule caisse : chaque app lit et écrit dans votre Clover.', 'One menu and one register: each app reads and writes your Clover.')}</li>
          <li><Icon name="check" size={16} />{t('Les commandes circulent par Food Hub, signées ; une app retirée n’arrête jamais les autres.', 'Orders move through Food Hub, signed; removing one app never stops the others.')}</li>
          <li><Icon name="check" size={16} />{t('Chaque app garde ses propres données et son propre forfait : prenez seulement ce qu’il vous faut.', 'Each app keeps its own data and its own plan: take only what you need.')}</li>
        </ul>
      </Card>
    </Shell>
  );
}
