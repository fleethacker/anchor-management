# Generate backend seed data from the prototype models

Status: accepted

The backend seed is extracted from the JavaScript model scripts in `index.html`
rather than manually re-entering the demo records in Go. This keeps the existing
prototype as the source of truth while the client/backend boundary is being
established and avoids silent drift between the page and API fixtures.

The extraction is a build-time step; the generated JSON is input data, not a
second place to edit the demo model.
