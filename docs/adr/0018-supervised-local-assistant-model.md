# Supervise a small local Assistant model through llama.cpp

Status: accepted

## Context

The Assistant provider in ADR 0014 is compatible with an OpenAI Responses API,
but an air-gapped deployment needs a model that does not depend on external
egress. Dow's deployment cannot use Chinese-origin models. The intended local
scope is deliberately narrow: answer bounded questions, read selected
backend-owned skill files, summarize selected evidence, and produce unsaved
short drafts. It is not an autonomous agent or a workflow authority.

Embedding a C++ inference library into the CGO-disabled Go binary would add
native binding, cross-compilation, memory-boundary, and upgrade complexity. A
small `llama-server` process can use the existing HTTP provider seam while still
being shipped inside the air-gapped deployment artifact.

## Decision

Add an opt-in `ASSISTANT_PROVIDER=local` mode that can supervise a local
`llama-server` child process when `ASSISTANT_LOCAL_MODEL_PATH` is configured.
The backend:

- starts the configured binary with a local model file and no model URL;
- binds it to `127.0.0.1` and uses one inference slot;
- enables offline mode and disables the web UI and agent mode;
- supplies a temporary 0600 API-key file and removes it at shutdown;
- waits for authenticated `/health` readiness before advertising the provider;
- does not require the shared Assistant login because the provider is
  loopback-bound and has no external model spend or egress;
- sends the existing strict structured Responses request through loopback;
- stops the child process when the API exits.

The first benchmark target is Hugging Face's non-Chinese-origin
`SmolLM2-360M-Instruct` Q8 GGUF. The model is a provider implementation detail,
not a source of authority. The backend selects the operation and skill file,
resolves evidence, limits context, validates source IDs and output schema, and
keeps all drafts unsaved until human review. CASREP creation uses the
user-collected facts and deterministic composer; model output cannot replace
those report fields. Generic task requests are not accepted as equipment or
narrative facts; the Assistant must collect the actual report details first.
New drafts use only user-supplied narrative facts; existing reports and example
forms are reference material and are never copied into a new report. No tools,
database access, filesystem access, or workflow commands are exposed to the
model.

The local process is not started unless both the local model path and provider
configuration are present. The configured executable path is trusted server
startup configuration and is never derived from request data. If startup fails,
the service remains unavailable and the deterministic local Assistant path
remains usable. An externally managed OpenAI-compatible local endpoint remains
supported when no local binary/model path is configured.

For the Fly deployment, the pinned llama.cpp server and the verified
SmolLM2-360M-Instruct Q8 GGUF are packaged in the Docker image. The Fly runtime
selects `ASSISTANT_PROVIDER=local`, uses the image paths, allocates 2 GB RAM and
two shared CPUs, uses a 4096-token context to bound model memory, and allows
60 seconds for model startup. The model artifact is
verified during the image build and is never downloaded at runtime.

The UDS package deploys that same image in both its upstream and local-image
flavors. Its chart fixes the local provider configuration to the image paths,
uses a 4096-token context and a 600-token output limit, requests and limits 1Gi
of memory, and delays liveness checks for 75 seconds. These values are
package-owned rather than Zarf values: callers must not select a model binary,
model path, or model endpoint. A release package must use an image published
from the same source revision.

## Consequences

- The same provider contract can be tested with a real local model without a
  Go inference binding or a new Go dependency.
- The deployment must package and verify the llama.cpp binary, model, tokenizer
  metadata, license, and checksums; runtime downloads are forbidden.
- The model's memory, cold-start latency, CPU throughput, and response quality
  must be measured on the Dow air-gapped target. The Fly deployment uses a 2 GB
  machine as the initial benchmark profile; larger memory is required if peak
  RSS or latency measurements exceed the available margin.
- Child-process failure is reported as model unavailability; it does not affect
  ordinary CRUD or the deterministic Assistant fallback.
- The model remains non-authoritative. Output validation, workflow guards,
  source scoping, and human review remain mandatory. Authentication remains
  required for network-backed providers; the supervised loopback provider is
  intentionally exempt from the shared prototype login.
- Local prompts use a smaller fixed context budget. Broad all-case questions
  are rejected for model use and retain the deterministic local fallback rather
  than silently truncating evidence.

## Inference acceptance and prompt correction

The running process and API health are insufficient acceptance criteria. A
Fly probe reproduced 422 on whole-workspace context while a focused request
succeeded. The UI hid the scope error behind "Model unavailable". Separately,
the 360M model often returned a case identifier or an unrelated field from the
dense JSON prompt despite valid transport and JSON syntax.

Retain the pinned model and existing resource allocation. Split trusted system
instructions from untrusted bounded evidence/request data, put the question
last, and explain the compact response fields. Real-model probes with all
selected structured fields then returned the reported condition with its source.
Enforce complete compact output validation and include instructions in the
prompt budget; scope rejection remains 422. Do not relax source or workflow guards.

Expose explicit single-CASREP scope, actionable failure details, a distinct model
response label and request ID. Saved chat scopes must not silently widen if a
record disappears. Single-case fallback uses recorded history without broader
aggregate counts. This remains a bounded structured-record question path, not
the full-corpus Analysis review defined by the CASREP analysis skill.

Require the read-only inference verifier in hardened-image CI and after Fly
deployment. It checks two responses, known-condition text, cited scope, request
identity, invalid input rejection, subsequent recovery and unchanged selected
case data; the hosted check also covers Pages-origin CORS. Browser tests remain
isolated and cover UI success/fallback/retry. Keep basic health independent so
optional inference failure does not remove the ordinary application from service.

## UDS development acceptance

The deployed package reproduced inference timeout while ordinary health passed:
Zarf values overrode the chart with a half-CPU limit, and redeploying the same
local image tag retained an old pod. Align Zarf defaults with the documented
500m CPU / 1Gi requests and 2 CPU / 1Gi limits, and fix model threads at two.
For the local flavor, always pull the rebuilt image and include Helm release
revision in the pod template so every development upgrade replaces the pod.
Retain normal versioned-image behavior for the upstream flavor.

Use `Recreate` deployment strategy for both flavors because the JSON store must
have only one writer. Accept brief upgrade downtime; preserve the PVC and its
records. Ship the read-only inference verifier in the runtime image and run it
after rollout in `uds run dev`, with a standalone `uds run verify-inference`
task. This gate checks actual model responses and recovery from blocked inputs.
Pod readiness alone is not sufficient. Storage permission failures require
inspection of the failing mount and process identity, not data resets or a
privileged startup process.

The existing Helm 4 deployment retained server-defaulted `rollingUpdate` under
server-side apply, including when the chart set it to null. Select client-side
apply for the application chart in both Zarf flavors and keep the explicit null
so the transition is performed by the package without a manual live patch.
Zarf documents this chart-level setting in its
[package schema](https://www.docs.zarf.dev/v0-87/schema/v1alpha1-package/).

## Short draft-request intake

A concrete request beginning "Draft a demo C2 CASREP for No. 2 chilled-water
pump" was rejected as a generic task because intake recognized only explicit
Category wording and equipment preceded by an article. Number abbreviations
also terminated equipment extraction, and the short-answer fallback could
overwrite an extracted identity with the entire request.

Extend deterministic intake to recognize category-before-CASREP phrasing,
article-free equipment and numbered identities, then present the following
observation for confirmation. Preserve original notes, guard extracted identity
from fallback overwrite, and keep bare task requests and missing-condition
requests incomplete. Confirmation, controlled-field verification, composition
and workflow boundaries remain unchanged; no model-generated facts are added.

## Consolidation with the source-built package

ADR 0023 supersedes the local/upstream flavor and fixed-tag rollout mechanisms.
The single package builds from the checkout, tags images by version and full
image ID, and verifies deployed HTML. Keep two model threads, client-side apply
with explicit `rollingUpdate: null`, and the bundled inference verifier after
that UI check in `uds run dev`. No Helm-revision rollout annotation is needed
with content-derived image tags. The existing PVC and single writer remain.
