#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${1:?Usage: scan-image.sh IMAGE [REPORT_DIRECTORY]}"
REPORT_DIR="${2:-$ROOT/.build/image-security}"
mkdir -p "$REPORT_DIR"
# Resolve mutable tags once; both scanners and the SBOM examine identical bytes.
IMAGE_ID="$(docker image inspect --format '{{.Id}}' "$IMAGE")"
docker image inspect "$IMAGE_ID" > "$REPORT_DIR/image.json"
trivy --version > "$REPORT_DIR/trivy-version.txt"
grype version > "$REPORT_DIR/grype-version.txt"

status=0
trivy image --image-src docker --ignorefile /dev/null \
  --scanners vuln,misconfig,secret --severity UNKNOWN,LOW,MEDIUM,HIGH,CRITICAL \
  --ignore-unfixed=false --exit-code 1 --format json --output "$REPORT_DIR/trivy.json" \
  "$IMAGE_ID" || status=1
grype "docker:$IMAGE_ID" --config "$ROOT/scripts/grype.yaml" --only-fixed=false --fail-on negligible \
  --output json --file "$REPORT_DIR/grype.json" || status=1
# Preserve an inventory even when the vulnerability gate fails.
trivy image --image-src docker --format cyclonedx --output "$REPORT_DIR/sbom.cdx.json" \
  "$IMAGE_ID" || status=1
node "$ROOT/scripts/check-image-scans.cjs" "$REPORT_DIR" || status=1
printf 'Image scan evidence: %s\n' "$REPORT_DIR"
exit "$status"
