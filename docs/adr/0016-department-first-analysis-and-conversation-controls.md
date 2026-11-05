# Department-first evidence analysis and isolated conversations

Status: accepted

## Decision

Use the fixed department order Combat Systems, Engineering, Deck, Supply as the
Analysis entry point. Compute metrics from all authorized loaded case rows and
associated registry/material/history evidence before presentation filters.
Keep unique casualties, message versions, observations and confirmed findings
separate. Preserve missing/conflicting/unmapped data and zero-history coverage.
Ownership suggestions are explicit local analysis labels, not source edits.

The agent follows the versioned casrep-analysis skill. Deterministic calculations
own the hierarchy and measures; validated agent findings supply interpretations,
alternatives and recommended checks. Cite the exact snapshot and its source IDs.
No provider, endpoint, credential, workflow rule or persistence schema is added.

Keep legacy detailed analysis accessible. Scope Assistant history questions to
the selected department/system/equipment/part while preserving complete source
history in the review packet. New conversations and device history never change
writer buffers or CASREP state. Invalid or stale saved draft proposals must be
regenerated; text generation can stop, but pending case writes retain their
existing completion/error handling.

## Verification

Protect existing document/reporting/case/material/PLAD/API scripts. Exercise
full inventory, ownership and identity ambiguity, typed result validation,
diagram drilldowns and chat lifecycle alongside all existing backend, browser,
review, print and reporting acceptance tests against isolated fictional data.

## Inline tools for the single-ship workspace

Keep the department hierarchy first and render the detailed analysis tabs below
it on the same page. Remove the legacy page toggle and command/profile selectors;
the hosted workspace already supplies one ship's data. Keep internal identity and
snapshot scoping intact. Detail-tab selection scrolls to its section and tracks
Assistant context independently from the department drilldown. This layout change
does not establish or modify server authorization boundaries.
