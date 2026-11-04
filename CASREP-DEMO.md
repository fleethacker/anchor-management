# Five-minute live CASREP walkthrough

Use fictional, unclassified data only. The prototype does not send official
messages. With Go 1.22+ and Node.js 20+, run from `backend/`:

```sh
go run ./cmd/server -addr 127.0.0.1:4180 -data /tmp/casrep-demo.json
```

Open <http://127.0.0.1:4180> and verify **Backend storage** in the footer. Use a
new temporary data path for a fresh seed. Opening `index.html`, or serving it with
`python3 -m http.server 4173 --bind 127.0.0.1`, instead uses browser storage.

1. **Draft (about one minute).** Select **New CASREP**. Show the Casualty, Repair,
   and Recipients tabs, synchronized message preview, and UTC repair picker. For
   a quick start, paste `sample-casreps/01_CASREP_26001_chilled-water.txt` into the
   message. In **Message setup**, enter a current exercise DTG and new fictional
   serial. Set the repair estimate sufficiently in the future to demonstrate the
   periodic timer. Keep all identifiers and addresses fictional. Select **Check
   report**, fix required items, and save. The deadline says **Starts on submission**.
2. **Submit and return (one minute).** Select **Submit for review**. The deadline
   appears and **Review & release** shows the Division Officer holding the report.
   Select **Review as Division Officer**. Select text in the message, comment
   “Clarify the post-repair test plan,” and post. Select **Return to draft**, enter
   a reason, and return it. The original submission deadline stays visible.
3. **Revise and approve (two minutes).** Edit the problem description or repair
   plan, save, and resubmit. Select each active **Review as …** step, then
   **Approve & forward**, then the approval button: DIVO, Department Head, CHENG,
   XO, and CO. The CO button says **Approve for CO release**. After all five
   approvals, select **CO release**. Show the audit trail and preserved comments
   under **More → Revision history**. The earlier round has not been overwritten.
4. **Release and update (one minute).** Select **Record transmission**, supply a
   fictional reference, and save. Explain that this records scenario evidence and
   sends nothing. Select **Create update**. The casualty number remains, the UPDATE
   sequence increments, and new DTG/serial fields need completion. Change the
   repair/parts status and save: **Update required** appears without postponing the
   current deadline. Submit the valid UPDATE to start its next periodic interval.
5. **Notifications.** Open the bell and demonstrate due-soon/overdue reports. The
   registry can filter these states. Open a deadline's **Details** to show its
   submission, category interval, ETR checkpoint, and source. Legacy reports without
   a submission date are explicitly identified; no discovery date is substituted.

The backend walkthrough completed during development created **DEMO-26-2051**:
INITIAL revision 1 → DIVO comment and return → revised INITIAL, five approvals
and CO release → recorded fictional transmission → submitted UPDATE with a new
deadline. Saved edits, material status/notices, and PLAD templates survived reload.
This record is in the preview's temporary database, not the shared seed. Use a new
temporary database and the steps above for a reproducible live demonstration.
