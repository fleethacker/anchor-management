# Backend API

The Go server exposes the records in the prototype through a small JSON REST API.
It serves `index.html` as static content and persists mutations to a local JSON
file. The seed file is generated from the JavaScript data models; it is not a
second hand-maintained copy of the demo data.

## Run

From `backend/`, with Go 1.22+ and Node.js 24 LTS on PATH (no npm install):

```sh
go run ./cmd/server
```

The UI is at <http://localhost:8080>. The mutable database defaults to
`data/anchor-management.json`; use another path when running tests or separate
environments. API request bodies are limited to 4 MiB and the server applies
HTTP read/header/write/idle timeouts.

Regenerate fresh fixtures with `node scripts/extract-demo-data.cjs` when changing
the embedded model data. An existing runtime database is never replaced by this
command or server startup.

To serve the frontend separately while using this backend, run a static server
from the repository root, start the API with `-cors-origin http://localhost:4173`,
and open `http://localhost:4173/?api=http://localhost:8080/api/v1`.

Useful options:

```sh
go run ./cmd/server -addr :9090 -data /tmp/anchor-management.json
go run ./cmd/server -node /path/to/node -model-helper scripts/casrep-workflow.cjs -static ..
```

## Resources

- `cases`
- `assets`
- `work-orders`
- `requisitions`
- `plad-templates`

Every collection supports:

```text
GET    /api/v1/{resource}?search=&profile=&status=&caseStatus=&stage=&assetId=&nextUpdateBefore=&nextUpdateAfter=&hasNextUpdate=true&sort=&order=&limit=100&offset=0
POST   /api/v1/{resource}
GET    /api/v1/{resource}/{id}
PATCH  /api/v1/{resource}/{id}
PUT    /api/v1/{resource}/{id}
DELETE /api/v1/{resource}/{id}
```

Responses use `{ "data": ... }`. Collection responses also include
`meta.total`, `meta.limit`, and `meta.offset`. Errors use
`{ "error": { "message": "..." } }`.

Collection results are paginated with `limit` (maximum 500) and `offset`.
The overview's upcoming-report query uses `limit=10`, `sort=nextUpdateAt`,
and `nextUpdateBefore`/`hasNextUpdate` filters, with `reporting=calculated`.

Generic case updates increment `revision`. Send `If-Match: "3"` (or
`{"expectedRevision":3}`) to reject stale writes with HTTP `409 Conflict`.
The store writes through a temporary file and rename, so an interrupted write
does not replace the previous JSON database.
Failed persistence also restores the in-memory state.

## Assistant authentication and model endpoint

The full-page Assistant uses these additive endpoints:

```text
POST /api/v1/auth/login
GET  /api/v1/auth/session
POST /api/v1/auth/logout
GET  /api/v1/assistant/capabilities
POST /api/v1/assistant/responses
```

For network-backed or externally managed providers, set
`ASSISTANT_SHARED_PASSWORD` to enable the prototype's single shared account.
Login accepts `{"password":"..."}` over HTTPS and sets an expiring
`HttpOnly` session cookie plus a readable CSRF cookie. Logout and protected model
requests require `X-CSRF-Token`. The frontend origin must be listed in the
comma-separated `ASSISTANT_ALLOWED_ORIGINS`; credentialed Assistant requests are
not compatible with wildcard CORS. `ASSISTANT_COOKIE_SECURE` defaults to true
and `ASSISTANT_SESSION_TTL` defaults to eight hours. The supervised local
provider does not require the shared login because it is loopback-bound and has
no external model spend or egress.

`GET /assistant/capabilities` is a non-secret status endpoint and reports
`provider`, `modelConfigured`, `modelAvailable`, `authenticationRequired`, and
`authenticated`. `POST /assistant/responses` accepts a bounded request with
`mode` (`chat` or `draft`), task, question/notes, optional conversation, and
server-resolved `caseIds`. It returns strict structured Assistant data with
source IDs and coverage. It never persists a prompt or completion and has no
workflow action. It returns `401` when the configured provider requires a
session, `422` for invalid scope/input, and `503` when the model is not
configured, unavailable, or returns invalid output.

Provider configuration is server-only: `ASSISTANT_PROVIDER=none` (default),
`openai`, or `openai-compatible`/`local`; `ASSISTANT_MODEL` is required, and
`OPENAI_API_KEY` is required for the OpenAI provider. `ASSISTANT_MODEL_ENDPOINT`
selects an internally managed compatible endpoint.

For a supervised air-gapped model, set `ASSISTANT_PROVIDER=local`,
`ASSISTANT_MODEL`, `ASSISTANT_LOCAL_MODEL_PATH`, and optionally
`ASSISTANT_LOCAL_BINARY` (default `llama-server`). The backend starts the binary
with loopback binding, offline mode, one slot, no web UI, and a temporary API-key
file. Optional tuning variables are `ASSISTANT_LOCAL_PORT` (9931),
`ASSISTANT_LOCAL_CONTEXT_SIZE` (4096), `ASSISTANT_LOCAL_THREADS`,
`ASSISTANT_LOCAL_MAX_TOKENS` (1200), `ASSISTANT_LOCAL_STARTUP_TIMEOUT` (45s),
and `ASSISTANT_LOCAL_SHUTDOWN_TIMEOUT` (5s). The model path must be a local,
preverified file; the process never downloads a model. If the binary/model path
is not configured, `local` retains its externally managed endpoint behavior.

The initial benchmark uses a non-Chinese-origin SmolLM2-360M-Instruct Q8 GGUF.
Record and approve the runtime, model, tokenizer metadata, license, and
checksums before packaging. Model prompts include packaged
`backend/internal/assistant/skills/*.md` policy files and bounded evidence;
records and user text are treated as untrusted content. Local-process requests
also enforce a smaller prompt budget; broad corpus questions fall back to the
local deterministic Assistant instead of silently truncating evidence.

The shared login is one prototype principal, not user identity or RBAC, and is
not used for the supervised loopback local provider. The existing generic
resource and workflow routes remain a trusted prototype/admin surface and are
not protected by this Assistant login.

Example:

```sh
curl http://localhost:8080/api/v1/cases?profile=FLEET\&limit=2
curl -X PATCH http://localhost:8080/api/v1/work-orders/work-1 \
  -H 'Content-Type: application/json' \
  -d '{"status":"Complete"}'
```

## Fly.io backend / GitHub Pages frontend

The deployment files are `backend/Dockerfile`, `backend/fly.toml`,
`.github/workflows/fly-backend.yml`, and `.github/workflows/pages.yml`. The configured Fly app is
`https://anchor-management-api.fly.dev`, with the `anchor_management_data` volume
mounted at `/data`. The image includes Node and the shared CASREP helper as well
as the Go binary, fixtures, HTML, and frontend config. The volume retains mutable
data when the machine is replaced.

The deployment commands from main remain:

```sh
fly auth login
fly apps create anchor-management-api
fly volumes create anchor_management_data --region iad --size 1 -a anchor-management-api
fly deploy . --config backend/fly.toml
```

Use the create commands only for initial setup. Set the GitHub repository variable
`CASREP_API_BASE` to `https://anchor-management-api.fly.dev/api/v1` (or the chosen
API host). The Pages workflow inlines it into the generated index so separately
cached config cannot leave an empty API base. The local `frontend-config.js`
default remains same-origin. Set `CORS_ALLOWED_ORIGIN` to the exact frontend
origin (for example, `https://fleethacker.github.io`); an empty value disables
cross-origin permission. CORS is not authentication.

Set the `FLY_API_TOKEN` GitHub repository secret from
`fly tokens create deploy -a anchor-management-api`; the Fly workflow deploys
backend changes on `main`. Pages waits and retries while that deployment rolls
out. Manual `fly deploy` remains the recovery path. Before replacing the site,
the Pages workflow checks `GET /api/v1/health?check=casrep` on the configured API for
`casrep-workflow-v1` and `casrep-deadlines-v1` capabilities. The check runs the
packaged rules on an empty collection without reading or changing live records;
missing rules return 503. Ordinary `/health` remains a lightweight service check.
An older or unavailable API stops publication and leaves the current Pages site
in place. Deploy the Fly API, then rerun the **deploy frontend** workflow. Merging
code does not itself deploy Fly. With no API configured, static-demo publication
remains available.

## CASREP workflow commands

Create an editable draft with `POST /api/v1/cases/drafts` (201), normally passing
`traffic`, optional `assetId`, and `actorId: "originator"`. Then use
`POST /api/v1/cases/{id}/actions/{action}` (200). Each existing-case command needs
`expectedRevision` or `If-Match`. The client also sends `expectedStage`, the saved
`expectedDigest` for document actions, and `snapshotId` for the active review.
Stale guards return 409. Invalid workflow/fields return 422. Rule-runtime failures
return 503 and leave persisted state unchanged.

| Action | Additional body fields |
| --- | --- |
| `save` | editable fields / `traffic`, `actorId` |
| `submit` | `reviewerId: "originator"` |
| `return` | `reviewerId`, required `note` |
| `concur` | `reviewId`, matching `reviewerId` |
| `authorize` | `reviewerId: "demo-co"` |
| `transmit` | `dtg`, approved `recipients`, optional `note` |
| `deliver` | evidence `note`, optional `pendingRecipients` |
| `followup` | `type`: UPDATE, CORRECT, or CANCEL |
| `close` | `evidence`, actual `restoredAt` for CORRECT |
| `comment-add` | `reviewerId`, selected `start`/`end`, `text` |
| `comment-reply` | `reviewerId`, `commentId`, `text` |
| `comment-resolve` | `reviewerId`, `commentId` (toggles resolution) |
| `record-submission` | actual `submittedAt`, INITIAL/UPDATE `messageType`, optional `note` |
| `require-update` | `kind`, `detail` |
| `observation` | `kind`, actual `at`, `symptom`, `detail`, failure `evidence` |

Review IDs in order are `divo`, `department`, `cheng`, `xo`, `co`; simulated
reviewer IDs are `demo-` plus that ID. The originator is `originator`. Normal
submission/audit times come from the server. `record-submission` is explicit
legacy evidence entry and cannot backdate a new INITIAL. Only a material edit or
new follow-on changes the message revision; comments/approvals retain its digest.

The backend runs the shared pure document/reporting/workflow rules through Node.
It validates canonical traffic on submission, preserves review snapshots, guards
locked edits and role order, and serializes writes with existing CRUD. These are
simulated workflow rules, not authenticated permissions.

## Calculated due reports

```text
GET /api/v1/cases?reporting=calculated&caseStatus=Active&hasNextUpdate=true&includeRequired=true&sort=nextUpdateAt&order=asc&limit=10&offset=0
```

This read projects `nextUpdateAt` and a `reportingSchedule` containing status,
due/periodic/ETR times, the last submission, and outstanding changes. It applies
the documented submission-based policy before server filtering and pagination.
The existing `{data,meta}` envelope is unchanged. An optional `nextUpdateBefore`
sets the horizon; `includeRequired=true` also includes reportable changes beyond
it. Requests without `reporting=calculated` keep the original stored-field rules.
No calculated read rewrites stored `nextUpdateAt` values.

Requisition CRUD also records reporting consequences for linked active CASREPs.
Changes to part, status, ETA, quantity, NSN, JCN, or link are persisted together
with a deduplicated `materialChanges` notice and event. The next submitted
INITIAL/UPDATE acknowledges those notices. Message text and approval revisions
are not modified by material CRUD.

This is intentionally a prototype backend. It has no authenticated users,
tamper-resistant audit service, official transmission, background notifications,
or multi-instance locking. Generic resource CRUD remains a trusted prototype/admin
interface and can bypass workflow rules; it must be restricted before production.
Do not send operational, classified, personal, or other sensitive data.

### Ship schedule and routing administration

GET/POST/PATCH `/command-settings` uses standard CRUD. The singleton name is
`ship-schedule`, with `text`. Reuse its returned ID for edits.
POST `/cases/{id}/actions/set-route` accepts `expectedRevision`,
`actorId: originator`, and `chain: [{id,label,name}]`. Active Drafts only,
1–20 distinct IDs, CO last. Submitted snapshots retain their original chain.

CASREP deletion: `DELETE /api/v1/cases/{id}` returns 204 for untransmitted cases.
Transmitted / Delivery verified cases and any case with nonempty transmission
history (including follow-on drafts) return 422 without mutation. Linked assets,
work orders and requisitions are retained. The frontend confirms before deleting.


## Analysis settings and requisition revisions

`command-settings` contains independent singletons named `ship-schedule` and
`analysis-areas`. Analysis configuration stores custom `areas` (`id`, `name`),
`caseDepartments` and `assetDepartments` maps; the four built-in departments are
retained. POST creates one setting per name. PATCH/PUT for analysis-areas requires
`expectedRevision` (or If-Match); successful updates increment revision and stale
writes return 409. Invalid catalogs/assignments return 422. Requisition updates
also increment revision and accept the same optimistic guard. Deploy a backend
with casrep-command-tools-v1 before publishing the matching frontend.
