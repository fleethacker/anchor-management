# Draft continuity and pre-transmission routing

Status: accepted. Extends ADR 0008 and the shared schedule/routing decision.

Persist new and edited drafts automatically through the existing guarded save
commands after a short debounce. Keep a synchronous API-scoped recovery buffer
for the period before a write completes or while it fails. Restore only Draft
buffers; retain the recorded base revision/digest so concurrent changes are
rejected instead of silently overwritten. Serialize session saves and retain
edits arriving during requests. Browser recovery is explicitly separate from
backend success. Incomplete drafts remain printable and saveable; submission
continues to enforce required checks. Put all message fields together in message
order rather than behind separate setup/recipient/repair tools.

Allow routing changes through Release authorized, with the same originator,
revision, and active-case guards. Changes supersede current review and return
to Draft; all prior acknowledgements, snapshots, release versions and submission
evidence remain historical. Require fresh approval/release for the new chain.
An identical chain changes nothing. Transmission locks that message's chain;
a later follow-on is a new draft with independent review. Preserve current
message text and deadlines. Add a health capability for coordinated publication.

Browser recovery requires the same browser profile/origin, available storage,
and retained site data. It is not a cross-device offline write queue. Failed
backend writes remain visible and may be retried. Existing API failure behavior
and workflow boundaries remain intact.
