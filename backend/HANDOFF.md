# Backend handoff

This document is the operating checklist for the next agent. Keep it updated in
the same change as implementation work.

## Source of truth

- `index.html` contains the current prototype model and fictional records.
- `backend/scripts/extract-demo-data.cjs` converts those model records into
  `backend/data/seed.json`.
- `backend/SPEC.md` defines the API/resource contract.
- `docs/adr/` records architectural choices and their trade-offs.
- `CONTEXT.md` defines domain vocabulary; update it when a domain term changes.

Generated seed data is regenerated, not hand-edited. The mutable runtime file
`backend/data/anchor-management.json` is local state and is ignored by Git.

## Change protocol

1. Read `CONTEXT.md`, `backend/SPEC.md`, and the relevant ADR before editing.
2. Make the smallest implementation change.
3. Update `backend/SPEC.md` when resource fields, validation, endpoints,
   persistence behavior, or completion checks change.
4. Update this handoff when commands, source-of-truth paths, known limitations,
   implementation status, or next-agent instructions change.
5. Add or amend an ADR when the change chooses architecture, persistence,
   boundaries, or another decision that a future agent might reasonably revisit.
6. Update `CONTEXT.md` when the meaning or relationship of a domain term changes.
7. Run the documentation sync gate and all tests before declaring the work done.

The sync gate requires backend/application changes to update both the spec and
this handoff, and to include an ADR change. It checks changed paths, not whether
a paragraph is semantically complete, so reviewers must still read the docs.
The same check runs in `.github/workflows/backend.yml` against the PR/push merge
base. CI pins Ubuntu 24.04, uses Node-24-compatible action versions, and
disables Go caching because this standard-library module has no `go.sum`.

## Verification

From the repository root:

```sh
node backend/scripts/check-doc-sync.cjs
git diff --check
node tests/casrep-document.test.cjs
```

From `backend/`:

```sh
gofmt -w cmd/server/main.go internal/store/*.go
go test ./...
go vet ./...
node scripts/extract-demo-data.cjs
```

For a committed branch/PR, compare against its merge base:

```sh
DOC_SYNC_BASE=origin/main node backend/scripts/check-doc-sync.cjs
```

## Current status and boundaries

The first integration slice is complete: the Go-served page loads all resource
collections from the API, material/work-order/requisition/PLAD CRUD paths update
the backend, and the overview fetches upcoming reports 10 at a time with
previous/next controls. A separately served frontend can connect with
`?api=http://HOST:8080/api/v1`; otherwise a static server falls back to local
prototype mode.

The prototype's fictional model/fixture data is still embedded in `index.html`
for the local fallback and model tests. It has not been removed yet; backend
seed extraction prevents the API from depending on browser storage, but this is
still a known duplication to remove in a later migration slice.

CASREP document editing, review comments, observations, and release/transmission
workflow actions are not yet connected; the frontend reports those operations as
unavailable in backend mode. Add dedicated server workflow endpoints before
removing that guard.

The API is a dependency-free, single-process JSON-file backend. The current
Fly deployment is `https://anchor-management-api.fly.dev` with the
`anchor_management_data` volume. Fly setup is defined in `backend/fly.toml`.
GitHub Pages reads the Fly URL from the `CASREP_API_BASE` repository variable
through `.github/workflows/pages.yml`. The current CORS wildcard is for the
fictional demo only.

Authentication, authorization, audit history, official transmission, database
transactions, and multi-instance locking remain future work.
