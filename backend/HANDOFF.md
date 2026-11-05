# Backend handoff

## Department analysis maintenance

The embedded casrep-department-analysis and casrep-department-ui scripts drive
the department-first Analysis page. They are not loaded by the backend rules
helper. Original detailed analysis remains inline below the department hierarchy. The
existing API client still loads all collection pages before application startup.
Read skills/casrep-analysis/SKILL.md and its playbook/output contract for analysis
behavior; docs/CASREP-Assistant-Instructions.md covers the conversational agent.

ReadinessApp.departmentAnalysis exposes detached snapshot(), packet(question)
and applyAgentResult(result) hooks. No new service or credentials are supplied.
The packet includes the complete loaded manifest/current and historical
evidence; inaccessible text remains a limitation. Drilldowns filter matching
findings without making a globally valid assessment stale; changed data,
ownership, command or profile invalidate its snapshot.

Analysis labels use shared analysis-areas settings, or API-scoped static browser
settings. The legacy casrep-analysis-ownership-v1 labels initialize an empty
configuration. Chat history uses casrep-assistant-conversations-v1 and remains
local device state. Neither changes CASREP messages or workflow records. Keep case-write busy guards when changing
conversation controls; generation cancellation must not cancel a case command.

Run the department model/UI/chat unit tests plus the full Playwright suite.
Include complete inventory beyond pagination/legacy AI limits, duplicate and
missing identities, ambiguous ownership, stable equipment identity, parts
confirmation, history coverage, invalid/stale agent output, unchanged case
storage, conversation restoration/cancellation and responsive drilldowns.


## Assistant portal verification

For local/Fly model troubleshooting, use [the inference runbook](../docs/INFERENCE-VERIFICATION.md).
`npm run verify:inference -- --base-url https://anchor-management-api.fly.dev --origin https://fleethacker.github.io --expect-text "controller reset"`
checks two real responses plus blocked paths without writing CASREP records.
Health and **Model ready** alone are insufficient. Select one CASREP in
**History scope** to avoid the small model's context limit; a 422 scope error
now explains that recovery instead of claiming the provider is unavailable.
Successful cards show **MODEL RESPONSE**, selected scope and request ID.
Chat settings describe actual optional-model behavior; drafting remains local.

Local prompts separate trusted system instructions from complete bounded
user/evidence data and place the question last. This fixes identifier-only or
unrelated-field answers seen with the previous dense JSON prompt. Compact output
validation now fails closed, including empty/missing fields and uncited claims.
Fly explicitly sets two model threads and a 60-second startup timeout, matching
its existing CPU allocation and health grace period. Provider errors appear in
Fly logs without prompts or credentials.

Run `node --test backend/scripts/verify-inference.test.cjs` with existing unit
checks. Security CI enables the actual model in its isolated hardened-image
runtime check; Fly CI performs the same read-only acceptance after deploy.
The known-answer check is a bounded demo regression, not certification of model
accuracy. Keep full isolated Playwright coverage alongside real inference checks.

The Assistant is additive within index.html. Its chat/composer scripts are not
loaded by the backend rules helper. Preserve the existing document, reporting,
case, API client and material scripts when changing the portal. Historical
references use loaded approved text; local style summaries are structural
observations. The full-page `#assistant` portal sends bounded history questions
through the backend Assistant adapter when its capability status reports a ready
model. It renders the response as model-assisted and falls back to local analysis
on unavailable or failed requests. Editor-launched requests use the focused case
ID to stay within the local prompt budget. The small overlay and editor writing
help remain local-only; CASREP draft composition remains deterministic and
fact-bound.

The backend provider is optional. `ASSISTANT_PROVIDER=none` is the safe default;
`openai` uses the server-side `OPENAI_API_KEY`, `ASSISTANT_MODEL`, and Responses
endpoint, while `openai-compatible`/`local` uses an internal
`ASSISTANT_MODEL_ENDPOINT`. When `ASSISTANT_PROVIDER=local` also has
`ASSISTANT_LOCAL_MODEL_PATH`, the backend supervises the configured
`llama-server` binary on loopback with offline mode, one slot, no web UI, no
agent mode, and a temporary API-key file. The binary path is trusted server
startup configuration and is never accepted from Assistant request data. The
first benchmark model is the non-Chinese-origin SmolLM2-360M-Instruct Q8 GGUF.
Provider requests are
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

## UDS package local inference

`chart/templates/deployment.yaml` enables the verified local provider for both
UDS package flavors. It uses the binary and GGUF paths installed by
`backend/Dockerfile`, fixes a 4096-token context and 600-token response cap,
and allows 60 seconds for model startup. The chart's 1Gi request/limit and
75-second liveness delay are part of the package contract; changing the model,
context, or memory profile requires target-environment measurement and an ADR.
The UDS package must be built from a released image produced from the same
source revision. Do not expose a caller-selected model binary, path, or endpoint
through Zarf values.

Keep `zarf-values.yaml` aligned with the chart's 500m CPU / 1Gi requests and
2 CPU / 1Gi limits; package values override chart defaults. The model uses two
threads. `uds run dev` builds/deploys the local image and then invokes the
image's `/app/scripts/verify-inference.cjs`; `uds run verify-inference` repeats
only the deployed-model check. A 422 or 503 fails the task even if health passes.
The local flavor always pulls and adds the Helm revision to the pod template
to prevent unchanged tags from retaining old pods. `Recreate` preserves one
writer during deployment and keeps the PVC, with brief application downtime.
Inspect numeric mount ownership if `/data` denies atomic temporary-file writes;
do not reset persistent demo data as a permissions fix. Validate both rendered
flavors and resolved package values, then replay `uds run dev` and verify the
new image identity, unchanged database, and stable pod restarts.
The application chart selects `serverSideApply: "false"` in `common/zarf.yaml`:
Helm 4 server-side apply retained the old default `rollingUpdate` even with an
explicit null. Keep the chart's null plus client-side apply for that transition.

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
The Ubuntu 24.04 runner, Node-24-compatible actions, pinned action commits, and
disabled Go module cache from main are retained; this standard-library module has
no `go.sum`. Security CI runs Gitleaks, npm audit, OpenGrep, CodeQL, Gosec,
Trivy, and Grype on every push/PR and weekly. OpenGrep suppressions are inline
and reviewed only for trusted local process startup arguments and the readable
CSRF cookie; revisit them if either boundary changes.

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
# Security review (also run from the repository root):
gitleaks detect --source . --redact --no-banner
trivy fs --scanners vuln,misconfig,secret --severity HIGH,CRITICAL .
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
users can maintain templates without discarding an unsaved draft. The template
workflow appears before the ad-hoc recipient fields, while both remain usable.
Work-order/requisition/PLAD writes retain the original CRUD paths and
wait for success. Requisition changes and linked reporting metadata persist in
one atomic file write. The overview uses server-calculated deadline pages of 10;
legacy collection queries keep their stored `nextUpdateAt` behavior.

Browser verification with a temporary backend database completed a draft save and
reload, DIVO comment/return/revision, all five approvals, CO release, notional
transmission, a submitted UPDATE with a new deadline, material status/notice and
PLAD persistence, due-page navigation, and a configured-API failure. Static demo
fallback was checked separately. See `../CASREP-DEMO.md` for the live walkthrough.

## Hosted deployment

Main's Fly.io / GitHub Pages setup is retained. The documented deploy command uses the repository root as its build context and `backend/Dockerfile`; `backend/fly.toml` configures
`anchor-management-api` and the `anchor_management_data` volume mounted at `/data`.
The Pages workflow inlines the `CASREP_API_BASE` repository variable into its
index. `frontend-config.js` remains the local same-origin default. The Docker
image uses pinned Go/Node base digests, shallow-fetches and parallel-builds the
pinned llama.cpp server with a BuildKit compiler cache, verifies and packages the
approved SmolLM2-360M-Instruct Q8 GGUF at image-build time,
removes runtime npm tooling, runs as non-root `app`, and copies only read-only
application/model files; `/data` is the writable volume. CI scans it with Trivy
and Grype and runs a read-only, capability-dropped smoke test. The Fly volume contains pure demo data; run the
one-shot migration after deployment:
`fly ssh console --user app -C 'node /app/scripts/migrate-demo-traffic.cjs /data/anchor-management.json /app/static/index.html'`.
Run it as the service user so the migrated file remains readable by the Go process.
`.github/workflows/fly-backend.yml` deploys
main-branch backend changes using the `FLY_API_TOKEN` repository secret. Deploy
backend changes before the new frontend; Pages now waits and retries while Fly
rolls out. See `API.md` for setup commands. The hosted image runs the supervised local Assistant provider with the
packaged model and sets exact-origin CORS through `ASSISTANT_ALLOWED_ORIGINS`;
CORS is not authentication. The Fly machine is sized at 2 GB RAM and two shared
CPUs. The local model uses a 4096-token context to fit the model and API within
that memory budget, with a 60-second health-check grace period for model startup.

Before publishing, Pages calls `/api/v1/health?check=casrep` and requires the
workflow/deadline capability markers. This exercises the packaged helper without
reading or mutating live data. A previous API version or missing runtime stops
publication and preserves the existing site. Run `fly deploy . --config
backend/fly.toml` from the repo root for manual recovery. The ordinary health
endpoint and Fly health probe remain independent of Node readiness.

The rules runner permits one child process at a time to bound memory on the
2 GB Fly machine. Go resource CRUD remains independent of that runtime. CI
builds the full container once in the security job, uses scoped BuildKit cache
layers for llama.cpp, its compiler cache, and the model, runs the packaged-helper
check there, and
keeps backend verification focused on Go, Node, and Playwright tests.
Local verification uses Go/Node and temporary databases; the hardened image was
built and exercised locally with Trivy, Grype, and a read-only runtime smoke test.
CI repeats the image scans and packaged-helper check.

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

The editor's Ship schedule section is in the report-fields sidebar after
Remarks. There is no separate schedule banner above either document view;
checks/history and review tools retain their focused content. The section
shows the current shared setting; locked reports label it as command context
and disclose a different/missing schedule in their saved message. No persistence
or workflow contract changes. Verify with
`node --test tests/casrep-editor-schedule.test.cjs` and the full Playwright suite,
including `tests/e2e/editor-schedule.spec.cjs` (backend/static, compact layout and
unchanged locked traffic/revision).

Left-navigation Admin contains PLAD Manager and Schedule Manager. The shared
schedule uses additive `command-settings` persistence, or browser key
`casrep-ship-schedule-v1` in static mode. Existing databases initialize an empty
collection without replacing cases. Schedule application updates drafts and
returns changed In review/Ready for release reports to Draft before saving, so
fresh review is required. Historical snapshots, acknowledgements and submission
clocks remain intact. Released/transmitted reports are only flagged; closed
cases are excluded. Already matching schedules are no-ops. The result separates
updated, returned, flagged, unchanged and failed counts. Missing legacy
submission evidence is reported rather than counting a nonexistent update flag.
A return followed by a failed save leaves an explicitly reported Draft with its old traffic; retry
saves it normally without returning it twice. Saved/new drafts inherit the
current shared setting. Verify the schedule application unit suite and full
isolated Playwright suite, including per-stage persistence, stale guards,
unchanged review evidence, partial failure and retry. No backend API deployment
or migration is required for this client workflow change.

Draft sessions prepare the shared schedule before their first render. Keep the
persisted digest as the save guard and mark the prepared buffer dirty. Autosave
synchronizes the message textarea with the current session while preserving its
selection, rather than relying on navigation to redraw it. Verify first-open
New CASREP in backend/static modes without visiting Schedule Manager, schedule
restoration after a raw message edit, reload persistence, and unchanged locked
messages.
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

## Draft autosave and reviewer changes

Drafts autosave after 650 ms using the existing create/save commands. Each session
serializes saves; edits made while a request runs remain dirty and get saved next.
Explicit workflow actions wait for pending saves. Print bypasses validation and
pending workflow guards; only submission requires complete message fields.
The API-scoped localStorage recovery buffer saves current traffic synchronously,
restores unsynced drafts on reopen, and resumes the last draft for an empty route.
Storage failures keep the unload warning; failed API writes are reported and leave
the recovery copy available. A configured API failure still cannot select static
mode. Assistant-generated drafts autosave when opened in the editor.

Review & release offers Configure routing until transmission. Changes during
review/release supersede the old snapshot and return to Draft for a fresh review;
prior approvals and release records stay historical and the reporting clock stays
unchanged. Same-chain saves are no-ops. `casrep-routing-edit-v1` gates Pages on the
matching backend. Verify the new draft-autosave and reviewer-editing Playwright
cases, including incomplete print, close/reopen, slow/failed saves, pre-transmit
changes, and the backend rejection after transmission. All use isolated data.

## Delete CASREP

The registry has an explicit Delete action per eligible row; the editor has
Delete CASREP. Confirmation is required and initially focuses Cancel. A record
with a transmitted/delivered stage or any transmission history cannot be deleted,
even when its current message is a follow-on Draft. Both browser-only storage and
backend DELETE enforce this. Deploy the backend first; Pages requires
`casrep-delete-v1`. No migration or live-data deletion is required for deployment.

Deletion pauses autosave and awaits pending writes so a just-created ID is also
removed. Successful deletion invalidates cached collection/due reads and clears
its session/recovery context. Failed deletes retain the report and permit retry.
Verify isolated Playwright coverage for registry/editor deletion, Cancel, reload,
static mode, pending initial/edit saves, failed API deletes, and protected
transmitted/delivered/follow-on cases. Equipment and material records are retained.

## Combined Analysis layout

The Analysis entry point now renders department navigation above the former
advanced tools on one page. Command/profile filters and More analysis tools are
removed, including redundant AEGIS / casualty-picture ship choosers. Test that
switching detailed tabs leaves department cards or the selected drilldown in
place, preserves source-case navigation and contextual Assistant behavior, and
fits desktop/tablet/phone widths. Stale agent results are tested by changing local
ownership labels, since profile selection is no longer a UI action. No backend
or data migration is required for this layout change.


The Gitleaks history gate uses the open-source CLI v8.30.1 directly, with the
official Linux release archive SHA-256 pinned in the workflow. This avoids the
GitHub Action's missing organization license while retaining a full-history,
redacted scan and a failing exit status for findings. No ignore or baseline is
introduced.


## CASREP Command tools verification

The rebuilt frontend adds CASREP Command branding with an embedded resized logo,
screen-only dark mode, unique active overview counts and UTC due-period links,
compact registry/routing filters, keyboard/clickable rows, additional analysis
areas with batch assignments, and editor/Tracker requisition actions. Retain the
bottom-left bell, non-scrolling navigation, combined Analysis tools and saved vs
current schedule distinction. Do not replace main with the alternate HTML.

Deploy API before Pages: both advertise/require casrep-command-tools-v1. Store
analysis_settings.go validates the additive analysis-areas setting. Generic
settings/requisition updates increment revision. Analysis-setting edits require
expectedRevision; stale settings/requisition writes return 409. No live migration,
seed regeneration or data replacement is required. Saving an area/assignment
must not alter any CASREP or equipment record. Settings conflicts retain the open
dialog, reload current settings and require reopening before another write.

Run the existing model/workflow/chat gates plus:
`node --test tests/casrep-overview-summary.test.cjs tests/casrep-department-analysis.test.cjs tests/casrep-department-ui.test.cjs tests/casrep-editor-schedule.test.cjs`
and the full `npm run test:e2e` suite. command-tools.spec.cjs covers API/static
area assignment/reload, failed and stale settings saves, linked requisition
comments/delivery/reload, unchanged message/deadline, calendar cohorts, filters,
keyboard rows, dark-mode persistence/paper and short/phone navigation. Go tests
cover setting coexistence, validation, persistence and stale requisition notes.
All browser/API checks use isolated temporary databases, never the live API.


Record and equipment-observation IDs use Web Crypto randomUUID or getRandomValues;
there is no Math.random fallback. A runtime without secure randomness rejects a
new ID rather than creating a weak one. Browser view routing accepts only own
allowlisted keys and uses an explicit rendering switch, so prototype-property URL
names cannot dispatch to inherited methods. Verify security-boundary model tests
and the full browser suite, including constructor/__proto__/toString routes.

Dialog autofocus runs once in a microtask only while that dialog is current and
no field already has focus. It must not redirect typing after a user moves to
another field. The browser clock regression exercises pending timers after
entering a sourcing comment.

## Routing queue presentation

`casrep-routing-queue` is a read-only client projection in index.html. It reuses
CasrepReporting, excludes closed/transmitted records, and supplies filtering,
stage counts, owner labels and stable sorting to both list and board views. It
is not a backend workflow dependency. Routing list pagination is 15; board
pagination remains six per populated stage. Search updates results without
replacing the focused input. Filter/stage/sort changes reset queue page offsets.

Run `node --test tests/casrep-routing-queue.test.cjs` and the full isolated
Playwright suite. `tests/e2e/routing-queue.spec.cjs` covers backend/static read-only
use, combined filters, empty stages, pagination, list/board switching, keyboard
opening, contextual return links and preserved page/scroll/focus. It also checks
responsive layout and dark mode. Existing command-tools coverage now uses the
visible queue controls; Registry keeps its filter dialog. Browser reloads reset
queue UI state. Returning after a workflow change recomputes current results and
clamps the page if its previous last report moved out of the queue.

The board uses bounded 184–260px columns in one row, including on narrow screens.
Board-only horizontal overflow must not widen the page. Common next-action owners
move to column headers; mixed reviewers stay on tiles. Titles clamp visually to
two lines with complete accessible names/tooltips. Preserve six-item independent
column pagination and horizontal scroll on editor return. Browser tests measure
column/card dimensions at desktop, tablet and phone widths, verify four-stage
layout, and check board paging and keyboard return from a later column.

Board column pagination preserves horizontal and page scroll. Keyboard focus stays
with the same paging direction when available, or moves to the remaining enabled
control on the first/last page. List pagination still returns to the results top.
The mobile pagination regression covers both the middle and last page.

## Sidebar branding maintenance

The refinement styles size both the logo wrapper and image together through
`--brand-logo-size`. Avoid fixed wrapper heights that are smaller than the image.
Check desktop, tablet rail, mobile menu and short viewports for divider/title
clearance and navigation visibility. Run the existing full isolated browser suite.


## Notification dismissal maintenance

The embedded `casrep-notifications` module is a client projection of
`CasrepReporting`, with browser-only preference storage. It is not a backend
workflow dependency. Keep the shared reporting rules unchanged when adjusting
notification presentation. Source selection occurs after backend connection;
static and API-backed workspaces must not share dismissal state. Clear all and
Restore all operate on the current profile's displayed reminders, including
missing submission dates, without deleting preferences for other profiles.

Fingerprints include submission identity, due date, submitted category/ETR,
material changes and urgency. Urgency must advance even when the reporting label
is still "Update required". Exclude rolling overdue-day text and unrelated edits.
Dismissal must use the rendered snapshot, not silently acknowledge a newer alert.
Keep open-report and dismiss buttons as siblings, preserve focus after updates,
and retain restore controls and honest empty-state text.

Run `node --test tests/casrep-notifications.test.cjs tests/casrep-reporting.test.cjs`
and the full isolated Playwright suite. Notification browser tests cover static
and backend sources, no report/API mutations, persistence and restoration,
changed-condition resurfacing, keyboard focus, narrow screens and dark mode.
The local and CI unit commands include notification tests. Never test clearing by
resetting the user's local workspace or writing to the live service.


## Workspace guide and demo tour

`policy()` renders the interactive guide from the local `guideStages` metadata.
`guidePanel()` and `guidePreview()` present capabilities and conceptual diagrams,
not live report facts. Keep all claims aligned with the implemented workflow; do
not imply official transmission, requisition fulfillment, production identity,
or readiness certification. Assistant draft composition uses confirmed facts;
model-assisted history answers depend on the configured connection.

`selectGuideStep()` updates the panel and roving tab selection without rerendering
the application. Preserve keyboard arrows/Home/End, Previous/Next edge focus,
selection/scroll continuity, and the reduced-motion behavior of Take the tour.
Launchers reuse the existing view/action handlers; Assistant must use `#assistant`,
not `data-view="assistant"`. Keep demonstration reset in the static-only closed
disclosure and never trigger report creation as part of viewing the tour.

Run the existing embedded-script/unit checks and full isolated Playwright suite.
`tests/e2e/workspace-guide.spec.cjs` covers connected/static context, tab semantics,
presenter controls, real tool launchers, Assistant return, notification/brief
previews, no report/API mutations, responsive layout, and dark mode. The existing
overview-report test also verifies the footer entry and Workspace guide heading.
