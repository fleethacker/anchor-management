# Add a client-side Assistant portal within the existing workspace

Status: accepted

## Context

The user needs a compact Assistant entry and a full-page chat without changing
main's existing editor, approval route, reporting clocks or Go/Node architecture.

## Decision

Add namespaced chat/composer/controller scripts and scoped styles to index.html.
Keep every pre-existing pure model and API client unchanged. Initialize the
portal only after the existing storage connection succeeds; retain fail-closed
behavior for a configured API. Keep the primary pages and navigation structure.

An Initial enters an unsaved current-editor buffer. Follow-on preparation uses
an isolated copy of the existing rules; only explicit Open in New CASREP invokes
the existing awaited followup command with source revision/stage/digest guards.
Protect existing dirty buffers, reject stale proposals and prevent duplicate
or conflicting navigation while a handoff is pending. Preserve unknown message
sets; unsupported freeform narrative requires explicit manual mapping.

## Consequences

No API, persistence schema, server dependency, deployment topology or credentials
are introduced. The local demonstration can show recorded-history charts and
template wording; it is labeled as disconnected from AI. Approved prior copies
provide structural style references without borrowing their casualty facts.
Existing model, backend/container and editor acceptance checks remain required,
with additional portal and async handoff coverage.
