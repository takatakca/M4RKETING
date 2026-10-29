# Agent instructions — M4RKETING by TAKATAK

Part of the **TAKATAK Suite**: nine Clover App Market apps (C4ISSE, T4CTILE, 4CCOUNTING, TR4CKER, ST4FF, M4RKETING,
LOY4LTY, REW4RDS, CH4T). Each one works alone; together they talk through TAKATAK Food Hub. Contract:
`takatakca/foodhubca` → `docs/TAKATAK_SUITE.md`. Ecosystem map: `foodhubca/docs/FOOD_ECOSYSTEM_MAP.md`.

## Work log rule (every agent: Claude, Codex, Cursor, people)

1. **Before you start:** read the top of `WORKLOG.md` and the open pull requests. If a line for the same work is
   `active` or has an open PR, do not redo it: continue that branch or pick other work.
2. **Claim it:** add one line at the top of the log with status `active`.
3. **Before you stop:** update your line (`done`, `PR #n`, `blocked: reason`) and the next step. Commit and push it.
4. One line per piece of work, newest first. Format: `YYYY-MM-DD | agent | branch → PR | status | what | next step`

## Git

- Only the owner (Matt) merges to `main`. Work on a branch, open a pull request.
- Never force-push, never rewrite pushed history, never discard someone else's uncommitted work.

## Hard rules

- **Public repository:** never commit secrets, tokens, `.env` values, merchant or customer data, support case numbers.
- **Shared kit:** `lib/core/`, `lib/clover/`, `lib/suite.ts`, `lib/hooks.ts`, `lib/app.ts`, `app/api/clover/`,
  `app/api/suite/`, `app/api/health/`, `app/api/cron/`, `app/api/devices/`, `components/ui.tsx`, `components/ApiForm.tsx`,
  `components/DeviceKeys.tsx`, `tests/kit.test.ts`, `tests/menu.test.ts`, `tests/helpers.ts` are **identical in all nine
  repos**. Change them in all nine at once (same commit message), or not at all. This app's own code lives in
  `lib/domain/`, `components/Panel.tsx` and its own `app/api/*` routes.
- **Merchant `RNVTBYMCKXEJ1` (dormant On2GO.ca) is read-only** (`NEVER_WRITE_MERCHANTS`). Never write to it.
- Clover tokens are sealed with `TOKEN_ENCRYPTION_KEY`; never log or return them.
- Brand: `BRAND.md` (electric blue on deep navy; green/amber/red for status only). French first, English alongside.
- Platform rule: each delivery platform hears only about itself (a DoorDash message never names Uber, and the reverse).

## Checks before every push

`npm run typecheck` · `npm test` · `npm run build`

## Handoff

Keep `WORKLOG.md` current, and `DEPLOY.md` for what the owner must do (Clover Developer Dashboard, Coolify, secrets).
