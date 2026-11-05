# Correctness, security, and E2E review — 2026-11-05

Reviewed revision: `f05bdaa392380ed9e01f3c67012f065b6d9305e3`.

The current release suite passes, but the application has reproducible security and correctness defects outside its coverage. Two high-severity security findings warrant priority: stored script execution through case history and repository exposure in the default source-run server. Authenticated Assistant use, material-record retention, invalid dates, static concurrency, and incomplete pagination also need fixes.

Application code was not changed. This report is the only repository addition. Existing untracked `.ai/` and `.codex/` content was preserved. All mutations during testing used isolated temporary databases, fictional fixtures, or in-memory browser/model storage. No live Fly API, volume, deployment, or external model received test writes or requests. Nothing was staged, committed, or pushed.

## Scope and method

Reviewed the embedded frontend models and UI, Go routes/store/authentication, Assistant providers and process supervision, shared Node workflow boundary, persistence contracts, test topology, container/build configuration, and deployment workflows. Used parallel file reviews and independently reproduced the material findings. Read the domain/API/handoff contracts and relevant ADRs; the Analysis contract informed review of coverage and source accounting, not an operational interpretation of CASREP narratives. The user-supplied `RTK.md` reference could not be resolved.

Runtime: Node 24.22.2, Go 1.27.3, Playwright 1.64.1, system Chromium 156.0.8078.79. Playwright ran with `CI=1`, `ASSISTANT_PROVIDER=none`, and retries disabled, forcing a fresh temporary server instead of reusing port 4173. Initial sandbox socket/subprocess/DNS failures were rerun with the needed permission and are not counted as application failures.

Priority labels: **P1 / High** means address before exposing the affected deployment to untrusted users; **P2 / Medium** means a reproducible correctness, configuration, or verification defect requiring planned remediation. Conditional configuration observations are separated below.

## Confirmed application findings

### F1 — P1 / High: stored XSS in case history

**Location:** `index.html:5396`; generic case merge/validation in `backend/internal/store/store.go:175` and `:289`.

History rendering interpolates `documentHistory[].revision` and submitted snapshot revisions directly into HTML. Generic case PATCH accepts and persists arbitrary nested metadata. A fictional revision containing `<img src="/fictional-missing-image" onerror="window.reviewXss=true">` survived PATCH and executed in Chromium when opening the case's History tool. This was reproduced through the actual Go API and browser, not only an isolated renderer.

An API writer can store script that runs in another user's application origin. That script can read browser-accessible application state and make requests with that user's browser privileges. The documented prototype status does not make persisted strings safe to execute.

**Fix:** Escape all metadata rendered into markup or use text nodes. Validate nested history/review shapes at the server boundary while safely rendering legacy malformed records. Audit adjacent revision displays in comments, acknowledgements, and comparisons. Add a browser test that persists hostile metadata, reloads, opens every affected tool, and asserts no execution.

**Evidence:** [actual API/browser results](/tmp/anchor-review-4ZOozt/adversarial-final/results.json), [history screenshot](/tmp/anchor-review-4ZOozt/adversarial-final/stored-xss-history.png), [trace](/tmp/anchor-review-4ZOozt/adversarial-final/trace.zip).

### F2 — P1 / High: default source-run server exposes repository files

**Location:** `backend/cmd/server/main.go:47`, `:50`, `:73`.

The documented `go run ./cmd/server` defaults to `:8080` and serves `..` using unrestricted `http.FileServer`. From the backend working directory, that is the repository root. An isolated server returned HTTP 200 for `/.git/HEAD`; an independent probe also retrieved `/backend/SPEC.md`. Files under the root, including local configuration, Git metadata, and the default mutable database, can therefore be served to network clients if present.

**Fix:** Serve an explicit frontend asset allowlist or a dedicated static directory. Bind development defaults to loopback. Test that dotfiles, backend files, and database paths are inaccessible.

**Boundary:** The Docker image explicitly uses `/app/static`; this finding applies to source-run/default deployments, not a claim that the packaged image exposes `.git`. No credential contents were inspected or printed.

### F3 — P2 / Medium: shared-login Assistant requests and logout fail after successful login

**Location:** `backend/internal/auth/auth.go:175`, `:177`; `index.html:3634`, `:3638`.

Both cookies use `Path=/api/v1`, but the UI at `/` reads the CSRF token through `document.cookie`. Login and session verification succeed while the token remains invisible to the page. Actual browser requests then omit `X-CSRF-Token`, making Assistant responses and logout return 401. A separate Pages frontend also cannot read an API-origin cookie, irrespective of its path. Cookie path/domain behavior is documented in [MDN's Set-Cookie reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).

**Observed:** `login=true`, `session=true`, `visibleCSRF=false`, Assistant POST=401, logout=401.

**Fix:** Expose the CSRF value in authenticated login/session JSON and retain it in client memory; send it on guarded writes. Preserve HttpOnly session protection. Add actual-browser login → model request → logout tests for same-origin and supported separate-origin deployments, including cookie settings for local HTTP development.

**Boundary:** The default supervised local provider bypasses this shared-login path and is unaffected. Provider inference was deliberately unreachable in the reproduction; rejection occurred before provider invocation.

### F4 — P2 / Medium: documented CORS restriction is ignored

**Location:** `backend/cmd/server/main.go:68`, `:644`–`:646`; contract in `backend/SPEC.md:117` and `backend/API.md:162`.

Startup reads only `ASSISTANT_ALLOWED_ORIGINS`. The documented `CORS_ALLOWED_ORIGIN` setting has no effect. With the recognized setting empty, middleware emits `Access-Control-Allow-Origin: *`, contradicting the documented default of no cross-origin permission. With `CORS_ALLOWED_ORIGIN=https://allowed.example`, a request carrying `Origin: https://untrusted.example` returned 200 with wildcard permission.

**Fix:** Reconcile the configuration names, retain a documented compatibility path, and default to no cross-origin permission. Test the actual startup environment wiring rather than only constructing middleware directly. CORS is browser access policy, not a replacement for authentication; see the [MDN CORS reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS).

**Boundary:** Existing Fly configuration sets the recognized Assistant origin variable. This defect affects deployments relying on the documented generic variable or empty defaults.

### F5 — P2 / Medium: deleting a case makes retained material records uneditable

**Location:** `backend/internal/store/store.go:219`, `:325`.

Case deletion retains work orders and requisitions, as promised, but leaves their `casrepId` pointing to the deleted record. Subsequent updates revalidate that nonexistent reference and fail. Actual API reproduction: create a case and linked work order/requisition; delete case → 204; change requisition notes or work-order status → 422, `invalid record: casrepId does not exist`.

**Fix:** Preserve material records while atomically clearing the active relationship or retaining a separately modeled historical reference. Test that retained records remain readable and editable after case deletion, including rollback on persistence failure.

### F6 — P2 / Medium: one malformed ETR prevents Registry loading

**Location:** `index.html:4592`; missing date validation in `backend/internal/store/store.go:289`.

`etrLabel` calls `toISOString()` without validating its input, although the neighboring `date()` formatter handles invalid dates. Generic PATCH accepts `etr: "not-a-date"`. Persisting it on `demo-001` and reloading `/#casreps` produces “Workspace could not load / Invalid time value.” A single malformed record can therefore make the Registry unavailable.

**Fix:** Validate new date inputs and render malformed legacy dates as explicit invalid/missing data instead of throwing. Add a persisted-data browser regression.

**Evidence:** [Registry failure screenshot](/tmp/anchor-review-4ZOozt/adversarial-final/invalid-date-registry.png). The final reproduction reloads the page after the API write so it reads the persisted value.

### F7 — P2 / Medium: static material edits silently discard another tab's changes

**Location:** `index.html:2846`–`:2868`, and the material store's whole-state `commit`.

`saveRequisition` merges against a cached snapshot, ignores `expectedRevision`, and writes the entire stale material state. Two store instances sharing the same browser-storage adapter reproduced data loss: tab A saved a new comment; tab B changed status using its old snapshot; the new comment disappeared and the previous notes returned. Stale whole-state writes can also affect unrelated material records.

**Fix:** Reload authoritative browser storage before writes, compare revisions, and preserve unrelated current records. Add a real two-tab browser test for conflicting notes/status edits and distinct-record edits. The present reproduction exercises the exact static model with two storage-sharing instances.

### F8 — P2 / Medium: incomplete pagination is silently accepted

**Location:** `index.html:3648`–`:3651`.

`all()` returns accumulated rows whenever a page is empty, even if `meta.total` says additional records exist. A two-page probe advertising two records but returning one followed by an empty page completed successfully with one row. Startup can accept partial data as its loaded corpus, undermining complete inventory, counts, and analysis coverage.

**Fix:** Reject premature empty pages and reconcile total, offsets, and unique identities. If concurrent changes prevent a consistent read, retry with bounded attempts or show an explicit incomplete-acquisition state. Test failed, empty, duplicate, and inconsistent pages beyond the first page.

**Evidence for F7/F8:** [model reproduction script](/tmp/anchor-review-4ZOozt/model-probes.cjs), [results](/tmp/anchor-review-4ZOozt/model-probes.log).

## Confirmed configuration and verification findings

### F9 — P2 / Medium: package resource defaults override the embedded-model baseline

**Location:** `zarf-values.yaml:3`; mappings at `common/zarf.yaml:19` and `:44`.

The package supplies 100m/128Mi requests and 500m/512Mi limits, then maps those values over chart resources for both flavors. This overrides the chart's 500m/1Gi requests and 2 CPU/1Gi limits, contrary to the current embedded-model contract in SPEC, HANDOFF, and `docs/configuration.md`. Align the package defaults with the measured model baseline and test the effective rendered resources for both flavors. The source mapping is confirmed; no Kubernetes deployment or OOM/latency measurement was performed.

### F10 — P2 / Medium: local Trivy scans do not fail on findings

**Location:** `scripts/security-scan.sh:66`, `:124`, `:129`.

Both Trivy invocations omit `--exit-code 1`, permitting the wrapper to print “Security scans passed” despite Trivy-only high-severity configuration or secret findings. An isolated root-user Dockerfile produced DS-0002/HIGH with exit 0; adding `--exit-code 1` returned 1. Grype's vulnerability gate does not cover configuration/secret-only findings.

**Fix:** Set explicit failing exit codes on both invocations and add a known-bad fixture check for the scan wrapper. The CI Trivy action already configures a failing exit code. The current repository scan returned no high/critical findings; this is a gate-behavior defect, not a claim of an unreported current CVE.

### F11 — P2 / Medium: local E2E defaults can mutate an existing development database

**Location:** `playwright.config.cjs:29`.

`reuseExistingServer: !process.env.CI` skips the temporary-database server command if an existing server answers port 4173. Tests then create, update, and delete records on that server. The default local invocation therefore does not guarantee the isolation promised by the test contract.

**Fix:** Disable reuse by default and require a server owned by the test run. This review used `CI=1`, so it did not exercise the unsafe reuse path or mutate an existing development server.

### F12 — P2 / Medium: the central workflow test bypasses failure-artifact retention

**Location:** `tests/e2e/editor-workflow.spec.cjs:4`; `tests/casrep-editor.browser.test.cjs:48` and `:230`.

The Playwright test delegates to a standalone helper that launches its own Chromium browser/context without tracing or video. Runner fixture retention settings do not apply to it. Failures before its manually captured late screenshots can lose the relevant browser evidence.

**Fix:** Accept runner-owned browser/page fixtures or explicitly capture trace, video, and failure screenshots for the helper. This test passed during review. Extra standalone suites were run with a temporary capture preload so their actual failures retained all three artifact types.

### F13 — P2 / Medium: three maintained standalone browser suites are stale and fail

These tests are outside the 54-test release gate:

| Suite | Failure | Evidence-based interpretation |
| --- | --- | --- |
| `tests/casrep-assistant.browser.test.cjs:123` | Waits for an unsaved-draft warning that never appears | The original `PRESERVE MY UNSAVED PUMP` record was found in the temporary database: autosave already preserved it. The assertion assumes the earlier non-autosave lifecycle. |
| `tests/casrep-assistant-navigation.browser.test.cjs:38` | Waits for `data-ca-open-draft` immediately after entering facts | The current flow requires fact confirmation first; the test never confirms. Its later pending-command checks are not reached. |
| `tests/casrep-admin.browser.test.cjs:4` | Waits for “Save and apply to all” | The actual button is “Save and apply to open reports.” The main schedule E2E uses the current label and passes. |

**Fix:** Update these tests to current contracts, migrate their distinct acceptance paths into the release suite, and ensure every supported browser entry point runs in CI. These are test failures, not evidence that the intended application flows all fail. The full suites remain failed; no assertions were changed to obtain a green result.

## Additional release/configuration observations

- **Release ordering is not enforced in the checked-in workflows.** `.github/workflows/fly-backend.yml:30`, `.github/workflows/pages.yml:86`, and `.github/workflows/publish-casrep-command-image.yml:36` deploy or publish independently of correctness/security workflows. Pages checks API capabilities, not test success for the source revision. Require successful checks for the exact revision and scan the image being published. Remote branch/environment protection was not inspected, so this is a confirmed repository-level gap with potentially external mitigation.
- **The old Gitleaks Action remains before the CLI replacement.** `.github/workflows/security.yml:22` still invokes the licensed action, despite docs saying the CLI removed the organization-license dependency. For an organization without a license, that step can prevent the later CLI scan. The [pinned action documentation](https://raw.githubusercontent.com/gitleaks/gitleaks-action/f586c14365d4643c6aa59d472ae6e984bf47bb34/README.md) makes this organization-dependent; no claim is made that the current personal-owner repository fails for this reason.
- **Known prototype security limits remain material.** Generic CRUD/workflow paths are unauthenticated, reviewer identity is supplied by the client, generic writes can bypass workflow guards, history is mutable, and persistence supports one process. These are explicitly documented boundaries, not newly discovered regressions. This review does not establish production readiness or suitability for sensitive data.

## Verification results

| Check | Result | Scope/qualification |
| --- | --- | --- |
| Full isolated Playwright release suite | **54 passed**, no retries, approximately 1.8 minutes | Includes the seven broad editor acceptance groups and `demo-rich-1008`. Chromium only. |
| Expanded JS/model/seed tests | **153 passed**, 0 failed/skipped | All 18 non-browser test files, including PLAD seed extraction outside the ordinary npm unit script. |
| Go race/coverage tests | **Passed** across all four packages | Overall statement coverage **67.1%**: server 59.3%, Assistant 73.7%, auth 71.4%, store 66.9%. No race report. |
| `go vet ./...` | **Passed** | Backend static checks. |
| Documentation sync and `git diff --check` | **Passed** | No application/backend implementation edits. |
| Three standalone browser suites | **All three failed** | Stale expectations/selectors in F13; traces/screenshots/videos preserved. |
| Actual API/browser adversarial probes | **Six defects reproduced** | CORS mismatch, static-file exposure, stored XSS, post-login CSRF failure, persisted invalid-date failure, and orphaned material updates. These are reproduction successes, not acceptance-test passes. |
| Static-model/API-client probes | **Two defects reproduced** | Lost static material comment and incomplete pagination. |
| npm audit | **0 advisories** | All severity levels, current locked dependencies. |
| Gitleaks 8.30.1, all local refs | **0 findings**, 108 commits | Redacted history scan; not an audit of remote secret stores. |
| Trivy 0.76.1 filesystem scan | **0 HIGH/CRITICAL findings**, exit 0 | Vulnerabilities, configuration, and secrets. Does not substitute for scanning the built runtime image or the Go standard-library binary. |
| OpenGrep 1.19.0 | **0 findings**, partial coverage | 380 rules on 122 scanned files; five parsing warnings involving Helm templates and workflow Bash snippets. CI pins a newer 1.33.1 binary. |
| Container image/Grype, CodeQL, Gosec, live UDS/Fly | **Not run in this review** | No current-image vulnerability or deployment certification claimed. |
| Actual packaged-model inference | **Not run** | Provider contract/process tests use fakes; release E2E mocks model responses. |

### E2E coverage exercised

The release suite covers representative canonical INITIAL/UPDATE/CORRECT messages; required-field submission blocking; autosave and recovery; delayed/failed writes; API persistence and reload; ordered review/return/release/transmission/follow-on behavior; review history; deletion and transmitted-record protection; command schedule application and partial failure; material comments/delivery; ownership/settings conflicts; reporting pagination; configured API failure; static fallback; message/overview printing and PDF; queue filters/paging/return focus; responsive navigation, dark mode, and keyboard interactions; department analysis and stale results; Assistant fact confirmation and conversation controls.

Remaining gaps include actual authenticated same/cross-origin Assistant flows, real provider inference, hostile stored metadata, two-tab material concurrency, incomplete/inconsistent acquisition, retained-material edits after deletion, and malformed persisted dates. Firefox/WebKit, automated accessibility auditing, sustained load, restart/crash durability, and multi-instance behavior were not exercised. Responsive/keyboard checks are not a complete accessibility certification. The Analysis review tested code and accounting contracts, not substantive review of every fictional narrative.

## Commands and evidence

Primary commands:

```sh
CI=1 ASSISTANT_PROVIDER=none CHROME_EXECUTABLE=/usr/bin/chromium npm run test:e2e -- --retries=0
# From backend/:
go test -race -coverprofile=/tmp/anchor-review-4ZOozt/go-coverage.out ./...
go vet ./...
# From repository root:
node backend/scripts/check-doc-sync.cjs
git diff --check
npm audit --audit-level=low --json
gitleaks git --log-opts=--all --redact --no-banner
trivy fs --scanners vuln,misconfig,secret --exit-code 1 --severity HIGH,CRITICAL .
opengrep --config auto --max-target-bytes 0 --error .
```

The JS run included every `tests/*.test.cjs` except standalone `*.browser.test.cjs`, plus both `backend/scripts/*.test.cjs`; those browser scripts were exercised separately, with the editor helper already included in the release suite.

- [Playwright HTML report](../../playwright-report/index.html) and repository `test-results/` contain the release-suite screenshots/PDFs.
- [Unit log](/tmp/anchor-review-4ZOozt/unit.log), [Go test log](/tmp/anchor-review-4ZOozt/go-test.log), [E2E log](/tmp/anchor-review-4ZOozt/e2e.log).
- [Adversarial browser script](/tmp/anchor-review-4ZOozt/adversarial-browser.cjs), [results](/tmp/anchor-review-4ZOozt/adversarial-final/results.json), [trace](/tmp/anchor-review-4ZOozt/adversarial-final/trace.zip).
- [Model probes](/tmp/anchor-review-4ZOozt/model-probes.cjs) and [results](/tmp/anchor-review-4ZOozt/model-probes.log).
- [Standalone runner](/tmp/anchor-review-4ZOozt/additional-e2e.cjs), [Assistant failure trace](/tmp/anchor-review-4ZOozt/casrep-assistant/context-4-trace.zip), [navigation failure trace](/tmp/anchor-review-4ZOozt/casrep-assistant-navigation/context-7-trace.zip), [Admin failure trace](/tmp/anchor-review-4ZOozt/casrep-admin/context-1-trace.zip). Sibling files include screenshots, videos, logs, and fictional databases.
- [npm audit](/tmp/anchor-review-4ZOozt/npm-audit.json), [Gitleaks](/tmp/anchor-review-4ZOozt/gitleaks-all.json), [Trivy](/tmp/anchor-review-4ZOozt/trivy.json), [OpenGrep](/tmp/anchor-review-4ZOozt/opengrep.json).

Temporary probes and databases remain under `/tmp/anchor-review-4ZOozt`; preserve them before normal temporary-file cleanup if long-term evidence is needed. Traces contain fictional test data and a deliberately fictional shared password. No production credential was used. The first combined probe required a harness correction to reload after an API date edit; `adversarial-final` is the completed reproduction result.

## Recommended remediation order

1. Close stored-XSS and default static-serving exposure; add API-to-browser hostile-data regressions.
2. Repair shared-login CSRF delivery and documented CORS wiring; cover real browser login/request/logout.
3. Fix retained material relationships, malformed dates, static concurrency, and acquisition reconciliation with focused regression tests.
4. Align effective package resources; enforce scan exit codes, owned test servers, artifact retention, and release ordering.
5. Repair/migrate stale standalone tests, then rerun all model/backend tests and the full isolated Playwright gate.

No application fixes were applied as part of this review.
