# Domain context

## CASREP case
A casualty report record describing one reported material condition, its impact,
assistance, evidence, review state, and follow-on history. A later UPDATE is a
revision or message about the same casualty, not automatically a new casualty.

## Equipment asset
A stable physical or training item to which cases, work orders, and requisitions
may be linked. The asset is the anchor for material history.

## Work order
A maintenance execution record. Its status tracks work progress independently of
CASREP reporting or release state.

## W requisition
A local material-support request for a part or quantity. It tracks sourcing and
receipt; it does not itself prove that a part caused a casualty or close a case.

## PLAD template
A reusable named list of plain-language message recipients. Applying one to a
case copies a snapshot of the addresses; changing the template later does not
rewrite an existing case's recipients.

## Demonstration record
Fictional data used to exercise the workspace. It is not an operational readiness
assessment, official message, transmission, requisition, or source of authority.
