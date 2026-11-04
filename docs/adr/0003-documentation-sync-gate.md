# Require documentation changes with implementation changes

Status: accepted

Backend or embedded model changes must travel with updates to the backend spec,
handoff instructions, and an ADR addition or amendment. A repository check scans
working-tree or merge-base changes and fails when that bundle is incomplete.
This favors a deliberate handoff over fast undocumented edits because another
agent is expected to recreate and extend the backend later.

The gate checks that the files changed; human review still decides whether the
new contract, rationale, domain vocabulary, and next-agent instructions are
actually complete.
