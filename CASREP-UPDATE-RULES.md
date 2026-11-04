# CASREP update rules and implementation

Research checked 4 November 2026. This is a documented prototype baseline, not an
assertion of current operational approval.

## Public source

[NAVSEA's public JFMM, COMUSFLTFORCOMINST 4790.3 Rev. D, Volume VI,
§5.3.2.2](https://www.navsea.navy.mil/Portals/103/Documents/SUBMEPP/JFMM/Volume%20VI.pdf)
provides these intervals:

| Reported category | Periodic update |
| --- | --- |
| CAT 2 | 30 days |
| CAT 3 | 10 days |
| CAT 4 | 72 hours |

The same paragraph calls for updates before ETR expiration by 24 hours and when
previous information, parts status/receipt, assistance needs, active 4790/2K,
ship schedule, or ETR changes. Adjacent paragraphs address controlled routing,
recipient verification, authorized deferral, and correction after restoration.
Release and confirmed receipt are separate; a CASCOR does not cancel a W requisition.

[NAVSEA's JFMM page](https://www.navsea.navy.mil/Home/SUBMEPP/Products/JFMM/)
announces Revision E dated 27 April 2026 and the move to the SUBMEPP portal. That
revision and current NTRP 1-03.1 were not accessible for verification here. Command
supplements may impose tighter requirements. Before fielding, the owning command
must validate the policy and approved serializer against its authoritative copies.

## Calculation used by this prototype

- The submission event is **Submit for review**, as an explicit exercise simulation.
  The connected backend records this event using server time; the static demo
  uses browser time.
  For production, connect this event to the command's authoritative message
  submission record; do not silently equate a draft save with submission.
- Category and ETR come from the submitted canonical message. The periodic
  deadline is that submission instant plus the category interval. The ETR
  checkpoint is the reported repair instant minus 24 hours. The earlier wins.
- UTC instants and elapsed hours avoid browser-timezone and daylight-saving
  shifts. UTC DTGs reject impossible dates; entered repair dates write back to
  the message's ESTIMATE set.
- A new submitted UPDATE starts a new cycle. Re-review of the same report retains
  its original submission instant. Editing a draft, authorizing release,
  retransmitting a revision, or recording delivery does not reset the interval.
- An old ETR checkpoint remains visible until a revised submitted estimate or
  reporting closure resolves it. UNKNOWN/DEFRD text cannot manufacture an ETR;
  periodic reporting continues. No TYCOM-approved deferral is inferred.
- Reporting status uses UTC calendar days. The day before the due date is
  **due soon**; the full due date is **Due today**, including time after the
  calculated checkpoint. At the next UTC midnight it becomes **Overdue by 1 day**,
  increasing by one each day. No hour/minute countdown is displayed. Changed
  information creates **Update required** immediately, while preserving the
  existing deadline. Exact submission and checkpoint timestamps remain stored.
- A CORRECT/CASCOR or CANCEL draft does not close reporting. Closure follows the
  existing restoration/cancellation and delivery checks. Closed records have no
  active update countdown.

## Existing data and notifications

Saved reporting submissions take precedence. Legacy review snapshots and recorded
transmissions can establish a baseline; duplicate transmissions of one revision
are not additional updates. An explicit imported submission date is also accepted.
Creation/discovery times, last edits, release authorization, and the old manual
`nextUpdateAt` field are never substituted for a submission.

A legacy record with no evidence displays **Submission date needed** with an
explicit date-entry action. Future or invalid dates are rejected. A new INITIAL
draft must actually be submitted. Fresh fictional seed data includes explicitly
labeled fictional submission events; existing persisted data is not backdated.

The notification bell, overview due list, registry filters, routing cards, and
editor banner all share `CasrepReporting.resolve`. They refresh every minute and
on focus/visibility changes. Storage changes from another tab refresh deadlines
and mark stale editor buffers in static mode. Backend mode refreshes cases from
the API and requests calculated deadlines in server-filtered pages of 10. The
`reporting=calculated` projection does not change legacy stored reminder fields.
Requisition changes create linked reporting notices in the same backend write;
they do not alter message text or reset submission time. No notification
permission, external messaging, or background scheduler is installed. Production
still needs approved policy versions, delivery, acknowledgement, escalation, and
durable scheduling.

## Checks

`tests/casrep-reporting.test.cjs` covers all category intervals, exact boundaries,
UTC/DST/calendar transitions, ETR precedence, invalid and missing dates, migration,
same-report re-review, submitted UPDATE cycles, change notices, closed records,
role ordering, CO authority, and all ten sample messages. The document suite covers
canonical editing, PLAD copying, immutable review snapshots, concurrency, anchored
comments, and preserved versions. Browser acceptance covers the editing flow and
a return/revise loop through every role to release. Backend integration tests also
cover real command execution, server timestamps, reload persistence, concurrent
comments, material notice acknowledgement, and unchanged legacy CRUD/pagination.
