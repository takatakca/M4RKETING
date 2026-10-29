import { notFound } from 'next/navigation';
import { AccountTab } from '@/components/Account';
import { Shell } from '@/components/Shell';
import { PageHead, SignIn } from '@/components/ui';
import { pick } from '@/lib/core/i18n';
import { pageContext } from '@/lib/core/page';
import { ACCOUNT_TABS } from '@/lib/nav';

export const dynamic = 'force-dynamic';

// Account → profile, plan, authorized actions, devices, payments and deposits, security and data, activity log.
export default async function AccountPage({ params }: { params: Promise<{ tab: string }> }) {
  const ctx = await pageContext();
  if (!ctx.merchant) return <SignIn lang={ctx.lang} />;
  const { tab: slug } = await params;
  const tab = ACCOUNT_TABS.find((a) => a.slug === slug);
  if (!tab) notFound();
  const { lang } = ctx;
  return (
    <Shell ctx={ctx} active={`account:${tab.slug}`} crumbs={[{ label: pick(lang, 'Compte', 'Account'), href: '/app/account/profile' }, { label: pick(lang, tab.fr, tab.en), href: `/app/account/${tab.slug}` }]}>
      <PageHead title={pick(lang, tab.fr, tab.en)} sub={pick(lang, tab.hintFr, tab.hintEn)} icon={tab.icon} />
      <AccountTab ctx={ctx} tab={tab.slug} />
    </Shell>
  );
}
