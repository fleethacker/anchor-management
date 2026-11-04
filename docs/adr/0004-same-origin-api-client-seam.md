# Use a same-origin API client seam for the first frontend integration

Status: accepted

The first integration keeps the existing HTML workspace and adds a small
same-origin-by-default `fetch` adapter. When the page is served by the Go server
it loads cases, assets, work orders, requisitions, and PLAD templates from
`/api/v1`; a separately served page can provide an explicit API base. If no API
is available, it retains the prototype's local browser fallback. This
allows a safe vertical slice without rewriting the synchronous rendering model
or coupling the UI directly to HTTP details.

The initial remote write scope is material CRUD/status updates. CASREP document
workflow, review comments, observations, and release actions remain explicitly
unwired until their server invariants are implemented.
