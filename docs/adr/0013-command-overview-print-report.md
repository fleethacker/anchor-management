# One-page command overview report

Status: accepted.

Replace UI JSON/text downloads with a command briefing built from all loaded
records in the overview scope. Reuse the reporting model and linked material
records; compute counts in a pure embedded model with deterministic clock input.
Do not change persisted messages or generate inferred operational decisions.

Provide a report preview and dedicated named Letter-landscape print page, using
the browser print dialog for printing or Save PDF. Keep the message-only print
root separate. Bound the report to eight priority excerpts and three reviewer
workloads, disclose omitted records, and retain missing-value labels. Model tests
verify counts, ranking, links and absence of mutations. The full Playwright suite
checks one physical landscape page and no layout overlap; render the PDF for
visual QA. Browser tests use isolated data and never write to live Fly.

Remove Workspace Guide from navigation, retaining its footer link. Do not
remove low-level storage serialization or API JSON contracts: only download
controls/handlers are removed. Local test launch can use CHROME_EXECUTABLE; CI
continues installing managed Chromium.
