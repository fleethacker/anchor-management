# Make Playwright end-to-end tests a release gate

**Status:** accepted

Correctness is measured across the browser, API, persistence, and static fallback seams, so Playwright end-to-end tests are a first-class CI gate rather than an optional local acceptance script. Tests use isolated temporary databases and fictional records, cover seeded canonical traffic, validation, persistence, workflow transitions, reporting pagination, failure modes, export/print, and responsive behavior, and never mutate the live Fly database. Failures retain traces, screenshots, and other Playwright artifacts for diagnosis.

## Consequences

- Browser tests run alongside Go, model, and documentation checks in CI.
- The suite must include both positive complete-message paths and negative validation paths.
- Seed and migration changes require browser coverage for representative message types and the `demo-rich-1008` regression.
- Stable accessible roles and explicit test attributes are part of the UI contract where semantic selectors are insufficient.
