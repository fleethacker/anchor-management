# Backend handoff

## Assistant portal verification

The Assistant is additive within index.html. Its chat/composer scripts are not
loaded by the backend rules helper. Preserve the existing document, reporting,
case, API client and material scripts when changing the portal. Historical
references use loaded approved text; local style summaries are structural
observations. The full-page `#assistant` portal may call the backend Assistant
adapter, but the small overlay and editor writing help remain local-only until
separately enabled.

The backend provider is optional. `ASSISTANT_PROVIDER=none` is the safe default;
`openai` uses the server-side `OPENAI_API_KEY`, `ASSISTANT_MODEL`, and Responses
endpoint, while `openai-compatible`/`local` uses an internal
`ASSISTANT_MODEL_ENDPOINT`. When `ASSISTANT_PROVIDER=local` also has
`ASSISTANT_LOCAL_MODEL_PATH`, the backend supervises the configured
`llama-server` binary on loopback with offline mode, one slot, no web UI, no
agent mode, and a temporary API-key file. The first benchmark model is the
non-Chinese-origin SmolLM2-360M-Instruct Q8 GGUF. Provider requests are
non-persistent (`store:false`) and never run while holding the store write lock.
Local-process requests use a smaller fixed prompt budget; broad all-case
requests fall back to deterministic local analysis rather than silently
truncating evidence. Local-process requests use a smaller fixed prompt budget;
broad all-case requests fall back to deterministic local analysis rather than
silently truncating evidence.

When a network-backed or externally managed provider is configured, set
`ASSISTANT_SHARED_PASSWORD` and protect the model with the shared session login.
Set `ASSISTANT_ALLOWED_ORIGINS` to the specific frontend origin(s); do not use
wildcard CORS with credentialed model requests. `ASSISTANT_COOKIE_SECURE`
defaults to true. The supervised loopback local provider does not require the
shared login. The shared login is one principal and does not replace production
identity or authorization.

The normal verification workflow includes assistant, composer, guarded handoff,
authentication, provider-contract, unavailable-model, malformed-output, and
source-scope tests. Optional browser acceptance uses the existing separately
installed Playwright setup:

    node tests/casrep-assistant.browser.test.cjs
    node tests/casrep-assistant-navigation.browser.test.cjs

Set PLAYWRIGHT_MODULE, CHROME_EXECUTABLE, CASREP_TEST_URL and optionally
CASREP_TEST_OUTPUT as for the editor browser suite. Use isolated fictional
storage. Check opening/back/forward, tablet access, pending-command navigation,
exact preview handoff, dirty-buffer protection and ordinary Save. Freeform
sponsor narrative without supported labeled ranges requires manual mapping;
the Assistant blocks before a follow-on write instead of discarding passages.

No deployment provider is configured by default. The repository provides
`scripts/run-local-assistant.sh` to build llama.cpp with macOS Metal support,
download and checksum the approved SmolLM2-360M-Instruct Q8 model, build the
backend, and run the supervised local provider. It keeps model/runtime files
outside the repository. Alternatively, provide a preverified local
`llama-server` binary and model file, set `ASSISTANT_PROVIDER=local`,
`ASSISTANT_MODEL`, and `ASSISTANT_LOCAL_MODEL_PATH`. The supervised local provider does not need
`ASSISTANT_SHARED_PASSWORD`; set `ASSISTANT_ALLOWED_ORIGINS` only when serving a
separate frontend. For example:

    ASSISTANT_PROVIDER=local ASSISTANT_MODEL=smollm2-360m \
    ASSISTANT_LOCAL_BINARY=/opt/llama-server \
    ASSISTANT_LOCAL_MODEL_PATH=/models/smollm2-360m-instruct-q8_0.gguf \
    go run ./cmd/server -addr 127.0.0.1:4180 -data /tmp/casrep-test.json

The backend logs startup failure and falls back to unavailable model status
without affecting deterministic Assistant behavior.
The agent reference is docs/CASREP-Assistant-Instructions.md; model-backed
Assistant work must preserve the current case workflow and storage boundary.

## Source of truth

- `index.html` contains the canonical document, reporting, workflow, and demo models.
- `scripts/casrep-workflow.cjs` loads only the three pure CASREP model scripts for
  server commands and calculated deadline queries. It does not use browser storage.
- `scripts/migrate-demo-traffic.cjs` is a one-shot, non-HTTP repair helper for
  existing fictional databases. It loads the document model and changes only demo
  records whose canonical traffic is absent.
- `scripts/extract-demo-data.cjs` generates `data/seed.json`; include the reporting
  model before the case model and load `casrep-plad-model` for PLAD templates.
  `SEED_REFERENCE` fixes the clock for every fixture.
- `SPEC.md` and `API.md` define the API contract; `../CONTEXT.md` defines terms.
- `../docs/adr/` records decisions, including the shared rules runtime in ADR 0008.

Generated seeds are regenerated, not hand-edited. The ignored
`data/anchor-management.json` is mutable runtime state. Starting the server never
replaces an existing database. New seed submission dates apply to fresh fictional
databases only; never backdate existing records from discovery/creation times.
Seeded demonstration cases include materialized canonical traffic. The Fly volume
contains pure demo data, so deploy the matching image and run the migration helper
or reset the volume without a backup.

## Change protocol

1. Read the context, spec, and relevant ADRs before editing.
2. Preserve the existing resource CRUD, filters, pagination, and field shapes.
3. Update `SPEC.md` for contract, validation, persistence, or completion changes.
4. Update this handoff for commands, status, paths, or limitations.
5. Add/amend an ADR for architecture, persistence, or boundary decisions.
6. Update `CONTEXT.md` when domain meanings or relationships change.
7. Run the documentation gate and applicable tests before declaring completion.

The gate checks changed paths, including untracked files, rather than prose
quality. CI compares with the PR/push merge base. Review the content as well.
The Ubuntu 24.04 runner, Node-24-compatible actions, and disabled Go module cache
from main are retained; this standard-library module has no `go.sum`.

## Run and verify

Use Go 1.22+ and Node.js 20+ on PATH. The backend runtime needs no npm
installation; browser acceptance tests use the root `package.json` and Playwright.
From `backend/`:

```sh
go run ./cmd/server
# Isolated development/test database:
go run ./cmd/server -addr 127.0.0.1:4180 -data /tmp/casrep-test.json
```

The defaults assume the working directory is `backend/`. `-node` selects the Node
executable, `-model-helper` selects the trusted helper, and `-static` identifies the
UI directory containing the shared `index.html`. Deploy these files together.
A separately served UI can use `?api=http://HOST:8080/api/v1`.

From the repository root:

```sh
node backend/scripts/check-doc-sync.cjs
git diff --check
node --test tests/casrep-document.test.cjs tests/casrep-reporting.test.cjs tests/casrep-api-client.test.cjs backend/scripts/casrep-workflow.test.cjs backend/scripts/migrate-demo-traffic.test.cjs
```

From `backend/`:

```sh
gofmt -w cmd/server/*.go internal/store/*.go
go test ./...
go vet ./...
# Use when changing concurrent write behavior:
go test -race ./...
# Regenerate only when fixture/model changes require it:
SEED_REFERENCE=2026-11-04T12:00:00Z node scripts/extract-demo-data.cjs
# Repair a pre-existing local database:
node scripts/migrate-demo-traffic.cjs /data/anchor-management.json ../index.html
```

From the repository root, install browser dependencies and run the isolated E2E
suite. It starts a Go server with a temporary database and never writes to Fly:

```sh
npm ci
npx playwright install --with-deps chromium
npm run test:e2e
```

The Playwright suite must retain traces, screenshots, videos, and the HTML report
on failure. The existing `tests/casrep-editor.browser.test.cjs` remains a broad
legacy acceptance path; use the Playwright runner for the required CI gate.

For a committed branch/PR, run the gate with `DOC_SYNC_BASE=origin/main`.
The server tests exercise actual Node commands, not mocked workflow results.
Tests cover all-resource CRUD, 500-record page limits, due paging/filtering,
revision conflicts, concurrent comments, return/revise/approve/release/UPDATE,
material notices, reload persistence, and write-failure rollback. The seed model
suite asserts all 186 fictional cases have canonical traffic with no required
validation errors. The migration test asserts selective, idempotent repair and
preservation of existing traffic.

## Current status

The Go-served UI reads every page of all five resources. Seeded canonical traffic
is checked in the browser for representative INITIAL, UPDATE, and CORRECT cases;
`demo-rich-1008` is a required regression case. CASREP editing, review
comments, legacy submission date entry, observations, approvals, returns, release,
transmission/delivery evidence, follow-on drafts, and closure use dedicated server
commands. The editor's Recipients tool links to PLAD Manager in a separate tab so
users can maintain templates without discarding an unsaved draft. Work-order/requisition/PLAD writes retain the original CRUD paths and
wait for success. Requisition changes and linked reporting metadata persist in
one atomic file write. The overview uses server-calculated deadline pages of 10;
legacy collection queries keep their stored `nextUpdateAt` behavior.

Browser verification with a temporary backend database completed a draft save and
reload, DIVO comment/return/revision, all five approvals, CO release, notional
transmission, a submitted UPDATE with a new deadline, material status/notice and
PLAD persistence, due-page navigation, and a configured-API failure. Static demo
fallback was checked separately. See `../CASREP-DEMO.md` for the live walkthrough.

## Hosted deployment

Main's Fly.io / GitHub Pages setup is retained. `backend/fly.toml` configures
`anchor-management-api` and the `anchor_management_data` volume mounted at `/data`.
Use `backend/fly.staging.toml`, `scripts/deploy-fly-staging.sh`,
`scripts/verify-fly-staging.sh`, and `docs/FLY-STAGING-RUNBOOK.md` for a
separate demo-only staging app and volume; never run browser write tests against
Fly.
The Pages workflow inlines the `CASREP_API_BASE` repository variable into its
index. `frontend-config.js` remains the local same-origin default. The Docker
image now installs Node and copies the shared rules and demo-traffic migration
helpers, with an explicit helper path in its entrypoint. The Fly volume contains
pure demo data; run the one-shot migration after deployment:
`fly ssh console --user app -C 'node /app/scripts/migrate-demo-traffic.cjs /data/anchor-management.json /app/static/index.html'`.
Run it as the service user so the migrated file remains readable by the Go process.
`.github/workflows/fly-backend.yml` deploys
main-branch backend changes using the `FLY_API_TOKEN` repository secret. Deploy
backend changes before the new frontend; Pages now waits and retries while Fly
rolls out. See `API.md` for setup commands. Wildcard CORS remains for the
fictional demo.

Before publishing, Pages calls `/api/v1/health?check=casrep` and requires the
workflow/deadline capability markers. This exercises the packaged helper without
reading or mutating live data. A previous API version or missing runtime stops
publication and preserves the existing site. Run `fly deploy . --config
backend/fly.toml` from the repo root for manual recovery. The ordinary health
endpoint and Fly health probe remain independent of Node readiness.

The rules runner permits one child process at a time to bound memory on the
existing 256 MB Fly machine. Go resource CRUD remains independent of that runtime.
Local verification used Go/Node and a temporary database; Docker was not available
on this host. CI builds the image and smoke-tests its packaged helper.

## Boundaries and follow-up

- The shared Node helper is required for workflow/calculated-deadline endpoints;
  missing runtime/files return 503 without partial writes. Generic CRUD still works.
- The helper runs inside the Go write lock, with a 10-second timeout. This favors
  consistent prototype state over throughput. A long-running rules service or a
  tested port is a later scaling decision.
- Fixture models remain embedded for static fallback and tests. Extracting them
  into standalone shared modules is a later migration; avoid separate rule copies.
- UI roles are simulated. Generic CRUD is still a trusted prototype/admin path,
  not an authenticated workflow boundary. Do not describe this as production RBAC.
- Stored histories are retained but not tamper-resistant. The Assistant shared
  login protects model requests but is one shared principal, not production
  identity or RBAC. Authentication for generic CRUD/workflow, multi-instance
  transactions/locking, approved templates and reporting rules, official
  messaging, and durable notifications still need implementation.
- Assistant model output is non-persistent and schema-validated. The backend
  packages `internal/assistant/skills/*.md`; user content cannot select a skill.
  No Assistant response has workflow tools or a direct persistence path.
  CASREP creation uses the deterministic composer and the facts collected from
  the user; model output is not allowed to replace equipment, title,
  description, category, or other report fields. Generic requests such as
"create a CASREP" are rejected as report facts and prompt for actual equipment
and condition details. New drafts use only the user's supplied narrative
facts; existing reports and example forms are reference material, never copied
as new-report facts. The intended flow is one natural-language or labeled prompt
followed by compact fact confirmation, not a second manual form. Extraction is
advisory; the deterministic composer receives only confirmed facts. The
current extractor recognizes common ordinary prose for equipment, category,
and observed condition, then preserves the extracted wording for confirmation.
- Notifications refresh while the app is open. No background delivery service exists.
- Existing databases are not silently migrated or reset. Preserve missing submission
  evidence and legacy review history; use explicit date entry or a new review round.

## Admin and configurable routing

Left-navigation Admin contains PLAD Manager and Schedule Manager. The shared
schedule uses additive `command-settings` persistence, or browser key
`casrep-ship-schedule-v1` in static mode. Existing databases initialize an empty
collection without replacing cases. Application updates drafts, flags submitted
reports, and lists partial failures for retry. Saved/new drafts inherit it.
Configure routing from a draft's Review & release tab. `set-route` uses the shared
model and existing command path; submission snapshots the chosen chain.
Activity and registry show 20 rows per page; queue columns show six. Queue filters
combine category, stage, search, and dynamically discovered next-reviewer labels.
Deploy API and frontend together; Pages requires `command-admin-v1`.

Homepage category lists show six records per category (18 total), independently
paginated. Editor UI uses 12pt text; Find, Outline and Update rules are removed.


The shared document model exports wrap and lineLimit (69). Continuations use one leading space and preserve logical values and physical comment offsets. Deploy the API before Pages; casrep-line-wrap-v1 prevents publishing the new formatter against the old parser. MC/profile decoration is removed; notifications remain available.


Typography uses the original UI sizes; only editor action buttons are increased
to 12px. The message soft-wraps to available paper width without horizontal
scrolling, retaining the stored 69-character format and exact text. Activity and
Workspace Guide are grouped under Admin; Workspace/Material navigation headings
and the brand subtitle are removed. Latest PLAD and Assistant integrations remain.


The top breadcrumb/notification bar is removed. Notifications are available in
the bottom-left sidebar beside the Assistant and workspace controls. A separate
mobile menu button retains navigation access when the sidebar is collapsed.


The left navigation fits the dynamic viewport height without its own scrollbar.
Short screens reduce spacing and secondary text; expanded short menus use two
columns. All nine destinations, Assistant, and notifications remain reachable.


## Command overview briefing

Overview's **Export overview** opens a fixed one-page US Letter landscape report
with print / Save PDF. It uses all loaded records in the current command/profile,
independent of table pages, and includes category totals, reporting watch items,
eight priority casualty excerpts, impact/mitigation, repairs/parts, ETR, next
reviewer workload, linked maintenance/supply counts, assistance and ship schedule.
Unshown active reports and condensed excerpts are disclosed. Priority is category
(CAT 4 first), then overdue/due/changed/late repair and reporting date. No readiness
score or recommendation is inferred. Missing dates remain explicit.

Existing JSON and text export controls and download handlers are removed; message
printing remains. Workspace Guide is accessible only through the bottom-left
footer. That footer remains available on compact screens. Browser tests verify
one landscape PDF page, bounded content and removal of export controls.
Playwright accepts optional CHROME_EXECUTABLE for the installed local browser;
CI continues using its managed Chromium and isolated database.
