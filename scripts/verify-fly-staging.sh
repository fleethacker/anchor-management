#!/usr/bin/env bash
set -euo pipefail

# Read-only staging verification. Never run browser write tests against Fly.
BASE_URL="${FLY_STAGING_URL:-https://${FLY_STAGING_APP:-anchor-management-api-staging}.fly.dev}"
BASE_URL="${BASE_URL%/}"

command -v curl >/dev/null 2>&1 || { echo "Missing curl" >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Missing node" >&2; exit 1; }

health="$(curl --fail --silent --show-error "$BASE_URL/api/v1/health?check=casrep")"
capabilities="$(curl --fail --silent --show-error "$BASE_URL/api/v1/assistant/capabilities")"

printf '%s\n' "$health" | node -e '
const value = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
if (value.data?.status !== "ok") throw new Error("CASREP health check did not report ok");
if (!value.data.capabilities?.includes("casrep-workflow-v1")) throw new Error("workflow capability missing");
if (!value.data.capabilities?.includes("casrep-line-wrap-v1")) throw new Error("line-wrap capability missing");
console.log("PASS health: CASREP capabilities ready");
'

printf '%s\n' "$capabilities" | node -e '
const value = JSON.parse(require("node:fs").readFileSync(0, "utf8"));
const data = value.data || {};
if (data.provider !== "none") throw new Error(`unexpected staging provider: ${data.provider}`);
if (data.modelAvailable) throw new Error("staging unexpectedly reports a model");
console.log("PASS Assistant: deterministic provider-only staging mode");
'

echo "Read-only staging checks passed: $BASE_URL"
