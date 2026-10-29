import { tierAtLeast } from '@/lib/app';
import { money, pick } from '@/lib/core/i18n';
import type { PageCtx } from '@/lib/core/page';
import { customerStats, listCampaigns, listDiscounts, segmentCounts, SEGMENTS, type Segment } from '@/lib/domain/marketing';
import { ApiForm } from './ApiForm';
import { RevokeButton } from './RevokeButton';
import { Banner, Card, Stat } from './ui';

const LABEL: Record<Segment, [string, string]> = { new: ['Nouveaux', 'New'], regular: ['Réguliers', 'Regulars'], lapsing: ['À relancer (31–90 j)', 'Lapsing (31–90 d)'], lost: ['Perdus (> 90 j)', 'Lost (> 90 d)'] };

// M4RKETING dashboard: segments, the app's Clover discounts and their use, campaigns (Premium).
export async function Panel({ ctx }: { ctx: PageCtx }) {
  const { lang, merchantId, tier } = ctx;
  if (!merchantId) return null;
  const premium = tierAtLeast(tier, 'premium');
  const [s, d, campaigns] = await Promise.all([customerStats(merchantId), listDiscounts(merchantId), premium ? listCampaigns(merchantId) : Promise.resolve([])]);
  const counts = s.ok ? segmentCounts(s.list) : null;
  return (
    <>
      {!s.ok ? <Banner tone="warn">{s.error}</Banner> : (
        <div className="grid">{SEGMENTS.map((k) => <Stat key={k} label={pick(lang, ...LABEL[k])} value={counts![k]} note={premium ? <a href={`/api/marketing/export?segment=${k}`}>CSV</a> : undefined} />)}</div>
      )}
      <p className="muted">{pick(lang, 'Clients des 180 derniers jours qui ont une fiche client Clover. L’export ne contient que ceux qui ont accepté le marketing.', 'Customers of the last 180 days with a Clover customer record. The export only has those who accepted marketing.')}</p>
      <Card title={pick(lang, 'Rabais M4RKETING (dans Clover)', 'M4RKETING discounts (in Clover)')}>
        {d.ok && d.list.length > 0 && (
          <table><thead><tr><th>{pick(lang, 'Nom', 'Name')}</th><th>{pick(lang, 'Valeur', 'Value')}</th><th>{pick(lang, 'Utilisé (180 j)', 'Used (180 d)')}</th><th /></tr></thead>
            <tbody>{d.list.map((x) => <tr key={x.id}><td>{x.name}</td><td>{x.amountCents !== null ? money(x.amountCents, lang) : `${x.percentage} %`}</td><td>{s.ok ? s.discountUse[x.name] ?? 0 : '—'}</td><td><RevokeButton url={`/api/marketing/discounts?id=${x.id}`} label={pick(lang, 'Retirer', 'Remove')} /></td></tr>)}</tbody></table>
        )}
        <ApiForm action="/api/marketing/discounts" fields={[
          { name: 'name', label: pick(lang, 'Nom', 'Name'), required: true, placeholder: 'Retour 10 %' },
          { name: 'amountCents', label: pick(lang, 'Montant ($) — ou', 'Amount ($) — or'), type: 'money' },
          { name: 'percentage', label: pick(lang, 'Pourcentage', 'Percentage'), type: 'number' },
        ]} submit={pick(lang, 'Créer dans Clover', 'Create in Clover')} />
      </Card>
      {premium ? (
        <Card title={pick(lang, 'Campagnes', 'Campaigns')}>
          <p className="muted">{pick(lang, 'Un brouillon est approuvé par une personne. Rien n’est envoyé par cette app : exportez l’audience (consentement Clover) vers votre outil d’envoi.', 'A person approves each draft. Nothing is sent by this app: export the audience (Clover consent) to your sending tool.')}</p>
          {campaigns.length > 0 && <table><thead><tr><th>{pick(lang, 'Nom', 'Name')}</th><th>Segment</th><th>{pick(lang, 'Rabais', 'Discount')}</th><th /></tr></thead>
            <tbody>{campaigns.map((c) => <tr key={c.id}><td>{c.name}</td><td>{pick(lang, ...LABEL[c.segment])}</td><td>{c.discountName ?? '—'}</td><td>{c.status === 'approved' ? pick(lang, 'Approuvée', 'Approved') : <ApproveButton id={c.id} label={pick(lang, 'Approuver', 'Approve')} />}</td></tr>)}</tbody></table>}
          <ApiForm action="/api/marketing/campaigns" fields={[
            { name: 'name', label: pick(lang, 'Nom', 'Name'), required: true },
            { name: 'segment', label: 'Segment', type: 'select', options: SEGMENTS.map((k) => ({ value: k, label: pick(lang, ...LABEL[k]) })) },
            { name: 'discountName', label: pick(lang, 'Rabais', 'Discount'), type: 'select', options: [{ value: '', label: '—' }, ...(d.ok ? d.list.map((x) => ({ value: x.name, label: x.name })) : [])] },
            { name: 'messageFr', label: pick(lang, 'Message (français)', 'Message (French)'), type: 'textarea' },
            { name: 'messageEn', label: pick(lang, 'Message (anglais)', 'Message (English)'), type: 'textarea' },
          ]} submit={pick(lang, 'Enregistrer le brouillon', 'Save the draft')} />
        </Card>
      ) : <p className="muted">{pick(lang, 'Campagnes et export d’audience : forfait Premium.', 'Campaigns and audience export: Premium plan.')}</p>}
    </>
  );
}

function ApproveButton({ id, label }: { id: string; label: string }) {
  return <ApiForm action="/api/marketing/campaigns" extra={{ approve: id }} fields={[]} submit={label} />;
}
