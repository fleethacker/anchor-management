# Present the workspace as an interactive capability tour

**Status:** accepted

## Context

The About this workspace page listed only a few early features. It did not show
how drafting, review, schedules, material support, reporting, and analysis connect,
and was not useful as an entry point for a product demonstration.

## Decision

Retain the Workspace guide heading, footer entry, and `#policy` route. Replace the
generic panels with a branded introduction, four selectable workflow stages,
conceptual visual previews, and launchers for the actual application tools. Keep
the page read-only unless the user explicitly chooses an existing writing action.
Do not fabricate sample casualties, approvals, operational metrics, or results to
make the guide look populated. No new API, data schema, or persistent tour state
is introduced.

Use accessible tabs and Previous/Next presenter controls. Keep focus and scrolling
stable as stages change, support keyboard navigation, and respect reduced motion
for the tour entry scroll. Describe the active storage mode, current Assistant
boundaries, and fictional demonstration in compact disclosures. Preserve the
existing static reset inside a closed disclosure.

## Consequences

The guide can introduce the complete workflow during a demo and open the real
tool for a deeper walkthrough. Capability copy must stay synchronized with the
implemented application. Conceptual previews are explanatory rather than live
records. Browser tests verify real navigation, accessibility, responsive themes,
and unchanged reports in backend and static modes.
