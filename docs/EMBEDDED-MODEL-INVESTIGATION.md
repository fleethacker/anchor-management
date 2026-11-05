# Embedded air-gapped Assistant model investigation

**Date:** 2026-11-05  
**Branch:** `research/embedded-assistant-model`  
**Scope:** feasibility of complementing the backend Assistant proposed by
[PR #19](https://github.com/fleethacker/anchor-management/pull/19) with a small
locally packaged model for an air-gapped deployment.

## Executive recommendation

This is feasible, but the first implementation should be a **locally packaged
model service supervised by the Go backend**, not a model compiled into the Go
binary and not a model trained from the 186 demonstration cases.

Dow's deployment constraint changes the candidate set: **do not package or
operate a Chinese-origin model**. Qwen is therefore excluded from this design,
even though it was considered in the initial investigation. Model origin,
weights, tokenizer, quantization artifact, runtime, license, and transitive
build inputs must all be recorded and approved; a non-Chinese model is not by
itself a complete supply-chain approval.

Use the existing PR #19 provider seam:

```text
Go API/auth/context validator
        -> loopback OpenAI-compatible Responses API
        -> llama.cpp server
        -> pinned GGUF model
```

`llama.cpp` is MIT-licensed, has a C/C++ implementation with CPU and quantized
inference, and its official server documents OpenAI-compatible chat completions,
Responses, embeddings, and schema-constrained JSON routes. This matches PR #19's
server-side `OpenAIProvider` boundary without adding a Go SDK or exposing a
provider credential.

The model should be described as a **local model provider**, not as an
independent authority. Given the intended scope—answering bounded questions,
reading a selected skill file, and helping with narrowly defined drafts—a
sub-billion-parameter model is a reasonable target. Deterministic evidence
selection, source validation, CASREP field rules, workflow guards, and explicit
human review remain the correctness boundary. The model supplies bounded
language and fact proposals.

## What PR #19 requires

PR #19 already establishes most of the right seam:

- `POST /api/v1/assistant/responses` receives bounded Assistant requests.
- The backend resolves case IDs and related records rather than trusting a
  browser copy of records.
- Packaged skill files are embedded in the Go binary.
- User text and records are labelled untrusted evidence.
- Structured output, source IDs, categories, output lengths, and mode are
  validated server-side.
- Model output is not persisted and cannot call workflow commands.
- The provider is disabled by default and can target an in-environment
  OpenAI-compatible endpoint.
- The existing browser composer retains the unsaved draft and human handoff.

This means the local model can initially be added as a provider/deployment
option rather than as a new Assistant product. The main adapter compatibility
question is operational: PR #19 posts an OpenAI Responses request with
`text.format.type=json_schema`; the selected local server must be tested against
that exact request and response shape.

## Narrow task profile

The local provider should expose a small fixed operation set rather than a
general-purpose agent:

- **Answer:** answer one user question from explicitly selected evidence and
  cite the source IDs supplied by the backend.
- **Explain:** explain a field, workflow rule, or selected skill instruction in
  plain language.
- **Draft:** produce an unsaved, schema-constrained draft for a bounded form or
  message; the human remains responsible for review and submission.
- **Summarize:** compress a selected message or small evidence set without
  claiming that omitted records were reviewed.

The backend, not the model, should select the operation and skill file, retrieve
records, enforce token/record limits, validate citations, and reject unsupported
requests. The model should have no tools, workflow commands, database access,
file access, or ability to select arbitrary skills. This makes SmolLM2-360M a
reasonable first target and keeps a larger model from becoming an unnecessary
security dependency.

## Feasibility constraints

### Fly model deployment sizing

The previous `backend/fly.toml` profile allocated 256 MB, which was not enough
for the candidate model files below, before accounting for the Go API, Node
rules runtime, prompt context, KV cache, and llama.cpp process overhead. The
initial production profile now allocates 1 GB RAM and two shared CPUs for the
verified 360M Q8 model; peak RSS and latency must still be measured before
selecting a larger model or reducing the memory margin:

| Candidate | Published model facts | Practical implication |
| --- | --- | --- |
| Hugging Face SmolLM2-360M Instruct | Hugging Face; 360M parameters; Apache 2.0; official Hugging Face GGUF repository | Official Q8 GGUF observed at roughly 386 MB. Best fit for bounded Q&A, selected skill reading, and short drafts; benchmark JSON and abstention behavior. |
| Hugging Face SmolLM2 1.7B Instruct | Hugging Face; 1.7B parameters; Apache 2.0; official Hugging Face GGUF repository | Official Q4_K_M GGUF observed at roughly 1.06 GB. Upgrade path if the 360M model fails the evaluation set. |
| Allen Institute OLMo 2 1B Instruct | Allen Institute for AI; 1B parameters; Apache 2.0; official AllenAI GGUF repository | Official Q4_K_M GGUF observed at roughly 936 MB. Provenance/transparency comparison with more capacity. |
| IBM Granite 3.2 2B Instruct | IBM; 2B parameters; Apache 2.0; official IBM GGUF repository | Official Q4_K_M GGUF observed at roughly 1.55 GB. Reserve for cases where the smaller models cannot meet quality requirements. |
| Microsoft Phi-3.5-mini Instruct | Microsoft; 3.8B parameters; MIT; 128K context in the model card | Optional quality/reference candidate. The Q4 GGUF should be built or independently verified rather than blindly taking an unapproved third-party conversion. |

These file sizes are download sizes, not total runtime memory. The 360M Q8
profile should fit comfortably on the proposed target; larger profiles need
additional runtime memory for the KV cache and context. Measure peak RSS and
tokens/second on the air-gapped target CPU rather than sizing from file size
alone.

### The full case corpus cannot be sent to a tiny model

PR #19 permits up to 250 case IDs and a prompt up to 1.5 MB. That is a useful
transport bound but not a usable small-model context strategy. A 1B/2B model
will not reliably reason over 186 full records plus skills and conversation in a
small context window.

Before local inference, the backend should:

1. Compute deterministic scope, counts, departments, systems, equipment, parts,
   coverage gaps, and source identities.
2. Select only the evidence relevant to the question/task, with a hard token and
   record budget.
3. Load only the one or two skill files needed for the selected operation.
4. Include stable case ID, revision, and digest metadata for every included
   source.
5. Keep complete evidence available through the UI's source links rather than
   putting the entire corpus into the prompt.
6. Reject a request when the requested scope cannot be represented without
   silently truncating evidence.

For Initial drafting, use the existing deterministic composer to supply the
canonical structure and ask the model only for bounded narrative/fact proposals.
For investigation, start with a small source set and disclose omitted records,
missing narratives, and unavailable history. This is more important than model
size.

## Model choice

### Recommended first benchmark: SmolLM2-360M-Instruct Q8_0

SmolLM2-360M is sufficient to test the deliberately narrow role: answer a
question from a bounded evidence set, follow one selected skill file, summarize
or rewrite text, and produce a schema-constrained draft. Its official Q8 GGUF is
roughly 386 MB and the model is Apache 2.0. Q8 is preferable to aggressive
quantization for the first benchmark because the size reduction is not needed
here and instruction-following quality matters more than saving a few hundred
megabytes.

Do not use it as a general investigator or autonomous agent. If it fails the
evaluation set, move to SmolLM2 1.7B or OLMo 2 1B before considering Granite.
Use llama.cpp grammar/schema constraints for syntactic JSON, then measure
semantic correctness, source citation, uncertainty, and abstention against a
repository-owned evaluation set.

### Upgrade candidates

- **SmolLM2 1.7B Instruct:** same vendor and Apache 2.0 license, with more
  capacity and an official GGUF repository. This is the natural next step if the
  360M model is too weak.
- **OLMo 2 1B Instruct:** Allen Institute for AI, Apache 2.0, and an official
  AllenAI GGUF repository. Use as a provenance/transparency comparison.
- **IBM Granite 3.2 2B Instruct:** IBM, Apache 2.0, and an official IBM GGUF
  repository. Reserve for tasks that genuinely need more reasoning capacity.
- **Phi-3.5-mini Instruct:** Microsoft, MIT, and documented as a 3.8B model with
  128K context. Use only if its license and internally reproducible artifact are
  approved.

No candidate is trusted merely because its developer is a recognized company or
non-Chinese. All candidates require the same adversarial evaluation and
artifact-provenance gate.

### Do not train from the current 186 fixtures

The demonstration records are fictional fixtures, not a sufficient domain corpus
or an authority source. Fine-tuning on them would risk teaching synthetic values,
controlled-field placeholders, and accidental workflow claims. It would also
make future fixture changes a model-release concern.

If a purpose-built model is later needed, first create an approved, de-identified,
versioned training/evaluation corpus containing:

- grounded question/answer pairs with complete source IDs;
- explicit unknown, unavailable, and conflicting-evidence answers;
- draft fact extraction that preserves uncertainty and never invents outcomes;
- negative prompt-injection examples from message text and pasted excerpts;
- malformed, stale, out-of-scope, and duplicate source cases;
- every report type and the department-first analysis contract.

A LoRA/adapter or prompt/template improvement should be evaluated against this
corpus before considering a new base model. The runtime must still validate model
output; fine-tuning is not an authorization mechanism.

## Packaging options

### Option A — recommended: supervised local process

Package a pinned `llama-server` binary and GGUF model in the air-gap artifact or
mount the model from a controlled read-only volume. Start it bound to
`127.0.0.1` with:

- no tools, MCP, file access, or web access;
- a local API key or Unix-socket boundary if supported by the deployment;
- fixed model, context, slots, and token limits;
- offline mode and no model download URL;
- a health/readiness check that does not expose the model publicly.

The Go backend owns the child process lifecycle or is configured with a loopback
endpoint. It should not hold the store write lock during inference. A supervised
child keeps the current `CGO_ENABLED=0` Go build possible and isolates the C++
runtime from the API process. It also makes model upgrades, crash recovery, and
resource limits explicit.

This is "embedded" in the deployed backend package while preserving a clean
provider seam. It is preferable to making the Go binary itself a cgo wrapper.

### Option B — cgo/libllama inside the Go server

llama.cpp exposes a C/C++ library, so a direct binding is possible. It would
require changing the static Go build, maintaining cgo bindings, building native
artifacts for every target architecture, and treating the inference library as
part of the API's crash and memory boundary. It removes one localhost hop but
increases supply-chain, cross-compilation, testing, and upgrade complexity.

This should be deferred unless process supervision or deployment policy makes a
single process mandatory.

### Option C — pure Go inference implementation

Not recommended for the first slice. It would require selecting and maintaining
an inference engine, tokenizer, quantization implementation, and model-format
compatibility layer. It does not improve grounding or safety and would be a much
larger project than the Assistant provider itself.

## Security and air-gap requirements

The local model reduces external data egress, but it does not make generated
answers trustworthy. The deployment must still:

- verify model, runtime, and skill-file checksums before installation;
- record model ID, quantization, runtime version, skill version, and evaluation
  corpus version in capability/diagnostic output;
- keep model files and skills read-only and owned by the service account;
- prevent runtime downloads and DNS/egress from the model process;
- bind the inference server to loopback or a private deployment network;
- retain PR #19 authentication, CSRF, origin, request-size, timeout, concurrency,
  and output-validation controls;
- keep imported CASREP text and user notes in an explicitly untrusted evidence
  section;
- disable llama.cpp tools, MCP, UI, and file-serving features;
- never log full prompts, records, model output, or secrets by default;
- test malformed JSON, invalid source citations, prompt injection, timeouts,
  cancellation, OOM/crash, and stale source revisions.

The model server should not be added to the public CORS surface. The Go API
should remain the only authenticated model-facing endpoint.

## Proposed proof of concept

1. Build or obtain a pinned llama.cpp server binary for the target CPU and record
   its source commit, license, artifact checksum, and SBOM.
2. Package SmolLM2-360M-Instruct Q8_0 as the first benchmark profile. Keep
   SmolLM2 1.7B, OLMo 2 1B, and Granite as upgrade profiles only if the small
   model fails evaluation. Add Microsoft Phi-3.5-mini only if its artifact is
   internally reproducible and approved. The production Docker image packages
   the pinned llama.cpp server and checksum-verified 360M Q8 artifact.
3. Run llama.cpp against the exact PR #19 Responses API request, including the
   JSON schema, and confirm the response parser accepts only the intended field.
4. Add a local provider integration test using an `httptest`-compatible fake and
   a separate real-model smoke test that is never required for ordinary unit CI.
5. Add deterministic retrieval/context budgeting before enabling 186-case
   history questions.
6. Create a fictional evaluation set covering chat, INITIAL, UPDATE, CORRECT,
   CANCEL, source citation, uncertainty, prompt injection, malformed output,
   and no-evidence cases.
7. Measure cold start, warm latency, tokens/second, peak RSS, disk footprint,
   concurrency, and behavior under the target air-gap machine's CPU/RAM limits.
8. Enable the local provider only behind an explicit capability/configuration
   flag. Preserve local-only behavior when the model is absent or unhealthy.

## Decision gates

The initial Fly profile is enabled for the approved 360M Q8 benchmark. Before
upgrading the model, increasing context, or reducing the memory margin, require:

- the target machine has at least the measured memory margin;
- the server is offline and loopback-bound;
- model/runtime/skill provenance is verified;
- structured output and source validation pass adversarial tests;
- the model never changes workflow state or canonical control fields;
- local-only fallback remains clear and functional;
- the evaluation set demonstrates acceptable groundedness and abstention;
- the deployment owner accepts the model/license/data policy.

## Primary sources

- PR #19, optional backend Assistant/provider/authentication design:
  <https://github.com/fleethacker/anchor-management/pull/19>
- Repository PR #19 research note:
  <https://github.com/fleethacker/anchor-management/blob/feat/assistant-authentication/OPENAI-INTEGRATION-RESEARCH.md>
- llama.cpp project README and license:
  <https://github.com/ggml-org/llama.cpp>
- llama.cpp server documentation, including Responses API and JSON schema:
  <https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md>
- IBM Granite 3.2 2B Instruct model card and license:
  <https://huggingface.co/ibm-granite/granite-3.2-2b-instruct>
- IBM Granite 3.2 2B official GGUF repository:
  <https://huggingface.co/ibm-research/granite-3.2-2b-instruct-GGUF>
- AllenAI OLMo 2 1B Instruct model card and license:
  <https://huggingface.co/allenai/OLMo-2-0425-1B-Instruct>
- AllenAI OLMo 2 1B official GGUF repository:
  <https://huggingface.co/allenai/OLMo-2-0425-1B-Instruct-GGUF>
- Hugging Face SmolLM2-360M Instruct model card and license:
  <https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct>
- Hugging Face SmolLM2-360M official GGUF repository:
  <https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct-GGUF>
- Hugging Face SmolLM2 1.7B Instruct model card and license:
  <https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct>
- Hugging Face SmolLM2 1.7B official GGUF repository:
  <https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF>
- Microsoft Phi-3.5-mini Instruct model card and license:
  <https://huggingface.co/microsoft/Phi-3.5-mini-instruct>
- Current repository deployment memory configuration:
  <https://github.com/fleethacker/anchor-management/blob/main/backend/fly.toml>
