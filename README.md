# Hackathon

One self-contained CASREP workspace in `index.html`, combining the existing
casualty, Logistics and PLAD workflows with the AEGIS analysis interface.

The interface is a single-command workspace with a CASREP registry, a local
W/Whiskey-requisition Logistics tracker, and a PLAD Manager. PLAD templates
are saved in the browser and can copy their plain-language address lists into
a CASREP draft. This prototype does not create, submit, fund, route, or
transmit official Navy records or messages.

**CASREP Analysis → AEGIS system** adds a component hierarchy, an explained
maintenance-burden score, confirmed part and casualty drilldowns, repeat-failure
history, and period comparisons. The single-command USS Constitution example has
186 fictional CASREPs and 95 equipment records. Its score is a demonstration
maintenance measure, not an official readiness rating.

See [CASREP-W-REQUISITIONS-RESEARCH.md](CASREP-W-REQUISITIONS-RESEARCH.md)
for the public-source research and operational caveats behind these features.

See [CASREP-MESSAGE-FORMAT.md](CASREP-MESSAGE-FORMAT.md) for the documented
message structure, field order, material tables, and parser conventions used
by the fictional DDG CASREP samples.

## Run locally

Open `index.html` in a browser. No installation or build step is required.

The demo uses fictional records and runs entirely in the browser. A production
backend and AI provider are not connected.

Opening or creating a report now uses the main-screen **CASREP editor**, retaining
the left navigation. It includes synchronized message/field editing, PLAD snapshot
previews, revision history, anchored review comments, simulated acknowledgements
on a separate internal cover, and message-only text/print/PDF output. See
[CASREP-EDITOR.md](CASREP-EDITOR.md) for workflow details, template limitations,
the future backend contract and verification commands.

The HTML embeds all styling, JavaScript, and demonstration data. No second page
or external runtime dependency is required. The merged case/material demo uses
separate storage keys so previous prototype edits remain preserved; the existing
PLAD template library is retained.
