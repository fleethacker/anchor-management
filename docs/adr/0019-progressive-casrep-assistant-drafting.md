# Progressive CASREP assistant drafting

The CASREP Assistant will streamline authoring without becoming a second manual
form: one natural-language user prompt may contain all known facts, the Assistant
extracts candidate narrative fields, and a compact confirmation step exposes the
values, provenance, uncertainty, and missing essentials before opening the
writer. The deterministic CASREP composer receives only user-confirmed facts;
existing reports and demonstration records such as `demo-001` are reference
fixtures, never implicit input for a new report. Model extraction is optional
and advisory, while control fields, validation, workflow state, and final human
review remain authoritative. The Assistant should ask follow-up questions only
for genuinely missing or ambiguous essential facts, leaving non-essential gaps
visible for completion in the writer rather than forcing one-question-per-field
interaction. The initial deterministic extraction path recognizes common
ordinary prose for equipment, category, and observed condition, then presents
those candidates for confirmation without silently treating the prompt itself
as report data.

## Consequences

- Natural-language and labeled fact paste are both supported, with the common
  path requiring one prompt and one lightweight review.
- Every generated narrative value can be traced to user input or marked missing;
  inferred values cannot silently enter a CASREP.
- E2E acceptance must verify both the streamlined successful path and the
  refusal to copy an example/current report into a new draft.
- The writer remains responsible for DTGs, identifiers, recipients,
  classification, routing, review, release, and transmission controls.
