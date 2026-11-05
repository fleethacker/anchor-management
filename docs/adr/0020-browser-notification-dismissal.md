# Dismiss reporting notifications as browser preferences

**Status:** accepted

## Context

The bell displayed a live projection of reporting conditions without a way to
clear reminders. Closing the dialog did not acknowledge them. Changing reporting
facts to remove an alert would misrepresent the report's actual obligations.

## Decision

Add individual dismissal, Clear all, and individual/bulk restore for current
reminders. Store record IDs and SHA-256 condition fingerprints in browser storage
scoped by frontend origin and backend endpoint, isolating static mode. Do not
change the API schema, reporting rules, case workflow, deadlines or report history.
Include missing-submission reminders consistently in the list, clearing and badge.

A fingerprint changes with the submitted reporting cycle, category/ETR, deadline,
material changes or urgency. The urgency bucket is independent of the "Update
required" label. Daily overdue counts and unrelated edits remain stable. Clear
only rendered conditions to avoid hiding changes that arrive during interaction.

## Consequences

Dismissals persist in this browser and sync through storage events between tabs;
they are not a command-wide acknowledgement or a cross-device preference. Other
profiles retain their own dismissed items. Failed persistence uses session memory
and an explanatory warning. Restoring reminders is reversible, and clearing does
not claim that the underlying report is resolved. Keyboard focus moves to a
remaining action or the empty state; each row has separate open and dismiss buttons.
Unit tests cover persistence, condition changes, source isolation and invalid
storage. Full browser tests verify report immutability, badge/list behavior,
restoration, focus and responsive display on isolated fictional data.
