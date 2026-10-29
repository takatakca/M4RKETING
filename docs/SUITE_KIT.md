# The TAKATAK Suite kit (identical in the nine apps)

_2026-10-29. Every Clover App Market app of the TAKATAK Suite (C4ISSE, T4CTILE, 4CCOUNTING, TR4CKER, ST4FF, M4RKETING,
LOY4LTY, REW4RDS, CH4T) is the same Next.js 16 + TypeScript app with its own features plugged in. This file is part of
the kit: change it in all nine repos at once. The suite contract (events, signatures, directory) is in
`takatakca/foodhubca` → `docs/TAKATAK_SUITE.md`; the review of the whole suite is `docs/TAKATAK_SUITE_PLAYBOOK.md` there._

## 1. What is shared, what is the app's own

| Layer | Files | Who changes it |
|---|---|---|
| Kit: Clover | `lib/clover/` (OAuth v2, sealed tokens, API calls, webhooks, menu, merchant profile) | all nine at once |
| Kit: core | `lib/core/` (store, session, roles, authorized actions, activity log, device keys, export, i18n, time, phone) | all nine at once |
| Kit: suite | `lib/suite.ts` (Food Hub link, directory), `lib/suite-catalog.ts` (the nine apps), `lib/nav.ts` (menu types, account tabs) | all nine at once |
| Kit: screens | `components/{Shell,SectionPage,Account,ui,icons,ApiForm,DeviceKeys,RevokeButton,Top}.tsx`, `app/app/**`, `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `app/legal/` | all nine at once |
| Kit: routes | `app/api/{clover,suite,health,cron,devices,session,account}/` | all nine at once |
| Kit: tests | `tests/{kit,menu}.test.ts`, `tests/helpers.ts` | all nine at once |
| **The app** | `lib/domain/` (its logic; `index.ts` exports `hooks`, `sections`, `actions`, `deviceKinds`, `tierFeatures`), `components/Panel.tsx` (its screens), its own `app/api/*` routes, its own tests, `config/app.config.json` | this repo only |

The master copy of the kit is kept by the agent that maintains it; a change is copied to the nine repos and committed
with the same message in each. `tests/kit.test.ts` also checks that the app plugs into the shell correctly.

## 2. The screens (what a merchant sees)

- **Public page** `/`: what the app does, the three plans and what each one adds (`tierFeatures`), the nine suite apps.
- **Signed-in frame** (`components/Shell.tsx`): side menu with sub-menus, top bar (where you are, suite app switcher,
  language, who you are and your Clover role). Works without JavaScript; on a phone the menu slides in.
  - **The app's own menu**: `sections` from `lib/domain/index.ts`. A section has a slug (`''` = overview), an icon, a
    one-line hint, and optionally `parent` (sub-menu), `hub` (a parent page showing its children as tiles), `tier`
    (lowest plan; below it the menu shows a lock and the page shows the plans) and `view` (the authorized action needed
    to see it; people without it do not see it at all). `components/Panel.tsx` draws each section.
  - **TAKATAK Suite** `/app/suite`: the nine apps, which ones this restaurant has (Food Hub's directory), "Open" (through
    Clover's own sign-in, one click) or "Discover in Clover"; the Food Hub link and its counters.
  - **My account** `/app/account/<tab>`: Profile (the business as Clover knows it, you and your role), Plan and billing,
    Authorized actions, Devices, Payments and deposits, Security and data (session, protections, records kept, JSON
    export), Activity log.
  - **Help** `/app/help`: where to find what, service status, terms.

## 3. Security model

- **Sign-in only through Clover** (OAuth v2). The callback stores the merchant's tokens sealed (AES-256-GCM,
  `TOKEN_ENCRYPTION_KEY`) and signs a 7-day session cookie (`SESSION_SECRET`) with the person's Clover employee ID,
  name and **role** (owner, admin, manager, employee; read from Clover, which needs the "Employees: read" permission).
- **Authorized actions** (`lib/core/access.ts`): each sensitive action has a lowest role. Defaults come from the code
  (`SHARED_ACTIONS` + the app's `actions`); the owner changes them in Account → Authorized actions. The server checks
  them on every call (`requireMerchant(req, tier, { action })` / `requireMerchantOrDevice`), never only the screen. A
  device key acts as an employee. A person whose role Clover did not confirm counts as owner by default (the app keeps
  working); the owner can switch that to employee once roles show — the page refuses a change that would lock out the
  person making it.
- **Activity log** (`lib/core/audit.ts`): every refusal and every allowed change (POST, PUT, PATCH, DELETE), plus reads a
  route marks `audit: 'always'` (data exports). Who, role, action, path, result. Kept 180 days (`/api/cron`).
- **Device keys**: `Bearer dk_<id>.<secret>`, only a hash is stored, shown once, revocable (Account → Devices).
- **Data export** (Account → Security and data): one JSON file of the app's records for the merchant; tokens, hashes,
  secrets and sealed values are left out (`lib/core/export.ts`). Uninstall deletes the Clover tokens at once.
- **No bank or card number** ever passes through an app; payouts stay in Clover (Account → Payments and deposits).
- **Read-only merchants** (`NEVER_WRITE_MERCHANTS`, default the dormant On2GO.ca `RNVTBYMCKXEJ1`): every write refused.

## 4. All in one, each one alone

- Alone: an app installed by itself works fully with its own Clover token and database; the Suite page then shows the
  other apps with "Discover in Clover".
- Together: with `FOODHUB_URL` + `FOODHUB_SUITE_SECRET`, the app receives Food Hub's signed order events, sends its own
  (`<app>.<name>`), and tells Food Hub when a merchant installs or removes it (`<app>.installed` / `.uninstalled`, retried
  by `/api/cron`). Food Hub keeps the directory; every app reads it for its switcher (kept 5 minutes; when Food Hub
  does not answer, the last answer is kept and Food Hub is asked again a minute later, so pages never wait on it).
- One sign-in: "Open" on another suite app goes to that app's `/api/clover/connect/start`; Clover already knows the
  person, so it comes straight back signed in.

## 5. Adding to an app (recipe)

1. A screen: add a section to `sections` (slug, fr, en, icon, hints; `parent`, `tier`, `view` if needed) and a `case` in
   `components/Panel.tsx`. Use `Card`, `Stat`, `Bars`, `KV`, `Tiles`, `Empty`, `Badge`, `Banner` from `components/ui.tsx`.
2. A form: `<ApiForm action="/api/…" fields={…} submit="…" result="… {path} {cents|money} {flag?yes|no}" />`. Never
   pass a function to it (server pages cannot hand functions to a browser component).
3. A sensitive action: add it to `actions` (key `app.verb`, fr, en, lowest role) and guard the route with
   `requireMerchant(req, tier, { action: 'app.verb' })`. It shows in Account → Authorized actions by itself.
4. Plan content: update `tierFeatures` (what works today; roadmap lines start with « Bientôt : » / "Coming:").
5. Checks before every push: `npm run typecheck` · `npm test` · `npm run build`.
