# CASREP Command workspace tools

Status: accepted.

Rebuild the selected workspace improvements on main without importing an alternate
HTML application. Use the supplied logo (resized and embedded so Pages and the
packaged single-file frontend share it), CASREP Command branding, and a local
appearance preference. Dark mode changes screen surfaces; message paper and
printed reports retain light contrast. Keep notifications at the bottom left,
non-scrolling responsive navigation, combined department-first Analysis and the
locked-message schedule comparison.

Overview groups casualties by command/profile and casualty number, falling back
to record identity when no number is available. The latest record represents a
group. Persisted caseStatus controls reporting closure; a CORRECT/CANCEL draft
does not close an active case. Calendar totals use existing reporting deadlines
and UTC day boundaries. Today, the remainder of the Monday–Sunday week and the
remainder of the month overlap; prior days count as overdue, not future totals.
KPI links retain that cohort in Registry. Six-per-category pagination remains.

Store additional analysis areas and explicit case/asset labels as the additive
singleton command setting `analysis-areas`. The four default departments always
remain first; up to 64 custom id/name pairs follow. Unknown assignments, duplicate
or reserved definitions and malformed maps are rejected. Settings do not amend
case messages, records, evidence or workflow. Configure the full catalog in the
analysis snapshot and validate findings against its actual hierarchy. A changed
catalog/mapping invalidates prior interpretations. Existing browser ownership
labels can initialize settings, but are not silently published as shared data.

Backend settings coexist with the shared ship schedule and persist through the
existing JSON store. Updates require expectedRevision and increment revision;
creation is unique by name. Static mode uses an API-scoped browser key and checks
its saved revision. Conflicting saves reload current settings and require a new
dialog, preserving the user's pending input rather than replacing newer labels.

Requisition tools reuse existing CRUD and verified case/equipment links. Delivery,
part and status changes retain the existing metadata-only CASREP update flag.
Comments append timestamp/optional author to sourcing notes; comments alone do
not change the reporting clock. Requisition revisions guard stale comments and
edits. Linking equipment requires an editable draft and cannot invalidate linked
requisitions. Message validation still governs submission only, not material
tracking or printing.

Require `casrep-command-tools-v1` before publishing Pages against this API. No
seed regeneration, data replacement or live migration is needed. Verification
uses isolated API/static datasets, full browser workflows, calendar/analysis
model tests, persistence/conflict tests and dark-mode print checks.


Record and equipment-observation IDs use Web Crypto randomUUID or getRandomValues;
there is no Math.random fallback. A runtime without secure randomness rejects a
new ID rather than creating a weak one. Browser view routing accepts only own
allowlisted keys and uses an explicit rendering switch, so prototype-property URL
names cannot dispatch to inherited methods. Verify security-boundary model tests
and the full browser suite, including constructor/__proto__/toString routes.

Dialog autofocus runs once in a microtask only while that dialog is current and
no field already has focus. It must not redirect typing after a user moves to
another field. The browser clock regression exercises pending timers after
entering a sourcing comment.

Sidebar branding uses a shared logo size for the wrapper and embedded image,
with explicit divider clearance. Desktop/mobile show the title beside the mark;
the tablet rail centers the mark. Compact-height rules resize both together so
the logo cannot overrun its allocated space or intersect the divider.
