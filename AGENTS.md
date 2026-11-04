# Anchor Management agent rules

## Read before changing behavior

- Read `CONTEXT.md` for domain terms.
- Read `backend/SPEC.md` and `backend/HANDOFF.md` for the API and persistence contract.
- Read the relevant ADR before changing seed materialization, Fly data, workflow state, or test topology. The canonical traffic decision is in `docs/adr/0010-materialize-demo-casrep-traffic.md`; the browser verification decision is in `docs/adr/0011-playwright-e2e-release-gate.md`.

## Demo data and canonical traffic

- The embedded model in `index.html` is the source of truth for fictional demo fixtures. Regenerate `backend/data/seed.json` with `node backend/scripts/extract-demo-data.cjs`; do not hand-edit extracted seed records.
- A structured case and its canonical CASREP traffic are different representations. Seeded demonstration records must contain deterministic, fully populated canonical traffic with no required validation errors or controlled-field placeholders.
- Demo message values must remain explicitly fictional and deterministic. Never invent operational review, approval, transmission, or release evidence to make a fixture pass.
- An existing Fly volume is not replaced by a new seed. This Fly volume is pure demonstration data, so no backup is required; use the idempotent migration path or reset it after deployment, preserve existing traffic/history when migrating, and verify the result twice.
- If a legacy record has no canonical traffic, expose a repair/migration state instead of hiding the problem behind generated placeholder errors.

## Verification

- For model, seed, workflow, or UI behavior changes, run the relevant unit tests plus the full Playwright end-to-end suite.
- Playwright tests use isolated local or CI databases and fictional data only. They must not write to the live Fly API or depend on live mutable state.
- Cover both successful and blocked paths: complete messages, required-field validation, API persistence, workflow transitions, review history, reporting pagination, API failure behavior, static fallback, export/print, and responsive accessibility.
- Keep `demo-rich-1008` as a regression case: opening it and checking the report must not produce required validation errors after the seed/migration work is complete.
- Preserve traces, screenshots, and other browser artifacts when E2E tests fail.

## Documentation and ownership

- Implementation changes require synchronized updates to `backend/SPEC.md`, `backend/HANDOFF.md`, and an ADR; run `node backend/scripts/check-doc-sync.cjs`.
- Update this file when the agent workflow, required verification, data source, or deployment safety rule changes.
- The user exclusively stages, commits, and pushes. Never run `git add`, `git commit`, or `git push`.
