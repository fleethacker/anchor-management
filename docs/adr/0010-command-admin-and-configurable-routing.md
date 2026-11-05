# Shared schedule and configurable review chains

Status: accepted.

Store the command schedule in a separate additive command-settings resource,
with a browser key for static mode. Apply it via revision-checked case commands;
retain locked text, flag updates, and list per-record failures for retry.
Bulk application is not a cross-record transaction.

Store per-case routingChain via draft-only set-route. Reuse the shared rules for
submission assignments, ordered approvals, and CO release. Historical snapshots
retain their original assignments. Queue ownership comes from the next pending
step and optional name. Paginate loaded lists without changing API pagination.
Admin groups navigation; it does not introduce authenticated permissions.
Require command-admin-v1 before Pages publishes against the new backend.

The editor exposes the shared schedule above both message and review panels,
outside the form/tool sidebar. This makes the same command context used by the
overview export discoverable on compact screens and while checking a report.
A locked report keeps its exact canonical text: the current command schedule is
labeled as context, and a different/missing message schedule can be inspected
separately. Moving the display does not apply new schedule text or create a
revision, submission, approval or release.

Admin is now grouped in the left navigation for consistent access. Homepage
category registers paginate independently at six records each, keeping 18
reports visible across the three categories. Editor controls use 12pt text;
Find, Outline and Update rules presentation is removed without altering rules.
