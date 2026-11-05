# Safe history rendering, static serving, and owned browser tests

Status: accepted, 2026-11-05.

## Context

The correctness/security review reproduced script execution through stored
history revisions and repository-file exposure through the default file server.
The browser runner could reuse an unrelated listener, while the broad editor
helper launched a separate browser outside the runner's failure-artifact lifecycle.
These are remediation slices R0–R2; later slices remain tracked in the review plan.

## Decision

Escape persisted history/review values in every display context, including
revisions, comparison attributes, comments, approval records, and print/report
labels. Show unavailable states for malformed legacy metadata without changing
stored evidence. Generic writes validate supplied metadata shapes, known field
types, safe integer revisions/offsets and a combined 4 MiB budget. Preserve
unknown fields and permit unrelated updates when old metadata is malformed.
Rendering remains the primary protection because persisted data is untrusted.
Legacy reporting skips malformed snapshots and reports missing submission
evidence with no inferred due date. Tests exercise this from an owned persisted
database, in addition to intercepted hostile browser reads.

Serve only `/`, `/index.html` and `/frontend-config.js` over GET/HEAD, with explicit
content types and `nosniff`. Match canonical escaped paths before ServeMux can
normalize them. Keep API dispatch separate, and retain the trusted filesystem
path for Node rules. Source startup defaults to loopback; the image continues
to pass its explicit all-interface address. Bind before opening the database,
and report the actual bound address after initialization succeeds.

Each browser test owns a fresh fictional database and Go process bound to
`127.0.0.1:0`. The shared fixture obtains its URL only from that process's startup
log after binding. A pre-existing listener is never contacted. This replaces the
plan's initial fixed-port fail-fast proposal with process ownership and avoids
port-reservation races. Reject configured base URLs and CASREP_TEST_URL.
Related browser pages share one test fixture; independent tests start from seed.
Build once per worker and terminate only fixture-owned processes.

Use runner-owned browser pages/contexts so early failures retain standard
Playwright trace, screenshot and video. Retain backend logs, fictional databases
and HTML reports in unique run directories; later runs preserve prior evidence.
The old editor entry point delegates to the runner. Other legacy browser scripts
remain in R9's consolidation scope and are not claimed safe by this decision.

## Verification and compatibility

Regression tests reject malformed writes without mutation, preserve valid
workflow-generated history, and safely display hostile legacy reads without
network/script execution or record rewrites. HTTP tests exercise actual static
routing, shared model capabilities, methods, types, hidden paths and traversal.
The harness gate proves separate database state, zero requests to an unrelated
listener, rejected URL overrides and artifacts from intentional early/browser
startup failures. Run these alongside Go, model and the full Playwright suite.

No data migration or seed change is required. Legacy metadata can still be read;
clients supplying malformed replacements now receive 422. The narrower HTTP
surface intentionally removes undocumented repository-file access. Source users
needing remote access must choose an explicit listener. Generic CRUD and claimed
reviewer identities remain prototype limitations, addressed by the production
track. Roll forward or contain a failing feature rather than roll back to known
script execution or file disclosure.
