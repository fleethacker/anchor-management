# Backend specification

## Additive Assistant portal

The bottom-left Assistant launcher opens a client-side chat page. Existing API
resources, command payloads, storage ownership, shared rules, pagination and
reporting/review behavior are unchanged. No Assistant endpoint, provider,
credential, database migration or server runtime is added.

Draft generation is a labeled local template demonstration. An INITIAL opens an
unsaved buffer in the existing editor; normal Save remains its persistence path.
Explicit follow-on handoff uses the existing guarded followup command and waits
for its response. Chat generation, comparisons and previews do not submit,
approve, release, transmit, close reporting or move submission deadlines.

Status: resource CRUD and CASREP prototype workflow integrated.

## Purpose and runtime

The Go API owns persisted state for the HTML client. All five original resource
collections, filters, CRUD endpoints, CORS behavior, and pagination remain
available. Go 1.22+ runs the service without third-party Go modules. Node.js 20+
runs the shared CASREP rules; no npm packages are required. The static HTML demo
continues to work independently with browser storage.

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
assets, 5 work orders, and 5 requisitions. Regenerate it; do not hand-edit it.
The server seeds only when the mutable database is absent. Regeneration never
migrates or replaces existing runtime data. Legacy reports without submission
evidence need explicit date entry.

Writes use a temporary JSON file and rename. The store rolls back its in-memory
snapshot on persistence failure, including related material reporting changes.
This is single-process persistence, without multi-instance locking or a database
transaction manager.

## Deployment topology

The hosted topology from main remains a Fly.io API plus a GitHub Pages frontend.
`backend/Dockerfile` packages the Go binary, Node runtime, shared CASREP helper,
seed, and matching static model file. `backend/fly.toml` retains its `/data` volume,
256 MB machine, health check, and port 8080. The rules runner limits child-process
concurrency to one to bound memory on that machine.

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
available after errors. Backend case data refreshes every minute and on focus;
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

Run the documentation sync gate, JS model/API tests, `go test ./...`, and
`go vet ./...` as described in `HANDOFF.md`. CI checks spec, handoff, and ADR
updates against the merge base. Existing CRUD and server pagination contracts
must continue to pass when adding CASREP behavior.

## Command administration

`command-settings` is additive CRUD, persisted as `commandSettings`, initialized
empty for existing databases. A singleton named `ship-schedule` stores `text`.
The frontend applies it to active drafts with revision-checked saves and flags
other active reports for updates without rewriting their locked traffic.
Failures are listed for explicit retry; application is per report.

`set-route` is a revision-checked action for draft originators. Payload `chain`
contains 1–20 distinct `{id,label,name}` steps ending with CO. Submission
snapshots these reviewers; approvals follow their saved order. The five-role
default remains for unconfigured records. Health advertises `command-admin-v1`.

The frontend presents Admin in the left navigation. Homepage category registers
paginate six records each (18 across CAT 2/3/4); total counts retain all matches.
Editor controls and fields use 12pt text. Find/Outline and Update rules UI are
removed; reporting calculations and existing API contracts are unchanged.


Messages saved through the shared rules wrap physical lines at 69 characters. A leading-space continuation after a full line is unfolded for parsing; field offsets map back to physical text for review anchors. Draft edits/save and message export/printing use this formatter. Existing locked snapshots remain unchanged. Health adds casrep-line-wrap-v1, required by Pages.
