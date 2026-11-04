# Persist CASREP workflow commands with shared rules

Status: accepted. Extends ADR 0004; preserves ADR 0005's server pagination and
ADR 0006/0007's Fly.io, GitHub Pages, and CI configuration.

## Context

The editor redesign introduces submission-based deadlines, ordered review roles,
locked traffic, and retained comments/approvals. Main's initial API integration
persists material and PLAD changes but blocks CASREP writes. Combining the pages
without dedicated commands would either lose backend persistence or bypass the
editor's workflow invariants. Reimplementing the document parser and all rules in
Go would create two sources of truth during this prototype iteration.

## Decision

Keep all existing resource CRUD and query contracts. Add dedicated CASREP command
endpoints. Go serializes commands with other writes, owns the clock and current
snapshot, checks concurrency guards, and atomically persists the result. A small
Node.js 20+ helper loads the three existing pure document/reporting/case models
from trusted `index.html`. Inputs are JSON over stdin, never executable request
code. The helper is bounded by a 10-second timeout. No npm packages are introduced.

Calculated deadline queries opt into `reporting=calculated`. They project the
same reporting rules before the existing server filters, ordering, and page
slicing. Legacy `nextUpdateAt` queries keep their original behavior and stored
values. The overview still requests 10 records per page with server total counts.

Record requisition reporting consequences in the Go store, in the same atomic
write as material CRUD. Keep them as metadata independent of traffic/revision;
the shared reporting model consumes them and clears them on INITIAL/UPDATE
submission. Roll back in-memory changes when file persistence fails.

The client chooses its data source before allowing edits, waits for writes, loads
all collection pages, and preserves drafts on errors. A discovered/configured API
failure must not switch saves into the static browser store.

## Consequences and limits

Workflow and deadline semantics are identical across backend and static modes;
existing material/PLAD clients and plain collection queries continue to work.
Node is now a runtime dependency for commands and calculated deadlines, alongside
Go. Original CRUD remains available without Node. The Fly image includes the
runtime/helper and matching HTML; its existing volume and machine configuration
remain. One rules child process runs at a time to bound memory. The Pages API-base
injection and local same-origin config are preserved. A read-only CASREP health
probe exercises the packaged rules on an empty collection. Pages requires its
capability markers before replacing the existing site, so merging frontend code
cannot publish it against an older API. Deploy the Fly API, then rerun Pages if
publication was blocked. Ordinary health and static-demo publication remain
available. The per-command process and whole-case snapshot trade throughput
for a small integration; extract shared modules or use a persistent rules process
before scaling, with contract tests protecting behavior.

This does not add authenticated users or tamper-resistant audit storage. Generic
CRUD remains a trusted prototype/admin interface and can bypass workflow rules;
it must be restricted before operational use. The server records simulated roles,
not verified identity. Current instructions, authorized templates, official Navy
messaging, background notifications, and multi-instance persistence remain separate
work. Existing runtime databases are retained; regenerated fictional seed evidence
must never be applied as invented history to persisted records.
