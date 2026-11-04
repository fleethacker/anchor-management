# Generate PLAD seed data from the shared frontend model

Status: accepted

PLAD addresses and the three demonstration templates are defined in the
`casrep-plad-model` script in `index.html`. The backend seed extractor loads
that model and writes the same templates to `backend/data/seed.json`.

This keeps local-browser PLAD templates and backend seed data aligned. The seed
remains generated output and must not be edited independently.
