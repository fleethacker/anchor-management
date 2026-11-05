# Fly.io staging runbook

This creates a separate demo-only Fly app and volume for deployment verification.
It does not touch `anchor-management-api` or its production volume.

The staging deployment runs with `ASSISTANT_PROVIDER=none`. CASREP drafting,
confirmation, canonical composition, and writer handoff are deterministic and do
not require model weights. Model-backed investigation remains disabled until a
provider and resource plan are approved.

## Prerequisites

Install and authenticate Fly CLI, then confirm the target organization:

```sh
brew install flyctl
fly auth login
fly orgs list
```

Install repository dependencies and run the local gates first:

```sh
npm ci
./scripts/test-local-assistant.sh
(cd backend && go test ./... && go vet ./...)
node backend/scripts/check-doc-sync.cjs
```

Do not run browser write tests against a Fly app. The Playwright suite creates an
isolated temporary database locally.

## One-time staging setup

Choose globally unique app/volume names. Set them in the shell for the rest of
the session:

```sh
export FLY_ORG="your-fly-organization"
export FLY_STAGING_APP="anchor-management-api-staging"
export FLY_STAGING_REGION="iad"
```

Create the app:

```sh
fly apps create "$FLY_STAGING_APP" --org "$FLY_ORG"
```

Create its independent volume:

```sh
fly volumes create anchor_management_data_staging \
  --app "$FLY_STAGING_APP" \
  --region "$FLY_STAGING_REGION" \
  --size 1
```

Do not reuse `anchor_management_api`'s production volume.

## Deploy staging

The script verifies that the app exists, generates a temporary config with the
selected app name, and deploys from the repository root:

```sh
./scripts/deploy-fly-staging.sh
```

For a different app name:

```sh
FLY_STAGING_APP="$FLY_STAGING_APP" ./scripts/deploy-fly-staging.sh
```

Configure exact same-origin CORS for the staging UI. This is not a secret, but it
must not be wildcard CORS when credentialed Assistant requests are enabled:

```sh
fly secrets set \
  ASSISTANT_PROVIDER=none \
  ASSISTANT_COOKIE_SECURE=true \
  ASSISTANT_ALLOWED_ORIGINS="https://${FLY_STAGING_APP}.fly.dev" \
  --app "$FLY_STAGING_APP"
```

Redeploy after changing runtime secrets:

```sh
./scripts/deploy-fly-staging.sh
```

## Read-only verification

```sh
FLY_STAGING_APP="$FLY_STAGING_APP" ./scripts/verify-fly-staging.sh
```

Equivalent manual checks:

```sh
curl --fail "https://${FLY_STAGING_APP}.fly.dev/api/v1/health"
curl --fail "https://${FLY_STAGING_APP}.fly.dev/api/v1/health?check=casrep"
curl --fail "https://${FLY_STAGING_APP}.fly.dev/api/v1/assistant/capabilities"
```

Open the staging UI manually:

```sh
open "https://${FLY_STAGING_APP}.fly.dev/#assistant"
```

Verify the natural-language path with fictional data:

```text
I need to create a casrep for an auxiliary cooling pump no2. Category c3, the seal leakage was observed during local inspection and I have not determined the cause yet.
```

Confirm that the Assistant displays extracted facts before composing a draft,
that the draft opens in the writer, and that no existing demonstration record is
copied into the new report.

## Inspecting the deployment

```sh
fly status --app "$FLY_STAGING_APP"
fly checks list --app "$FLY_STAGING_APP"
fly logs --app "$FLY_STAGING_APP"
fly volumes list --app "$FLY_STAGING_APP"
```

The health check must remain green. The staging app should report provider
`none` and no available model.

## Production promotion checklist

Before deploying the same revision to production:

- [ ] Staging health and capability checks pass.
- [ ] Local unit, Go, and isolated Playwright gates pass.
- [ ] Browser artifacts are retained for any failures.
- [ ] Demo-only scope is confirmed; no operational data is loaded.
- [ ] Production API and Pages origins are recorded exactly.
- [ ] Production authentication/RBAC limitations are explicitly accepted.
- [ ] No local-model deployment is attempted on the current 256 MB Fly machine.
- [ ] The production volume is not reset or replaced.
- [ ] Backend deploy completes before Pages publication.

Production deployment uses the existing workflow on `main` or the manual command:

```sh
fly deploy . --config backend/fly.toml --remote-only
```

Then verify the production health endpoint and let the Pages workflow perform its
configured API readiness check. Do not run the browser suite against production.

## Rollback

If staging is unhealthy, inspect logs and revert the staging app to the previous
release before investigating further:

```sh
fly releases --app "$FLY_STAGING_APP"
# Check out the approved revision, then redeploy its source:
FLY_STAGING_APP="$FLY_STAGING_APP" ./scripts/deploy-fly-staging.sh
```

Use the exact previously approved image or release procedure; do not reset the
volume as a first response. The staging volume contains fictional data only, but
preserving it makes diagnosis easier.
