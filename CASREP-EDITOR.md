# CASREP document editor

Opening or creating a CASREP uses the main workspace and retains the Material
Readiness header and navigation. The registry, AEGIS analysis, routing queue,
PLAD library, equipment, work orders and W requisitions keep their existing IDs
and relationships. Case overview, analysis, routing and events are available in
the editor's **Case workspace** tab.

The editor keeps a paper-style message beside a wider **Report details** panel.
Use the panel menu for fields, recipients, outline, search, checks and history.
Export and print sit beside the document tabs; Undo and Redo sit with the message
fields. The editor has no icon rail, zoom controls or simulated-actor dropdown.

The message is a plain-text working copy with a synchronized structured panel.
Known fields are edited in place by text range; whitespace, unknown sets and
unrecognized content are retained. Missing/unrecognized fields must be repaired
in the document before structured editing can address them. No rich text is
inserted on paste. The optional 80-column guide is a display aid, not a message
formatting rule. Saving is explicit. Working buffers survive navigation within
the page; closing/reloading with unsaved changes prompts the browser's standard
unsaved-changes protection. Saved records survive reload through local storage.

## Template scope

`CasrepDocument.template` identifies the versioned **project demonstration**
template. It follows the repository's fictional fixture conventions in
[CASREP-MESSAGE-FORMAT.md](CASREP-MESSAGE-FORMAT.md), with labeled narrative
sections for bidirectional editing. INITIAL, UPDATE, CORRECT and CANCEL drafts
have distinct sets and follow-on identifiers. A follow-on retains prior content
and unknown sets for the writer to check intentionally.

The command-authorized NTRP 1-03.1 template and supplements were not supplied.
Neither this template nor these field checks establish operational formatting
approval. Controlled values (precedence, DTG, recipients, classification,
handling and identifiers) start as explicit placeholders. The editor does not
assign an UNCLASSIFIED marking or invent release information. Its local exercise
marking is required for submitting these fictional records to demo review.

## Review and history

- Draft permits writing, field/recipient edits, PLAD snapshots, undo/redo and
  saving. Comment and Sign review remain unavailable.
- Submitting saves and validates the working copy, captures its exact UTF-8 text,
  SHA-256 digest, revision, template, distribution and assigned demo roles, then
  locks material edits at both the UI and store boundaries.
- Open **Case workspace → Routing**, then **Review** on an assigned review step
  to comment or acknowledge an In review revision. The selected step supplies
  its simulated reviewer context; the Report details menu then includes Review
  comments and Acknowledge review. Comments store exact offsets, quoted text, author,
  timestamp, snapshot, replies and resolution. An acknowledgement records role,
  decision, revision and digest without changing traffic.
- Returning from review requires an explicit reason. Later content/recipient
  edits increment the revision and require fresh review. Prior snapshots,
  comments and acknowledgements remain available; old comment anchors and
  acknowledgements are marked superseded. Returning and resubmitting identical
  text also creates a distinct review round.
- Release-authorized/transmitted traffic is read-only. The existing transmitted
  follow-on workflow creates a new draft and preserves released versions.
- Legacy demo cases have no retrospectively invented document signatures or
  reviewed document digest. Return a legacy review case to Draft, save its
  working copy and submit it to establish the new document-review snapshot.

The internal cover is separate from traffic. Plain-text export reads canonical
traffic only. Printing, including Print to PDF and browser print shortcuts,
constructs an explicit message-only DOM root before printing and hides all
other body roots. This works while the cover or a dialog is selected. No cover,
comment UI, acknowledgement, or review metadata enters the traffic export.

## Versioned persistence / future server contract

The existing case storage schema remains compatible. New fields are additive:

| Field | Contents |
| --- | --- |
| `traffic.schemaVersion = 1` | Canonical LF-delimited text and its template identity/version |
| `traffic.recipientSnapshots[]` | PLAD identity, library version timestamp, copied source addresses, applied time, TO/INFO category, append/replace mode, resulting recipients |
| `documentReview.schemaVersion = 1` | Internal review metadata, separate from traffic |
| `documentReview.snapshots[]` | Review round ID, exact text/revision/digest, template, recipient snapshots, assigned reviewer IDs/roles, submission and return metadata |
| `documentReview.activeSnapshotId` | Current applicable review round; cleared on return/follow-on |
| `documentReview.comments[]` | Source snapshot/revision/digest, immutable anchor/quote, author/time, replies and resolution |
| `documentReview.acknowledgements[]` | Source snapshot/revision/digest, reviewer ID, assigned role, decision, simulated mark and time |
| `events[]`, `versions[]`, `transmissions[]` | Existing append-only store events and preserved release/delivery history |

Material saves and review transitions support `expectedRevision` and
`expectedDigest`; review operations also bind to the review round ID. The local
store rereads storage before mutations to reject stale material writes and
retain concurrent comments. This is browser-prototype conflict checking, not a
transactional multi-user backend.

A future backend must implement these invariants independently of the browser:

1. Authenticate users and authorize every edit, return, assignment, comment,
   review decision and release according to command policy. Ignore client
   actor/role claims; derive identity from the server session.
2. Own the approved template and serializer version, validate exact content before
   review and authorized release, compute the authoritative UTF-8 digest, and
   preserve submitted/released text as immutable snapshots.
3. Use transactional optimistic concurrency (revision/ETag plus snapshot ID) and
   atomic writes. Return a conflict without overwriting a newer revision.
4. Bind acknowledgements to authenticated reviewer, assigned role and exact
   server snapshot/digest. Retain superseded decisions; use the separately
   approved identity/signing service for formal signatures.
5. Append immutable audit events with event ID, actor, server time, action,
   expected/resulting version, source digest and return reason. Clients must not
   rewrite events or reviewed traffic.
6. Generate traffic downloads and PDF/print representations from the canonical
   traffic resource only. Internal covers and review metadata must have separate
   resources and must never enter message export roots.

All current actors and acknowledgements are explicitly simulated. The browser
has no authenticated reviewer service, official release/transmission service,
production backend or command-approved serializer connection.

## Verification

Run the dependency-free model/workflow tests:

```sh
node tests/casrep-document.test.cjs
```

The optional browser acceptance suite requires Playwright and a local server:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
# In another terminal with Playwright available:
node tests/casrep-editor.browser.test.cjs
```

`PLAYWRIGHT_MODULE` can point to an existing Playwright module installation;
`CHROME_EXECUTABLE` can select an installed Chrome binary. `CASREP_TEST_URL` and
`CASREP_TEST_OUTPUT` override the URL and temporary screenshots/traffic/PDF
destination. Browser checks use an isolated profile and fictional test records.
