// What an app declares about its own screens and actions (lib/domain/index.ts), and the shared menu built from it.
// Shared kit: identical in every TAKATAK Suite app. The app's own sections live in components/Panel.tsx.
import type { Tier } from './app';
import type { Role } from './core/roles';

export type IconName =
  | 'home' | 'chart' | 'register' | 'drawer' | 'camera' | 'device' | 'kiosk' | 'screen' | 'list' | 'book' | 'tax' | 'download'
  | 'truck' | 'star' | 'users' | 'clock' | 'calendar' | 'money' | 'megaphone' | 'tag' | 'target' | 'gift' | 'card' | 'repeat'
  | 'search' | 'chat' | 'plus' | 'archive' | 'template' | 'user' | 'shield' | 'bank' | 'lock' | 'log' | 'grid' | 'help'
  | 'store' | 'link' | 'out' | 'menu' | 'chevron' | 'check' | 'spark';

/** One screen of the app. slug '' is the overview; `parent` nests it under another section (one level). */
export interface AppSection {
  slug: string;
  fr: string;
  en: string;
  icon: IconName;
  /** One line under the title. */
  hintFr?: string;
  hintEn?: string;
  /** Lowest plan that opens it (the menu shows a lock below it). */
  tier?: Tier;
  /** Action needed to see it (Account → Authorized actions). */
  view?: string;
  parent?: string;
  /** A parent with no screen of its own: its page shows its children as tiles. */
  hub?: boolean;
}

/** Something a person does in the app, with the lowest Clover role allowed by default. */
export interface AppAction { key: string; fr: string; en: string; min: Role }

/** Kinds of device keys the app hands out (register, kiosk…). */
export interface DeviceKind { kind: string; fr: string; en: string }

/** What each plan adds, for the plan page and the public page. */
export type TierFeatures = Record<Tier, Array<[string, string]>>;

export const ACCOUNT_TABS: Array<{ slug: string; fr: string; en: string; icon: IconName; hintFr: string; hintEn: string }> = [
  { slug: 'profile', fr: 'Profil', en: 'Profile', icon: 'store', hintFr: 'Votre commerce tel que Clover le connaît.', hintEn: 'Your business as Clover knows it.' },
  { slug: 'plan', fr: 'Forfait et facturation', en: 'Plan and billing', icon: 'card', hintFr: 'Votre forfait, ce qu’il comprend, la facturation Clover.', hintEn: 'Your plan, what it includes, Clover billing.' },
  { slug: 'access', fr: 'Actions autorisées', en: 'Authorized actions', icon: 'shield', hintFr: 'Qui peut faire quoi, selon son rôle dans Clover.', hintEn: 'Who can do what, by their Clover role.' },
  { slug: 'devices', fr: 'Appareils', en: 'Devices', icon: 'device', hintFr: 'Les clés des caisses, bornes et appareils branchés.', hintEn: 'Keys of the registers, kiosks and devices plugged in.' },
  { slug: 'payouts', fr: 'Paiements et dépôts', en: 'Payments and deposits', icon: 'bank', hintFr: 'Où va votre argent, et ce que l’app ne voit jamais.', hintEn: 'Where your money goes, and what the app never sees.' },
  { slug: 'security', fr: 'Sécurité et données', en: 'Security and data', icon: 'lock', hintFr: 'Votre session, vos données, leur export.', hintEn: 'Your session, your data, its export.' },
  { slug: 'activity', fr: 'Journal d’activité', en: 'Activity log', icon: 'log', hintFr: 'Chaque action sensible : qui, quoi, quand.', hintEn: 'Every sensitive action: who, what, when.' },
];
