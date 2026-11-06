# Verify local model inference

The Fly demo runs the packaged SmolLM2-360M-Instruct Q8 model through a
supervised `llama-server`. It runs on the Fly machine; no external model API or
runtime download is used. Draft creation still uses the deterministic local
composer. Model inference supports bounded questions about selected structured
CASREP records. It does not perform the complete historical Analysis review.

## Check the Fly demo

From the repository root with Node.js 24 LTS:

```sh
npm run verify:inference -- \
  --base-url https://anchor-management-api.fly.dev \
  --origin https://fleethacker.github.io \
  --case-id demo-rich-1008 \
  --expect-text "controller reset" \
  --wait-ms 90000
```

Expected: exit code 0 and a JSON report with `status: "PASS"`. Each of its two
responses must have a nonempty answer containing the expected condition, a
different request ID, `provider: "local-model"`, and citations restricted to
the selected case. The check also requires rejection of an unknown case and an
oversized prompt, successful inference after those rejections, valid browser
CORS, and the selected record remaining unchanged.

This command sends GETs and non-persistent Assistant POSTs only. It creates no
cases, changes no review state, and never resets the Fly volume. It briefly uses
the single model inference slot. A concurrent human edit can make the unchanged
record check fail; inspect the change before repeating. For a deliberately
edited fixture, select another known fictional case and its expected condition.

The result proves the inference path and this bounded condition regression.
It does not prove every answer is correct, complete, or safe for operational use.
The small model can paraphrase poorly or miss details; inspect its cited record.
Do not interpret valid JSON or a source ID as proof that every assertion follows
from that source.

## Verify through the UI

1. Open [the Fly Assistant](https://anchor-management-api.fly.dev/#assistant).
2. In **History scope**, choose **DEMO-26-1008**. Opening that CASREP first and
   launching Assistant also selects it automatically.
3. Send: **Summarize this fictional case in one sentence and cite its case ID.**
4. Confirm **Model connected · local-model**, a **MODEL RESPONSE** card mentioning
   the controller reset, a link to the selected case, and a request ID below it.
5. Inspect the source and compare its condition with the answer.

**Model ready** means the backend advertises an available model. It does not
mean inference has completed. **LOCAL COMPARISON** means deterministic browser
analysis. Creating a draft is also local-template behavior and does not test
inference. Chat history is saved on the device; historical response cards are
not evidence of a fresh inference after reload.

Whole-workspace prompts can exceed the 4096-token local context. The app
rejects oversized scope rather than silently selecting only some cases. On
**Model ready · narrow scope**, choose one CASREP, shorten the question, and
click **Retry response**. A single case with unusually large linked evidence can
still exceed the budget. Full-corpus model review needs a separate batching and
coverage workflow; this selector does not implement that review.

## Test an isolated local deployment

### UDS development

With Docker available and your kubeconfig pointing at an existing local UDS Core
cluster, run from the repository root:

```sh
uds run dev
```

This builds the image for the host architecture, creates the single Zarf package
and bundle, verifies the deployed UI checksum, then runs the real inference verifier inside
the deployed container. Success requires `status: "PASS"` and two model answers
mentioning the fictional controller reset; a healthy API alone does not pass.
Open **https://casrep-command.uds.dev/#assistant** and follow the UI steps above.
Node.js 24 LTS, UDS CLI and Docker Buildx are required on the host; the inference
check uses Node from the image.
`uds run default` creates the standard test cluster first when one is needed.

To repeat only the inference check without rebuilding or deploying:

```sh
uds run verify-inference
```

Each build uses a versioned tag containing the full image ID, so changed image
bytes replace the pod without relying on a mutable tag or Helm revision.
Upgrades stop the old pod first to preserve one writer to the JSON database,
so expect brief downtime. The PVC and existing records are retained.
The package defaults to 500m CPU / 1Gi requests, 2 CPU / 1Gi limits, and two model
threads. Zarf resource overrides still apply; reducing CPU can push inference
past its 30-second server timeout. The verifier assumes `demo-rich-1008` retains
its seeded condition; a deliberate edit can require a different fixture check.

Inspect failures without resetting data:

```sh
uds zarf tools kubectl get pods -n casrep-command
uds zarf tools kubectl logs -n casrep-command deployment/casrep-command --tail=100
uds zarf tools kubectl get events -n casrep-command --sort-by=.lastTimestamp
```

`create database temp file: open /data/...: permission denied` means the app
cannot create the temporary file required for atomic database replacement.
Check the failing container's mount and numeric ownership, including the
directory and existing database. The packaged pod runs as UID 100 with
`fsGroup: 100`; its data volume must support writes by that identity. An image's
directory ownership does not override a bind mount or PVC. Correct the storage
configuration for the failing runtime; do not reset or broadly chmod the data
directory to hide the error. The Docker example below uses writable temporary
storage, while UDS uses the persistent volume.

### Standalone container

For an already running local model backend:

```sh
npm run verify:inference -- \
  --base-url http://127.0.0.1:4180 --expect-text "controller reset"
```

To exercise the actual packaged runtime with temporary storage, build from the
repository root, then start a container:

```sh
docker build -f backend/Dockerfile -t anchor-management:inference .
docker run --rm --name anchor-inference \
  --read-only --cap-drop=ALL --security-opt=no-new-privileges:true \
  --memory=2g --cpus=2 \
  --tmpfs /data:rw,noexec,nosuid,size=64m,mode=1777 \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m,mode=1777 \
  -p 127.0.0.1:4180:8080 \
  -e ASSISTANT_PROVIDER=local \
  -e ASSISTANT_MODEL=smollm2-360m \
  -e ASSISTANT_LOCAL_BINARY=/opt/llama/bin/llama-server \
  -e ASSISTANT_LOCAL_MODEL_PATH=/models/smollm2-360m-instruct-q8_0.gguf \
  -e ASSISTANT_LOCAL_CONTEXT_SIZE=4096 \
  -e ASSISTANT_LOCAL_MAX_TOKENS=600 \
  -e ASSISTANT_LOCAL_THREADS=2 \
  -e ASSISTANT_LOCAL_STARTUP_TIMEOUT=60s \
  anchor-management:inference
```

Run the verifier in another terminal with `--wait-ms 90000`. Stop the container
with Ctrl-C when finished. `/data` is an isolated temporary database; `/tmp`
holds the ephemeral model API-key file. Neither uses the Fly volume. The build
downloads and checksum-verifies the pinned model; container startup is offline.

## Regression gates

```sh
node --test backend/scripts/verify-inference.test.cjs
npm run test:unit
node --test tests/casrep-department-ui.test.cjs
(cd backend && go test ./... && go vet ./...)
CHROME_EXECUTABLE=/usr/bin/chromium npm run test:e2e
node backend/scripts/check-doc-sync.cjs
```

Use the installed Playwright Chromium by omitting `CHROME_EXECUTABLE` where
appropriate. Browser tests use temporary databases and mocked model responses;
the separate real-model verifier is necessary. Preserve `test-results/` and
`playwright-report/` after failures. The security workflow builds the image and
runs real inference in its hardened isolated runtime. The Fly deployment
workflow runs the hosted read-only check after rollout; a failure fails the
workflow but does not roll back the deployment automatically.

## Diagnose failures

```sh
fly status --config backend/fly.toml
fly logs --config backend/fly.toml --no-tail
curl --fail --silent --show-error \
  https://anchor-management-api.fly.dev/api/v1/assistant/capabilities
```

| Signal | Meaning / next check |
| --- | --- |
| `/health` succeeds, model unavailable | API runs but model failed startup or exited. Inspect `disabling local Assistant model`, model path, memory and startup logs. |
| HTTP 422, scope too large | Narrow case selection or shorten input; model readiness is unaffected. |
| HTTP 422, case unavailable | Selected ID is absent from that deployment; choose an existing fictional case. |
| HTTP 503 on responses | Inspect `Assistant response failed` in Fly logs: provider HTTP failure, timeout, invalid JSON, invalid source or empty answer. |
| Ready but UI shows local-only result | Confirm history task, selected scope, a fresh POST to `/assistant/responses`, and its status in browser Network tools. Draft composition does not invoke the model. |
| CORS/preflight failure | Check `ASSISTANT_ALLOWED_ORIGINS` against the frontend's exact origin. The verifier checks `https://fleethacker.github.io`. |
| Known-condition assertion fails | Inspect answer and source. Transport worked, but the model failed the requested regression; do not call verification successful. |

Basic Fly health remains independent of inference so model failure does not take
the CASREP application offline. Fly allocates 2 GB and two shared CPUs, with
4096 context tokens, 600 output tokens, two model threads and a 60-second startup
allowance. Inference latency varies with CPU contention. The provider's request
timeout is 30 seconds; increasing client wait time does not remove that bound.

The pinned [llama.cpp server documentation](https://github.com/ggml-org/llama.cpp/blob/e30ad80fd7fa09a858bf8b8f4118e6479809486e/tools/server/README.md)
describes its Responses route, schema-constrained JSON and runtime settings.
