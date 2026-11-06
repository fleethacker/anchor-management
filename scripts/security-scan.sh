#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

IMAGE="${SECURITY_IMAGE:-anchor-management:security}"
OPENGREP_VERSION="v1.33.1"
GOTOOLCHAIN_VERSION="${GOTOOLCHAIN:-go1.24.13}"
CACHE_ROOT="${XDG_CACHE_HOME:-$HOME/.cache}/anchor-management-security"

case "$(uname -s):$(uname -m)" in
  Linux:x86_64|Linux:amd64)
    OPENGREP_ASSET="opengrep_manylinux_x86"
    OPENGREP_SHA256="46e8133cc490f9f50518061590ce2f6be5a08afaeda034471c0ceda4b3899808" ;;
  Linux:aarch64|Linux:arm64)
    OPENGREP_ASSET="opengrep_manylinux_aarch64"
    OPENGREP_SHA256="d1433f63a90b8bc0b6ad4b498a13b372b856ce9a754a43484ba4920fe2d76dcf" ;;
  Darwin:x86_64|Darwin:amd64)
    OPENGREP_ASSET="opengrep_osx_x86"
    OPENGREP_SHA256="c3bd18e0d898d44e28419d95dad57c8928bb46ab32889a0ee1f72a87ad9627af" ;;
  Darwin:arm64|Darwin:aarch64)
    OPENGREP_ASSET="opengrep_osx_arm64"
    OPENGREP_SHA256="a17c1881bb40e3214266a7a291cf4f2ae3bc56c1715628b5712d2ec816bc3e2d" ;;
  *)
    echo "Unsupported OpenGrep platform: $(uname -s) $(uname -m)" >&2
    exit 1 ;;
esac

OPENGREP="$CACHE_ROOT/${OPENGREP_ASSET}-${OPENGREP_VERSION}"
GOBIN="$CACHE_ROOT/go-bin"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

for command in gitleaks npm trivy grype docker curl go; do
  need "$command"
done
if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then
  echo "Missing required command: sha256sum or shasum" >&2
  exit 1
fi

mkdir -p "$CACHE_ROOT" "$GOBIN"

check_sha256() {
  local expected="$1" file="$2"
  if command -v sha256sum >/dev/null 2>&1; then
    echo "$expected  $file" | sha256sum --check
  else
    echo "$expected  $file" | shasum -a 256 --check
  fi
}

printf '\n== Gitleaks ==\n'
gitleaks detect --source . --redact --no-banner

printf '\n== npm audit ==\n'
npm audit --audit-level=high

printf '\n== Trivy filesystem ==\n'
trivy fs --scanners vuln,misconfig,secret --severity HIGH,CRITICAL --exit-code 1 .

if [[ ! -x "$OPENGREP" ]]; then
  temporary="$OPENGREP.$$"
  trap 'rm -f "$temporary"' EXIT
  curl --fail --silent --show-error --location \
    "https://github.com/opengrep/opengrep/releases/download/${OPENGREP_VERSION}/${OPENGREP_ASSET}" \
    --output "$temporary"
  check_sha256 "$OPENGREP_SHA256" "$temporary"
  chmod 0555 "$temporary"
  mv "$temporary" "$OPENGREP"
  trap - EXIT
fi
check_sha256 "$OPENGREP_SHA256" "$OPENGREP"

printf '\n== OpenGrep ==\n'
"$OPENGREP" --config auto --max-target-bytes 0 --error .

if [[ ! -x "$GOBIN/gosec" ]]; then
  printf '\n== Installing Gosec ==\n'
  GOTOOLCHAIN="$GOTOOLCHAIN_VERSION" GOBIN="$GOBIN" \
    go install github.com/securego/gosec/v2/cmd/gosec@v2.22.8
fi

printf '\n== Gosec ==\n'
(
  cd backend
  GOTOOLCHAIN="$GOTOOLCHAIN_VERSION" "$GOBIN/gosec" \
    -severity medium -confidence high ./...
)

printf '\n== Container build ==\n'
docker build --pull -f backend/Dockerfile -t "$IMAGE" .

printf '\n== Hardened container runtime ==\n'
test "$(docker inspect --format '{{.Config.User}}' "$IMAGE")" = app
runtime_id="$(docker run --detach --rm \
  --read-only \
  --cap-drop=ALL \
  --security-opt=no-new-privileges:true \
  --tmpfs /data:rw,noexec,nosuid,size=16m,mode=1777 \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m,mode=1777 \
  --publish-all \
  "$IMAGE")"
cleanup_runtime() { docker stop "$runtime_id" >/dev/null 2>&1 || true; }
trap cleanup_runtime EXIT
runtime_port="$(docker port "$runtime_id" 8080/tcp | sed -n '1s/.*:\([0-9][0-9]*\)$/\1/p')"
for ((attempt=1; attempt<=30; attempt++)); do
  if curl --fail --silent "http://127.0.0.1:${runtime_port}/api/v1/health" >/dev/null; then
    break
  fi
  sleep 1
done
curl --fail --silent "http://127.0.0.1:${runtime_port}/api/v1/health" >/dev/null
cleanup_runtime
trap - EXIT

printf '\n== Zero-findings image gate ==\n'
bash scripts/scan-image.sh "$IMAGE"

printf '\nSecurity scans passed. CodeQL remains available through GitHub Actions.\n'
