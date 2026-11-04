# Backend handoff

## Source of truth

- `index.html` contains the canonical document, reporting, workflow, and demo models.
- `scripts/casrep-workflow.cjs` loads only the three pure CASREP model scripts for
  server commands and calculated deadline queries. It does not use browser storage.
- `scripts/extract-demo-data.cjs` generates `data/seed.json`; include the reporting
  model before the case model. `SEED_REFERENCE` fixes the clock for every fixture.
- `SPEC.md` and `API.md` define the API contract; `../CONTEXT.md` defines terms.
- `../docs/adr/` records decisions, including the shared rules runtime in ADR 0008.

Generated seeds are regenerated, not hand-edited. The ignored
`data/anchor-management.json` is mutable runtime state. Starting the server never
replaces an existing database. New seed submission dates apply to fresh fictional
databases only; never backdate existing records from discovery/creation times.

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

Use Go 1.22+ and Node.js 20+ on PATH. No npm installation is needed.
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
node --test tests/casrep-document.test.cjs tests/casrep-reporting.test.cjs tests/casrep-api-client.test.cjs backend/scripts/casrep-workflow.test.cjs
```

From `backend/`:

```sh
gofmt -w cmd/server/*.go internal/store/*.go
go test ./...
go vet ./...
# Use when changing concurrent write behavior:
go test -race ./...
# Regenerate only when fixture/model changes require it:
node scripts/extract-demo-data.cjs
```

For a committed branch/PR, run the gate with `DOC_SYNC_BASE=origin/main`.
The server tests exercise actual Node commands, not mocked workflow results.
Tests cover all-resource CRUD, 500-record page limits, due paging/filtering,
revision conflicts, concurrent comments, return/revise/approve/release/UPDATE,
material notices, reload persistence, and write-failure rollback.

## Current status

The Go-served UI reads every page of all five resources. CASREP editing, review
comments, legacy submission date entry, observations, approvals, returns, release,
transmission/delivery evidence, follow-on drafts, and closure use dedicated server
commands. Work-order/requisition/PLAD writes retain the original CRUD paths and
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
image now installs Node and copies the shared rules helper, with an explicit
helper path in its entrypoint. `.github/workflows/fly-backend.yml` deploys
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
- Stored histories are retained but not tamper-resistant. Authentication,
  multi-instance transactions/locking, approved templates and reporting rules,
  official messaging, and durable notifications still need implementation.
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
