#!/usr/bin/env bash
set -euo pipefail

# Build/run the opt-in air-gapped Assistant locally on macOS.
# Override paths and settings with environment variables before invoking.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LLAMA_SOURCE_DIR="${LLAMA_SOURCE_DIR:-${TMPDIR:-/tmp}/llama.cpp}"
LLAMA_BUILD_DIR="${LLAMA_BUILD_DIR:-${TMPDIR:-/tmp}/llama-build}"
LOCAL_CACHE_DIR="${LOCAL_CACHE_DIR:-${HOME}/.local/share/anchor-management}"
MODEL_DIR="${MODEL_DIR:-${LOCAL_CACHE_DIR}/models}"
MODEL_FILE="${MODEL_FILE:-${MODEL_DIR}/smollm2-360m-instruct-q8_0.gguf}"
LLAMA_BINARY="${LLAMA_BINARY:-${LLAMA_BUILD_DIR}/bin/llama-server}"
BACKEND_BINARY="${BACKEND_BINARY:-${LOCAL_CACHE_DIR}/anchor-management}"
DATA_PATH="${DATA_PATH:-${TMPDIR:-/tmp}/anchor-management-local.json}"
ADDR="${ADDR:-127.0.0.1:4180}"
MODEL_URL="https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF/resolve/main/smollm2-360m-instruct-q8_0.gguf"
MODEL_SHA256="48ab3034d0dd401fbc721eb1df3217902fee7dab9078992d66431f09b7750201"

require_command() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    echo "Install prerequisites with: brew install go node cmake" >&2
    exit 1
  }
}

for command in cmake curl go git shasum; do
  require_command "$command"
done

mkdir -p "$MODEL_DIR" "$(dirname "$BACKEND_BINARY")"

if [[ ! -d "$LLAMA_SOURCE_DIR/.git" ]]; then
  echo "Cloning llama.cpp into $LLAMA_SOURCE_DIR"
  git clone --depth 1 https://github.com/ggml-org/llama.cpp.git "$LLAMA_SOURCE_DIR"
fi

echo "Building llama-server"
# The API never uses llama.cpp's embedded Web UI. Remove any partial UI tree
# from an earlier build before configuring UI support off; this avoids stale or
# truncated downloaded assets being processed by CMake.
rm -rf \
  "$LLAMA_BUILD_DIR/tools/ui/dist" \
  "$LLAMA_BUILD_DIR/tools/ui/ui-gzip" \
  "$LLAMA_BUILD_DIR/tools/ui/ui-src" \
  "$LLAMA_BUILD_DIR/tools/ui/.ui-stamp" \
  "$LLAMA_BUILD_DIR/tools/ui/.ui-embed.sha256"
cmake -S "$LLAMA_SOURCE_DIR" -B "$LLAMA_BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=Release \
  -DGGML_METAL=ON \
  -DLLAMA_BUILD_SERVER=ON \
  -DLLAMA_BUILD_UI=OFF \
  -DLLAMA_USE_PREBUILT_UI=OFF \
  -DLLAMA_UI_GZIP=OFF \
  -DLLAMA_BUILD_TESTS=OFF \
  -DLLAMA_BUILD_EXAMPLES=OFF >/dev/null
cmake --build "$LLAMA_BUILD_DIR" \
  --config Release \
  --target llama-server \
  -j"$(sysctl -n hw.ncpu 2>/dev/null || printf '2')"

if [[ ! -f "$MODEL_FILE" ]]; then
  echo "Downloading SmolLM2-360M-Instruct Q8 model"
  curl -L --fail --retry 3 --output "$MODEL_FILE" "$MODEL_URL"
fi

actual_sha256="$(shasum -a 256 "$MODEL_FILE" | awk '{print $1}')"
if [[ "$actual_sha256" != "$MODEL_SHA256" ]]; then
  echo "Model checksum mismatch" >&2
  echo "Expected: $MODEL_SHA256" >&2
  echo "Actual:   $actual_sha256" >&2
  echo "Remove the file and rerun: rm -f '$MODEL_FILE'" >&2
  exit 1
fi

if [[ ! -x "$LLAMA_BINARY" ]]; then
  echo "llama-server was not built at $LLAMA_BINARY" >&2
  exit 1
fi

echo "Building Anchor Management backend"
(
  cd "$ROOT_DIR/backend"
  go build -trimpath -o "$BACKEND_BINARY" ./cmd/server
)

echo "Starting Anchor Management at http://$ADDR/#assistant"
echo "Press Ctrl-C to stop the backend and local model."

cd "$ROOT_DIR/backend"
exec env \
  ASSISTANT_PROVIDER=local \
  ASSISTANT_MODEL="${ASSISTANT_MODEL:-smollm2-360m}" \
  ASSISTANT_LOCAL_BINARY="$LLAMA_BINARY" \
  ASSISTANT_LOCAL_MODEL_PATH="$MODEL_FILE" \
  ASSISTANT_LOCAL_CONTEXT_SIZE="${ASSISTANT_LOCAL_CONTEXT_SIZE:-4096}" \
  ASSISTANT_COOKIE_SECURE="${ASSISTANT_COOKIE_SECURE:-false}" \
  ASSISTANT_ALLOWED_ORIGINS="${ASSISTANT_ALLOWED_ORIGINS:-http://127.0.0.1:4180,http://localhost:4180}" \
  "$BACKEND_BINARY" \
    -addr "$ADDR" \
    -data "$DATA_PATH" \
    -seed data/seed.json \
    -static .. \
    -model-helper scripts/casrep-workflow.cjs
