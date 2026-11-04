# Backend specification

Status: initial implementation

## Purpose

Expose the records represented by the HTML prototype as a small HTTP API. The
backend owns persisted CRUD state; the browser prototype remains a separate
client until it is explicitly migrated to this API.

## Resource model

| Resource | Collection key | Required create fields | References |
| --- | --- | --- | --- |
| CASREP case | `cases` | `title` | `assetId` is optional |
| Equipment asset | `assets` | `name` | none |
| Work order | `work-orders` | `title`, `assetId` | `assetId` → asset; optional `casrepId` → case |
| W requisition | `requisitions` | `part`, `assetId` | `assetId` → asset; optional `casrepId` → case |
| PLAD template | `plad-templates` | `name`, `recipients` | none |

Existing prototype fields are preserved rather than reduced to a new schema.
New records receive server-generated IDs and timestamps. Case revisions start at
1 and increment on updates.

## HTTP contract

Base path: `/api/v1`.

For every resource:

- `GET /{resource}` returns `{data: [...], meta: {total, limit, offset}}`.
- `POST /{resource}` creates a record and returns HTTP 201.
- `GET /{resource}/{id}` returns one record.
- `PATCH` and `PUT /{resource}/{id}` merge fields and return the updated record.
- `DELETE /{resource}/{id}` returns HTTP 204.
- Missing IDs return 404; invalid fields or references return 422.
- Collection filters include `search`, `profile`, `stage`, `status`, `caseStatus`,
  `assetId`, `nextUpdateBefore`, `nextUpdateAfter`, and `hasNextUpdate`.
- `sort` supports stable ordering by `nextUpdateAt`, `discoveredAt`,
  `updatedAt`, `createdAt`, `title`, or `id`; `order=desc` reverses it.
- Case writes accept `If-Match: "<revision>"` or `expectedRevision`; stale writes
  return 409 without changing the record.
- Errors have the shape `{error: {message: string}}`.

`GET /health` returns a basic service status. `GET /` serves the existing HTML
workspace.

## Frontend integration slice

When served by the Go process, the page probes `/api/v1/health` and loads all
five resource collections through the same-origin API client. The overview
fetches upcoming reports in pages of 10, ordered by `nextUpdateAt`, and exposes
previous/next controls. A separately served frontend can set the API base with
`?api=http://HOST:8080/api/v1` (or
`window.CASREP_API_BASE`) and uses the backend's CORS support. Dashboard,
registry, equipment, logistics, PLAD, and analysis reads use the backend
snapshot. Work-order and requisition CRUD/status changes, plus PLAD saves, are
sent to the backend and update the in-page snapshot after success.

The page falls back to its existing local browser store when opened from a
static server without the API. CASREP document edits, review comments,
observations, and release/transmission workflow actions intentionally remain
local-only/blocked in this first slice; they require dedicated server workflow
endpoints before being connected.

## Deployment topology

The intended hosted topology is a Fly.io backend plus a GitHub Pages frontend.
`backend/Dockerfile` packages the API and seed data; `backend/fly.toml` mounts
`/data` for the mutable JSON store and exposes `/api/v1/health`. The Pages
workflow builds a static `_site` and inlines the `CASREP_API_BASE` repository
variable into the generated index so a separately cached config file cannot
leave the frontend on an empty API base. The backend must allow the Pages origin
via CORS; wildcard CORS is currently suitable only for this fictional demo.

## Persistence and extraction

`backend/data/seed.json` is generated from the model scripts embedded in
`index.html` by `backend/scripts/extract-demo-data.cjs`. It currently extracts
186 cases, 95 assets, 5 work orders, 5 requisitions, and 3 PLAD templates. Do
not hand-edit the seed when changing prototype demo data; regenerate it.

The server copies seed data to its mutable JSON database on first start and
writes changes atomically. This persistence choice is for local development and
single-process use. Authentication, authorization, audit history, database
transactions, and multi-instance locking are out of scope for this version.

## Completion checks

The repository documentation gate requires backend/application changes to update
this spec, `backend/HANDOFF.md`, and an ADR. CI runs that gate against the merge
base; local work can run it from the repository root:

```sh
node backend/scripts/check-doc-sync.cjs
```

From `backend/`:

```sh
gofmt -w cmd/server/main.go internal/store/*.go
go test ./...
node scripts/extract-demo-data.cjs
```

A backend change is complete when those checks pass and the CRUD contract above
remains true.
