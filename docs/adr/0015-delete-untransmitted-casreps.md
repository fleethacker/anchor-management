# Delete untransmitted CASREPs

Status: accepted. Extends the draft continuity decision.

Expose an explicit, confirmed delete action in the registry and editor. Reuse the
existing case DELETE endpoint and add the same removal operation to the browser
store. Protect all cases with any recorded transmission, including follow-on
drafts and legacy Transmitted/Delivery verified stages. Enforce the guard under
the backend write lock as well as in the static model and interface. Return 422
without changes for protected cases, 204 for successful removal, and retain
linked equipment and material records. This removes a case; it does not cancel
or retract an externally transmitted message.

Pause session autosave during deletion and wait for any pending initial save to
identify the actual persisted record before removing it. Clear timers, recovery
buffers, editor and Assistant return context only after success. Reject late
checkpoint saves on deleted sessions and invalidate in-flight collection/due
reads. Failure preserves the last persisted case and unsynced editor buffer.

Add a backend health capability so Pages cannot expose deletion against an older
API without the transmission guard. Test only isolated local/CI data; publishing
this feature does not delete existing live records.
