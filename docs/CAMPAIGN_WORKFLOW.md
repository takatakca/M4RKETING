# Reviewed campaign workflow

Branch: feature/foodhub-campaign-workflows. M4RKETING now binds a merchant-owned draft, its message/segment and its current Clover discount to a reviewed preview. Approval records that exact configuration; edits clear approval and an outdated preview cannot approve a changed draft. Export requires the approved campaign, checks the current offer and re-reads current contact consent. Unknown Clover data fails closed. No messages are sent or promotions published by this workflow.

The app-specific compare-and-swap keeps concurrent database edits from replacing each other. Existing shared suite transport remains separate; an installed app connection alone does not implement automatic campaign triggers.

Validation: 52 unit tests, TypeScript and production build passed. The [real PostgreSQL/browser proof](proofs/campaign-workflow-2026-11-04/results.json) passed nine checks with two app processes, a held database-row race, restart/JSONB ordering, consent withdrawal and concurrent campaign edits during audience lookup. Clover traffic uses an isolated loopback receiver; no provider writes or external messages occur. Screenshots contain synthetic contacts only.

Reproduce after building with scripts/verify-campaign-workflow.mjs and an isolated local PostgreSQL fixture, following its loopback database guard. Production deployment, live merchant authorization and campaign delivery remain unverified. Shared OAuth identity validation is tracked as a separate required suite update.

— signé : Codex campaign continuation / coordinator @ cloud · 2026-11-04
