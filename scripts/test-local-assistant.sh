#!/usr/bin/env bash
set -euo pipefail

# Run the isolated Assistant drafting browser slice on macOS or CI.
# This does not build or start llama-server; Playwright starts an isolated
# temporary backend using the repository's browser-test configuration.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

command -v node >/dev/null 2>&1 || {
  echo "Missing required command: node" >&2
  exit 1
}
command -v npx >/dev/null 2>&1 || {
  echo "Missing required command: npx" >&2
  exit 1
}

exec npx playwright test tests/e2e/assistant-draft-fields.spec.cjs "$@"
