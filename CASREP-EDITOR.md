# CASREP editing and review

The main-screen editor keeps the canonical message beside three field sections:
**Casualty**, **Repair**, and **Recipients**. On smaller screens, the fields come
first. Repair estimates use a UTC date/time picker. Field edits immediately update
the plain-text message; editing the message updates the fields. Unknown sets and
unrecognized narrative are preserved. Multiline narrative edits replace the full
field without leaving trailing text behind.

**Message setup** contains identifiers, precedence, DTG, position, and maintenance
references. Checks, history, export, and print are available on
directly in the compact header. Undo/Redo buttons and the More menu are removed.
The former Case workspace tab and analysis fields have been removed from
the editor. Analysis and Logistics remain accessible through the main navigation.
Icons share consistent sizes and alignment, including the notification bell.

Saving is explicit. Unsaved buffers survive navigation within the app, and browser
reload/close prompts before discarding them. The Go-served editor saves to the
backend; the static demo saves to browser storage. The footer identifies the
active store. Actions wait for successful writes, and stale revisions are rejected.

## Submission and update deadlines

The header shows the deadline beside the report identity and actions. Due status
uses UTC calendar days: Due today remains until UTC midnight, then becomes
Overdue by 1 day; hour and minute countdowns are not shown. Details exposes the submission, periodic, and repair checkpoints.
The registry, routing queue, overview, and notification bell use the same reporting
model. Notifications refresh every minute and when the app regains focus. They are
in-app notifications while the prototype is open, not background push. Backend
mode retains server filtering, total counts, and due-report pages of 10.

For this prototype, **Submit for review** records the submission event. A new
INITIAL starts the clock; a submitted follow-on UPDATE starts the next interval.
Saving, opening, returning, or re-reviewing the same message does not restart it.
Draft category/ETR changes do not replace the last submitted deadline. Changes to
casualty information, repairs, parts, assistance, and schedule flag an update;
linked requisition status changes do so as well. A pending change never hides an
already overdue deadline. CORRECT/CASCOR and CANCEL drafts retain reminders until
reporting is closed.

See [CASREP-UPDATE-RULES.md](CASREP-UPDATE-RULES.md) for the public-source baseline,
calculation, migration behavior, and limitations.

## Review and version history

1. The **Sailor / LPO** writes, saves, and submits a validated exercise message.
2. **Review & release** shows the current holder and the full chain: Division
   Officer → Department Head → Engineer Officer / CHENG → Executive Officer →
   Commanding Officer. Select **Review as …** on the current step.
3. The assigned reviewer can select message text and comment, reply, resolve
   feedback, return with a reason, or approve and forward. Material text stays
   locked during review. Later roles cannot skip the current approval.
4. A return unlocks the draft. Saving revised content creates a new version;
   resubmitting creates a fresh review round. Previous comments, quoted anchors,
   returns, and approvals remain attached to their original text and revision.
5. Only the simulated CO can authorize release, after all five approvals. Release,
   transmission, and delivery evidence are separate events. No message is sent.
6. **Create update** opens an editable follow-on after transmission. It retains
   the casualty number and content, increments the UPDATE sequence, and requests a
   new message DTG and serial. Prior release versions remain preserved.

Saved draft versions, exact submitted snapshots, SHA-256 digests, acknowledgements,
comments, replies, resolution events, and release history are retained. Open
**Revision history** or **Review & release → View audit trail** to inspect
them. Acknowledgements and internal review information never enter traffic
exports. Plain-text export and print/PDF use only the canonical message, even
when initiated from the review view. Print page margins are zero, with spacing
inside the message content, to suppress browser date, title, URL and page-number
headers and footers.

Existing legacy review records have no invented signatures or review digest.
Return one to Draft and submit its saved message to establish the new five-role
review snapshot. Existing records without submission evidence display
**Submission date needed**; enter the actual last submission through **Add date**.

## Format scope and prototype boundaries

The versioned project template follows the fictional samples and conventions in
[CASREP-MESSAGE-FORMAT.md](CASREP-MESSAGE-FORMAT.md). INITIAL, UPDATE, CORRECT
(CASCOR), and CANCEL have distinct identifiers. Validation checks required sets,
set order, category, four-character EIC, three-digit serial, report identifiers,
real UTC DTGs, exercise markings, and unresolved placeholders. New drafts use
UNCLAS. All supplied samples remain editable without forcing labeled narrative
onto their original freeform remarks.

These checks are not certification against the current command-authorized
NTRP/NWP 1-03.1 and supplements. Unknown sets are preserved for review. No live
Navy system, authenticated identity service, formal digital signature, or messaging
gateway is connected. All records, role selections, and release actions are
simulations using notional, unclassified data.

## Persistence and server contract

New fields are additive; existing storage keys and record relationships remain.

| Field | Purpose |
| --- | --- |
| `traffic` | Canonical LF-delimited text, template version, copied PLAD snapshots |
| `documentHistory[]` | Each saved material revision and its exact text |
| `documentReview.snapshots[]` | Submitted review rounds, exact text, digest, assignments, return metadata |
| `documentReview.comments[]` | Anchors, quoted text, author, time, replies, resolution |
| `documentReview.acknowledgements[]` | Assigned role, decision, source round, revision, digest |
| `reporting` | Submission cycles, submitted category/ETR, pending reportable changes |
| `materialChanges[]` | Requisition reporting notices, persisted with material writes |
| `events[]`, `versions[]`, `transmissions[]` | Audit, immutable release copies, handoff/delivery evidence |

Material edits use expected revision/digest; review decisions also bind to the
review round. In backend mode, dedicated commands invoke these same pure rules
through Node.js 20+. Go supplies current records and the server clock, serializes
writes, and persists successful results atomically. The existing CRUD endpoints,
filters, PLAD/material saves, and pagination remain available. Requisition changes
and linked reporting notices share one write. See [backend/API.md](backend/API.md)
and [backend/SPEC.md](backend/SPEC.md).

The static store rereads browser data before mutations. Existing keys and backend
databases are retained; the two stores are not silently combined. A configured
backend failure does not switch writes to browser storage. Production still needs
authenticated actors and permissions on every path, approved templates/policies,
tamper-resistant audit retention, and operational messaging. Generic CRUD remains
a trusted prototype/admin interface, not an authenticated workflow boundary.

## Verification

Dependency-free model, document, workflow, fixture, and deadline checks:

```sh
node tests/casrep-document.test.cjs
node tests/casrep-reporting.test.cjs
node --test tests/casrep-api-client.test.cjs backend/scripts/casrep-workflow.test.cjs
# From backend/:
go test ./...
go vet ./...
```

Optional browser acceptance suite, with Playwright installed separately:

```sh
python3 -m http.server 4173 --bind 127.0.0.1
# In another terminal:
node tests/casrep-editor.browser.test.cjs
```

`PLAYWRIGHT_MODULE`, `CHROME_EXECUTABLE`, `CASREP_TEST_URL`, and
`CASREP_TEST_OUTPUT` select an existing Playwright installation, browser binary,
server, and temporary output directory. The suite uses an isolated browser profile
and synthetic records. For backend mode, point it at a server using a temporary
database. See [CASREP-DEMO.md](CASREP-DEMO.md) for a live walkthrough.

## Admin and queue management

Use the left-navigation **Admin** section for **PLAD Manager** and **Schedule Manager**.
Save the ship schedule once and apply it to all active reports. Drafts receive
its text; locked reports receive a schedule-change notice for their next update.
A partial application lists failures for retry. New drafts inherit the schedule
when saved. Existing review and release text remains preserved.

From a draft's **Review & release** tab, select **Configure routing**. Add or remove
reviewers, choose roles and optional names, and move steps up or down. CO must
remain last. The chosen chain survives saving, returning and creating updates;
submission captures its exact reviewers for that round. Earlier rounds retain
their assignments and decisions.

The routing queue combines category, stage, search and next-reviewer filters.
Reviewer choices come from the current pending steps. A role-only choice matches
all named people in that role; a named choice narrows to that person. Activity and
the registry show 20 rows per page, and each routing column shows six reports.

Admin acceptance tests use the same environment variables as the editor suite:
`node tests/casrep-admin.browser.test.cjs`. Set `CASREP_TEST_URL` to an isolated
server/database to verify backend persistence as well as static mode.

The editor uses 12pt text for controls, fields and the message. Find, Outline and
Update rules controls are removed. Home-page CAT 2/3/4 lists show two reports per
category (six total), with independent pagination and full category totals.
