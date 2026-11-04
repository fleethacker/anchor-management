# Materialize canonical traffic for demonstration records

**Status:** accepted

Demonstration records must carry a deterministic, fully populated canonical CASREP traffic document rather than relying on the editor to synthesize placeholders from structured case fields. The embedded model remains the source of truth and generates `backend/data/seed.json`; an idempotent migration repairs existing Fly volume records only when canonical traffic is absent, preserves existing traffic and review history, and never invents operational review evidence. This keeps the demo data fictional while making validation, persistence, and workflow behavior representative of a complete report.

## Consequences

- Controlled message fields use deterministic, explicitly synthetic values.
- Seed validation must reject required document errors and unresolved controlled-field placeholders.
- Updating the seed does not update an existing Fly volume; because the Fly volume is pure demonstration data, deployment may use the documented migration or reset without a backup. Fly migrations run as Unix user `app` so file ownership remains compatible with the Go service.
- Legacy records that remain without traffic must be surfaced as needing repair, not presented as a large list of generated placeholder errors.
