// M4RKETING's side of the shared shell: hooks, menu sections, authorized actions, device kinds, what each plan adds.
// Segments and discounts are read live from Clover; nothing to do on events yet.
import type { AppHooks } from '../hooks';
import type { AppAction, AppSection, DeviceKind, TierFeatures } from '../nav';

export const hooks: AppHooks = {};

export const sections: AppSection[] = [
  { slug: '', fr: 'Segments', en: 'Segments', icon: 'target', hintFr: 'Vos clients des 180 derniers jours : nouveaux, réguliers, à relancer, perdus.', hintEn: 'Your customers of the last 180 days: new, regular, lapsing, lost.' },
  { slug: 'discounts', fr: 'Rabais', en: 'Discounts', icon: 'tag', hintFr: 'Rabais créés dans Clover et leur utilisation.', hintEn: 'Discounts created in Clover and how often they are used.' },
  { slug: 'campaigns', fr: 'Campagnes', en: 'Campaigns', icon: 'megaphone', tier: 'premium', hintFr: 'Brouillons approuvés par une personne. Rien n’est envoyé par cette app.', hintEn: 'Drafts approved by a person. Nothing is sent by this app.' },
  { slug: 'audience', fr: 'Audience', en: 'Audience', icon: 'download', tier: 'premium', view: 'marketing.export', hintFr: 'Export des clients qui ont accepté le marketing dans Clover.', hintEn: 'Export of the customers who accepted marketing in Clover.' },
];

export const actions: AppAction[] = [
  { key: 'marketing.discounts', fr: 'Créer et retirer des rabais dans Clover', en: 'Create and remove discounts in Clover', min: 'manager' },
  { key: 'marketing.campaigns', fr: 'Préparer des campagnes', en: 'Prepare campaigns', min: 'manager' },
  { key: 'marketing.approve', fr: 'Approuver une campagne', en: 'Approve a campaign', min: 'admin' },
  { key: 'marketing.export', fr: 'Exporter une audience (renseignements personnels)', en: 'Export an audience (personal information)', min: 'admin' },
];

export const deviceKinds: DeviceKind[] = [];

export const tierFeatures: TierFeatures = {
  base: [
    ['Segments : nouveaux, réguliers, à relancer, perdus', 'Segments: new, regular, lapsing, lost'],
    ['Rabais créés et gérés dans Clover (préfixe « M4 · »)', 'Discounts created and managed in Clover (“M4 · ” prefix)'],
    ['Utilisation des rabais mesurée par les commandes', 'Discount use measured by orders'],
  ],
  premium: [
    ['Campagnes en brouillon, approuvées par une personne', 'Draft campaigns, approved by a person'],
    ['Export de l’audience avec le consentement Clover seulement', 'Audience export with Clover consent only'],
  ],
  vip: [
    ['Bientôt : campagnes déclenchées, points bonus LOY4LTY, cartes promo REW4RDS', 'Coming: triggered campaigns, LOY4LTY bonus points, REW4RDS promo cards'],
  ],
};
