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

Admin is now grouped in the left navigation for consistent access. Homepage
category registers paginate independently at two records each, keeping six
reports visible across the three categories. Editor controls use 12pt text;
Find, Outline and Update rules presentation is removed without altering rules.
