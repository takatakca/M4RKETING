// One screen of the app inside the Shell: the plan and the role are checked first, a hub shows its children as tiles,
// anything else is the app's own Panel (with the page's query string, for filters such as a date range).
// Shared kit: identical in every TAKATAK Suite app.
import { notFound } from 'next/navigation';
import { tierAtLeast } from '@/lib/app';
import { pick } from '@/lib/core/i18n';
import { pageContext } from '@/lib/core/page';
import { sections } from '@/lib/domain';
import { Panel } from './Panel';
import { sectionHref, Shell, visibleSections } from './Shell';
import { Locked, NotAllowed, PageHead, SignIn, Tiles, tierName, Badge } from './ui';

export async function SectionPage({ slug, query = {} }: { slug: string; query?: Record<string, string> }) {
  const ctx = await pageContext();
  if (!ctx.merchant) return <SignIn lang={ctx.lang} />;
  const s = sections.find((x) => x.slug === slug);
  if (!s) notFound();
  const { lang } = ctx;
  const parent = s.parent ? sections.find((x) => x.slug === s.parent) : undefined;
  const crumbs = [...(parent ? [{ label: pick(lang, parent.fr, parent.en), href: sectionHref(parent.slug) }] : []), ...(slug ? [{ label: pick(lang, s.fr, s.en), href: sectionHref(slug) }] : [])];
  const head = <PageHead title={pick(lang, s.fr, s.en)} sub={s.hintFr ? pick(lang, s.hintFr, s.hintEn ?? s.hintFr) : undefined} icon={s.icon} />;
  let body;
  if (s.tier && !tierAtLeast(ctx.tier, s.tier)) body = <Locked lang={lang} need={s.tier} />;
  else if (s.view && !ctx.can(s.view)) body = <NotAllowed lang={lang} role={ctx.role} need={ctx.policy?.min[s.view] ?? 'owner'} />;
  else if (s.hub) {
    const kids = visibleSections(ctx).filter((c) => c.parent === s.slug);
    body = <Tiles items={kids.map((c) => ({ href: sectionHref(c.slug), title: pick(lang, c.fr, c.en), text: c.hintFr ? pick(lang, c.hintFr, c.hintEn ?? c.hintFr) : undefined, icon: c.icon,
      badge: c.tier && !tierAtLeast(ctx.tier, c.tier) ? <Badge tone="brand">{tierName(c.tier)}</Badge> : undefined }))} />;
  } else body = <Panel ctx={ctx} section={slug} query={query} />;
  return <Shell ctx={ctx} active={`app:${slug}`} crumbs={crumbs}>{head}{body}</Shell>;
}
