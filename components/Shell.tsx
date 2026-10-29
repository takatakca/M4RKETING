// The premium frame around every signed-in screen: a side menu with sub-menus (the app's own sections, the TAKATAK
// Suite, the account, help), a top bar (where you are, the suite app switcher, language, who you are) and the screen.
// Works without JavaScript: sub-menus are <details>, the phone menu is a checkbox. Shared kit: identical in every app.
import type { ReactNode } from 'react';
import Link from 'next/link';
import { APP } from '@/lib/app';
import { pick } from '@/lib/core/i18n';
import type { PageCtx } from '@/lib/core/page';
import { ROLE_LABEL } from '@/lib/core/roles';
import { sections } from '@/lib/domain';
import { ACCOUNT_TABS, type AppSection, type IconName } from '@/lib/nav';
import { appMarketUrl, openAppUrl, selfMono, SUITE_CATALOG } from '@/lib/suite-catalog';
import { suiteConfig, suiteDirectory } from '@/lib/suite';
import { tierAtLeast } from '@/lib/app';
import { Icon } from './icons';
import { RevokeButton } from './RevokeButton';
import { tierName } from './ui';

export interface Crumb { label: string; href?: string }

type Item = { key: string; href: string; label: string; icon: IconName; pill?: string; external?: boolean; children?: Item[]; selfLabel?: string };

/** "app:<slug>", "suite", "account:<tab>", "help". */
export type Active = string;

export const sectionHref = (slug: string) => (slug ? `/app/${slug}` : '/app');

/** The sections this person may see (a section needing an action they lack is not listed). */
export function visibleSections(ctx: PageCtx): AppSection[] {
  return sections.filter((s) => !s.view || ctx.can(s.view));
}

function appItems(ctx: PageCtx): Item[] {
  const vis = visibleSections(ctx);
  const item = (s: AppSection): Item => ({
    key: `app:${s.slug}`, href: sectionHref(s.slug), label: pick(ctx.lang, s.fr, s.en), icon: s.icon,
    pill: s.tier && !tierAtLeast(ctx.tier, s.tier) ? tierName(s.tier) : undefined,
  });
  return vis.filter((s) => !s.parent).map((s) => {
    const kids = vis.filter((c) => c.parent === s.slug).map(item);
    return kids.length ? { ...item(s), children: kids, selfLabel: pick(ctx.lang, 'Vue d’ensemble', 'Overview') } : item(s);
  });
}

function NavItem({ it, active }: { it: Item; active: Active }) {
  const on = active === it.key || (it.children ?? []).some((c) => c.key === active);
  const link = (x: Item, cls = '') => {
    const inner = <><Icon name={x.icon} /><span className="nav-label">{x.label}</span>{x.pill && <span className="nav-pill"><Icon name="lock" size={12} />{x.pill}</span>}</>;
    return x.external
      ? <a className={`nav-link ${cls}`} href={x.href} target="_blank" rel="noopener noreferrer">{inner}</a>
      : <Link className={`nav-link ${cls}${active === x.key ? ' is-active' : ''}`} href={x.href} aria-current={active === x.key ? 'page' : undefined}>{inner}</Link>;
  };
  if (!it.children?.length) return <li>{link(it)}</li>;
  return (
    <li>
      <details className="nav-group" open={on || undefined}>
        <summary className={`nav-link${on ? ' is-on' : ''}`}><Icon name={it.icon} /><span className="nav-label">{it.label}</span><Icon name="chevron" size={14} className="nav-chevron" /></summary>
        <ul className="nav-sub">
          {it.selfLabel && <li>{link({ key: it.key, href: it.href, label: it.selfLabel, icon: it.icon, pill: it.pill })}</li>}
          {it.children.map((c) => <li key={c.key}>{link(c)}</li>)}
        </ul>
      </details>
    </li>
  );
}

export async function Shell({ ctx, active, crumbs, children }: { ctx: PageCtx; active: Active; crumbs: Crumb[]; children: ReactNode }) {
  const { lang, merchant, tier } = ctx;
  const t = (fr: string, en: string) => pick(lang, fr, en);
  const dir = merchant ? await suiteDirectory(merchant.merchantId) : null;
  const installed = new Map((dir ?? []).filter((a) => a.installed).map((a) => [a.key, a]));
  const others = SUITE_CATALOG.filter((a) => a.key !== APP.key);
  const foodhub = suiteConfig()?.url ?? null;

  const suiteKids: Item[] = others.filter((a) => installed.get(a.key)?.url).map((a) => ({ key: `suite:${a.key}`, href: openAppUrl(installed.get(a.key)!.url!), label: a.name, icon: a.icon, external: true }));
  if (foodhub) suiteKids.push({ key: 'suite:foodhub', href: foodhub, label: 'Food Hub', icon: 'store', external: true });
  const groups: Array<{ label: string; items: Item[] }> = [
    { label: APP.short, items: appItems(ctx) },
    { label: 'TAKATAK Suite', items: [{ key: 'suite', href: '/app/suite', label: t('La suite', 'The suite'), icon: 'grid', children: suiteKids.length ? suiteKids : undefined, selfLabel: t('Toutes les apps', 'All apps') }] },
    { label: t('Compte', 'Account'), items: [{ key: 'account', href: '/app/account/profile', label: t('Mon compte', 'My account'), icon: 'user', children: ACCOUNT_TABS.map((a) => ({ key: `account:${a.slug}`, href: `/app/account/${a.slug}`, label: t(a.fr, a.en), icon: a.icon })) }] },
    { label: t('Aide', 'Help'), items: [{ key: 'help', href: '/app/help', label: t('Aide et état du service', 'Help and service status'), icon: 'help' }] },
  ];
  const other = lang === 'en' ? 'fr' : 'en';
  const here = crumbs.length ? crumbs[crumbs.length - 1].href ?? '/app' : '/app';
  const person = ctx.person ?? t(ROLE_LABEL[ctx.role][0], ROLE_LABEL[ctx.role][1]);
  const initials = person.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="shell">
      <input type="checkbox" id="nav-toggle" className="nav-toggle" aria-hidden="true" tabIndex={-1} />
      <aside className="side" aria-label={t('Menu principal', 'Main menu')}>
        <Link href="/app" className="side-brand">
          <span className="mono">{selfMono(APP.key, APP.name)}</span>
          <span><strong>{APP.short}</strong><small>GROUPE TAKATAK</small></span>
        </Link>
        {merchant && (
          <div className="side-merchant">
            <span className="side-merchant-name">{merchant.name ?? merchant.merchantId}</span>
            <span className={`tier tier-${tier}`}>{tierName(tier)}</span>
          </div>
        )}
        <nav className="nav">
          {groups.map((g) => (
            <div key={g.label} className="nav-section">
              <p className="nav-heading">{g.label}</p>
              <ul>{g.items.map((it) => <NavItem key={it.key} it={it} active={active} />)}</ul>
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <RevokeButton url="/api/session" label={t('Se déconnecter', 'Sign out')} />
        </div>
      </aside>
      <label htmlFor="nav-toggle" className="scrim" aria-hidden="true" />
      <div className="frame">
        <header className="bar">
          <label htmlFor="nav-toggle" className="burger" aria-label={t('Ouvrir le menu', 'Open the menu')}><Icon name="menu" size={20} /></label>
          <nav className="crumbs" aria-label={t('Vous êtes ici', 'You are here')}>
            <Link href="/app">{APP.short}</Link>
            {crumbs.map((c, i) => <span key={i}><Icon name="chevron" size={12} />{c.href && i < crumbs.length - 1 ? <Link href={c.href}>{c.label}</Link> : <span aria-current="page">{c.label}</span>}</span>)}
          </nav>
          <div className="bar-right">
            <details className="switcher">
              <summary aria-label={t('Apps de la suite TAKATAK', 'TAKATAK Suite apps')}><Icon name="grid" size={20} /></summary>
              <div className="switcher-panel">
                <p className="nav-heading">TAKATAK Suite</p>
                <div className="switcher-grid">
                  {SUITE_CATALOG.map((a) => {
                    const me = a.key === APP.key;
                    const got = installed.get(a.key);
                    const href = me ? '/app' : got?.url ? openAppUrl(got.url) : appMarketUrl(a.appId);
                    const cls = `switch-app${me ? ' is-here' : got ? ' is-installed' : ''}`;
                    const body = <><span className="mono">{a.mono}</span><span>{a.name}</span><small>{me ? t('Ici', 'Here') : got ? t('Ouvrir', 'Open') : t('Découvrir', 'Discover')}</small></>;
                    return me ? <Link key={a.key} className={cls} href={href}>{body}</Link> : <a key={a.key} className={cls} href={href} target="_blank" rel="noopener noreferrer">{body}</a>;
                  })}
                </div>
                <Link className="switcher-all" href="/app/suite">{t('Toute la suite', 'The whole suite')} <Icon name="chevron" size={14} /></Link>
              </div>
            </details>
            <a className="lang" href={`/api/session/lang?lang=${other}&back=${encodeURIComponent(here)}`} hrefLang={other}>{other.toUpperCase()}</a>
            <Link className="who" href="/app/account/profile" title={ctx.roleVerified ? undefined : t('Rôle non confirmé par Clover', 'Role not confirmed by Clover')}>
              <span className="avatar">{initials || '·'}</span>
              <span className="who-text"><strong>{person}</strong><small>{t(ROLE_LABEL[ctx.role][0], ROLE_LABEL[ctx.role][1])}{ctx.roleVerified ? '' : ' *'}</small></span>
            </Link>
          </div>
        </header>
        <main className="content" id="content">{children}</main>
      </div>
    </div>
  );
}
