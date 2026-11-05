#!/usr/bin/env bash
set -euo pipefail

# Deploy the demo-only staging app. Create the Fly app and volume once using
# docs/FLY-STAGING-RUNBOOK.md before running this script.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FLY_BIN="${FLY_BIN:-flyctl}"
APP="${FLY_STAGING_APP:-anchor-management-api-staging}"
CONFIG_SOURCE="$ROOT_DIR/backend/fly.staging.toml"
CONFIG_GENERATED="$ROOT_DIR/backend/.fly-staging.generated.toml"

command -v "$FLY_BIN" >/dev/null 2>&1 || {
  echo "Missing $FLY_BIN. Install Fly CLI and run fly auth login." >&2
  exit 1
}

cleanup() { rm -f "$CONFIG_GENERATED"; }
trap cleanup EXIT

sed "s/^app = \".*\"/app = \"$APP\"/" "$CONFIG_SOURCE" > "$CONFIG_GENERATED"

if ! "$FLY_BIN" status --app "$APP" >/dev/null 2>&1; then
  echo "Fly app '$APP' does not exist." >&2
  echo "Create it and its staging volume using docs/FLY-STAGING-RUNBOOK.md." >&2
  exit 1
fi

echo "Deploying demo-only staging app: $APP"
"$FLY_BIN" deploy "$ROOT_DIR" --config "$CONFIG_GENERATED" --remote-only

echo "Staging deployment complete: https://$APP.fly.dev"
