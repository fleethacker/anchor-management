# Remediation R0–R2 verification

Status: implemented and verified in the working tree, including latest main.

This batch addresses F1, F2, F11 and F12 from the
[review](2026-11-05-correctness-security-review.md), following
[the remediation plan](2026-11-05-remediation-plan.md). Remaining demonstration
release and production-security work stays open.

## Integrated source

- Review baseline: `f05bdaa392380ed9e01f3c67012f065b6d9305e3`.
- Latest main fetched and fast-forwarded to
  `140be8897561bbcb55e82191ff44fecd84846a10` (PR #37 sidebar branding and PR #38
  notification dismissal).
- Five overlapping files merged cleanly and matched a separate three-way
  preflight. Git reports no unmerged entries or conflict markers. The index is
  empty; remediation changes remain unstaged and uncommitted.
- Working branch: `fix/security-remediation`, created from that updated `main`.
- New notification browser tests use the owned fixture. The remediation ADR is
  [0021](../adr/0021-safe-history-static-serving-and-owned-browser-tests.md),
  preserving upstream ADR 0020.
- Recovery copies of the pre-integration patch/new files remain at
  `/tmp/anchor-main-sync.p14pa4/`. Unrelated untracked files and the existing
  stash were preserved.

## Implemented behavior

| Finding | Result | Regression evidence |
| --- | --- | --- |
| F1: stored history XSS | Escape persisted history/review metadata across history, comments, comparison, approval, print and report displays. Show unavailable legacy values without rewriting records. Reject newly supplied malformed metadata with 422. Legacy reporting with unusable snapshots reports missing submission evidence. | Three history-security browser scenarios, API rejection/preservation checks, store validation using real workflow-generated history, rejected-write disk/memory atomicity. |
| F2: repository exposure | Serve only `/`, `/index.html`, `/frontend-config.js` for GET/HEAD. Source startup defaults to loopback; the container retains its explicit listener and Node rules path. | Actual CLI defaults, private/encoded/traversal paths, methods/MIME, real server API capabilities, isolated container smoke. |
| F11: reused test server | Each test owns its Go process, loopback port and fictional database. URL overrides are rejected; all maintained specs import the shared fixture. | Unrelated sentinel receives zero requests; independent tests start from pristine state; configured and legacy URL overrides fail before writes. |
| F12: missing early-failure artifacts | The broad editor flow uses the runner's page/context. Unique run folders preserve prior evidence; failures attach backend log/database. | Intentional early browser failure produces trace, screenshot, video and HTML; startup failure retains logs. |

No seed migration, live API write, deployment or publication was performed.
Canonical traffic and usable reporting projections remain unchanged. Independent
combined-model comparison found identical projections for all 186 seed cases;
malformed historical evidence remains explicitly unavailable.

## Verification

Local browser runs used `/usr/bin/chromium` through `CHROME_EXECUTABLE` and disabled
retries. Evidence is under `test-results/remediation-r0-r2-20261105/`.

| Check | Result | Evidence |
| --- | --- | --- |
| All model/script suites, including notification tests | 154 passed | `unit-post-main.log` |
| Full isolated Playwright suite after main integration | 63 passed, no retries | `e2e-post-main.log` |
| Browser ownership/failure-artifact gate | 2 passed | `harness-post-main.log` |
| Full Go race suite after main integration | Passed | `go-post-main.log` |
| Go vet | Passed | `go-vet.log` |
| Gosec with repository-pinned Go toolchain | 0 issues | `gosec.log` |
| Documentation sync | Passed | `doc-sync-post-main.log` |
| Hardened container rebuilt after main integration | Passed | `container-post-main-verification.json` |
| Whitespace/conflict checks | Passed | `git diff --check`, empty unmerged index |

Browser HTML report: `playwright-report/2026-11-05T21-55-08-769Z-bf9a1159/`.
The original 54 browser scenarios remain represented; five security/server
regressions and four upstream notification scenarios bring the suite to 63.
The broad editor scenario still covers seven acceptance groups. Before main
integration, both complete 59-scenario runs passed. Harness reports contain
deliberate nested failures: the outer harness passes only when their expected
artifacts are present. Development failure artifacts were retained separately.

The tested local image ID is
`sha256:b8a9ab38c1855bb1c8851de1fa82aa1ec1f0bfdd468c0a86d12724dfc3bd0a1b`.
Source, packaged and served HTML share SHA-256
`c0536fbfeb926aa35f2fde7d872689f997e464ab87f0fd0cf1bc0f93a6803a51`.
Container checks cover frontend restrictions, shared Node capabilities, draft
save/submit, blocked workflow mutation and restart persistence. The container
uses provider `none`, network isolation, a fictional tmpfs database, read-only
root, dropped capabilities and no privilege gain. This proves the R2 runtime
boundary, not packaged-model inference or load. The image was not published.

## Remaining work

R3–R9 remain open: shared-login CSRF and CORS, retained material/date integrity,
cross-tab static writes, consistent pagination/acquisition, effective package
resources and model testing, enforced scanner gates, stale-suite consolidation
and verified-artifact release ordering. The production identity, authorization,
audit, persistence and operations track also remains open. These patches do not
make the prototype suitable for sensitive operational data.
