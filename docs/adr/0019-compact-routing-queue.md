# Compact routing queue and contextual return

Status: accepted.

Use a compact list as the default routing work surface. A four-column board
wastes space when stages are empty and makes comparing many reports difficult.
Retain a board option for stage overview, with compact cards and only populated
columns. Both views derive from one read-only projection of the existing Active,
pre-transmission records. Keep review and transmission decisions in the guarded
editor, preserving all existing authority, exact-message and revision checks.

Expose search, category, next-action owner, stage counts and sorting directly.
Count stages after search/category/owner filters but before the selected stage so
users can see where matching work exists. Apply filtering and sorting before
pagination. Default urgency is the existing reporting status/date, not an inferred
review deadline. Oldest/newest sorts use recorded update times, not invented time
in stage. Show undated records explicitly and use stable report/ID tie breakers.

Keep queue UI state in memory and capture selected report/scroll on editor entry.
Contextual Back and browser Back restore the current queue and focus while
re-evaluating eligibility after any workflow change. Registry/direct opens retain
their existing back target. Reload persistence and a shared saved-view service
are outside this change. On small screens, list rows reflow without page-wide
horizontal scrolling. Keyboard row opening and return focus are required.

No API change, database migration, seed replacement or new health capability is
needed. Verify the pure projection and full isolated browser suite, including
read-only storage, pagination, filters, missing results, return navigation and
responsive/dark-mode views.

Keep board columns bounded at 184–260px rather than distributing spare width
across a few populated queues. Maintain one row with board-local horizontal
scrolling on small screens. Compact tiles retain report ID, category, title and
reporting urgency; move a shared next-action owner to its column header while
retaining per-report owners in mixed-reviewer columns. Full names remain
accessible despite visual truncation. Capture horizontal scroll with the existing
queue return context. List layout and workflow behavior remain unchanged.

Board column pagination preserves horizontal and page scroll. Keyboard focus stays
with the same paging direction when available, or moves to the remaining enabled
control on the first/last page. List pagination still returns to the results top.
The mobile pagination regression covers both the middle and last page.
