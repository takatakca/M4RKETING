// Building blocks of every TAKATAK Suite screen (server components). Shared kit: identical in every suite app.
import type { ReactNode } from 'react';
import Link from 'next/link';
import { APP, type Tier } from '@/lib/app';
import { pick, type Lang } from '@/lib/core/i18n';
import { ROLE_LABEL, type Role } from '@/lib/core/roles';
import type { IconName } from '@/lib/nav';
import { appMarketUrl, selfMono } from '@/lib/suite-catalog';
import { Icon } from './icons';

export function Card({ title, children, right, sub, icon }: { title?: ReactNode; children: ReactNode; right?: ReactNode; sub?: ReactNode; icon?: IconName }) {
  return (
    <section className="card">
      {(title || right) && (
        <div className="card-head">
          <div className="card-title">{icon && <span className="card-icon"><Icon name={icon} /></span>}<div><h2>{title}</h2>{sub && <p className="card-sub">{sub}</p>}</div></div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, note, tone }: { label: ReactNode; value: ReactNode; note?: ReactNode; tone?: 'ok' | 'warn' | 'stop' }) {
  return <div className={`stat${tone ? ` stat-${tone}` : ''}`}><div className="stat-label">{label}</div><div className="stat-value">{value}</div>{note && <div className="stat-note">{note}</div>}</div>;
}

export function Badge({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'ok' | 'warn' | 'stop' | 'brand' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Banner({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' | 'stop' }) {
  return <div className={`banner banner-${tone}`} role={tone === 'stop' ? 'alert' : undefined}>{children}</div>;
}

/** Title of a screen, its one-line purpose and its main buttons. */
export function PageHead({ title, sub, icon, actions }: { title: ReactNode; sub?: ReactNode; icon?: IconName; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div className="page-title">{icon && <span className="page-icon"><Icon name={icon} size={22} /></span>}<div><h1>{title}</h1>{sub && <p className="page-sub">{sub}</p>}</div></div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

/** A label → value list (profile, plan). */
export function KV({ rows }: { rows: Array<[ReactNode, ReactNode]> }) {
  return <dl className="kv">{rows.map(([k, v], i) => <div key={i}><dt>{k}</dt><dd>{v ?? '—'}</dd></div>)}</dl>;
}

export function Empty({ children, icon = 'spark' }: { children: ReactNode; icon?: IconName }) {
  return <div className="empty"><Icon name={icon} size={22} /><p>{children}</p></div>;
}

/** Links shown as tiles (a menu's children, the suite apps). */
export function Tiles({ items }: { items: Array<{ href: string; title: ReactNode; text?: ReactNode; icon?: IconName; mono?: string; badge?: ReactNode; external?: boolean }> }) {
  return (
    <div className="tiles">
      {items.map((t) => {
        const inner = (
          <>
            <span className="tile-mark">{t.mono ? <span className="mono">{t.mono}</span> : t.icon ? <Icon name={t.icon} size={20} /> : null}</span>
            <span className="tile-body"><span className="tile-title">{t.title}{t.badge}</span>{t.text && <span className="tile-text">{t.text}</span>}</span>
            <Icon name="chevron" className="tile-go" />
          </>
        );
        return t.external ? <a key={t.href} className="tile" href={t.href} target="_blank" rel="noopener noreferrer">{inner}</a> : <Link key={t.href} className="tile" href={t.href}>{inner}</Link>;
      })}
    </div>
  );
}

/** A bar chart drawn by the server (no chart library): one bar per row, scaled to the largest value. */
export function Bars({ rows, empty }: { rows: Array<{ label: ReactNode; value: number; shown: ReactNode; note?: ReactNode }>; empty?: ReactNode }) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  if (!rows.length || max <= 0) return <Empty icon="chart">{empty ?? '—'}</Empty>;
  return (
    <div className="bars" role="list">
      {rows.map((r, i) => (
        <div key={i} className="bar-row" role="listitem">
          <span className="bar-label">{r.label}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: `${Math.max(2, Math.round((r.value / max) * 100))}%` }} /></span>
          <span className="bar-value">{r.shown}{r.note && <small>{r.note}</small>}</span>
        </div>
      ))}
    </div>
  );
}

export const tierName = (t: Tier) => (t === 'vip' ? 'VIP' : t === 'premium' ? 'Premium' : 'Base');

/** Shown instead of a screen the plan does not include. */
export function Locked({ lang, need }: { lang: Lang; need: Tier }) {
  return (
    <div className="locked">
      <span className="locked-icon"><Icon name="lock" size={22} /></span>
      <h2>{pick(lang, `Compris dans le forfait ${tierName(need)}`, `Included in the ${tierName(need)} plan`)}</h2>
      <p className="muted">{pick(lang, 'Changez de forfait dans le Clover App Market : l’écran s’ouvre dès que Clover confirme.', 'Change your plan in the Clover App Market: the screen opens as soon as Clover confirms.')}</p>
      <div className="row center"><a className="btn" href={appMarketUrl(APP.cloverAppId)} target="_blank" rel="noopener noreferrer">{pick(lang, 'Voir les forfaits', 'See the plans')}</a><Link className="btn ghost" href="/app/account/plan">{pick(lang, 'Mon forfait', 'My plan')}</Link></div>
    </div>
  );
}

/** Shown instead of a screen the person's role does not open. */
export function NotAllowed({ lang, role, need }: { lang: Lang; role: Role; need: Role }) {
  return (
    <div className="locked">
      <span className="locked-icon"><Icon name="shield" size={22} /></span>
      <h2>{pick(lang, 'Réservé à un autre rôle', 'Reserved for another role')}</h2>
      <p className="muted">{pick(lang,
        `Votre rôle (${ROLE_LABEL[role][0]}) n’ouvre pas cet écran ; ${ROLE_LABEL[need][0]} ou plus le peut. Le propriétaire peut le changer dans Compte › Actions autorisées.`,
        `Your role (${ROLE_LABEL[role][1]}) does not open this screen; ${ROLE_LABEL[need][1]} or higher can. The owner can change it in Account › Authorized actions.`)}</p>
      <div className="row center"><Link className="btn ghost" href="/app/account/access">{pick(lang, 'Voir les actions autorisées', 'See authorized actions')}</Link></div>
    </div>
  );
}

/** Not signed in: the only way in is through Clover. */
export function SignIn({ lang, error }: { lang: Lang; error?: string | null }) {
  return (
    <main className="signin">
      <div className="signin-card">
        <span className="mono big">{selfMono(APP.key, APP.name)}</span>
        <h1>{APP.name}</h1>
        <p className="muted">{pick(lang, APP.summaryFr, APP.summaryEn || APP.summaryFr)}</p>
        {error && <Banner tone="stop">{error}</Banner>}
        <a className="btn wide" href="/api/clover/connect/start">{pick(lang, 'Se connecter avec Clover', 'Sign in with Clover')}</a>
        <p className="muted small">{pick(lang, 'Vous pouvez aussi ouvrir l’app depuis votre tableau de bord Clover.', 'You can also open the app from your Clover dashboard.')}</p>
        <p className="small"><span className="eyebrow">GROUPE TAKATAK · TAKATAK SUITE</span></p>
      </div>
    </main>
  );
}
