# Gate accessibility and readable responsive typography

**Status:** accepted

## Context

Browser audits found low-contrast secondary text, incomplete dark-theme surfaces,
accessible names that differed from visible labels, undersized chart buttons,
and table headers that widened the document beyond a 320px viewport. Screen text
included 8–11px labels. Hidden mobile navigation remained keyboard-reachable,
and dialogs did not isolate background controls.

## Decision

Use Section 508's incorporated WCAG 2.0 A/AA criteria as the federal baseline and
WCAG 2.2 AA as the interface target. No project-specific DoW checklist has been
supplied. This decision establishes development checks, not an agency conformance
determination. See [the verification scope](../accessibility.md).

Keep the embedded stylesheet and application architecture. Consolidate failed
secondary-text colors into theme tokens, complete dark surfaces, use contrasting
focus indicators and input borders, and retain readable light message paper.
Use the full browser-default root size with root-relative screen typography:
16px body, navigation, primary controls and fields, with a 14px secondary-text
floor at default browser size. The earlier 14px body/12px secondary scale remained
too small in use. Keep the small-text token and root size independent for print.
These font sizes are product choices, not WCAG minimum-font-size requirements.
The message editor also scales with the root size. Print briefing dimensions and
the canonical 69-character message format remain independent of screen type.

Keep wide tables and the optional routing board in their own scroll containers.
Reserve board header space for wrapped captions and equal-height pagination rows
so larger labels and controls keep the first cards aligned across columns.
Position table wrappers so absolute screen-reader labels cannot escape clipping
and widen the page. Small screens stack headers, fields and department cards.
Navigation may scroll when short height or enlarged text needs more space; this
supersedes the earlier requirement to avoid a sidebar scrollbar at all costs.
Use a 280px desktop sidebar, stable rows at least 48px high, and unbroken count
badges. Remove the short-height two-column grid and flex-compressed navigation:
they squeezed labels and even split count digits. Preserve the tablet icon rail
and mobile drawer; overflow should scroll vertically with keyboard access intact.
Assistant headers wrap, the message area retains a readable minimum height, and
the conversation can scroll when enlarged headers/composers need more space.
Short viewports use document scrolling to preserve access to all actions.

Provide a skip link, remove collapsed navigation from keyboard traversal, expose
its expanded state, and contain focus while the mobile menu is open. Shared
dialogs make the background inert, wrap keyboard traversal, and return focus on
close. Chat history/options restore focus to their launchers. Composite department
and guide cards expose descriptive content separately from their action buttons;
routing cards derive their names from their visible content.

Run axe-core through Playwright, using WCAG A/AA tags through 2.2 plus best-practice
checks. Fail on violations without exclusions or disabled rules. Retain complete
axe JSON (including incomplete checks), failure traces, screenshots and videos.
Add explicit tests for reflow, font floors, enlarged text/spacing, focus contrast,
forced colors, reduced motion, dialog validation, keyboard navigation, and static
or failed-API states. These run inside the existing isolated full E2E gate; axe
is a development dependency only.

## Consequences

Automated checks cover selected rendered routes and interaction states. Manual
assistive-technology testing, complex chart alternatives, generated PDF reading
order/tagging, and the applicable agency checklist still require review before a
formal accessibility conformance claim. UI fixes do not change case data, workflow
guards, API contracts, or deployment state.
