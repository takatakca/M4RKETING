// The nine TAKATAK Suite apps (one Clover app and one GitHub repo each). Every app shows this list in its Suite page
// and its app switcher: the apps this restaurant has (from Food Hub's directory) open in one click through Clover's
// sign-in; the others link to their Clover App Market listing. Shared kit: identical in every suite app.
import { cloverConfig } from './clover/config';
import type { IconName } from './nav';

export interface CatalogApp { key: string; name: string; appId: string; mono: string; icon: IconName; fr: string; en: string }

export const SUITE_CATALOG: CatalogApp[] = [
  { key: 'c4isse', name: 'C4ISSE', appId: 'VDV7XAH5TPB78', mono: 'C4', icon: 'register', fr: 'Caisse au comptoir, tiroir-caisse, caisse-photo', en: 'Counter register, cash drawer, picture register' },
  { key: 't4ctile', name: 'T4CTILE', appId: 'SFH7X57N3B5FJ', mono: 'T4', icon: 'kiosk', fr: 'Borne libre-service et commande tactile', en: 'Self-service kiosk and touch ordering' },
  { key: '4ccounting', name: '4CCOUNTING', appId: 'VQTZE8C31D8MW', mono: '4C', icon: 'book', fr: 'Ventes, TPS/TVQ, pourboires, exports', en: 'Sales, GST/QST, tips, exports' },
  { key: 'tr4cker', name: 'TR4CKER', appId: 'EB2EPCWEJBZ82', mono: 'TR', icon: 'truck', fr: 'Suivi en direct de vos livraisons', en: 'Live tracking of your deliveries' },
  { key: 'st4ff', name: 'ST4FF', appId: 'E0BGTY752BZYE', mono: 'S4', icon: 'users', fr: 'Heures, quarts, coût de main-d’œuvre', en: 'Hours, shifts, labour cost' },
  { key: 'm4rketing', name: 'M4RKETING', appId: 'EQRZ028619JRW', mono: 'M4', icon: 'megaphone', fr: 'Segments, rabais, campagnes', en: 'Segments, discounts, campaigns' },
  { key: 'loy4lty', name: 'LOY4LTY', appId: 'WX0Y6313JX1TY', mono: 'L4', icon: 'star', fr: 'Fidélité par numéro de téléphone', en: 'Loyalty by phone number' },
  { key: 'rew4rd', name: 'REW4RDS', appId: '239362NZSVFSC', mono: 'R4', icon: 'gift', fr: 'Cartes-cadeaux', en: 'Gift cards' },
  { key: 'ch4t', name: 'CH4T', appId: 'RGE4PFGC9SR7C', mono: 'CH', icon: 'chat', fr: 'Soutien client', en: 'Customer support' },
];

/** The app's page in the Clover App Market (install, change plan). */
export const appMarketUrl = (appId: string) => `${cloverConfig.webUrl}/appmarket/apps/${encodeURIComponent(appId)}`;

/** Open another suite app for this restaurant: its own Clover sign-in (Clover already knows the person). */
export const openAppUrl = (appUrl: string) => `${appUrl.replace(/\/+$/, '')}/api/clover/connect/start`;

/** This app's own monogram (C4, T4…). */
export const selfMono = (key: string, name: string) => SUITE_CATALOG.find((a) => a.key === key)?.mono ?? name.slice(0, 2);
