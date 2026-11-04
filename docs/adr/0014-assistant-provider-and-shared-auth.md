# Add an optional backend Assistant provider with a shared prototype session

Status: accepted

## Context

The full-page `#assistant` portal is currently a local demonstration. Future
model access must keep provider credentials out of the GitHub Pages browser,
work when an airgapped installation has no model, and preserve the existing
read-only Assistant and explicit unsaved CASREP handoff. The existing backend
has no identity system, so enabling a provider without a minimum session gate
would create a public model/spend proxy.

## Decision

Add an additive backend Assistant interface with three provider states:

- `none` for local-only operation;
- an in-environment OpenAI-compatible endpoint for airgapped deployments;
- OpenAI Responses API access only when a deployment explicitly configures
  egress, `OPENAI_API_KEY`, and a server-selected model.

The full-page Assistant uses a backend response endpoint for model-assisted chat
and draft proposals. The backend resolves bounded case IDs from its own store,
packages server-owned skill files, treats records and user text as untrusted
evidence, requests strict structured output, validates source IDs and fields,
and never exposes workflow tools or persists model output. The browser keeps the
existing deterministic local path and unsaved writer handoff when the model is
absent or unavailable.

When model access is configured, require a prototype single shared login. The
backend issues an expiring opaque `HttpOnly` session cookie and a CSRF token;
credentialed cross-origin calls require explicit allowed origins. This login is
one shared principal, not individual identity, authorization, or audit proof.
Existing CRUD/workflow routes remain outside this first Assistant gate and are
still documented as trusted prototype/admin paths.

## Consequences

- Airgapped deployments can run without external egress or a model; local
  analysis remains available and is labeled as local-only.
- An internal model can use an OpenAI-compatible HTTP interface without adding
  a Go SDK or third-party module.
- OpenAI credentials remain server-side, but provider enablement still requires
  deployment secret management, rate limiting, quotas, and explicit data policy
  before production use.
- A shared login prevents anonymous provider use but cannot identify people,
  enforce command/profile permissions, or provide individual attribution.
- Provider calls are outside the store write lock and are non-persistent at the
  provider request layer. Timeouts, response limits, schema validation, and
  cancellation remain required operational controls.
- The skills are policy inputs, not a security boundary. Code-level output
  validation, source scoping, action isolation, and human handoff guards remain
  authoritative.
