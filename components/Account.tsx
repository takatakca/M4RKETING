// Account → Profile, Plan and billing, Authorized actions, Devices, Payments and deposits, Security and data, Activity.
// Shared kit: identical in every TAKATAK Suite app.
import Link from 'next/link';
import { APP, ownMerchants, tierAtLeast, type Tier } from '@/lib/app';
import { cloverConfig } from '@/lib/clover/config';
import { merchantProfile } from '@/lib/clover/profile';
import { allActions } from '@/lib/core/access';
import { recentAudit } from '@/lib/core/audit';
import { money, pick } from '@/lib/core/i18n';
import type { PageCtx } from '@/lib/core/page';
import { ROLE_LABEL, ROLES } from '@/lib/core/roles';
import { getStore } from '@/lib/core/store';
import { tierFeatures } from '@/lib/domain';
import { appMarketUrl } from '@/lib/suite-catalog';
import { ApiForm } from './ApiForm';
import { DeviceKeys } from './DeviceKeys';
import { Icon } from './icons';
import { RevokeButton } from './RevokeButton';
import { Badge, Banner, Card, Empty, KV, tierName } from './ui';

const TIERS: Tier[] = ['base', 'premium', 'vip'];

export async function AccountTab({ ctx, tab }: { ctx: PageCtx; tab: string }) {
  switch (tab) {
    case 'profile': return <Profile ctx={ctx} />;
    case 'plan': return <Plan ctx={ctx} />;
    case 'access': return <Access ctx={ctx} />;
    case 'devices': return <DeviceKeys merchantId={ctx.merchantId!} lang={ctx.lang} title={pick(ctx.lang, 'Toutes les clés d’appareil', 'All device keys')}
      hint={pick(ctx.lang, 'Chaque caisse, borne ou appareil qui appelle l’app a sa propre clé. Une clé perdue se retire ici : l’appareil s’arrête aussitôt.', 'Each register, kiosk or device that calls the app has its own key. A lost key is revoked here: the device stops at once.')}
      canManage={ctx.can('account.devices')} />;
    case 'payouts': return <Payouts ctx={ctx} />;
    case 'security': return <Security ctx={ctx} />;
    case 'activity': return <Activity ctx={ctx} />;
    default: return null;
  }
}

const date = (iso: string | null | undefined, lang: 'fr' | 'en', time = false) => (iso ? new Date(iso)[time ? 'toLocaleString' : 'toLocaleDateString'](lang === 'en' ? 'en-CA' : 'fr-CA') : '—');

async function Profile({ ctx }: { ctx: PageCtx }) {
  const { lang, merchant } = ctx;
  const m = merchant!;
  const p = await merchantProfile(m.merchantId).catch(() => null);
  const t = (fr: string, en: string) => pick(lang, fr, en);
  const other = lang === 'en' ? 'fr' : 'en';
  return (
    <>
      {!p && <Banner tone="warn">{t('Clover n’a pas répondu : les renseignements ci-dessous sont ceux gardés à la connexion.', 'Clover did not answer: the details below are the ones kept at sign-in.')}</Banner>}
      <Card title={t('Votre commerce', 'Your business')} sub={t('Lu dans Clover. Pour le changer : Clover → Compte et configuration → Infos sur l’entreprise.', 'Read from Clover. To change it: Clover → Account & Setup → Business Information.')} icon="store">
        <KV rows={[
          [t('Nom', 'Name'), p?.name ?? m.name],
          [t('Identifiant marchand Clover', 'Clover merchant ID'), <code key="m">{m.merchantId}</code>],
          [t('Adresse', 'Address'), p?.address],
          [t('Téléphone du commerce', 'Business phone'), p?.phone],
          [t('Site web', 'Website'), p?.website ? <a key="w" href={/^https?:\/\//.test(p.website) ? p.website : `https://${p.website}`} target="_blank" rel="noopener noreferrer">{p.website}</a> : null],
          [t('Devise', 'Currency'), p?.currency],
          [t('Pourboires', 'Tips'), p?.tipsEnabled === null || !p ? null : p.tipsEnabled ? t('Activés', 'On') : t('Désactivés', 'Off')],
          [t('Client Clover depuis', 'Clover customer since'), date(p?.createdAt, lang)],
          [t(`${APP.name} connectée le`, `${APP.name} connected on`), date(m.installedAt, lang)],
        ]} />
      </Card>
      <Card title={t('Vous', 'You')} icon="user">
        <KV rows={[
          [t('Nom', 'Name'), ctx.person ?? t('Non transmis par Clover', 'Not shared by Clover')],
          [t('Rôle dans Clover', 'Clover role'), <span key="r">{t(ROLE_LABEL[ctx.role][0], ROLE_LABEL[ctx.role][1])} {ctx.roleVerified ? <Badge tone="ok">{t('confirmé', 'confirmed')}</Badge> : <Badge tone="warn">{t('non confirmé', 'not confirmed')}</Badge>}</span>],
          [t('Langue', 'Language'), <a key="l" href={`/api/session/lang?lang=${other}&back=/app/account/profile`}>{lang === 'en' ? 'English' : 'Français'} → {other === 'en' ? 'English' : 'Français'}</a>],
        ]} />
      </Card>
    </>
  );
}

async function Plan({ ctx }: { ctx: PageCtx }) {
  const { lang, merchant, tier } = ctx;
  const m = merchant!;
  const t = (fr: string, en: string) => pick(lang, fr, en);
  const own = ownMerchants().has(m.merchantId);
  const price = APP.tiers.find((x) => x.name.toLowerCase() === tierName(tier).toLowerCase())?.priceCadPerMonth;
  return (
    <>
      <section className="hero-plan">
        <div>
          <p className="eyebrow">{t('Votre forfait', 'Your plan')}</p>
          <h2 className="hero-plan-name">{tierName(tier)}{price !== undefined && !own && <span> · {money(price * 100, lang)} / {t('mois', 'month')}</span>}</h2>
          <p className="muted">{own ? t('Restaurant du Groupe TAKATAK : tout est inclus, rien n’est facturé.', 'TAKATAK Group restaurant: everything included, nothing billed.')
            : m.billing?.plan ? `${t('Forfait Clover', 'Clover plan')} : ${m.billing.plan}${m.billing.status ? ` · ${m.billing.status}` : ''}` : t('Clover n’a pas encore indiqué votre forfait : Base par défaut.', 'Clover has not reported your plan yet: Base by default.')}</p>
          <div className="row">{m.billing?.inTrial && <Badge tone="warn">{t('Période d’essai', 'Trial')}</Badge>}<span className="muted small">{t('Vérifié', 'Checked')} {date(m.billing?.checkedAt, lang, true)}</span></div>
        </div>
        <div className="hero-plan-actions">
          <a className="btn" href={appMarketUrl(APP.cloverAppId)} target="_blank" rel="noopener noreferrer">{t('Changer de forfait', 'Change plan')}</a>
          <ApiForm action="/api/account/billing" fields={[]} submit={t('Revérifier auprès de Clover', 'Check again with Clover')} tone="ghost" done={t('Forfait relu.', 'Plan read again.')} />
        </div>
      </section>
      <div className="plans">
        {TIERS.map((k, i) => {
          const def = APP.tiers[i];
          return (
            <section key={k} className={`plan${k === tier ? ' is-current' : ''}`}>
              <header><h3>{tierName(k)}</h3>{k === tier && <Badge tone="brand">{t('Actuel', 'Current')}</Badge>}</header>
              <p className="plan-price">{def ? money(def.priceCadPerMonth * 100, lang) : '—'}<small> / {t('mois', 'month')}</small></p>
              {i > 0 && <p className="muted small">{t(`Tout ${tierName(TIERS[i - 1])}, plus :`, `Everything in ${tierName(TIERS[i - 1])}, plus:`)}</p>}
              <ul className="checks">{(tierFeatures[k] ?? []).map(([fr, en]) => <li key={fr}><Icon name="check" size={16} />{t(fr, en)}</li>)}</ul>
              {!tierAtLeast(tier, k) && <a className="btn ghost" href={appMarketUrl(APP.cloverAppId)} target="_blank" rel="noopener noreferrer">{t(`Passer à ${tierName(k)}`, `Move to ${tierName(k)}`)}</a>}
            </section>
          );
        })}
      </div>
      <p className="muted small">{t('Facturé chaque mois par Clover, sur votre relevé Clover. Annulez en désinstallant l’app dans Clover.', 'Billed monthly by Clover, on your Clover statement. Cancel by uninstalling the app in Clover.')}</p>
    </>
  );
}

function Access({ ctx }: { ctx: PageCtx }) {
  const { lang, policy } = ctx;
  const t = (fr: string, en: string) => pick(lang, fr, en);
  const list = allActions();
  const canEdit = ctx.can('account.access');
  const roleOptions = ROLES.map((r) => ({ value: r, label: t(ROLE_LABEL[r][0], ROLE_LABEL[r][1]) })).reverse();
  return (
    <>
      {!ctx.roleVerified && (
        <Banner tone="warn">{t(
          `Clover n’a pas confirmé votre rôle (l’app n’a pas la permission « Employés : lecture », ou Clover n’a pas transmis l’employé). Vous êtes traité comme ${ROLE_LABEL[policy!.unverified][0]}. Ajoutez la permission dans le tableau de bord développeur Clover, puis rouvrez l’app.`,
          `Clover did not confirm your role (the app lacks the “Employees: read” permission, or Clover did not pass the employee). You are treated as ${ROLE_LABEL[policy!.unverified][1]}. Add the permission in the Clover Developer Dashboard, then open the app again.`)}</Banner>
      )}
      <Card title={t('Qui peut faire quoi', 'Who can do what')} icon="shield"
        sub={t('Chaque action a un rôle minimum. Vérifié par le serveur à chaque fois, et noté au journal d’activité.', 'Each action has a lowest role. Checked by the server every time, and written to the activity log.')}
        right={<Badge tone="brand">{t('Vous', 'You')} : {t(ROLE_LABEL[ctx.role][0], ROLE_LABEL[ctx.role][1])}</Badge>}>
        <div className="table-wrap"><table>
          <thead><tr><th>{t('Action', 'Action')}</th><th>{t('Rôle minimum', 'Lowest role')}</th><th>{t('Vous', 'You')}</th></tr></thead>
          <tbody>{list.map((a) => <tr key={a.key}><td>{t(a.fr, a.en)}<div className="muted small"><code>{a.key}</code></div></td><td>{t(ROLE_LABEL[policy!.min[a.key]][0], ROLE_LABEL[policy!.min[a.key]][1])}</td><td>{ctx.can(a.key) ? <Badge tone="ok">{t('Oui', 'Yes')}</Badge> : <Badge>{t('Non', 'No')}</Badge>}</td></tr>)}</tbody>
        </table></div>
      </Card>
      {canEdit ? (
        <Card title={t('Changer les rôles', 'Change the roles')} icon="user" sub={t('Rôles du plus élevé au plus bas : propriétaire, administrateur, gérant, employé. Un appareil (caisse, borne) compte comme un employé.', 'Roles from highest to lowest: owner, admin, manager, employee. A device (register, kiosk) counts as an employee.')}>
          <ApiForm action="/api/account/access" method="PUT" fields={[
            ...list.map((a) => ({ name: `min.${a.key}`, label: t(a.fr, a.en), type: 'select' as const, options: a.key === 'account.access' ? roleOptions.slice(0, 2) : roleOptions, defaultValue: policy!.min[a.key] })),
            { name: 'unverified', label: t('Rôle non confirmé par Clover', 'Role not confirmed by Clover'), type: 'select' as const, defaultValue: policy!.unverified,
              options: [{ value: 'owner', label: t('Traiter comme propriétaire', 'Treat as owner') }, { value: 'employee', label: t('Traiter comme employé', 'Treat as employee') }] },
          ]} submit={t('Enregistrer', 'Save')} done={t('Enregistré. Les prochains appels suivent ces rôles.', 'Saved. The next calls follow these roles.')} />
        </Card>
      ) : <p className="muted">{t('Seul un rôle autorisé (propriétaire par défaut) change ces réglages.', 'Only an allowed role (the owner by default) changes these settings.')}</p>}
    </>
  );
}

function Payouts({ ctx }: { ctx: PageCtx }) {
  const { lang, tier } = ctx;
  const t = (fr: string, en: string) => pick(lang, fr, en);
  return (
    <>
      <Card title={t('Vos dépôts', 'Your deposits')} icon="bank" sub={t('L’argent de vos ventes ne passe jamais par l’app.', 'The money from your sales never goes through the app.')}>
        <p>{t('Clover dépose vos ventes par carte dans le compte bancaire inscrit à votre compte Clover. Pour voir vos dépôts ou changer ce compte : Clover → Compte et configuration → Dépôts.', 'Clover deposits your card sales into the bank account on your Clover account. To see your deposits or change that account: Clover → Account & Setup → Deposits.')}</p>
        <a className="btn ghost" href={cloverConfig.webUrl} target="_blank" rel="noopener noreferrer">{t('Ouvrir Clover', 'Open Clover')}</a>
      </Card>
      <Card title={t('Ce que l’app ne voit jamais', 'What the app never sees')} icon="lock">
        <ul className="checks">
          <li><Icon name="check" size={16} />{t('Aucun numéro de compte bancaire, de transit ou d’institution : l’app n’en demande pas et n’en garde pas.', 'No bank account, transit or institution number: the app never asks for one or keeps one.')}</li>
          <li><Icon name="check" size={16} />{t('Aucun numéro de carte : les paiements restent chez Clover (norme PCI).', 'No card number: payments stay with Clover (PCI standard).')}</li>
          <li><Icon name="check" size={16} />{t('Aucun mot de passe Clover : la connexion passe par Clover.', 'No Clover password: sign-in goes through Clover.')}</li>
        </ul>
        <p className="muted small">{t('Quelqu’un vous demande ces renseignements au nom de TAKATAK ? Ne répondez pas et prévenez-nous.', 'Someone asks you for these details on behalf of TAKATAK? Do not answer, and tell us.')}</p>
      </Card>
      <Card title={t('Votre abonnement à cette app', 'Your subscription to this app')} icon="card">
        <KV rows={[[t('Forfait', 'Plan'), tierName(tier)], [t('Facturation', 'Billing'), t('Mensuelle, par Clover, sur votre relevé Clover', 'Monthly, by Clover, on your Clover statement')]]} />
        <Link className="btn ghost" href="/app/account/plan">{t('Voir le forfait', 'See the plan')}</Link>
      </Card>
    </>
  );
}

const COLLECTION_LABEL: Record<string, [string, string]> = {
  audit: ['Journal d’activité', 'Activity log'], devices: ['Clés d’appareil', 'Device keys'],
};

async function Security({ ctx }: { ctx: PageCtx }) {
  const { lang, merchant, session } = ctx;
  const t = (fr: string, en: string) => pick(lang, fr, en);
  const counts = await getStore().merchantCounts(merchant!.merchantId);
  const rows = Object.entries(counts).filter(([c]) => !c.startsWith('_')).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <Card title={t('Votre session', 'Your session')} icon="user" right={<RevokeButton url="/api/session" label={t('Se déconnecter', 'Sign out')} />}>
        <KV rows={[
          [t('Connecté en tant que', 'Signed in as'), `${ctx.person ?? t('—', '—')} · ${t(ROLE_LABEL[ctx.role][0], ROLE_LABEL[ctx.role][1])}`],
          [t('Expire le', 'Expires on'), session ? date(new Date(session.exp * 1000).toISOString(), lang, true) : '—'],
          [t('Comment revenir', 'How to come back'), t('Rouvrez l’app depuis Clover : Clover confirme qui vous êtes.', 'Open the app from Clover again: Clover confirms who you are.')],
        ]} />
      </Card>
      <Card title={t('Protections en place', 'Protections in place')} icon="shield">
        <ul className="checks">
          <li><Icon name="check" size={16} />{t('Vos jetons d’accès Clover sont chiffrés (AES-256-GCM) et effacés dès la désinstallation.', 'Your Clover access tokens are encrypted (AES-256-GCM) and erased at uninstall.')}</li>
          <li><Icon name="check" size={16} />{t('Session signée, 7 jours ; la connexion passe toujours par Clover.', 'Signed session, 7 days; sign-in always goes through Clover.')}</li>
          <li><Icon name="check" size={16} />{t('Clés d’appareil gardées sous forme d’empreinte, affichées une seule fois, retirables.', 'Device keys stored as a fingerprint, shown once, revocable.')}</li>
          <li><Icon name="check" size={16} />{t('Chaque action sensible : rôle vérifié par le serveur et noté au journal.', 'Every sensitive action: role checked by the server and logged.')}</li>
          <li><Icon name="check" size={16} />{t('Lien avec Food Hub signé (HMAC) ; aucun nom, téléphone ou courriel de client ne circule entre les apps.', 'Link with Food Hub signed (HMAC); no customer name, phone or email moves between apps.')}</li>
        </ul>
      </Card>
      <Card title={t('Vos données dans cette app', 'Your data in this app')} icon="archive"
        right={ctx.can('account.export') ? <a className="btn ghost" href="/api/account/export"><Icon name="download" size={16} /> {t('Exporter (JSON)', 'Export (JSON)')}</a> : undefined}>
        {rows.length === 0 ? <Empty icon="archive">{t('Rien n’est encore gardé ici.', 'Nothing is kept here yet.')}</Empty> : (
          <div className="table-wrap"><table><thead><tr><th>{t('Registre', 'Record')}</th><th className="right">{t('Nombre', 'Count')}</th></tr></thead>
            <tbody>{rows.map(([c, n]) => <tr key={c}><td>{COLLECTION_LABEL[c] ? t(...COLLECTION_LABEL[c]) : <code>{c}</code>}</td><td className="right">{n.toLocaleString(lang === 'en' ? 'en-CA' : 'fr-CA')}</td></tr>)}</tbody></table></div>
        )}
        <p className="muted small">{t('Désinstaller l’app dans Clover efface aussitôt nos jetons d’accès. Vos registres restent (certains sont des obligations légales, ex. les cartes-cadeaux) jusqu’à votre demande de suppression.', 'Uninstalling the app in Clover erases our access tokens at once. Your records stay (some are legal records, e.g. gift cards) until you ask for deletion.')}</p>
      </Card>
    </>
  );
}

async function Activity({ ctx }: { ctx: PageCtx }) {
  const { lang, merchant } = ctx;
  const t = (fr: string, en: string) => pick(lang, fr, en);
  const list = await recentAudit(merchant!.merchantId, 150);
  const label = new Map(allActions().map((a) => [a.key, t(a.fr, a.en)]));
  return (
    <Card title={t('Dernières actions', 'Latest actions')} icon="log" sub={t('Gardé 180 jours.', 'Kept 180 days.')}>
      {list.length === 0 ? <Empty icon="log">{t('Aucune action sensible pour l’instant.', 'No sensitive action yet.')}</Empty> : (
        <div className="table-wrap"><table>
          <thead><tr><th>{t('Quand', 'When')}</th><th>{t('Qui', 'Who')}</th><th>{t('Action', 'Action')}</th><th>{t('Résultat', 'Result')}</th></tr></thead>
          <tbody>{list.map((e, i) => (
            <tr key={i}>
              <td className="nowrap">{date(e.at, lang, true)}</td>
              <td>{e.actor}<div className="muted small">{t(ROLE_LABEL[e.role][0], ROLE_LABEL[e.role][1])}{e.verified ? '' : ' *'}</div></td>
              <td>{label.get(e.action) ?? e.action}<div className="muted small"><code>{e.method} {e.path}</code></div></td>
              <td>{e.outcome === 'allowed' ? <Badge tone="ok">{t('Permis', 'Allowed')}</Badge> : <Badge tone="stop">{t('Refusé', 'Refused')}</Badge>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {list.some((e) => !e.verified) && <p className="muted small">* {t('rôle non confirmé par Clover', 'role not confirmed by Clover')}</p>}
    </Card>
  );
}
