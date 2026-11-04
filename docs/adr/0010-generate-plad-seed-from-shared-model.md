# Generate PLAD seed data from the shared frontend model

Status: accepted

PLAD addresses and demonstration templates are defined in the
`casrep-plad-model` script in `index.html`. The seed extractor loads that model
and writes the templates to `backend/data/seed.json`.

This keeps local-browser PLAD templates and backend seed data aligned. The seed
remains generated output and must not be edited independently.
