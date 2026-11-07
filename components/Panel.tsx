import { money, pick } from '@/lib/core/i18n';
import type { PageCtx } from '@/lib/core/page';
import { customerStats, listCampaigns, listDiscounts, previewCampaign, segmentCounts, SEGMENTS, type Segment, type Campaign } from '@/lib/domain/marketing';
import { ApiForm, type Field } from './ApiForm';
import { Icon } from './icons';
import { RevokeButton } from './RevokeButton';
import { Badge, Banner, Bars, Card, Empty, Stat } from './ui';

// M4RKETING screens (lib/domain `sections`): segments, discounts, campaigns (Premium), audience export (Premium).
const LABEL: Record<Segment, [string, string]> = { new: ['Nouveaux', 'New'], regular: ['Réguliers', 'Regulars'], lapsing: ['À relancer (31–90 j)', 'Lapsing (31–90 d)'], lost: ['Perdus (> 90 j)', 'Lost (> 90 d)'] };
const HINT: Record<Segment, [string, string]> = {
  new: ['Première commande il y a moins de 30 jours.', 'First order less than 30 days ago.'], regular: ['Clients fidèles, dernière visite il y a moins de 30 jours.', 'Loyal customers, last visit less than 30 days ago.'],
  lapsing: ['Pas vus depuis 31 à 90 jours : le bon moment pour un rabais.', 'Not seen for 31 to 90 days: the right time for a discount.'], lost: ['Pas vus depuis plus de 90 jours.', 'Not seen for more than 90 days.'],
};

export async function Panel({ ctx, section, query = {} }: { ctx: PageCtx; section: string; query?: Record<string, string> }) {
  switch (section) {
    case '': return <Segments ctx={ctx} />;
    case 'discounts': return <Discounts ctx={ctx} />;
    case 'campaigns': return <Campaigns ctx={ctx} selectedId={query.campaign} />;
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

function campaignFields(lang: PageCtx['lang'], discounts: Array<{ id: string; name: string }>, campaign?: Campaign): Field[] {
  const selected = campaign?.discountId ?? discounts.find((d) => d.name === campaign?.discountName)?.id ?? '';
  return [
    { name: 'name', label: pick(lang, 'Nom', 'Name'), required: true, defaultValue: campaign?.name },
    { name: 'segment', label: 'Segment', type: 'select', defaultValue: campaign?.segment, options: SEGMENTS.map((k) => ({ value: k, label: pick(lang, ...LABEL[k]) })) },
    { name: 'discountId', label: pick(lang, 'Rabais Clover', 'Clover discount'), type: 'select', defaultValue: selected, options: [{ value: '', label: pick(lang, 'Sans rabais', 'No discount') }, ...discounts.map((x) => ({ value: x.id, label: x.name }))] },
    { name: 'messageFr', label: pick(lang, 'Message (français)', 'Message (French)'), type: 'textarea', defaultValue: campaign?.messageFr },
    { name: 'messageEn', label: pick(lang, 'Message (anglais)', 'Message (English)'), type: 'textarea', defaultValue: campaign?.messageEn },
  ];
}

async function Campaigns({ ctx, selectedId }: { ctx: PageCtx; selectedId?: string }) {
  const { lang, merchantId } = ctx;
  const [d, campaigns] = await Promise.all([listDiscounts(merchantId!), listCampaigns(merchantId!)]);
  const selected = selectedId ? campaigns.find((c) => c.id === selectedId) : null;
  return (
    <>
      <Card title={pick(lang, 'Campagnes', 'Campaigns')} icon="megaphone" sub={pick(lang, 'Préparez le message, vérifiez le rabais et l’audience, puis faites approuver cette version. Rien n’est envoyé par cette app.', 'Prepare the message, review the discount and audience, then approve that version. Nothing is sent by this app.')}>
        {campaigns.length === 0 ? <Empty icon="megaphone">{pick(lang, 'Aucune campagne pour l’instant.', 'No campaign yet.')}</Empty> : (
          <div className="table-wrap"><table><thead><tr><th>{pick(lang, 'Nom', 'Name')}</th><th>Segment</th><th>{pick(lang, 'Rabais', 'Discount')}</th><th>{pick(lang, 'État', 'Status')}</th></tr></thead>
            <tbody>{campaigns.map((c) => <tr key={c.id}><td><a href={`/app/campaigns?campaign=${encodeURIComponent(c.id)}`}>{c.name}</a></td><td>{pick(lang, ...LABEL[c.segment])}</td><td>{c.discountName ?? '—'}</td>
              <td>{c.status === 'approved' && c.approvalHash ? <Badge tone="ok">{pick(lang, 'Version approuvée', 'Version approved')}</Badge> : <Badge>{pick(lang, 'À vérifier', 'Needs review')}</Badge>}</td></tr>)}</tbody></table></div>
        )}
      </Card>
      {selectedId && !selected && <Banner tone="warn">{pick(lang, 'Cette campagne n’est pas disponible dans la liste de ce marchand.', 'This campaign is not available in this merchant’s list.')}</Banner>}
      {selected && <CampaignReview ctx={ctx} campaign={selected} discounts={d.ok ? d.list : []} />}
      {ctx.can('marketing.campaigns') && !selected && (
        <Card title={pick(lang, 'Nouveau brouillon', 'New draft')} icon="plus">
          {!d.ok && <Banner tone="warn">{pick(lang, 'Les rabais Clover sont indisponibles. Vous pouvez préparer un brouillon sans rabais, puis le modifier.', 'Clover discounts are unavailable. You can prepare a draft without a discount and edit it later.')}</Banner>}
          <ApiForm action="/api/marketing/campaigns" fields={campaignFields(lang, d.ok ? d.list : [])} submit={pick(lang, 'Enregistrer le brouillon', 'Save the draft')} done={pick(lang, 'Brouillon enregistré. Ouvrez-le dans la liste pour le vérifier.', 'Draft saved. Open it in the list to review it.')} />
        </Card>
      )}
    </>
  );
}

export async function CampaignReview({ ctx, campaign: listedCampaign, discounts }: { ctx: PageCtx; campaign: Campaign; discounts: Array<{ id: string; name: string }> }) {
  const { lang, merchantId } = ctx;
  const result = await previewCampaign(merchantId!, listedCampaign.id);
  const preview = result.ok ? result.preview : null;
  // The list can become stale while the preview reads Clover. Display and edit
  // the same campaign version whose hash is submitted for approval.
  const campaign = preview?.campaign ?? listedCampaign;
  return (
    <>
      <Card title={pick(lang, `Vérifier : ${campaign.name}`, `Review: ${campaign.name}`)} icon="check" sub={pick(lang, 'L’approbation porte sur ce message, ce segment et la valeur actuelle du rabais dans Clover.', 'Approval covers this message, this segment and the current Clover discount value.')}>
        <p><strong>{pick(lang, ...LABEL[campaign.segment])}</strong> · {campaign.discountName ?? pick(lang, 'Sans rabais', 'No discount')}</p>
        {preview?.discount && <p>{pick(lang, 'Valeur vérifiée dans Clover :', 'Verified Clover value:')} {preview.discount.amountCents !== null ? money(preview.discount.amountCents, lang) : `${preview.discount.percentage} %`}</p>}
        <div className="grid"><div><h3>{pick(lang, 'Message français', 'French message')}</h3><p style={{ whiteSpace: 'pre-wrap' }}>{campaign.messageFr || '—'}</p></div><div><h3>{pick(lang, 'Message anglais', 'English message')}</h3><p style={{ whiteSpace: 'pre-wrap' }}>{campaign.messageEn || '—'}</p></div></div>
        {!result.ok ? <Banner tone="warn">{pick(lang, 'La campagne ne peut pas être vérifiée pour le moment. Vérifiez le rabais et la connexion Clover, puis actualisez cette page.', 'This campaign cannot be verified right now. Check the discount and Clover connection, then refresh this page.')}</Banner> : (
          <>
            <p>{pick(lang, `Contacts joignables avec consentement Clover : ${preview!.audience.consentedCount}. Clients dans ce segment : ${preview!.audience.segmentCount}.`, `Reachable contacts with Clover consent: ${preview!.audience.consentedCount}. Customers in this segment: ${preview!.audience.segmentCount}.`)}</p>
            <p className="muted small">{pick(lang, 'Le consentement sera relu dans Clover au moment de chaque export. Aucun contact n’est affiché dans cet aperçu.', 'Consent is re-read from Clover for each export. No contact details are shown in this preview.')}</p>
            {!preview!.canApprove && <Banner tone="warn">{pick(lang, 'Ajoutez un message en français ou en anglais avant d’approuver la campagne.', 'Add a French or English message before approving this campaign.')}</Banner>}
            {preview!.approved ? (
              <>
                <Badge tone="ok">{pick(lang, 'Version approuvée', 'Version approved')}{campaign.approvedBy ? ` · ${campaign.approvedBy}` : ''}</Badge>
                {ctx.can('marketing.export') && <p><a className="btn" href={`/api/marketing/export?campaign=${encodeURIComponent(campaign.id)}`}>{pick(lang, 'Exporter l’audience approuvée (CSV)', 'Export approved audience (CSV)')}</a></p>}
              </>
            ) : (
              <>
                {campaign.status === 'approved' && <Banner tone="warn">{pick(lang, 'Le contenu ou le rabais a changé depuis l’approbation. Cette version doit être approuvée de nouveau.', 'The content or discount changed after approval. Approve this version again.')}</Banner>}
                {ctx.can('marketing.approve') && preview!.canApprove && <ApiForm key={preview!.configurationHash} action="/api/marketing/campaigns" extra={{ approve: campaign.id, previewHash: preview!.configurationHash }} fields={[]} submit={pick(lang, 'Approuver cette version', 'Approve this version')} confirm={pick(lang, 'Approuver ce message, ce segment et ce rabais ? Aucun message ne sera envoyé.', 'Approve this message, segment and discount? No message will be sent.')} done={pick(lang, 'Version approuvée. Vous pouvez exporter son audience.', 'Version approved. Its audience can now be exported.')} />}
              </>
            )}
          </>
        )}
      </Card>
      {ctx.can('marketing.campaigns') && <Card title={pick(lang, 'Modifier la campagne', 'Edit the campaign')} icon="tag" sub={pick(lang, 'Une modification du contenu annule l’approbation. Une nouvelle vérification sera requise.', 'A content change clears approval. Another review will be required.')}>
        <ApiForm key={`${campaign.id}:${campaign.revision ?? 1}`} action="/api/marketing/campaigns" method="PATCH" extra={{ id: campaign.id, revision: campaign.revision ?? 1 }} fields={campaignFields(lang, discounts, campaign)} submit={pick(lang, 'Enregistrer les modifications', 'Save changes')} done={pick(lang, 'Modifications enregistrées. Vérifiez cette version avant de l’approuver.', 'Changes saved. Review this version before approving it.')} />
        <p><a href="/app/campaigns">{pick(lang, 'Préparer une autre campagne', 'Prepare another campaign')}</a></p>
      </Card>}
    </>
  );
}

async function Audience({ ctx }: { ctx: PageCtx }) {
  const { lang, merchantId } = ctx;
  const approved = (await listCampaigns(merchantId!)).filter((c) => c.status === 'approved' && c.approvalHash);
  return (
    <Card title={pick(lang, 'Audience des campagnes approuvées', 'Approved campaign audiences')} icon="download" sub={pick(lang, 'Ouvrez une campagne pour vérifier sa version et exporter seulement les contacts qui consentent toujours au marketing dans Clover.', 'Open a campaign to verify its version and export only contacts who still consent to marketing in Clover.')}>
      {!approved.length ? <Empty icon="megaphone">{pick(lang, 'Aucune version approuvée pour le moment.', 'No approved version yet.')}</Empty> : <div className="tiles">{approved.map((c) => (
        <a key={c.id} className="tile" href={`/app/campaigns?campaign=${encodeURIComponent(c.id)}`}>
          <span className="tile-mark"><Icon name="download" size={20} /></span>
          <span className="tile-body"><span className="tile-title">{c.name}</span><span className="tile-text">{pick(lang, ...LABEL[c.segment])} · {pick(lang, 'Vérifier et exporter', 'Review and export')}</span></span>
        </a>
      ))}</div>}
      <p><a href="/app/campaigns">{pick(lang, 'Préparer ou vérifier une campagne', 'Prepare or review a campaign')}</a></p>
      <p className="muted small">{pick(lang, 'Utilisez le fichier pour la campagne approuvée et votre outil d’envoi autorisé. Cette app n’envoie aucun message.', 'Use the file for the approved campaign in your authorized sending tool. This app sends no messages.')}</p>
    </Card>
  );
}
