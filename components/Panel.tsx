import { money, pick } from '@/lib/core/i18n';
import type { PageCtx } from '@/lib/core/page';
import { customerStats, listCampaigns, listDiscounts, segmentCounts, SEGMENTS, type Segment } from '@/lib/domain/marketing';
import { ApiForm } from './ApiForm';
import { Icon } from './icons';
import { RevokeButton } from './RevokeButton';
import { Badge, Banner, Bars, Card, Empty, Stat } from './ui';

// M4RKETING screens (lib/domain `sections`): segments, discounts, campaigns (Premium), audience export (Premium).
const LABEL: Record<Segment, [string, string]> = { new: ['Nouveaux', 'New'], regular: ['Réguliers', 'Regulars'], lapsing: ['À relancer (31–90 j)', 'Lapsing (31–90 d)'], lost: ['Perdus (> 90 j)', 'Lost (> 90 d)'] };
const HINT: Record<Segment, [string, string]> = {
  new: ['Première commande il y a moins de 30 jours.', 'First order less than 30 days ago.'], regular: ['Clients fidèles, dernière visite il y a moins de 30 jours.', 'Loyal customers, last visit less than 30 days ago.'],
  lapsing: ['Pas vus depuis 31 à 90 jours : le bon moment pour un rabais.', 'Not seen for 31 to 90 days: the right time for a discount.'], lost: ['Pas vus depuis plus de 90 jours.', 'Not seen for more than 90 days.'],
};

export async function Panel({ ctx, section }: { ctx: PageCtx; section: string; query?: Record<string, string> }) {
  switch (section) {
    case '': return <Segments ctx={ctx} />;
    case 'discounts': return <Discounts ctx={ctx} />;
    case 'campaigns': return <Campaigns ctx={ctx} />;
    case 'audience': return <Audience ctx={ctx} />;
    default: return null;
  }
}

async function Segments({ ctx }: { ctx: PageCtx }) {
  const { lang, merchantId } = ctx;
  const s = await customerStats(merchantId!);
  if (!s.ok) return <Banner tone="warn">{s.error}</Banner>;
  const counts = segmentCounts(s.list);
  const spent = (k: Segment) => s.list.filter((x) => x.segment === k).reduce((t, x) => t + x.spentCents, 0);
  return (
    <>
      <div className="grid">{SEGMENTS.map((k) => <Stat key={k} label={pick(lang, ...LABEL[k])} value={counts[k]} note={money(spent(k), lang)} tone={k === 'lapsing' && counts[k] > 0 ? 'warn' : undefined} />)}</div>
      <Card title={pick(lang, 'Ce que vos clients dépensent', 'What your customers spend')} icon="chart" sub={pick(lang, 'Clients des 180 derniers jours qui ont une fiche client Clover.', 'Customers of the last 180 days with a Clover customer record.')}>
        <Bars rows={SEGMENTS.map((k) => ({ label: pick(lang, ...LABEL[k]), value: spent(k), shown: money(spent(k), lang), note: `${counts[k]} ${pick(lang, 'clients', 'customers')}` }))} empty={pick(lang, 'Aucun client avec une fiche Clover pour l’instant.', 'No customer with a Clover record yet.')} />
      </Card>
      <Card title={pick(lang, 'Que faire de chaque segment', 'What to do with each segment')} icon="spark">
        <ul className="checks">{SEGMENTS.map((k) => <li key={k}><Icon name="check" size={16} /><span><strong>{pick(lang, ...LABEL[k])}</strong> — {pick(lang, ...HINT[k])}</span></li>)}</ul>
      </Card>
    </>
  );
}

async function Discounts({ ctx }: { ctx: PageCtx }) {
  const { lang, merchantId } = ctx;
  const [d, s] = await Promise.all([listDiscounts(merchantId!), customerStats(merchantId!)]);
  const can = ctx.can('marketing.discounts');
  return (
    <>
      <Card title={pick(lang, 'Rabais M4RKETING dans Clover', 'M4RKETING discounts in Clover')} icon="tag" sub={pick(lang, 'Ils apparaissent à la caisse Clover avec le préfixe « M4 · ».', 'They show at the Clover register with the “M4 · ” prefix.')}>
        {!d.ok ? <Banner tone="warn">{d.error}</Banner> : d.list.length === 0 ? <Empty icon="tag">{pick(lang, 'Aucun rabais pour l’instant.', 'No discount yet.')}</Empty> : (
          <div className="table-wrap"><table><thead><tr><th>{pick(lang, 'Nom', 'Name')}</th><th className="right">{pick(lang, 'Valeur', 'Value')}</th><th className="right">{pick(lang, 'Utilisé (180 j)', 'Used (180 d)')}</th><th /></tr></thead>
            <tbody>{d.list.map((x) => <tr key={x.id}><td>{x.name}</td><td className="right">{x.amountCents !== null ? money(x.amountCents, lang) : `${x.percentage} %`}</td><td className="right">{s.ok ? s.discountUse[x.name] ?? 0 : '—'}</td>
              <td className="right">{can && <RevokeButton url={`/api/marketing/discounts?id=${x.id}`} label={pick(lang, 'Retirer', 'Remove')} confirm={pick(lang, `Retirer « ${x.name} » de Clover ?`, `Remove “${x.name}” from Clover?`)} />}</td></tr>)}</tbody></table></div>
        )}
      </Card>
      {can && (
        <Card title={pick(lang, 'Nouveau rabais', 'New discount')} icon="plus" sub={pick(lang, 'Un montant ou un pourcentage.', 'An amount or a percentage.')}>
          <ApiForm action="/api/marketing/discounts" fields={[
            { name: 'name', label: pick(lang, 'Nom', 'Name'), required: true, placeholder: 'Retour 10 %' },
            { name: 'amountCents', label: pick(lang, 'Montant ($) — ou', 'Amount ($) — or'), type: 'money' },
            { name: 'percentage', label: pick(lang, 'Pourcentage', 'Percentage'), type: 'number' },
          ]} submit={pick(lang, 'Créer dans Clover', 'Create in Clover')} done={pick(lang, 'Rabais créé dans Clover.', 'Discount created in Clover.')} />
        </Card>
      )}
    </>
  );
}

async function Campaigns({ ctx }: { ctx: PageCtx }) {
  const { lang, merchantId } = ctx;
  const [d, campaigns] = await Promise.all([listDiscounts(merchantId!), listCampaigns(merchantId!)]);
  return (
    <>
      <Card title={pick(lang, 'Campagnes', 'Campaigns')} icon="megaphone" sub={pick(lang, 'Un brouillon est approuvé par une personne. Rien n’est envoyé par cette app : exportez l’audience vers votre outil d’envoi.', 'A person approves each draft. Nothing is sent by this app: export the audience to your sending tool.')}>
        {campaigns.length === 0 ? <Empty icon="megaphone">{pick(lang, 'Aucune campagne pour l’instant.', 'No campaign yet.')}</Empty> : (
          <div className="table-wrap"><table><thead><tr><th>{pick(lang, 'Nom', 'Name')}</th><th>Segment</th><th>{pick(lang, 'Rabais', 'Discount')}</th><th>{pick(lang, 'État', 'Status')}</th></tr></thead>
            <tbody>{campaigns.map((c) => <tr key={c.id}><td>{c.name}</td><td>{pick(lang, ...LABEL[c.segment])}</td><td>{c.discountName ?? '—'}</td>
              <td>{c.status === 'approved' ? <Badge tone="ok">{pick(lang, 'Approuvée', 'Approved')}{c.approvedBy ? ` · ${c.approvedBy}` : ''}</Badge>
                : ctx.can('marketing.approve') ? <ApiForm action="/api/marketing/campaigns" extra={{ approve: c.id }} fields={[]} submit={pick(lang, 'Approuver', 'Approve')} tone="ghost" confirm={pick(lang, `Approuver « ${c.name} » ?`, `Approve “${c.name}”?`)} done={pick(lang, 'Approuvée.', 'Approved.')} />
                : <Badge>{pick(lang, 'Brouillon', 'Draft')}</Badge>}</td></tr>)}</tbody></table></div>
        )}
      </Card>
      {ctx.can('marketing.campaigns') && (
        <Card title={pick(lang, 'Nouveau brouillon', 'New draft')} icon="plus">
          <ApiForm action="/api/marketing/campaigns" fields={[
            { name: 'name', label: pick(lang, 'Nom', 'Name'), required: true },
            { name: 'segment', label: 'Segment', type: 'select', options: SEGMENTS.map((k) => ({ value: k, label: pick(lang, ...LABEL[k]) })) },
            { name: 'discountName', label: pick(lang, 'Rabais', 'Discount'), type: 'select', options: [{ value: '', label: '—' }, ...(d.ok ? d.list.map((x) => ({ value: x.name, label: x.name })) : [])] },
            { name: 'messageFr', label: pick(lang, 'Message (français)', 'Message (French)'), type: 'textarea' },
            { name: 'messageEn', label: pick(lang, 'Message (anglais)', 'Message (English)'), type: 'textarea' },
          ]} submit={pick(lang, 'Enregistrer le brouillon', 'Save the draft')} done={pick(lang, 'Brouillon enregistré.', 'Draft saved.')} />
        </Card>
      )}
    </>
  );
}

async function Audience({ ctx }: { ctx: PageCtx }) {
  const { lang, merchantId } = ctx;
  const s = await customerStats(merchantId!);
  const counts = s.ok ? segmentCounts(s.list) : null;
  return (
    <Card title={pick(lang, 'Exporter une audience', 'Export an audience')} icon="download" sub={pick(lang, 'Seuls les clients qui ont accepté le marketing dans Clover sont dans le fichier. Chaque export est noté au journal d’activité.', 'Only customers who accepted marketing in Clover are in the file. Each export is written to the activity log.')}>
      <div className="tiles">{SEGMENTS.map((k) => (
        <a key={k} className="tile" href={`/api/marketing/export?segment=${k}`}>
          <span className="tile-mark"><Icon name="download" size={20} /></span>
          <span className="tile-body"><span className="tile-title">{pick(lang, ...LABEL[k])}</span><span className="tile-text">{counts ? `${counts[k]} ${pick(lang, 'clients dans le segment', 'customers in the segment')}` : '—'} · CSV</span></span>
        </a>
      ))}</div>
      <p className="muted small">{pick(lang, 'Loi 25 : utilisez ce fichier seulement pour la campagne approuvée, puis supprimez-le.', 'Law 25: use this file only for the approved campaign, then delete it.')}</p>
    </Card>
  );
}
