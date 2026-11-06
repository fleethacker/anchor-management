# Accessibility verification

The federal baseline is Section 508's incorporated WCAG 2.0 Level A/AA criteria.
The interface also targets WCAG 2.2 AA. A specific DoW policy or procurement
checklist has not been supplied; reconcile one with this scope before making an
agency compliance claim. [Section508.gov applicability guidance](https://www.section508.gov/develop/applicability-conformance/).

## Design checks

| Area | Acceptance target |
| --- | --- |
| Text contrast | At least 4.5:1 for normal text; 3:1 for qualifying large text. [WCAG 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) |
| Controls and focus | Essential boundaries and visual state cues contrast at least 3:1 with adjacent colors; keyboard focus stays visible. [WCAG 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) |
| Reflow | Reading and actions fit 320 CSS pixels. Wide tables and meaningful two-dimensional graphics may scroll within their own region. [WCAG 1.4.10](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) |
| Text enlargement | Text supports 200% sizing. [WCAG 1.4.4](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) |
| Text spacing | Support user overrides of line height 1.5, paragraph spacing 2em, letter spacing .12em and word spacing .16em. [WCAG 1.4.12](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html) |
| Pointer targets | At least 24 × 24 CSS pixels or applicable spacing/other exceptions. [WCAG 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) |
| Screen typography | Product floor: 14px secondary text; 16px body, navigation, primary controls and form fields at default browser sizing. Keep the screen root at 100% and use root-relative units. These are design choices, not a WCAG minimum font size. |
| Sidebar density | A 280px desktop sidebar with single-column rows at least 48px high. Labels and counts fit at default text size; enlarged text can wrap while badge digits stay together. Short screens scroll instead of shrinking rows or switching to two columns. |

## Automated scope

Run `npm run test:a11y` for focused checks or `npm run test:e2e` for the required
full release gate. Set `CHROME_EXECUTABLE=/usr/bin/chromium` to use an installed
Chromium. Both commands use the Playwright temporary local database. Accessibility
tests explicitly block API requests to other origins.

`tests/e2e/accessibility.spec.cjs` scans Overview, Registry, Routing, Logistics,
PLAD Manager, Schedule Manager, Activity, Workspace Guide, Analysis, Assistant,
and the `demo-rich-1008` editor at desktop and 320px widths in light/dark themes.
It also scans registry filters, notifications, the routing board, report checks,
review/release, chat history, invalid form dialogs, static fallback, and API
failure. The suite checks skip navigation, menu/dialog focus, accessible status,
minimum text sizes, single-column sidebar geometry and count badges, 200% text
sizing with spacing overrides, short-height access,
input/focus contrast, reduced motion, and forced-color focus.

Each scan writes a complete axe JSON result under `test-results/`, including
passes, violations and incomplete checks. Playwright retains traces/screenshots/
videos on failures; enlarged-text tests capture screenshots. Preserve failed-run
artifacts before rerunning, since Playwright cleans its output directory. CI
uploads its browser reports and artifacts.

## Manual completion before conformance reporting

Automation is regression evidence for the states exercised, not a complete
Section 508 or WCAG assessment. Record browser/OS/assistive-technology versions
and results for:

- Screen-reader reading order, headings, landmarks, status announcements, error
  recovery and complete case workflows with NVDA or VoiceOver.
- Keyboard-only use of every dialog, dynamic chart/drilldown and Assistant state;
  focus visibility and return after asynchronous updates.
- Real browser zoom at 200% and 400%, text-spacing overrides, long user content,
  high-contrast settings and speech-input activation using visible control names.
- All detailed analysis lenses, chart meaning without color, and equivalent text
  for visual relationships; the automated landing-page scan is not exhaustive.
- Print/Save PDF tagging, logical reading order, table structure and contrast.
- The applicable DoW checklist and an Accessibility Conformance Report if required.

Design rationale: [ADR 0022](adr/0022-accessibility-and-readable-responsive-type.md).
