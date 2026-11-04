# Pin the CI runner and avoid an empty Go dependency cache

Status: accepted

CI uses `ubuntu-24.04` instead of `ubuntu-latest` and Node-24-compatible major
versions of the official checkout, Go, and Node setup actions. The backend has
only the Go standard library and its `go.mod` lives under `backend/`, so Go
caching is disabled rather than asking the action to discover a root-level
`go.sum` that does not exist. This removes platform-migration noise and makes
workflow failures describe the repository rather than an empty cache lookup.
