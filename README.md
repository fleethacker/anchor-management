# Hackathon

One self-contained CASREP workspace in `index.html`, combining the existing
casualty, Logistics and PLAD workflows with the AEGIS analysis interface.

The interface is a single-command workspace with a CASREP registry,
W/Whiskey-requisition Logistics tracker, and a PLAD Manager. Saved templates
copy their plain-language address lists into
a CASREP draft. This prototype does not create, submit, fund, route, or
transmit official Navy records or messages.

**CASREP Analysis → AEGIS system** adds a component hierarchy, an explained
maintenance-burden score, confirmed part and casualty drilldowns, repeat-failure
history, and period comparisons. The single-command USS Constitution example has
186 fictional CASREPs and 95 equipment records. Its score is a demonstration
maintenance measure, not an official readiness rating.

See [CASREP-W-REQUISITIONS-RESEARCH.md](CASREP-W-REQUISITIONS-RESEARCH.md)
for the public-source research and operational caveats behind these features.

See [CASREP-MESSAGE-FORMAT.md](CASREP-MESSAGE-FORMAT.md) for the documented
message structure, field order, material tables, and parser conventions used
by the fictional DDG CASREP samples.

## Run with the backend

For model status, a browser walkthrough, and the read-only Fly smoke test, see
[Verify local model inference](docs/INFERENCE-VERIFICATION.md).

For the packaged model on a local UDS Core cluster, run `uds run dev`, then open
https://casrep-command.uds.dev. The task builds, deploys, and verifies real
inference; repeat the check with `uds run verify-inference`.

Requires Go 1.22+ and Node.js 20+ on PATH. The Go API owns persistence; Node runs
the shared CASREP document, routing, and deadline rules. No npm install is needed.

```sh
cd backend
go run ./cmd/server
```

Open <http://localhost:8080>. The server initializes its JSON database from the
checked-in fictional seed only when the database does not already exist.
Existing backend data is retained. The footer identifies **Backend storage**.
CASREP saves, comments, approvals, returns, release evidence, and update dates
persist there, along with material records and PLAD templates. The overview
continues to request due reports from the server in pages of 10.

Opening or creating a report now uses the main-screen **CASREP editor**, retaining
the left navigation. Three focused sections—Casualty, Repair, and Recipients—edit the message in place.
Review & release shows the Sailor/LPO → DIVO → Department Head → CHENG → XO → CO
route, with comments, returns, approvals, and preserved versions. Submission-based
update timers, due/overdue notifications, PLAD snapshots, and message-only
text/print/PDF output share the same canonical report. See
[CASREP-EDITOR.md](CASREP-EDITOR.md) for workflow details, template limitations,
the backend contract and verification commands.

## Static demo fallback

Opening `index.html` directly, or serving it with a static web server without the
API, uses the original browser stores. This mode needs no installation or build.
Its existing case/material storage keys and PLAD library are retained. Browser
and backend datasets stay separate. An explicitly configured API failure displays
a retry screen; it does not silently redirect writes into browser storage.

See [update rules and sources](CASREP-UPDATE-RULES.md), the
[one-page prototype brief](CASREP-PROTOTYPE-BRIEF.md), and the
[live demo walkthrough](CASREP-DEMO.md). Notifications run while the app is open;
roles and releases remain simulations. No Navy messaging system is connected.
The Assistant has an optional backend model adapter; it defaults to local-only
operation and requires explicit provider configuration plus shared login.

## Go backend

The prototype data is now extractable into `backend/data/seed.json` and is
served by a Go API with no third-party Go modules. The API supports CRUD for cases,
equipment, work orders, requisitions, and PLAD templates, plus filtering and
optimistic revision checks. It also serves this page as static content.

Regenerate fresh demo seeds with `node scripts/extract-demo-data.cjs` from
`backend/` after changing the model fixtures. This does not overwrite an existing
runtime database. CASREP command endpoints and calculated deadline queries use
the shared Node helper; existing resource CRUD remains available independently.

See [backend/API.md](backend/API.md) and [backend/SPEC.md](backend/SPEC.md) for
endpoints, persistence, and the handoff contract. Architectural decisions are
recorded in [docs/adr](docs/adr), with domain terms in [CONTEXT.md](CONTEXT.md).
The documentation sync gate is `node backend/scripts/check-doc-sync.cjs`; CI
requires implementation changes to include spec, handoff, and ADR updates. A
separate frontend server can connect with `?api=http://HOST:8080/api/v1`.
The intended hosted setup is Fly.io for the API and GitHub Pages for the static
frontend. Pages verifies backend compatibility before publishing, so deploy the
updated Fly API first; see [backend/API.md](backend/API.md) for deployment setup.
Security boundaries and CI scanning are documented in [SECURITY.md](SECURITY.md).
This remains a fictional, unauthenticated prototype and must not receive
operational or sensitive data.
