# OpenAI API integration investigation

**Status:** implementation in progress on `feat/assistant-authentication`; no live provider credentials are configured.

## Executive finding

The first slice should be the existing `#assistant` page only. It can add a
model-backed conversation without putting credentials in the browser or
changing CASREP workflow persistence. The existing Assistant is explicitly a
local, disconnected preview. The backend is the right integration seam, but
the current hosted backend is unauthenticated and has wildcard CORS. Enabling a
server-side API key on the public Fly app before adding identity,
authorization, quotas, and abuse controls would expose a spendable proxy.

The integration must be **model-optional**. The Assistant page should work in
three explicit states:

1. **Local-only:** deterministic page analysis and template demonstration remain
   available with no model or network call.
2. **Local model:** the backend calls an allowlisted in-environment,
   OpenAI-compatible endpoint when an airgapped model is installed.
3. **OpenAI provider:** only a deployment that explicitly permits egress and
   supplies the secret may enable the OpenAI adapter. It is disabled by default
   in an airgapped deployment.

A missing model is a normal capability state, not an application failure and
never a reason to expose a key to the browser. The UI must label which state
produced each answer. A safe first increment is a non-streaming, stateless
Assistant endpoint for bounded chat and draft proposals. It should return
narrative/fact proposals, not canonical message control fields or workflow
commands. The existing browser composer can continue to build the canonical
traffic and the user must open, review, and save the draft explicitly.

## Current seams

- `index.html` owns the Assistant UI, local conversation state, context
  aggregation, draft composer, canonical document model, and handoff guards.
- `docs/CASREP-Assistant-Instructions.md` is the behavioral reference. It
  requires grounded answers, inspectable source records, explicit uncertainty,
  no invented facts, and human-controlled handoff.
- `backend/cmd/server/main.go` owns the HTTP router and currently has no
  Assistant route.
- `backend/internal/store` owns the file-backed database and returns cloned
  snapshots. It has no chat persistence or provider client.
- `backend` deliberately has no third-party Go modules. A provider client can
  be implemented with Go's standard `net/http` and `encoding/json`, avoiding a
  dependency and preserving the current container build.
- The backend has no authentication, user identity, rate limiting, or durable
  audit service. Its CORS wildcard is documented as a fictional-demo boundary.
- The current Assistant controller already has async seams for
  `composeDraft`, `onTask`, and page context. The draft path expects a proposal
  that is checked against the current source/revision/schedule before opening
  an unsaved writer buffer.

## `#assistant` scope

The first implementation should not touch the editor, review route, reporting
clock, or other Assistant entry points. It should replace or augment only the
full-page portal opened by `#assistant`:

- Keep the current welcome/task choices and conversation UX.
- Keep `history` investigations read-only and source-linked.
- Keep Initial/Update/Correct/Cancel handoff behind the existing unsaved writer
  buffer and explicit `Open in New CASREP` action.
- Keep the current local implementation as the no-model path.
- Do not add model calls to the small overlay Assistant or editor writing help
  until the page contract is proven.

The browser can call one backend capability for the page, but it must not send
an API key, choose a provider, choose a system prompt, or claim that the model
searched records that the server did not resolve.

## Skill files and hard guardrails

Use a versioned application skill bundle for the model prompt, separate from
Pi's agent skills. The current `docs/CASREP-Assistant-Instructions.md` is the
behavioral source and can be refactored into a page skill with two disclosed
references:

- `drafting`: gather facts and return narrative/fact proposals only.
- `investigation`: answer from bounded records with claim-to-source links.

The backend selects the skill by a fixed `mode`/`task` enum. The user and model
cannot name a file, load a new skill, or replace the instruction layer. Package
the approved skill files with the backend (ideally embedded or checksum
verified) and include a skill version/hash in diagnostics. In an airgapped
install, a changed skill is a deliberate package change, not a writable prompt
file.

A skill file is a policy input, not a security boundary. Enforce the important
rules in code:

- expose only read/context and proposal endpoints; provide no workflow tools;
- resolve source IDs server-side and validate every returned source against the
  resolved context;
- require strict JSON output and reject unknown fields, control fields, excess
  lengths, missing source links, and invalid categories;
- keep evidence in an explicitly delimited, untrusted section;
- never persist model output automatically or pass it to `save`, `submit`,
  `authorize`, `release`, `transmit`, `close`, or `followup`;
- escape rendered text and preserve the existing dirty-buffer and revision
  guards;
- fail closed to a labeled local-only result when the model is missing,
  unavailable, malformed, or stale.

This gives the skill leverage and locality while keeping authorization,
validation, and data egress outside the model's discretion.

## Recommended architecture

### Backend provider adapter

Add a small provider boundary separate from `store.CaseAction` and the Node
rules runner:

```text
HTTP handler -> Assistant service -> context snapshot + prompt policy
                              -> OpenAI HTTP client
                              -> validated Assistant result
```

The handler should take a read snapshot, release all store locks, and only then
make the network request. OpenAI latency must never hold the store write lock.
Use a request-scoped timeout, bounded request/response sizes, and cancellation
when the browser disconnects.

Configuration should be environment/secret-manager based, for example:

- `OPENAI_API_KEY`: required to enable the integration; never sent to the UI.
- `OPENAI_MODEL`: server-selected allowlisted model, with a deliberate default.
- `OPENAI_TIMEOUT`: bounded server-side timeout.
- Optional organization/project configuration supplied by deployment secrets.

Do not accept an arbitrary provider URL, model name, system prompt, or API key
from the browser. If a configurable base URL is needed for tests, restrict it
to an explicitly non-production configuration.

### Context boundary

The browser should send intent and stable identifiers, not an authoritative
copy of records. The backend should resolve and bound the context from its own
store:

```json
{
  "mode": "chat | draft",
  "task": "history | INITIAL | UPDATE | CORRECT | CANCEL",
  "conversation": [{"role": "user", "content": "..."}],
  "caseId": "optional source case id",
  "caseIds": ["optional bounded selected ids"],
  "page": "overview | analytics | editor",
  "facts": {},
  "referenceText": "optional explicitly pasted historical excerpt"
}
```

The server should enforce maximum turns, characters, selected IDs, and source
text length. It should fetch related assets, work orders, requisitions,
approved/released versions, observations, and review-safe message text according
to the task. It should disclose coverage in the result. Unknown or unauthorized
IDs should not cause the server to search outside the requested scope.

For an Initial, the server needs a deliberate query for all authorized approved
history in the command/profile scope; it must not silently use the first page of
cases. For investigations, retain source IDs and revision/digest metadata so
claims can be inspected and stale context can be detected.

Imported messages, user-pasted excerpts, and stored narrative are evidence, not
instructions. Put behavioral rules in the server-owned instruction layer and
label evidence as untrusted content to reduce prompt-injection risk.

### Two response modes

**Chat/investigation:** return a validated structured result such as:

```json
{
  "answer": "short grounded answer",
  "claims": [{"text": "...", "sourceIds": ["case-1"]}],
  "gaps": ["Operating exposure is not recorded"],
  "nextQuestions": ["..."],
  "scope": {"caseIds": ["case-1"], "coverage": "..."}
}
```

The UI can render this into its existing answer/source presentation. Claims
without source IDs should be treated as interpretation or uncertainty, not as
recorded facts.

**Draft proposal:** ask the model for facts and body narrative only. Do not let
model output replace `FM`, `TO`, `INFO`, `DTG`, identifiers, recipients,
classification, routing, review state, or any controlled field. A useful
response shape is:

```json
{
  "complete": false,
  "facts": {
    "equipment": "...",
    "category": "C3",
    "description": "...",
    "impact": "...",
    "actions": "...",
    "mitigation": "...",
    "parts": "...",
    "assistance": "..."
  },
  "missingEssential": ["verified discovery time"],
  "previewNarrative": "...",
  "warnings": ["Cause remains unconfirmed"],
  "sources": [{"caseId": "case-1", "revision": 4, "digest": "..."}]
}
```

The existing `CasrepDraftComposer` should apply the returned facts to a local
or backend-shared canonical template. The preview shown to the user must be
byte-for-byte the wording handed to the writer, and opening it must remain an
unsaved buffer. No Assistant endpoint should call `save`, `submit`, `authorize`,
`release`, `transmit`, `close`, or `followup`.

### API shape for an MVP

Prefer a single endpoint initially:

```text
POST /api/v1/assistant/responses
```

Suggested response envelope:

```json
{
  "data": {
    "mode": "chat",
    "text": "...",
    "proposal": null,
    "sources": [],
    "coverage": "...",
    "model": "server-selected display name",
    "requestId": "server-generated correlation id"
  }
}
```

Return `503` when the feature is not configured or the provider is unavailable;
`400/422` for malformed or unsupported requests; `429` for local quota/rate
limits; and avoid returning provider response bodies or request headers to the
browser. Do not persist prompts or completions in the JSON database for the
MVP. Log only a request ID, mode, duration, status, token/usage summary if
available, and failure category; never log API keys, full prompts, full records,
or generated message text by default.

Non-streaming is the best first implementation because the current page already
models a single busy operation and has no streaming parser. SSE can be added
later after cancellation, disconnect cleanup, proxy buffering, test fixtures,
and partial-error behavior are defined.

## Authentication for the Assistant

The Assistant/model endpoint must require authentication before any provider is
enabled. A shared/single login is acceptable as a first deployment control,
but it should be treated as one principal, not as real per-user authorization.

Recommended minimal design:

- Configure one login secret through the deployment secret manager; never put
  it in `index.html`, `frontend-config.js`, a query string, or local storage.
- `POST /api/v1/auth/login` accepts the passphrase over TLS, compares it in
  constant time, and returns an opaque short-lived session cookie.
- Store only hashed/opaque session state server-side. Use an `HttpOnly`,
  `Secure`, `SameSite=None` cookie for the GitHub Pages-to-Fly deployment, with
  explicit allowed origins and credentials-enabled CORS.
- Protect state-changing requests with an Origin check plus a CSRF token. Rate
  limit login failures and Assistant requests; provide logout and session
  expiry/revocation.
- Apply the session middleware at least to Assistant/model routes. Before
  production, apply authentication and authorization to the existing CRUD and
  workflow routes too; protecting only the model route leaves records and
  workflow controls unauthenticated.
- Label audit events as the shared account. Do not imply that comments,
  approvals, or model requests identify individual people.

A reverse-proxy/identity-provider login is preferable when the airgapped
installation already has one. A shared login has known limitations: one
credential can be copied, one logout/revocation affects everyone, and the
backend cannot provide individual attribution or command/profile authorization.
It is still materially safer than embedding a provider key or leaving the
provider endpoint public.

## Security and deployment blockers

1. **Public spend proxy:** Fly currently has no auth and wildcard CORS. A server
   key would be callable by anyone who discovers the endpoint. Add the shared
   session control (or an identity provider), rate limits, request budgets,
   model allowlisting, and a kill switch before provider enablement.
2. **Data classification:** only notional unclassified fictional data is
   currently supported. Do not send operational, classified, controlled, or
   personally identifying data until command policy, retention, vendor terms,
   and redaction are approved.
3. **Prompt injection:** stored traffic and pasted excerpts may contain
   instruction-like text. Treat them as quoted evidence and constrain output to
   the structured schema.
4. **Output validation:** validate JSON shape, lengths, allowed fields, source
   IDs, and required facts server-side. Never treat a model response as an
   authorization or workflow decision.
5. **Availability/cost:** enforce timeouts, body limits, concurrency limits,
   retries only for safe transient failures, and per-request token budgets.
   Do not retry malformed requests or timeouts indefinitely.
6. **Observability:** add correlation IDs and redacted metrics. Make provider
   failures understandable in the UI while retaining the user's draft and
   notes.
7. **Model changes:** pin/allowlist a model and test prompt/schema behavior on
   fixture cases. A model upgrade is a behavior change, not merely a config
   change.

## Rollout plan

1. Add provider-independent request/response types and validation tests.
2. Add a fake provider and backend endpoint tests for disabled, success,
   malformed output, timeout, provider error, rate limit, and cancellation.
3. Add an OpenAI HTTP adapter using a test `httptest.Server`; keep the real
   endpoint out of unit/E2E tests.
4. Add bounded server-side context assembly and source/revision metadata.
5. Wire the existing Assistant page to the endpoint behind a feature/capability
   flag. Preserve local fallback only when explicitly in static mode; a
   configured backend failure must not silently switch data sources.
6. Add Playwright coverage for grounded chat, blocked/uncertain draft, successful
   unsaved handoff, API failure, no credential configuration, and responsive UI.
   Tests use fictional data and never call OpenAI.
7. Add authentication/authorization and quotas before enabling the key in Fly.
8. Update `backend/SPEC.md`, `backend/HANDOFF.md`, an Assistant ADR, and the
   deployment documentation together. Run the documentation gate, Go tests,
   JS tests, and the full Playwright suite.

## Open decisions

- Who are the authenticated users, and is access command/profile scoped?
- Which model and maximum budget are approved for the prototype?
- Is chat ephemeral, or must prompts/results become an auditable record? If
  auditable, define redaction, retention, access, and deletion first.
- Should the backend assemble full history from IDs, or should a separate
  server-side analysis projection be introduced for larger datasets?
- Is streaming required for the UX, or is a bounded non-streaming response
  acceptable?
- Which output schema is approved for each report type, especially CORRECT and
  CANCEL, where unsupported claims must remain explicit?
- What command-authorized references may be sent to the provider?

## Primary sources

- OpenAI Responses API reference: <https://developers.openai.com/api/docs/api-reference/responses>
- OpenAI text generation / Responses guidance: <https://developers.openai.com/api/docs/guides/text>
- OpenAI production best practices: <https://developers.openai.com/api/docs/guides/production-best-practices>
- OpenAI safety best practices: <https://developers.openai.com/api/docs/guides/safety-best-practices>
- OpenAI data controls guidance: <https://platform.openai.com/docs/guides/your-data>
- OpenAI API key safety guidance: <https://developers.openai.com/api/docs/guides/api-key-safety>

These sources define the provider API, credential handling, safety, and data
controls. The repository's own `CONTEXT.md`, `backend/SPEC.md`,
`backend/HANDOFF.md`, `docs/CASREP-Assistant-Instructions.md`, and
`docs/adr/0012-add-assistant-without-changing-workflow.md` define the app's
workflow and data boundaries.
