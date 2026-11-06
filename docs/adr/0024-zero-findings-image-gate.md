# Scan final images before packaging or publication

Status: accepted

## Context

Two CI workflows still selected Node 20 despite the runtime using Node 24.
Local Trivy commands did not fail on findings, image CI checked only high and
critical severity, and publication rebuilt/pushed images without a scan gate.
On 2026-11-06, Trivy found no vulnerabilities in the baseline amd64 image while
Grype reported CVE-2025-60876 against three BusyBox packages. Scanner agreement
and coverage cannot be assumed.

## Decision

Use Node 24.22.2 LTS in CI and the digest-pinned runtime image. Pin the Alpine
build stages too. Remove unused BusyBox, APK and their shell utilities from the
final image through the package manager, preserving inventory metadata, CA roots
and user/group files. Replace the package verifier's `sha256sum` invocation with
Node hashing. Preserve Go/Node rule execution, bundled model inference, UID/GID,
namespace/PVC and single-writer deployment behavior. Bump the package through
the canonical version task to 0.1.3.

Require complete Trivy and Grype reports for the same image with zero findings,
including unknown, unfixed and ignored findings. Reject malformed reports and
tool failures. Retain reports, image identity and CycloneDX inventory. Package
preparation scans before exporting or recording success. GHCR uses native
architecture builds, scans both, and publishes their exported bytes without a
second build. Fly scans locally and deploys the pushed registry digest.
Repository workflows enforce this policy; manual tool commands remain capable
of bypassing it and are not evidence of a gated release.

## Consequences

Builders now require Trivy/Grype and current vulnerability databases, including
approved database transfers for offline builds. A new low-severity or unfixed
advisory can block a release. No ignore list is introduced. Dependency updates
are proposed weekly for review; branch protection must require the security job.
The final image has no interactive shell. Diagnostics use Go/Node commands.

Zero known scanner findings is a time-bounded release condition, not proof of
zero vulnerabilities. Source-built llama.cpp, Node's binary and other embedded
components still need upstream advisory review. Preserve SBOMs and scan metadata,
rescan exact archived images before transfer/release, and distinguish local
validation from hosted CI, native arm64 and in-cluster upgrade verification.
