# Backend specification

## Department analysis and conversation controls

The Analysis page begins with Combat Systems, Engineering, Deck and Supply, then
drills into systems, equipment, parts and source CASREPs. Its read-only model
inventories all loaded cases and linked records before command/profile filters.
Explicit ownership takes precedence over disclosed provisional exact-label
suggestions. Unmapped/conflicting records remain visible as coverage gaps.
Separate casualty identities, follow-on revisions, observations and confirmed
part findings retain different counts and denominators.

Versioned agent interpretations annotate the deterministic snapshot. Full
manifest accounting, snapshot identity, entity membership and cited evidence
are validated; model-returned aggregate replacements are rejected. This does not
connect a live AI provider or certify an engineering conclusion.

New chat, local conversation history, rename/delete/undo, copy, retry and Stop
operate within the Assistant. Restored drafts require regeneration. Stop can
cancel text preparation or ignore its late result; it cannot cancel a case write.
Chat history remains browser state. Verified analysis ownership and additional
areas use the additive command setting described below. Shared case workflow
rules, review authority, reporting clocks and transmission behavior stay intact.


## Additive Assistant portal

The bottom-left Assistant launcher opens a full-page chat at `#assistant`.
Existing resource APIs, command payloads, storage ownership, shared rules,
pagination and reporting/review behavior remain unchanged. The page supports an
explicit local-only mode and an optional backend model mode.

The backend model endpoint is `POST /api/v1/assistant/responses`; capability
status is `GET /api/v1/assistant/capabilities`. Provider communication stays in
the backend. Supported provider configuration is `none`, `openai`, or an
allowlisted in-environment OpenAI-compatible endpoint. The default is `none`.
The OpenAI provider requires `OPENAI_API_KEY`, `ASSISTANT_MODEL`, and the
server-side endpoint configuration. A local-compatible provider may use an
internal endpoint and may omit an API key. The supervised local mode may start
an offline `llama-server` from `ASSISTANT_LOCAL_MODEL_PATH`, using a loopback
address, one slot, no web UI, no agent mode, and a temporary API-key file. No
model download is permitted at runtime. The configured
`ASSISTANT_LOCAL_BINARY` is trusted server startup configuration and is never
derived from request data. No provider secret reaches the browser.
Draft generation is a labeled local template demonstration. An INITIAL opens a
working buffer; opening it in the editor enables automatic draft persistence.
Explicit follow-on handoff uses the existing guarded followup command and waits
for its response. Chat generation, comparisons and previews do not submit,
approve, release, transmit, close reporting or move submission deadlines.

When a network-backed or externally managed model is enabled, the Assistant
endpoints require the optional shared login configured by
`ASSISTANT_SHARED_PASSWORD`. Login creates an expiring opaque session cookie and
a CSRF token; cross-origin deployments must set
`ASSISTANT_ALLOWED_ORIGINS`. The supervised loopback local provider does not
require this login. This is one shared principal, not individual identity or
production RBAC. Existing generic CRUD remains the prototype/admin surface and
is not implicitly protected by this Assistant login.

Model prompts use backend-packaged Assistant skill files. User text, pasted
messages, and records are untrusted evidence. The server resolves bounded case
IDs, validates strict structured output, requires claim source IDs, and rejects
control-field or out-of-scope results. Model output is never persisted or sent to a workflow command. Chat-collected
facts are passed to the deterministic local composer; model output never
replaces equipment, title, description, category, or other report fields during
CASREP creation. Generic task requests are not treated as equipment or
narrative facts; the Assistant asks for the missing report information instead.
User-supplied narrative facts, including a single natural-language or labeled
prompt, are the only source for a new CASREP draft; existing reports and example
forms are never copied into a new report. The Assistant may extract candidate
fields, but a compact confirmation step must expose provenance, uncertainty, and
missing essentials before the deterministic composer opens the writer. It asks
follow-up questions only for genuinely missing or ambiguous essential facts.
The first extraction path recognizes ordinary CASREP prose such as equipment
phrases, category statements, and observed-condition clauses while preserving
the original user wording for confirmation.
INITIAL/follow-on handoff remains an unsaved writer buffer
followed by explicit human review and normal Save.

Model availability is optional. If no model is configured, unavailable, or
returns invalid output, the page retains the local deterministic analysis and
labeled template behavior. Chat generation, comparisons and previews do not
submit, approve, release, transmit, close reporting or move submission
deadlines. The first local benchmark is a non-Chinese-origin SmolLM2-360M
Instruct Q8 GGUF for bounded questions, selected skill instructions, summaries,
and unsaved drafts; larger models are upgrade options only if its evaluation
fails. Local-process prompts use a smaller fixed budget and reject broad
all-case scopes rather than silently truncating evidence.

Status: backend Assistant adapter, shared prototype session, bounded response
contract, and full-page chat wiring integrated; production identity, quotas,
rate limiting, audit retention, and provider policy remain outstanding.

## Purpose and runtime

The Go API owns persisted state for the HTML client. All five original resource
collections, filters, CRUD endpoints, CORS behavior, and pagination remain
available. Go 1.22+ runs the service without third-party Go modules. Node.js 20+
runs the shared CASREP rules at runtime; the Playwright package is a development
and CI dependency only. The static HTML demo continues to work independently with
browser storage.

## Security boundary and runtime hardening

This remains a fictional prototype: the API has no authentication or
server-enforced user authorization, reviewer IDs are client claims, generic CRUD
can bypass workflow rules, and stored history is not tamper-resistant audit
storage. It must not receive operational, classified, personal, or other
sensitive data. Production must add identity, server-side authorization, rate
limiting, durable audit storage, and multi-instance transaction/locking controls.

The HTTP server applies bounded request bodies, header/read/write/idle timeouts,
and exact-origin CORS when `CORS_ALLOWED_ORIGIN` is configured. An empty origin
configuration permits same-origin use but emits no cross-origin permission. The
mutable JSON database is written mode `0600`. The container uses pinned base
image digests, a current Go/Node runtime, a non-root `app` user, read-only app
files, and no runtime npm package manager. CI gates repository secrets with
Gitleaks, locked Node dependencies with npm audit, source/image configuration
and vulnerabilities with Trivy, and image vulnerabilities with Grype; it also
smoke-tests the image with a read-only root
filesystem, dropped capabilities, and `no-new-privileges`. Reviewed inline
OpenGrep suppressions are limited to trusted local process startup configuration
and the intentionally readable CSRF cookie; production cookie security remains
enabled by default. CI uses a scoped BuildKit GitHub Actions cache for the
pinned llama.cpp/model image layers and does not duplicate the full image build
in backend correctness verification; Node dependency downloads use the locked
`package-lock.json` cache.

## Resource model

| Resource | Collection key | Required create fields | References |
| --- | --- | --- | --- |
| CASREP case | `cases` | `title` | optional `assetId` |
| Equipment asset | `assets` | `name` | none |
| Work order | `work-orders` | `title`, `assetId` | asset; optional `casrepId` |
| W requisition | `requisitions` | `part`, `assetId` | asset; optional `casrepId` |
| PLAD template | `plad-templates` | `name`, `recipients` | none |

Existing fields are retained. Generic creates assign IDs, timestamps, and default
statuses. Generic case PATCH/PUT increments `revision`. Dedicated workflow saves
increment the message revision only for material edits; comments and approvals
append to their histories without changing the message revision.

CASREP fields include canonical `traffic`, `documentHistory`, `documentReview`
snapshots/comments/acknowledgements, `reporting` submissions/pending changes,
`materialChanges`, `events`, `versions`, and `transmissions`. Unknown case fields
and existing asset/material relationships are preserved.

## Existing HTTP contract

Base path: `/api/v1`. For every resource:

- `GET /{resource}` returns `{data: [...], meta: {total, limit, offset}}`.
- `POST /{resource}` returns the new record with HTTP 201.
- `GET /{resource}/{id}` returns one record.
- `PATCH` and `PUT /{resource}/{id}` merge fields and return the updated record.
- `DELETE /{resource}/{id}` returns HTTP 204.
- Missing IDs return 404; invalid fields/references return 422. Malformed JSON,
  null bodies, or multiple JSON values return 400.
- Filters: `search`, `profile`, `stage`, `status`, `caseStatus`, `assetId`,
  `nextUpdateBefore`, `nextUpdateAfter`, and `hasNextUpdate`.
- `sort`: `nextUpdateAt`, `discoveredAt`, `updatedAt`, `createdAt`, `title`, `id`;
  `order=desc` reverses it. Timestamp ordering includes fractional seconds.
- `limit` defaults to 100 and is clamped to 1–500. `offset` is nonnegative and
  clamped to the result count. Pagination follows filtering and sorting.
- Generic writes accept `If-Match: "<revision>"` or `expectedRevision`; mismatches
  return 409 without changing the record.
- Errors: `{error: {message: string}}`.

`GET /health` reports basic service availability. `/` serves the HTML client.
Health does not assert that the optional rules runtime is installed.
`GET /health?check=casrep` additionally runs the trusted helper on an empty
collection and returns `data.capabilities` with `casrep-workflow-v1` and
`casrep-deadlines-v1`, or 503 if the packaged rules are unavailable. This read
does not access or mutate live records.

## CASREP commands

`POST /cases/drafts` creates a draft (201). The body contains editable fields,
normally `traffic`, optional `assetId`, and `actorId`. Incomplete drafts may be
saved; submission requires valid exercise traffic.

`POST /cases/{id}/actions/{action}` returns the updated case (200). Actions are
`save`, `submit`, `return`, `concur`, `authorize`, `transmit`, `deliver`, `followup`,
`close`, `comment-add`, `comment-reply`, `comment-resolve`, `record-submission`,
`require-update`, and `observation`. Payloads are documented in `API.md`.

Existing-case commands require `expectedRevision` (or `If-Match`). Optional
`expectedStage` and `snapshotId` reject stale stages/review rounds with 409. The
client also sends `expectedDigest` for document saves/transitions. The pure model
checks locked content, revision/digest, snapshot applicability, required message
fields, ordered roles, and CO release authority. An explicitly supplied asset
must exist. Normal command timestamps come from the server; `record-submission`
is a validated legacy date-entry action and cannot backdate a new INITIAL draft.

Go holds the same write lock used by resource CRUD while invoking the Node helper
with a current snapshot and server time over JSON stdin. It persists only the
successful case result. The helper evaluates trusted repository model scripts,
never request code. A missing/failed runtime returns 503; the process has a
10-second timeout and does not commit partial state. Resource CRUD remains
available if the rules runtime is missing.

## Calculated deadline pagination

`GET /cases?reporting=calculated` projects `nextUpdateAt` and `reportingSchedule`
from reporting evidence using the shared `CasrepReporting.resolve` rules. This is
a read projection and does not overwrite the legacy stored `nextUpdateAt` field.
Queries without this parameter retain their existing stored-field behavior.

The overview uses `reporting=calculated`, `caseStatus=Active`,
`hasNextUpdate=true`, `sort=nextUpdateAt`, `order=asc`, `limit=10`, `offset`, and
an optional `nextUpdateBefore` horizon. `includeRequired=true` includes cases
with a reportable change even if their periodic date falls beyond that horizon.
All other filters still apply. Filtering, ordering, counts, and slicing remain
on the server.

Submission starts the reporting clock. CAT 2/3/4 use 30 days/10 days/72 hours,
with the earlier ETR-minus-24-hours checkpoint. Re-review retains the original
cycle; a new submitted UPDATE starts the next one. Missing evidence is explicit.
This public JFMM Rev. D baseline requires command validation against current
instructions; see `../CASREP-UPDATE-RULES.md`.

## Material writes and persistence

Requisition creation, deletion, or a change to part, status, ETA, quantity, NSN,
JCN, or CASREP link records an update requirement and audit event on linked active
cases in the same write. Notices are deduplicated per requisition. Moving a link
flags both affected active cases. Owner/notes-only edits do not flag an update.
These writes do not change traffic, approvals, revision, or the reporting clock.
Submitting INITIAL/UPDATE acknowledges outstanding material notices. Changes that
precede the initial submission do not appear as outstanding notices.

`backend/data/seed.json` is generated from the embedded models: 186 cases, 95
assets, 5 work orders, 5 requisitions, and 3 PLAD templates. Every demonstration case has
deterministic, fully populated canonical traffic; required document validation
errors and controlled-field placeholders are seed failures. Regenerate it; do
not
hand-edit it. The server seeds only when the mutable database is absent. Regeneration
never migrates or replaces existing runtime data. Run
`node backend/scripts/migrate-demo-traffic.cjs DATABASE_PATH INDEX_HTML_PATH` once
to repair only demonstration cases without traffic. The Fly volume contains pure
demo data, so it may be migrated or reset without a backup; migration is idempotent
and preserves existing traffic and review history. Run Fly migrations as Unix user
`app` so rewritten file ownership remains readable by the Go service. Legacy reports
without submission
evidence need explicit date entry.

Writes use a temporary JSON file and rename. The store rolls back its in-memory
snapshot on persistence failure, including related material reporting changes.
This is single-process persistence, without multi-instance locking or a database
transaction manager.

## Deployment topology

The hosted topology from main remains a Fly.io API plus a GitHub Pages frontend.
The documented `fly deploy . --config backend/fly.toml` command uses the repository root as its build context and `backend/Dockerfile` as the Dockerfile. `backend/Dockerfile` packages the Go binary, Node runtime, shared CASREP helper,
demo-traffic migration helper, seed, `llama-server`, and the checksum-verified
SmolLM2-360M-Instruct Q8 GGUF model. The image runs as the unprivileged `app`
user; application files and the model are read-only, and only `/data` is
intended to be writable. The model is downloaded and verified at image build
time; runtime model downloads are forbidden. The llama.cpp stage shallow-fetches
the pinned commit, uses BuildKit ccache, and compiles with the builder's
available parallelism; unchanged model and compiler layers remain cacheable.
The migration is a Fly SSH
one-shot operation, not a public HTTP action. `backend/fly.toml` configures the
local provider, exact Pages origin, 1 GB machine, two shared CPUs, 60-second
startup grace period, health check, and port 8080. The local model server binds
only to loopback, runs offline with no web UI or agent mode, and uses one
inference slot. The rules runner remains limited to one child process.

The Pages workflow builds `_site/index.html` and inlines the `CASREP_API_BASE`
repository variable in place of `frontend-config.js`. This configuration seam and
CORS behavior are retained. Local config defaults to the same-origin API. The
workflow checks the configured API's CASREP health capabilities before replacing
the Pages site. An older or unavailable backend blocks publication; the previous
site remains live. `.github/workflows/fly-backend.yml` now deploys main-branch
backend changes with the `FLY_API_TOKEN` secret. Pages retries the readiness
check while that deployment rolls out. An unconfigured API still allows
static-demo publication. Manual `fly deploy` remains the recovery path.

## Client behavior and boundaries

The client selects its data source before enabling the workspace, reads every
page of all five collections, and waits for writes before showing success.
Pending editor actions are guarded against duplicate submission. Drafts remain
available after errors. The CASREP Recipients tool links to PLAD Manager in a
separate tab so users can maintain templates without discarding an unsaved
draft. The Recipients tool presents the saved PLAD template workflow first and
the ad-hoc To/Info entry fields below it; both paths remain available. Backend
case data refreshes every minute and on focus;
notifications run while the page is open. A static server without an API uses
browser storage. A configured API failure, or a read failure after successful
health discovery, produces a retry screen instead of a local-store switch.

Only notional unclassified data is supported. Reviewer identities are simulated
client claims, not authenticated principals. Retained generic CRUD endpoints are
a trusted prototype/admin interface and do not enforce workflow permissions;
production must restrict those paths as well as authenticate every command.
Stored history is not tamper-resistant audit storage. Official messaging,
background notification delivery, approved templates/policies, authentication,
and operational security controls remain outside this prototype.

## Completion checks

Run the documentation sync gate, JS model/API tests, `go test ./...`,
`go vet ./...`, and `npm run test:e2e` as described in `HANDOFF.md`. CI checks
spec, handoff, and ADR updates against the merge base and retains Playwright
traces, screenshots, videos, and reports on failure. Security CI also runs Gitleaks, npm audit, OpenGrep, CodeQL, Gosec, Trivy, and
Grype. OpenGrep, Gosec, dependency, image, and configuration findings fail at
the configured severity thresholds; CodeQL uploads Go and JavaScript findings
to GitHub Code Scanning. Existing CRUD and server pagination contracts must
continue to pass when adding CASREP behavior.

## Command administration

The CASREP editor displays the ship schedule only in the report-fields sidebar,
after Remarks, with no schedule banner above the document views. Checks, history
and review tools keep their focused content. The schedule uses the same current
command setting as the overview export, preserves line breaks, and links to
Schedule Manager. Locked reports explicitly retain their saved message and
can show their earlier message schedule separately. Displaying this context does
not amend canonical traffic, revisions, review snapshots or reporting deadlines.

`command-settings` is additive CRUD, persisted as `commandSettings`, initialized
empty for existing databases. A singleton named `ship-schedule` stores `text`.
The frontend updates open drafts with revision-checked saves. A changed schedule
returns an In review or Ready for release report to Draft using the existing
reasoned return command, then saves its new schedule for fresh approval. Prior
review text/acknowledgements and submission evidence remain historical; the
reporting clock is not restarted. Matching schedules do not reset review.
Released/transmitted reports retain their message text and receive update flags;
closed cases are excluded. Results distinguish updated schedules, returned
reviews, flagged reports, unchanged schedules and failures. Application is per
report, not a bulk transaction. Return and save are separate guarded commands;
if save fails after return, the report remains Draft with its old message and is
explicitly listed for retry. No new backend endpoint or migration is required.

Draft working buffers incorporate the shared schedule before the first editor
render, including direct/recovered draft opens. The persisted text digest remains
the concurrency guard until save. Autosave synchronizes the visible message with
the current working buffer without replacing the form or interrupting selection;
visiting Schedule Manager is not required to show the schedule. Locked/released
message text remains unchanged.

`set-route` is a revision-checked originator action available before transmission. Payload `chain`
contains 1–20 distinct `{id,label,name}` steps ending with CO. Submission
snapshots these reviewers; approvals follow their saved order. The five-role
default remains for unconfigured records. Health advertises `command-admin-v1`.

The frontend presents Admin in the left navigation. Homepage category registers
paginate six records each (18 across CAT 2/3/4); total counts retain all matches.
Editor controls and fields use 12pt text. Find/Outline and Update rules UI are
removed; reporting calculations and existing API contracts are unchanged.


Messages saved through the shared rules wrap physical lines at 69 characters. A leading-space continuation after a full line is unfolded for parsing; field offsets map back to physical text for review anchors. Draft edits/save and message export/printing use this formatter. Existing locked snapshots remain unchanged. Health adds casrep-line-wrap-v1, required by Pages.


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

## Draft continuity and reviewer edits

Opening a new CASREP editor creates a Draft automatically after a short debounce;
subsequent edits autosave through the existing revision-checked draft commands.
Incomplete messages may be saved and printed / saved as PDF. Required validation
continues to block submission only. A synchronous, API-scoped browser recovery
buffer preserves the latest edits before close, including failed or pending
backend saves. Reopening the same draft restores that buffer; opening the app
without an explicit view resumes the last draft. Conflicting server revisions
remain guarded rather than overwritten. Browser recovery is not backend success.

The right panel contains all fields in message order, starting with PLADs and
addressing, then casualty, condition/repair, and remarks. Separate Message setup
and field-tab controls are removed. The overview omits the single-command label.

`set-route` accepts Active cases in Draft, In review, Ready for release, or Release
authorized. A changed chain increments revision, returns the report to Draft,
resets current approvals, and supersedes the active snapshot. Previous approvals,
release versions, and submission dates remain historical. Unchanged chains do not
reset review. Transmitted / Delivery verified reports reject routing edits.
Pages requires the additive `casrep-routing-edit-v1` health capability so the UI
cannot publish against the previous draft-only command implementation.

## CASREP deletion

Registry rows and the editor expose Delete for CASREPs that have never been
transmitted. A confirmation identifies the report and explains permanent removal
of its case/message/review history. Equipment, work orders and requisitions remain.
Deleting a new unsaved editor buffer discards it without creating a new case.

The UI and static store reject Transmitted, Delivery verified, or any case with a
nonempty transmissions history, including follow-on drafts. The existing backend
`DELETE /cases/{id}` applies the same guard under its write lock and returns 422
for protected cases. Successful deletion remains 204. A failed delete leaves
saved state and recovery buffers intact. On success the client stops autosave,
waits for in-flight initial/draft saves, removes the final ID, clears its recovery
buffer and editor/Assistant references, and refreshes registry counts and due
views. `casrep-delete-v1` gates publication against this backend protection.

## Combined single-ship analysis page

CASREP Analysis uses one page: the existing department hierarchy and drilldowns
appear first, followed by inline detailed analysis tools (AEGIS, casualty picture,
equipment history, investigations, relationships, comparisons and AI analyst).
The More analysis tools / return-page toggle and command/profile selectors are
removed. AEGIS and casualty picture omit redundant ship-selection controls.
Detailed-tool navigation keeps department context above it and scrolls to the
inline tool section; contextual Assistant queries retain the active section's
scope. Ownership and stale-agent-result guards continue to use the current
snapshot. This is a presentation change for the single-ship workspace, without
changes to API access controls, stored identities, counts or workflow rules.


The Gitleaks history gate uses the open-source CLI v8.30.1 directly, with the
official Linux release archive SHA-256 pinned in the workflow. This avoids the
GitHub Action's missing organization license while retaining a full-history,
redacted scan and a failing exit status for findings. No ignore or baseline is
introduced.


## CASREP Command workspace tools

The app uses the supplied CASREP Command logo/name and a browser appearance
preference (`casrep-command-appearance-v1`). Dark mode affects screens only;
message paper, message-only printing and the one-page overview remain light.
Notifications stay at the bottom left, and responsive navigation fits without
its own scrollbar. Registry filters open a dialog and routing filters remain visible in the queue;
table rows support click/Enter/Space, and the combined Analysis page retains all detailed tools.

Overview totals consolidate command/profile/casualty-number duplicates using the
latest record. Only persisted non-Active caseStatus closes reporting; a draft
CORRECT/CANCEL does not. Calendar cards use existing resolved deadlines with UTC
windows: today, today through Sunday and today through month-end. They exclude
previous days, disclose overdue/undated cases and open matching registry cohorts.
The overview brief uses the same unique active cases. Category registers still
show six cases each and preserve independent pagination.

`command-settings` additionally accepts a singleton `analysis-areas` with
`areas: [{id,name}]`, `caseDepartments: {caseId: areaId}` and
`assetDepartments: {compositeAssetIdentity: areaId}`. It coexists with
`ship-schedule`. Default Combat Systems, Engineering, Deck and Supply are fixed
and first; up to 64 unique additional definitions follow. Invalid/reserved IDs,
duplicate names and assignment targets outside the catalog are rejected (422).
Updates require expectedRevision, increment revision and reject stale versions
(409). The setting name cannot change. These labels change analysis grouping
only, never the case/equipment records or canonical text. Configured areas bind
the analysis snapshot and agent evidence validation. Static mode stores the same
configuration under an API-scoped `casrep-analysis-settings-v1` key and checks
its stored revision. Existing local ownership labels initialize an empty setup.

The editor links registered equipment on drafts and lists linked requisitions
alongside parts. The Requisition Tracker offers creation/editing, delivery/status
updates and timestamped sourcing comments with optional author. Backend
requisition CRUD now increments revision; guarded stale edits return 409. Notes
alone retain existing material metadata semantics and do not require another
CASREP update. Part/status/delivery changes still flag the associated active
case without changing its approved message or submission deadline.

Health and Pages require `casrep-command-tools-v1` for these additive persistence
features. Existing stores initialize revisions on their next update; no seed or
live-data migration is required.


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

## Routing queue list and return navigation

Routing Queue defaults to a compact, paginated list of Active reports in Draft,
In review, Ready for release and Release authorized. Visible search, category and
next-action filters combine; stage buttons show matching counts before stage
selection. List pages contain 15 reports with pagination above and below. The
optional board uses the same filters/order, shows populated stages only and keeps
six reports per stage with paging at the top. Board columns stay 184–260px wide
in a single horizontal row instead of stretching when only a few stages are
populated. Tiles use compact spacing and two visible title lines; the complete
title remains available on hover and in the accessible name. A common next-action
owner appears once in the column header; mixed reviewers remain on their tiles.
Narrow screens scroll the board sideways, with horizontal position restored
after opening a report.

Reporting urgency uses the existing reporting resolver: overdue dates first,
then required updates, due today, missing submission dates, due tomorrow,
scheduled dates and remaining undated reports. Dates break urgency ties; category
and oldest/newest recorded update sorts are also available. Updated is a record
timestamp, not elapsed review time. No reporting rule or workflow state changes.

Opening a queue report retains the current session's filters, sort, view, page
and scroll position. The editor exposes Back to routing queue; it and browser Back
restore the selected row's focus, or the results area if that report moved out of
the filtered queue. Direct editor/registry opens retain the registry back link.
Queue state is in memory, not persisted across reloads or shared between users.
Responsive list rows reflow on narrow screens; rows support click/Enter/Space.
All review, approval, release and transmission actions retain their existing
editor guards. No API, persistence schema, seed or migration change is required.

Board column pagination preserves horizontal and page scroll. Keyboard focus stays
with the same paging direction when available, or moves to the remaining enabled
control on the first/last page. List pagination still returns to the results top.
The mobile pagination regression covers both the middle and last page.
