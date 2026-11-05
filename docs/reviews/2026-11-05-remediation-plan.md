# Correctness and security remediation plan

Status: R0–R2 implemented and verified in the working tree after integrating
latest `main` (`140be88`). See [verification evidence](2026-11-05-remediation-r0-r2.md).
R3–R9 and the production-security track remain pending.

Baseline: `f05bdaa392380ed9e01f3c67012f065b6d9305e3`. Source: [2026-11-05 review](2026-11-05-correctness-security-review.md).

## Outcomes and scope

Close all 13 confirmed findings, address release ordering and the duplicate Gitleaks integration, and turn the reproduced failures into maintained regression tests. Preserve fictional fixtures, canonical traffic, review history, reporting clocks, static fallback, and existing supported workflows.

Two completion milestones apply:

- **Remediated demonstration release:** R0–R9 below are complete, all findings have passing regression evidence, and the release pipeline publishes only verified artifacts. Existing prototype identity/storage restrictions remain explicit.
- **Production readiness:** P1–P4 additionally establish authenticated identities, authorization, durable audit, and a supported persistence/deployment topology. Passing the first milestone does not authorize sensitive or operational data.

The user authorized implementation. Deployment, live migration, and external
issue creation remain separate execution tasks. The user owns staging, commits,
and pushes. Slices can become separate PRs; each must remain runnable and include
its applicable verification and documentation.

## Finding coverage and delivery order

| Slice | Findings / observations | Deliverable | Dependencies |
| --- | --- | --- | --- |
| R0 | F11, F12 | Owned isolated test servers and reliable failure artifacts | None |
| R1 | F1 | Safe history/review rendering and nested-input validation | R0 for browser proof |
| R2 | F2 | Explicit static asset serving and loopback development default | R0 for server proof |
| R3 | F3, F4 | Working shared-login CSRF and documented CORS policy | R0; ship after R1 |
| R4 | F5, F6 | Retained material integrity and resilient date handling | R0 |
| R5 | F7; static completion of F5 | Coordinated static writes and stale-edit conflicts | R4 relationship semantics |
| R6 | F8 | Complete acquisition from a consistent data version | R0; integrates all preceding store changes |
| R7 | F9; packaged-model coverage | Effective resource defaults and measured model smoke tests | R0; no dependence on frontend fixes |
| R8 | F10; Gitleaks observation | Enforced security gates with explicit scan coverage | None; model/image gate uses R7 |
| R9 | F13; release-ordering observation; E2E gaps | Unified maintained suites and verified-artifact release pipeline | R0–R8 |
| P1–P4 | Known prototype security/persistence limitations | Production access, audit, durability, and operational controls | Design can start earlier; production exit follows R0–R9 |

R0 is a small harness change, not a full test rewrite. R1 and R2 are the first product fixes and can be prepared independently. R4/R5 own material-state behavior; R6 follows them to cover every mutation in its data-version protocol. R7/R8 can proceed independently. Concurrent implementation should avoid overlapping edits to the embedded `index.html` modules.

## R0 — Own the test environment and artifacts

**Files:** `playwright.config.cjs`, `tests/e2e/editor-workflow.spec.cjs`, `tests/casrep-editor.browser.test.cjs`, a small shared E2E fixture module, CI artifact configuration.

1. Use a test-owned server for every local and CI run. Bind an OS-assigned loopback port and obtain the address from the owned process after binding. Never reuse or write to a pre-existing listener. This supersedes the original fixed-port fail-fast proposal; see ADR 0021.
2. Give each independent test fixture/project an owned Go process, temporary database copied from fictional seed, and a local endpoint. Related pages in a concurrency test intentionally share that fixture's database. Build the test binary once where practical.
3. Validate custom acceptance URLs as owned local fixture endpoints. Eliminate the ability for the maintained runner to target Fly or an arbitrary external API. Retire unsafe standalone entry points after migration in R9.
4. Refactor the broad editor acceptance helper to accept Playwright-owned `page`, `context`, and output/attachment facilities. Do not launch an unmanaged browser inside a runner test.
5. Retain HTML report, traces, screenshots, videos, server logs, and fictional database on failure. Remove only run-owned temporary resources after successful tests; do not erase previous failure evidence.

**Acceptance:** A sentinel server already bound to the test port receives zero mutation requests. An intentional early assertion failure yields a usable trace, screenshot, and video; a backend startup failure retains logs. The normal workflow suite still passes. Playwright fixtures provide the intended browser lifecycle interface; see [official fixture documentation](https://playwright.dev/docs/test-fixtures).

## R1 — Eliminate stored script execution

**Files:** history/review/comment/comparison renderers in `index.html`; `backend/internal/store/store.go` and focused validation helpers/tests.

1. Use the existing escaping function or text nodes for every persisted value interpolated into these views, including revisions. Audit text, attribute, URL, and inline-event contexts separately; HTML escaping alone is not a universal solution for all contexts.
2. Define the accepted shapes and bounds of history/review structures. Reject newly supplied malformed revisions and collections with 422; keep unrelated supported/unknown case fields intact.
3. Render pre-existing malformed metadata safely and disclose unavailable values. Do not rewrite canonical traffic, discard historical entries, coerce invalid revisions into fabricated numbers, or invent approval evidence to satisfy validation.
4. Treat safe rendering as the primary protection: backend validation is additional protection and cannot make legacy data trusted.

**Acceptance:** Hostile values in saved/submitted revisions and adjacent metadata never execute when opening history, comments, comparison, print, or report views. Valid metadata remains readable. New malformed writes are rejected; a temporary database containing malformed legacy metadata remains navigable. Convert the review's reproduction into assertions for safe behavior, rather than preserving assertions that the exploit executes.

## R2 — Restrict the HTTP static surface

**Files:** `backend/cmd/server/main.go`, server tests, `backend/API.md`, startup scripts/docs as needed.

1. Replace unrestricted directory serving with an allowlist for `/`, `/index.html`, and `/frontend-config.js`, plus any explicitly verified frontend assets. Directory listing and arbitrary repository paths are unavailable.
2. Preserve the trusted filesystem path used by the shared Node rules loader; restricting HTTP access must not break server-side model loading.
3. Default source-run listening to `127.0.0.1:8080`. Keep the image's explicit `0.0.0.0:8080` setting for container networking.
4. Permit only the necessary static HTTP methods and send correct content types. Keep API routes separate from static routing.

**Acceptance:** Root UI and configuration load; health, API commands, and rules capabilities work in source and container modes. Requests for `.git`, backend files, mutable databases, hidden configuration, directory indexes, and encoded/traversal variants return no file content. Tests verify the actual startup defaults.

## R3 — Repair browser sessions and CORS together

**Files:** `backend/internal/auth/auth.go`, server auth/middleware/configuration, embedded API client and Assistant login controls, Fly/configuration documentation.

### Session interface

- Return `csrfToken` in successful login JSON and authenticated session JSON, alongside existing expiry/authentication fields. Resolve session validity and token under the same authenticator lock.
- Cache the token only in client memory. Restore it with the authenticated session endpoint after reload; never store it in localStorage or place it in a URL.
- Keep the opaque session cookie HttpOnly. Use `Cache-Control: no-store` on authentication/token responses. Remove dependence on a readable CSRF cookie; explicitly expire the legacy cookie when retiring it.
- Guard mutations with the session-bound header token. Clear cached state on logout, expiry, or authentication failure. Preserve drafts and questions; do not automatically replay a workflow write after reauthentication.
- Keep Secure cookies for HTTPS. Explicit loopback HTTP development must use a compatible SameSite policy and must not silently disable production cookie protection.

### Origin policy

- Honor `CORS_ALLOWED_ORIGIN` for generic API routes. Honor `ASSISTANT_ALLOWED_ORIGINS` for auth/Assistant routes; inherit the generic policy only when the Assistant policy is absent.
- Preserve existing Fly behavior during rollout: if only the legacy Assistant variable is configured, allow its exact origins for the generic API as a documented, temporary compatibility fallback. Update Fly to set the intended generic origin explicitly, then remove the fallback in a separately documented compatibility change.
- With both settings absent, emit no cross-origin permission. Same-origin requests continue to work. Reject wildcard/malformed configured origins for credentialed access; use exact scheme/host/port matching and `Vary: Origin`.
- Validate disallowed browser origins on state-changing requests, including simple requests, rather than relying solely on preflight. CORS still does not authenticate direct HTTP clients.

**Acceptance:** Real browser login → authenticated model request to a local provider stub → reload/session restoration → logout succeeds. Missing/wrong token, expired session, disallowed/null origin, wildcard configuration, and blocked-cookie scenarios fail visibly without writes. Test actual process environment wiring, same-origin HTTP/HTTPS, and separate HTTPS origins.

**Deployment decision:** Prefer same-origin API routing for production login. Separate-origin cookie tests must distinguish cross-origin from genuinely cross-site use; a two-port localhost test alone does not cover third-party cookie restrictions. A Pages/Fly browser that blocks third-party cookies must receive an actionable connection/authentication error, not a false connected state. Server CORS cannot override that browser policy. [MDN CORS documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/CORS).

## R4 — Preserve material records and tolerate legacy bad dates

**Files:** backend store/delete/validation helpers, corresponding tests, date rendering and deletion refresh in `index.html`; an explicit orphan-repair script if required.

### F5: relationship repair

- Under the existing store write lock, delete only an eligible untransmitted case and clear its active `casrepId` from retained work orders/requisitions in the same persisted transaction.
- Preserve equipment, notes, histories, quantities, and statuses. Append an actual software-action history entry recording which link was removed; do not represent this as operational review or approval.
- Advance affected material revisions/timestamps and keep revision checks consistent across their write paths. Stale open dialogs must conflict rather than restore a removed reference.
- On persistence failure, roll back case deletion and all related modifications together. Refresh the client's material snapshot after successful deletion so it cannot immediately resubmit stale links.
- Provide an idempotent, dry-run-capable repair for existing dangling links. Record the known former ID and repair event only; do not infer when/how the absent case was deleted or reconstruct its contents.
- Implement the corresponding static unlink behavior with R5's coordinated writer. Interrupted multi-key static cleanup must be disclosed and reconciled on recovery; localStorage is not a multi-key transaction.

**Acceptance:** Delete → reload → edit retained requisition notes/status and work-order status succeeds. Transmission protection still rejects deletion. Stale edits conflict. Injected disk failure leaves all records unchanged. A second orphan-repair pass changes nothing. Case traffic, approvals, unrelated material, and reporting clocks remain unchanged.

### F6: date handling

- Make `etrLabel` use validated date parsing before any ISO conversion. Display invalid historical values explicitly instead of crashing or inventing a valid date.
- Define accepted formats/nullability for editable date fields, starting with ETR and checking the existing ETA/due-date adapters. Validate new creates and changed date inputs at the server.
- Do not make an unrelated legitimate update impossible merely because an untouched legacy field is malformed. Allow explicit correction and preserve raw legacy values until corrected.

**Acceptance:** Invalid ETR in a temporary persisted database leaves Registry, Overview, and report views usable with an invalid-data indication. New invalid dates return 422; valid dates, unset values, UTC boundaries, and existing reporting calculations continue to work.

## R5 — Make static material writes safe across tabs

**Files:** `casrep-material-model` and static material adapter in `index.html`, all material mutation callers, static-model tests, two-tab E2E tests.

Use one coordinated persistent mutation interface for requisitions and work orders:

1. Acquire an exclusive Web Lock named for the actual material storage key.
2. Re-read and validate current storage inside the lock.
3. Compare the caller's expected record revision; legacy records begin at revision zero.
4. Merge only the intended change into current state, preserve unrelated records, advance revision, and persist once.
5. Publish success and update the local cache only after persistence succeeds; release the lock automatically.

All persistent material writers, including status shortcuts, reset/repair paths, and deletion unlinking, must use this interface. Keep synchronous detached read access if useful; mutation callers must await completion. Existing backend material calls are already asynchronous, so this belongs behind the adapter rather than duplicating UI logic.

Use storage events for cache refresh/invalidation, not as a mutex. Reading localStorage immediately before writing is insufficient: two tabs can still interleave. Web Locks coordinate same-origin tabs but require browser support/secure-context availability. [MDN Web Locks documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API).

**Compatibility decision:** If safe coordination is unavailable, retain viewing and report an explicit inability to persist material edits; do not fall back to unlocked writes. An isolated in-memory adapter can remain writable. Document this limitation for unsupported/file-based contexts. If writable persistence in those contexts becomes a requirement, use a transactional IndexedDB adapter as a separate migration rather than inventing a localStorage lease algorithm.

**Acceptance:** Two pages in one browser context sharing localStorage cannot lose comments, statuses, or unrelated-record edits. Same-record stale edits show a conflict with the entered text retained. Distinct-record edits both survive. Test simultaneous saves, missing revisions, tab closure while waiting/holding a lock, quota/storage failures, and reload persistence. Existing CASREP update-notice behavior remains intact; notes-only edits do not move deadlines.

**Rollout limitation:** Old already-open tabs do not participate in new locks. Require all demo tabs to reload for the upgraded writer contract; do not claim old and new client versions can safely co-write. If that deployment guarantee cannot be made, introduce an isolated versioned storage migration before enabling writes.

## R6 — Require complete, version-consistent acquisition

**Files:** Go store snapshot/list interfaces and mutation bookkeeping, collection response metadata, `casrep-api-client`, startup/refresh activation, department coverage tests.

1. Reject malformed page metadata, premature empty pages, unexpected offsets, overfull pages, missing/duplicate IDs, non-progress, and total changes. Impose a bounded restart policy and show a retryable acquisition error after exhaustion.
2. Add an opaque data-version marker to list metadata, captured atomically with the records. Include a process epoch plus monotonic successful-write generation, or an equivalently strong version. Restart must invalidate old markers; failed writes must not advance the committed version.
3. Allow subsequent reads to supply the expected version and return 409 if it no longer matches. Do not perform a separate check followed by an unlocked list read. Cover every mutation path, including material side effects, comments, settings, deletion, and dedicated workflow commands.
4. Acquire all six startup collections—cases, assets, work orders, requisitions, PLAD templates, and command settings—against one matching version. Discard a failed partial acquisition and restart the whole load, up to three attempts.
5. Activate the backend workspace only after the full acquisition succeeds. On refresh failure, retain the last complete snapshot with a stale/incomplete warning; do not splice partial rows into it or switch to static writes. Respect existing pending-edit/generation guards.
6. Mark `sourceComplete` only for a reconciled supplied dataset. Narrative availability and ownership gaps remain separate. A stable total alone does not prove a stable snapshot.

**Compatibility:** List metadata is additive for existing consumers. Publish an additive health capability for the new acquisition contract and require it before deploying the frontend that depends on versions. Old backends must produce a clear compatibility error, not a false completeness claim. Static supplied datasets retain their own disclosed acquisition boundary.

**Acceptance:** Load more than 1,000 cases plus linked resources/settings, including open/closed cases. Exercise empty middle pages, duplicates, conflicting IDs, changed totals, same-total replacements, failures after page one, mid-load settings/material changes, and server restart. A consistent load returns every identity exactly once; inconsistent acquisition never becomes the active complete snapshot. Existing filtered deadline pagination remains correct.

## R7 — Align resources and exercise the actual packaged model

**Files:** `zarf-values.yaml`, schema/configuration docs, `common/zarf.yaml`, chart values, container/model verification jobs.

- Align package defaults with the current contract: requests **500m CPU / 1Gi memory**, limits **2 CPU / 1Gi memory**, unless actual measurement requires a revised documented baseline.
- Test effective rendered configuration for both upstream and local flavors, including precedence of Zarf values over chart values. Preserve supported explicit overrides; validate malformed resources and document supported minimums.
- Keep model binary/path/endpoint package-owned. Build or reuse the image from the exact reviewed source revision; retain checksum verification and no runtime download behavior.
- Run the image with the embedded provider enabled, a temporary fictional database, read-only root filesystem, dropped capabilities, and bounded writable mounts. Ordinary `/health` alone is not sufficient: assert model-ready capability and obtain a valid, source-scoped response to a bounded fictional question.
- Measure startup time, peak memory, response latency, and process exit/OOM behavior at the actual chart resource limits. Exercise a focused request, one-slot contention, provider failure, cancellation, and recovery while basic CRUD remains responsive.

**Acceptance:** Both flavors render the intended resources. The model starts within its configured allowance and responds within the supported request budget without OOM at those limits. Report measured values; if limits are inadequate, update all defaults/docs together and repeat the test. Test the packaged architectures on suitable runners before advertising support.

**Implementation workflow:** Use the applicable UDS context/package skills and prescribed package validation when implementing or validating this slice. No cluster or live package deployment is performed by this planning document.

## R8 — Make security scans enforce their result

**Files:** `scripts/security-scan.sh`, `.github/workflows/security.yml`, focused shell/fixture checks.

- Set `--exit-code 1` on filesystem and image Trivy scans. Scanner errors must also fail; do not print success after an ignored/nonzero result.
- Test the wrapper with a known-bad isolated Dockerfile and controlled command doubles for each failing stage, proving later build/publish work does not run. Keep a small real-scanner fixture test as well.
- Remove the obsolete licensed Gitleaks Action and retain the checksum-pinned CLI, all-ref history scan, redaction, and failing exit code. Do not add blanket ignores/baselines to obtain green results.
- Align local and CI scanner versions/rules. Render Helm templates before configuration scanning; validate workflow syntax with a suitable pinned tool. Review OpenGrep parse gaps explicitly so unparsed critical source cannot be labeled scanned.
- Retain npm audit, Gitleaks, OpenGrep, Gosec, CodeQL, Trivy, and Grype coverage. Scan the built Go/runtime image, including standard-library exposure, rather than treating `go.mod` scanning as complete runtime coverage.
- Keep CodeQL execution and findings policy distinct: a successful analysis upload is not proof of zero alerts. Define severity policy and required code-scanning checks in repository rules.

**Acceptance:** Known-bad inputs and scanner execution failures fail the relevant gate. Clean inputs pass. Local and CI commands enforce the same documented thresholds. Every unresolved parse gap, scanner finding, or time-limited exception is visible with an owner and expiry; no global suppression hides it.

## R9 — Finish E2E coverage and enforce verified releases

### Maintained test suites

**Files:** stale standalone browser suites, `tests/e2e/`, `tests/helpers/`, `package.json`, correctness/security workflows.

- Migrate the three stale suites' distinct scenarios into Playwright-owned fixtures. Preserve their intent: test successful autosave persistence separately from a deliberately blocked/failed save that must retain an unsaved buffer; perform fact confirmation before handoff; use current accessible schedule controls.
- Remove duplicated standalone scenario implementations or leave thin wrappers invoking the maintained runner. All supported acceptance commands must enter the isolated harness.
- Make `npm run test:unit` and CI use one discovery/list mechanism covering all non-browser tests and backend script tests. Exclude browser entry points deliberately; do not silently omit PLAD seed coverage.
- Add the F1–F8 regression scenarios to normal gates. Browser tests for auth must reach actual Go auth endpoints and a local provider stub, not mock the auth/model route pair away. Keep a distinct packaged-model test for R7.
- Run full Chromium business flows and a Firefox/WebKit matrix for supported portable flows. Restrict browser-specific PDF generation tests to Chromium explicitly; retain portable print/layout checks in other browsers.
- Add automated accessibility checks for core routes/dialogs plus manual keyboard/focus checks, narrow/short viewports, and error-state announcements. Treat this as measured coverage, not a blanket accessibility certification.
- Exercise restart persistence and interrupted writes with temporary storage. Use a bounded load test reflecting the declared single-process/one-model-slot topology; record the supported load and latency targets before using them as gates.

**Acceptance:** The current 54 release tests and 153 reported unit/model tests remain represented, with no lost scenarios; counts may grow or change through a documented consolidation. All formerly stale scenario intents pass. New regression tests fail against the vulnerable behavior and pass after remediation. No unexplained skips or retry-only success closes a finding. Traces/screenshots/videos remain available for failures.

### Release orchestration

**Files:** `.github/workflows/backend.yml`, `security.yml`, `fly-backend.yml`, `pages.yml`, and `publish-casrep-command-image.yml`; release/configuration documentation.

1. Expose reusable correctness/security workflows and make a release coordinator depend on their success for one immutable source SHA. GitHub supports reusable workflow jobs and explicit `needs` dependencies. [Official documentation](https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows).
2. Apply that requirement to main, tags, and manual dispatch. A manual action must not bypass verification. Inspect actual branch/ruleset/environment protections; record any required administrator configuration without assuming it already exists.
3. Build immutable image artifacts once for each supported architecture, scan/smoke-test them, then publish/promote those exact artifacts. Record source SHA and image digests; do not rebuild different bytes after scanning.
4. Deploy Fly from the verified image digest instead of an independent unscanned remote rebuild. UDS package releases must reference the same verified source/artifact lineage.
5. Deploy the compatible backend before Pages. Preserve capability checks and add those required by new contracts; publish the frontend artifact built from the verified source.
6. Keep untrusted PR verification free of deployment credentials. Restrict privileged publication to trusted refs and validated artifacts; do not grant privileges merely because an unrelated workflow completed.
7. Serialize production releases and retain previous compatible backend/frontend artifacts. A failed gate or compatibility check leaves the currently deployed version intact.

**Acceptance:** A failing test, scanner, model smoke check, or capability check prevents publication/deployment. A tag/manual dispatch cannot publish a different SHA or unscanned architecture. Record the verified SHA/digests in the release evidence. Test this wiring without deploying to live Fly during development.

## Production-security track — prerequisites before real data

These tasks address the review's documented limitations. They are larger than patching F1–F13 and require deployment-owner inputs; they are not silently satisfied by the shared Assistant password.

| Work item | Recommended direction | Required proof |
| --- | --- | --- |
| P1 — Identity and authorization | Use the deployment's OIDC identity provider; UDS Keycloak where applicable. Put frontend/API behind a same-origin authenticated entry point. Authenticate every data route and derive actor identity from the verified session. Define command/profile scope and originator/reviewer/CO/admin permissions in a written matrix. Restrict generic CRUD so it cannot amend protected workflow fields or bypass case commands. Keep fictional static simulation explicitly separate. | Anonymous, wrong-scope, wrong-role, forged actor, and direct generic-write attempts are denied without state changes. Legitimate ordered reviews still work and record actual principals. |
| P2 — Model and API resource controls | Add authenticated quotas/rate limits, bounded concurrency/queues, request/output limits, and cancellation. Apply access controls to embedded local inference as well as remote providers in production. Use a deployment-controlled egress/data policy and secret storage. | Flood/oversize/cancellation tests remain bounded; overload returns explicit errors; no provider key or sensitive prompt appears in browser state/logs; unauthorized users cannot consume model capacity. |
| P3 — Audit and persistence | Enforce one writer for the file-backed demo, including startup locking and rollout topology; a replica count of one alone does not prevent overlapping processes. Use a transactional database before multi-instance production. Recommended production direction: PostgreSQL transactions plus an outbox delivering audit events to independently access-controlled append-only retention. Define the audit failure policy. | Concurrent writes, restart/interrupted persistence, duplicate delivery, audit-sink outage, and restore tests preserve invariants. Application users cannot alter retained audit evidence. No claim of tamper resistance from mutable history or a hash stored beside it. |
| P4 — Deployment/operations | Confirm hosting topology, supported browsers, TLS, identity mappings, retention, backup/restore objectives, monitoring, incident ownership, and data handling requirements. Establish restore exercises and reviewed security controls before accepting non-demo data. | Signed-off configuration, observed restore success, ownership/runbooks, alert tests, and all release gates. Test evidence identifies the actual environment and resource limits. |

The repository's current Fly data is explicitly fictional and does not require a backup under its existing rules. Production backup/retention requirements apply only to the future production track. No operational approval, compliance status, or security accreditation is inferred from this plan.

## Documentation, migration, and rollout rules

- Every implementation slice synchronizes `backend/SPEC.md`, `backend/HANDOFF.md`, and the relevant ADR/new ADR. Update `backend/API.md` for payload/config changes; update `CONTEXT.md` only where domain meaning changes. Update `AGENTS.md` when required verification or deployment safety changes. Run `node backend/scripts/check-doc-sync.cjs`.
- Keep `index.html` as the fixture/model source of truth. Do not hand-edit extracted seed records. If fixture changes become necessary, regenerate with the existing extractor and validate all canonical traffic, including `demo-rich-1008`.
- Prefer additive response/schema changes and safe handling of old stored records. New validation must not silently destroy legacy history. Document forward and rollback compatibility per slice.
- Run any orphan-link migration on a stopped/quiesced writer or through a correctly locked in-process operation; never rewrite a live file behind a running Go process. For Fly, execute as Unix user `app`, restart/reload the service, and verify both the initial repair and an idempotent second pass. Preserve existing traffic/history. Live execution remains a deployment step, not an E2E test.
- Ship additive backend auth/acquisition support before its dependent frontend. Gate incompatible clients using capabilities. Test old-client/new-backend behavior where compatibility is promised.
- Roll back only to a compatible, non-vulnerable release pair. If a security fix fails rollout, contain the affected feature or roll forward; do not restore known XSS/file exposure as an ordinary rollback.
- Static writer updates require closing/reloading old tabs. If storage format changes, define an explicit versioned migration and recovery path before shipping.

## Completion ledger

A finding is closed only when its patch, regression proof, applicable documentation, and full affected gate pass. Track commit/SHA, test names, artifacts, and remaining limitations in a follow-up verification record.

- [x] F1: hostile stored metadata cannot execute.
- [x] F2: only intended frontend files are served.
- [ ] F3: real browser session/CSRF lifecycle works.
- [ ] F4: startup configuration enforces documented origin policy.
- [ ] F5: retained material remains editable; existing orphans have an idempotent repair path.
- [ ] F6: malformed legacy dates cannot break views; new bad inputs are rejected.
- [ ] F7: competing static writers cannot silently lose updates.
- [ ] F8: partial/mixed-version acquisition cannot become a complete workspace.
- [ ] F9: both package flavors use validated, measured resource defaults.
- [ ] F10: security scan findings/errors stop the gate.
- [x] F11: maintained test execution cannot reuse/mutate an unrelated server.
- [x] F12: early workflow failures preserve browser evidence.
- [ ] F13: all maintained standalone scenario intents pass in the unified gate.
- [ ] Release ordering: every publication uses successful verification for the exact source/artifact.
- [ ] Gitleaks: only the pinned CLI path remains; all-ref redacted scanning passes.
- [ ] Coverage gaps: cross-browser, accessibility, real auth, actual packaged inference, rendered configuration, runtime-image security, and declared durability/load checks have results or explicit unresolved blockers.
- [ ] P1–P4: production-security prerequisites are separately satisfied before real data is admitted.

The first implementation batch covers R0–R2. Latest-main integration includes
PR #37 (sidebar branding) and PR #38 (notification dismissal); their new browser
tests now use the same owned fixture. The next product slice is R3, repairing
shared-login CSRF and the origin policy. Completion evidence is recorded
separately from the historical review findings.
