# Domain context

## CASREP case
A casualty report record describing one reported material condition, its impact,
assistance, evidence, review state, and follow-on history. A later UPDATE is a
revision or message about the same casualty, not automatically a new casualty.

## Submission and reporting deadline
For this exercise, **Submit for review** records submission using the backend's
clock (or the browser clock in static mode). The submitted category and ETR define
the update deadline. A new submitted UPDATE starts another cycle; returning and
re-reviewing the same message retain the original submission time. Release and
transmission are separate events. See `CASREP-UPDATE-RULES.md` for the public-source
baseline and the operational submission boundary that still needs validation.

## Review round
An exact message snapshot, digest, and ordered set of simulated reviewers:
Division Officer, Department Head, Engineer Officer/CHENG, XO, and CO. Comments
and approvals reference that round. A return preserves it and unlocks the draft;
revised content needs a fresh round. Only the simulated CO authorizes release.

## Equipment asset
A stable physical or training item to which cases, work orders, and requisitions
may be linked. The asset is the anchor for material history.

## Work order
A maintenance execution record. Its status tracks work progress independently of
CASREP reporting or release state.

## W requisition
A local material-support request for a part or quantity. It tracks sourcing and
receipt; it does not itself prove that a part caused a casualty or close a case.
Material changes also flag a required CASREP update for linked active cases.
This reporting metadata does not change the canonical message or its revision.

## PLAD template
A reusable named list of plain-language message recipients. Applying one to a
case copies a snapshot of the addresses; changing the template later does not
rewrite an existing case's recipients.

## Demonstration record
Fictional data used to exercise the workspace. It is not an operational readiness
assessment, official message, transmission, requisition, or source of authority.
