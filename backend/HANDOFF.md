# Backend handoff

## Department analysis maintenance

The embedded casrep-department-analysis and casrep-department-ui scripts drive
the department-first Analysis page. They are not loaded by the backend rules
helper. Original detailed analysis remains under More analysis tools. The
existing API client still loads all collection pages before application startup.
Read skills/casrep-analysis/SKILL.md and its playbook/output contract for analysis
behavior; docs/CASREP-Assistant-Instructions.md covers the conversational agent.

ReadinessApp.departmentAnalysis exposes detached snapshot(), packet(question)
and applyAgentResult(result) hooks. No new service or credentials are supplied.
The packet includes the complete loaded manifest/current and historical
evidence; inaccessible text remains a limitation. Drilldowns filter matching
findings without making a globally valid assessment stale; changed data,
ownership, command or profile invalidate its snapshot.

Analysis labels use casrep-analysis-ownership-v1. Chat history uses
casrep-assistant-conversations-v1. Both are local device state and never amend
CASREP messages or backend records. Keep case-write busy guards when changing
conversation controls; generation cancellation must not cancel a case command.

Run the department model/UI/chat unit tests plus the full Playwright suite.
Include complete inventory beyond pagination/legacy AI limits, duplicate and
missing identities, ambiguous ownership, stable equipment identity, parts
confirmation, history coverage, invalid/stale agent output, unchanged case
storage, conversation restoration/cancellation and responsive drilldowns.


## Assistant portal verification

The Assistant is additive within index.html. Its local chat/composer scripts are
not loaded by the backend rules helper. Preserve the existing document,
reporting, case, API client and material scripts when changing the portal.
Historical references use loaded approved text; local style summaries are
structural observations, not connected model-based voice adaptation.

The normal verification workflow includes assistant, composer and guarded
handoff tests. Optional browser acceptance uses the existing separately
installed Playwright setup:

    node tests/casrep-assistant.browser.test.cjs
    node tests/casrep-assistant-navigation.browser.test.cjs

Set PLAYWRIGHT_MODULE, CHROME_EXECUTABLE, CASREP_TEST_URL and optionally
CASREP_TEST_OUTPUT as for the editor browser suite. Use isolated fictional
storage. Check opening/back/forward, tablet access, pending-command navigation,
exact preview handoff, dirty-buffer protection and ordinary Save. Freeform
sponsor narrative without supported labeled ranges requires manual mapping;
the Assistant blocks before a follow-on write instead of discarding passages.

No live AI provider is connected. The agent reference is
docs/CASREP-Assistant-Instructions.md; future AI work must preserve the current
case workflow and storage boundary.

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
Trivy, and Grype on every push/PR and weekly.

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

Main's Fly.io / GitHub Pages setup is retained. `backend/fly.toml` configures
`anchor-management-api` and the `anchor_management_data` volume mounted at `/data`.
The Pages workflow inlines the `CASREP_API_BASE` repository variable into its
index. `frontend-config.js` remains the local same-origin default. The Docker
image uses pinned Go/Node base digests, removes runtime npm tooling, runs as
non-root `app`, and copies only read-only application files; `/data` is the
writable volume. CI scans it with Trivy and Grype and runs a read-only,
capability-dropped smoke test. The Fly volume contains pure demo data; run the
one-shot migration after deployment:
`fly ssh console --user app -C 'node /app/scripts/migrate-demo-traffic.cjs /data/anchor-management.json /app/static/index.html'`.
Run it as the service user so the migrated file remains readable by the Go process.
`.github/workflows/fly-backend.yml` deploys
main-branch backend changes using the `FLY_API_TOKEN` repository secret. Deploy
backend changes before the new frontend; Pages now waits and retries while Fly
rolls out. See `API.md` for setup commands. The hosted image sets exact-origin
CORS through `CORS_ALLOWED_ORIGIN`; CORS is not authentication.

Before publishing, Pages calls `/api/v1/health?check=casrep` and requires the
workflow/deadline capability markers. This exercises the packaged helper without
reading or mutating live data. A previous API version or missing runtime stops
publication and preserves the existing site. Run `fly deploy . --config
backend/fly.toml` from the repo root for manual recovery. The ordinary health
endpoint and Fly health probe remain independent of Node readiness.

The rules runner permits one child process at a time to bound memory on the
existing 256 MB Fly machine. Go resource CRUD remains independent of that runtime.
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
- Stored histories are retained but not tamper-resistant. Authentication,
  multi-instance transactions/locking, approved templates and reporting rules,
  official messaging, and durable notifications still need implementation.
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
