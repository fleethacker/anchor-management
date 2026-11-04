# 69-character message lines

Status: accepted.

Format physical message lines at 69 Unicode characters. Use a leading-space
continuation after a full physical line and unfold it in the shared parser while
mapping offsets to original text. This preserves logical field values, digest
inputs, and anchored selections. Draft saves enforce formatting on the server;
locked snapshots are retained. Export/print apply formatting for presentation.
Require casrep-line-wrap-v1 before Pages publication to coordinate deployment.

The editor may soft-wrap stored physical lines on narrow paper widths. This is
a display adaptation only; canonical text, wrapping limit and offsets are intact.

The shell omits the top bar; notifications move to the sidebar. A standalone
mobile toggle keeps navigation accessible without reserving a header row.

Sidebar layout uses dynamic viewport height, flexible rows, and a two-column
short-screen layout rather than scrolling or shrinking the full application.
