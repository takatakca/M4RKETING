# M4RKETING by TAKATAK

**App ID Clover (production) :** `EQRZ028619JRW`
**Développeur :** TAKATAK (compte développeur Clover 9KJ25ATT15TTW)
**État au portail :** brouillon (draft) — rien de soumis.
**Dépôt :** takatakca/M4RKETING

## Ce que fait l'app

Marketing du marchand branché sur ses vraies données Clover : promotions, campagnes clients, offres par segment — construit sur Customers / Inventory (rabais) / Orders.

## Paliers (doctrine de prix de Matt, 2026-10-28)

Chaque app a SES propres paliers. Base = le nécessaire essentiel · Premium = plus d'avantages · VIP = le full kit, tout ce que Clover offre pour la catégorie.

- **Base 50 $/mois** — rabais personnalisés créés et gérés dans l'inventaire ; segments clients simples (nouveaux/récents/inactifs) ; offres affichées à la caisse et à la borne via nos écrans.
- **Premium 100 $/mois** — + campagnes déclenchées par événements (premier achat, inactivité, anniversaire) ; promotions par catégorie/étiquette ; mesure des campagnes par les commandes.
- **VIP 150 $/mois** — full kit : moteur d'offres complet arrimé à LOY4LTY (points bonus) et REW4RDS (cartes promo) ; vitrine publique synchronisée via ON2GO (données publiques seulement) ; brouillons assistés par IA soumis à approbation humaine ; multi-marques cloisonnées.

Prix facturés via les plans d'abonnement du Clover App Market (à créer au portail — voir DEPLOY.md).

## Permissions Clover visées

Customers R/W · Inventory R/W (rabais) · Orders R · Merchant R

## Structure

- `docs/listing/` — fiche marketplace (description FR/EN) et textes légaux, depuis le package de soumission local (`~/workspace/clover-apps/`)
- `app/api/clover/` — points d'entrée webhook + OAuth (scaffold, même patron que Food Hub)
- `lib/clover/config.ts` — configuration par variables d'environnement (aucun secret dans le code)
- `config/app.config.json` — identité de l'app et paliers
- `DEPLOY.md` — ce qui reste à faire, étape par étape, pour la vague portail

## Le système unique TAKATAK

Cette application fait partie de la suite TAKATAK sur Clover : toutes les apps partagent le même dos d'événements (webhooks Clover), le même **client unique reconnu par son numéro de téléphone** (+ courriel), et les mêmes commandes et paiements Clover. Aucune app ne vit en silo : les données qu'elle produit alimentent les autres apps de la suite (voir « Clover API — Main Stuff — Robot Notepad », section 3, déposé au Drive Opérations et dans `~/workspace/clover-apps/`).


## État du code (2026-10-28)

Application Next.js 16 qui fonctionne (tests verts, build OK). Mise en ligne : `DEPLOY.md` § 5.

**Ce qui marche :**
- **Commun (kit Suite TAKATAK, identique dans les 9 apps)** : connexion Clover OAuth v2 (jetons scellés, rafraîchis
  seuls, supprimés à la désinstallation) · webhook Clover (vérification, X-Clover-Auth, chaque événement une fois) ·
  base PostgreSQL (ou mémoire en dev) · session marchand · paliers Base / Premium / VIP lus depuis la facturation
  Clover (`OWN_MERCHANTS` = VIP) · marchand `RNVTBYMCKXEJ1` en lecture seule · lien Suite TAKATAK avec Food Hub ·
  page d'accueil FR/EN, tableau de bord `/app`, pages légales `/legal/*`, `/api/health`, `/api/cron`, clés d'appareils.
- Segments depuis les commandes Clover des 180 derniers jours : nouveaux, réguliers, à relancer, perdus
- Rabais Clover gérés par l'app (préfixe « M4 · » — les autres rabais ne sont jamais touchés) et leur utilisation
- Premium : campagnes en brouillon approuvées par une personne ; export CSV de l'audience **avec consentement
  marketing Clover seulement**. Rien n'est envoyé par l'app.

**Ce qui reste :**
- Campagnes déclenchées par événements, offres à la caisse / borne, brouillons IA (VIP, approbation humaine).

**Développer :** `npm install` · `npm run dev` · `npm run typecheck` · `npm test` · `npm run build`. Règles pour
les agents : `AGENTS.md` ; journal : `WORKLOG.md`.
