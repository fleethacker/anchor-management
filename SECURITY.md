# Security review and operating boundary

## Scope

This repository is a fictional, notional CASREP prototype. It is not an
appropriate store for classified, operational, personal, or otherwise sensitive
information. The hosted Fly volume contains demonstration data only.

The review covers the Go API, embedded browser client, persistence, container
build, GitHub Actions, and the Fly/Pages deployment seam.

## Findings and disposition

| Finding | Severity | Disposition |
| --- | --- | --- |
| No authentication or authorization; reviewer and actor IDs are client claims, and generic CRUD can bypass workflow rules | Critical for real data | Accepted prototype limitation. Add an identity provider, server-side RBAC/ABAC, and restrict generic CRUD before handling anything other than fictional data. |
| Stored JSON history is not tamper-evident and the service is single-instance | High for audit use | Accepted prototype limitation. Use transactional durable storage, append-only audit records, backups, and multi-instance coordination for production. |
| Public API has no application rate limit or abuse control | High for internet exposure | Partially mitigated with request/header/body/time limits. Add edge authentication, rate limiting, quotas, and observability before production exposure. |
| Browser localStorage contains local chat and draft recovery state | Medium | Accepted for fictional data. Do not place sensitive data in static-demo storage; move recovery/history behind an approved protected client boundary if needed. |
| CI action/image supply chain and leaked-secret risk | High | CI now pins GitHub Actions by commit, runs Gitleaks over repository history, and runs Trivy source/configuration scans. |
| Container runs with unnecessary root/package-manager surface | Medium | Mitigated: pinned base digests, current Go/Node/Alpine lines, non-root `app` user, read-only application files, removed npm tooling, and CI read-only/capability-drop smoke test. |
| Cross-origin writes were previously allowed from every origin | High for a writable API | Mitigated for the hosted deployment with an exact Pages origin. `CORS_ALLOWED_ORIGIN` must be set to the exact origin for every deployment; CORS is not authentication. |
| OpenGrep flags trusted process startup and intentionally readable CSRF cookies | Low static-analysis noise | Reviewed inline suppressions document that the process path/arguments are startup-only configuration, production cookies default to `Secure`, and the CSRF cookie must remain readable so browser code can send its header. |

## CI gates

`.github/workflows/security.yml` runs on pushes, pull requests, and weekly:

- The checksum-verified Gitleaks CLI scans all repository history and redacts
  findings. It runs directly without the organization-license requirement of
  the commercial GitHub Action. Findings still fail the job.
- `npm audit` checks the locked Node dependency tree.
- OpenGrep scans tracked Go, JavaScript, HTML, YAML, Dockerfile, and related
  source with its security rules; findings fail the job.
- CodeQL analyzes Go and JavaScript/TypeScript and uploads code-scanning
  findings to GitHub.
- Gosec analyzes Go with medium-or-higher, high-confidence findings failing the
  job.
- Trivy scans source dependencies, secrets, Dockerfile configuration, and the
  built image for HIGH/CRITICAL findings.
- Grype scans the built image with a HIGH cutoff.
- The image is exercised as non-root with a read-only root filesystem, dropped
  capabilities, `no-new-privileges`, and writable temporary/data mounts only.
- The full image build is owned by this job and uses scoped BuildKit cache
  layers; pull requests cannot write into the default-branch cache scope.

A scan finding is a release blocker. Do not add an ignore entry without a
reviewed, documented expiry and an explanation of why the finding is not
reachable. The three inline OpenGrep suppressions above are intentionally
narrow, adjacent to the affected statements, and must be revisited if the
startup configuration or cookie model changes.

## Local review commands

The complete local wrapper runs the blocking checks, downloads and verifies the
pinned OpenGrep binary, installs the pinned Gosec version into the user cache,
and builds/scans the container:

```sh
npm run security:scan
```

CodeQL remains a GitHub Actions check because its database and code-scanning
upload flow are CI-oriented.

The Go/API and browser correctness gates remain the commands in
`backend/HANDOFF.md`.
