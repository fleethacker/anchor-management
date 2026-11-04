# Deploy the API to Fly.io and the frontend to GitHub Pages

Status: accepted

The Go backend is packaged as a Fly.io service with a mounted volume for its
JSON database, while the static HTML frontend is published through GitHub Pages.
The frontend receives the Fly API URL through the `CASREP_API_BASE` GitHub
repository variable and calls the backend with CORS enabled. This keeps static
frontend delivery independent from API process restarts while preserving a
simple deployment path for the current prototype.

The Fly volume is required because the file-backed store is otherwise
ephemeral. This topology is a demonstration deployment, not a production
identity, authorization, audit, or high-availability design.
