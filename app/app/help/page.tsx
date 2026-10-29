import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import { APP } from '@/lib/app';
import { cloverMissing } from '@/lib/clover/config';
import { Shell, sectionHref, visibleSections } from '@/components/Shell';
import { Badge, Card, KV, PageHead, SignIn, Tiles } from '@/components/ui';
import { pick } from '@/lib/core/i18n';
import { pageContext } from '@/lib/core/page';
import { getStore } from '@/lib/core/store';
import { LEGAL_DOCS } from '@/lib/legal';
import { suiteConfig } from '@/lib/suite';

export const dynamic = 'force-dynamic';

// Help: what the app does, where each thing is, the service status and the terms.
export default async function Help() {
  const ctx = await pageContext();
  if (!ctx.merchant) return <SignIn lang={ctx.lang} />;
  const { lang } = ctx;
  const t = (fr: string, en: string) => pick(lang, fr, en);
  let storage = true;
  try { await getStore().getKv('health'); } catch { storage = false; }
  const missing = cloverMissing();
  const legal = LEGAL_DOCS.filter((d) => d.lang === lang && fs.existsSync(path.join(process.cwd(), 'docs', 'legal', d.file)));
  const support = (process.env.SUPPORT_URL ?? '').trim();
  const ok = (b: boolean, yes: string, no: string) => (b ? <Badge tone="ok">{yes}</Badge> : <Badge tone="warn">{no}</Badge>);
  return (
    <Shell ctx={ctx} active="help" crumbs={[{ label: t('Aide', 'Help'), href: '/app/help' }]}>
      <PageHead title={t('Aide et état du service', 'Help and service status')} icon="help" sub={pick(lang, APP.summaryFr, APP.summaryEn || APP.summaryFr)}
        actions={/^https:\/\//.test(support) ? <a className="btn" href={support} target="_blank" rel="noopener noreferrer">{t('Écrire au soutien TAKATAK', 'Contact TAKATAK support')}</a> : undefined} />
      <Card title={t('Où trouver quoi', 'Where to find what')} icon="list">
        <Tiles items={[
          ...visibleSections(ctx).filter((s) => !s.parent).map((s) => ({ href: sectionHref(s.slug), title: t(s.fr, s.en), text: s.hintFr ? t(s.hintFr, s.hintEn ?? s.hintFr) : undefined, icon: s.icon })),
          { href: '/app/account/access', title: t('Actions autorisées', 'Authorized actions'), text: t('Qui peut faire quoi.', 'Who can do what.'), icon: 'shield' },
          { href: '/app/suite', title: 'TAKATAK Suite', text: t('Les autres apps, en un clic.', 'The other apps, in one click.'), icon: 'grid' },
        ]} />
      </Card>
      <Card title={t('État du service', 'Service status')} icon="spark">
        <KV rows={[
          ['Clover', ok(missing.length === 0, t('Configuré', 'Configured'), `${t('À compléter', 'To complete')} : ${missing.join(', ')}`)],
          [t('Stockage', 'Storage'), ok(storage && getStore().mode === 'postgres', t('Base de données', 'Database'), storage ? t('Mémoire (essai seulement)', 'Memory (test only)') : t('En panne', 'Down'))],
          ['Food Hub', suiteConfig() ? <Badge tone="ok">{t('Branchée', 'Connected')}</Badge> : <Badge>{t('Seule', 'Standalone')}</Badge>],
          [t('Version', 'Version'), <code key="v">{(process.env.SOURCE_COMMIT ?? 'dev').slice(0, 12)}</code>],
        ]} />
      </Card>
      {legal.length > 0 && (
        <Card title={t('Conditions et confidentialité', 'Terms and privacy')} icon="book">
          <p>{legal.map((d, i) => <span key={d.slug}>{i > 0 && ' · '}<Link href={`/legal/${d.slug}`}>{d.title}</Link></span>)}</p>
        </Card>
      )}
    </Shell>
  );
}
