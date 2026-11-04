# CASREP prototype — one-page brief

**Problem and behavior.** CASREP drafting, chop, revisions, and release currently
cross tools and lose a clear owner. This prototype keeps one canonical message,
its review history, and its current routing holder together. Three focused editor
sections cover casualty, repair, and recipients. The message preview stays in
sync. Deadlines and due/overdue notices sit outside the editing form.

**Roles and permissions.**

| Role | Prototype authority |
| --- | --- |
| Sailor / LPO | Draft, revise, submit, comment, withdraw for revision |
| Division Officer | Review, comment, return, approve to Department Head |
| Department Head | Review, comment, return, approve to CHENG |
| Engineer Officer / CHENG | Review, comment, return, approve to XO |
| Executive Officer | Review, comment, return, approve to CO |
| Commanding Officer | Review, comment, return, approve and authorize release |

Only the assigned current reviewer advances the chain. Reviewed text is locked;
a return requires a reason. New revisions require fresh approvals. Saved versions,
comments, returns, approvals, and exact released copies remain available. Release,
transmission, and receipt are separate events. The UI switches simulated roles;
this is not authenticated multi-user access control.

**Reporting policy.** Submission starts the clock, using server time in backend
mode. Public JFMM Rev. D rules
supply CAT 2/3/4 periodicity and the ETR checkpoint; changes requiring reporting
produce an immediate update notice. The latest instruction and command supplements
must be verified before operational use. See [update rules and sources](CASREP-UPDATE-RULES.md).
The current prototype has in-app notifications while open; durable background
notifications would run on a server.

**Classification and integration.** Only fictional, unclassified exercise data is
used. Production must run within the approved information-handling boundary, with
appropriate markings, encryption, access controls, retention, and auditing. It must
not infer classification from prose or place classified traffic in this
prototype. A versioned, command-approved NTRP/NWP serializer would export
only canonical message text. An approved Navy messaging adapter would record the
authorized handoff, message identifier, errors, and receipt evidence without mixing
internal comments into traffic. Maintenance and requisition integrations retain
separate records linked through approved equipment, JSN/JCN, and requisition IDs.

**Path to fielding.** Validate templates, routing, deadlines, and deferral rules
with the sponsor and command. The Go/Node backend now persists workflow, uses
server time and concurrency checks, and retains material/PLAD CRUD. Replace
simulated role selection and unrestricted prototype CRUD with authenticated
permissions, immutable audit storage, and production database transactions.
Establish approved
identity/signature and messaging interfaces, offline/disconnected behavior,
backup and recovery, accessibility, security authorization, and operational test
criteria. Pilot with notional data, then authorized data in the approved boundary.

**Demonstration.** [Live walkthrough](CASREP-DEMO.md): draft an INITIAL, obtain a
Division Officer comment and return, revise, route through all five approvals,
record CO release, and create an UPDATE while showing preserved history and timers.
