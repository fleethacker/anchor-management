# Backend API

The Go server exposes the records in the prototype through a small JSON REST API.
It serves `index.html` as static content and persists mutations to a local JSON
file. The seed file is generated from the JavaScript data models; it is not a
second hand-maintained copy of the demo data.

## Run

```sh
node scripts/extract-demo-data.cjs
go run ./cmd/server
```

The UI is at <http://localhost:8080>. The mutable database defaults to
`data/anchor-management.json`; use another path when running tests or separate
environments.

To serve the frontend separately while using this backend, run a static server
from the repository root and open `http://localhost:4173/?api=http://localhost:8080/api/v1`.

Useful options:

```sh
go run ./cmd/server -addr :9090 -data /tmp/anchor-management.json
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
and `nextUpdateBefore`/`hasNextUpdate` filters.

Case updates increment `revision`. Send `If-Match: "3"` (or
`{"expectedRevision":3}`) to reject stale writes with HTTP `409 Conflict`.
The store writes through a temporary file and rename, so an interrupted write
does not replace the previous JSON database.

Example:

```sh
curl http://localhost:8080/api/v1/cases?profile=FLEET\&limit=2
curl -X PATCH http://localhost:8080/api/v1/work-orders/work-1 \
  -H 'Content-Type: application/json' \
  -d '{"status":"Complete"}'
```

## Fly.io backend / GitHub Pages frontend

The deployment files are `backend/Dockerfile`, `backend/fly.toml`, and
`.github/workflows/pages.yml`. The current Fly app is `https://anchor-management-api.fly.dev`. It needs a
volume named `anchor_management_data` mounted at `/data`; otherwise JSON
mutations disappear when the machine is replaced.

After authenticating with Fly and choosing an available app name:

```sh
fly auth login
fly apps create anchor-management-api
fly volumes create anchor_management_data --region iad --size 1 -a anchor-management-api
fly deploy . --config backend/fly.toml
```

Set the GitHub repository variable `CASREP_API_BASE` to the deployed URL, for
example `https://anchor-management-api.fly.dev/api/v1`. The Pages workflow
writes that value to `frontend-config.js`. The backend's CORS middleware allows
Pages to call the API; restrict the origin before production use.

This is intentionally a local/simple backend. It has no authentication,
authorization, audit service, official message transmission, or multi-instance
locking. Those boundaries must be added before operational use.
