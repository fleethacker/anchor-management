# Deploy the Fly backend from GitHub Actions

Status: accepted

A main-branch workflow deploys the backend with a repository-scoped
`FLY_API_TOKEN` and the checked-in `backend/fly.toml`. This removes the local
machine as a required deployment step and ensures the Fly image is built from
the same commit that triggers the frontend deployment. The Pages workflow
retries its backend capability check while this deployment rolls out, preventing
the two independent workflows from publishing a frontend against an older API.

The Fly app and persistent volume remain provisioned resources; the workflow
only updates the application image and configuration.
