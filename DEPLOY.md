# DEPLOY — M4RKETING by TAKATAK (`EQRZ028619JRW`)

État : brouillon au portail développeur, scaffold de code déposé dans ce dépôt le 2026-10-28. Voici exactement ce qui reste, pour la vague portail (aucun secret ici — noms de variables seulement).

## 1. Developer Dashboard (portail développeur Clover, compte 9KJ25ATT15TTW)

- [ ] Ouvrir l'app `EQRZ028619JRW` → vérifier nom, pays (Canada), type d'app.
- [ ] **Permissions** à demander : Customers R/W · Inventory R/W (rabais) · Orders R · Merchant R (justifications dans `docs/listing/` quand un package existe).
- [ ] **OAuth** : régler l'URL de redirection à `{APP_BASE_URL}/api/clover/connect/callback`.
- [ ] **Webhooks** : régler l'URL à `{APP_BASE_URL}/api/clover/webhooks`, abonner les événements : C, O, I, A ; coller le `verificationCode` reçu au premier POST ; noter le code d'auth du webhook → variable `CLOVER_WEBHOOK_AUTH` (coffre/serveur, jamais ici).
- [ ] **Facturation App Market** : créer les 3 plans d'abonnement — **Base 50 $/mois · Premium 100 $/mois · VIP 150 $/mois** (CAD) et y associer les fonctionnalités du README.
- [ ] **Fiche marketplace** : téléverser description FR/EN + légaux depuis `docs/listing/` ; icône, couverture et captures (voir la liste de contrôle du package ; couvertures premium dans `~/workspace/clover-apps/assets-premium/` quand elles existent) ; vidéo de démo à tourner depuis le prototype.

## 2. Variables d'environnement (serveur de l'app — noms seulement)

`CLOVER_APP_ID` (= `EQRZ028619JRW`) · `CLOVER_CLIENT_ID` · `CLOVER_CLIENT_SECRET` · `CLOVER_WEBHOOK_AUTH` · `CLOVER_API_BASE` · `APP_BASE_URL` · `DATABASE_URL`

## 3. Test

- [ ] Installer l'app sur le marchand de test et compléter le flux OAuth (connect/start → callback).
- [ ] Déclencher un événement de chaque type abonné et vérifier la réception au webhook (200, en-tête X-Clover-Auth validé).
- [ ] Suivre les instructions de test du package (`docs/listing/PACKAGE.md`) pour la revue Clover.

## 4. Soumission

- [ ] Soumettre pour révision seulement quand la fiche, les plans et les tests ci-dessus sont verts.
