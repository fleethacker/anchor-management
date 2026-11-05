# Supervise a small local Assistant model through llama.cpp

Status: proposed

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
- sends the existing strict structured Responses request through loopback;
- stops the child process when the API exits.

The first benchmark target is Hugging Face's non-Chinese-origin
`SmolLM2-360M-Instruct` Q8 GGUF. The model is a provider implementation detail,
not a source of authority. The backend selects the operation and skill file,
resolves evidence, limits context, validates source IDs and output schema, and
keeps all drafts unsaved until human review. No tools, database access,
filesystem access, or workflow commands are exposed to the model.

The local process is not started unless both the local model path and provider
configuration are present. If startup fails, the service remains unavailable and
the deterministic local Assistant path remains usable. An externally managed
OpenAI-compatible local endpoint remains supported when no local binary/model
path is configured.

## Consequences

- The same provider contract can be tested with a real local model without a
  Go inference binding or a new Go dependency.
- The deployment must package and verify the llama.cpp binary, model, tokenizer
  metadata, license, and checksums; runtime downloads are forbidden.
- The model's memory, cold-start latency, CPU throughput, and response quality
  must be measured on the Dow air-gapped target. The existing 256 MB Fly demo
  configuration cannot run the model.
- Child-process failure is reported as model unavailability; it does not affect
  ordinary CRUD or the deterministic Assistant fallback.
- The model remains non-authoritative. Authentication, output validation,
  workflow guards, source scoping, and human review remain mandatory.
- Local prompts use a smaller fixed context budget. Broad all-case questions
  are rejected for model use and retain the deterministic local fallback rather
  than silently truncating evidence.
