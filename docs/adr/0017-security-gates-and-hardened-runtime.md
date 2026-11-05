# Security gates and hardened runtime

**Status:** accepted

The prototype remains fictional and unauthenticated, but its build and network
boundaries should fail closed where that does not require an identity system.
The API now bounds HTTP headers, request bodies, and connection durations;
configured CORS reflects only an explicitly configured exact origin; and the
mutable local database is private to the service account. These controls reduce
accidental exposure and resource exhaustion but do not provide authentication or
authorization.

CI runs Gitleaks over repository history, npm audit over the locked Node tree,
OpenGrep over tracked source, CodeQL over Go and JavaScript/TypeScript, and Gosec
over Go. Trivy scans source/configuration and the built image, while Grype scans
the built image. OpenGrep, Gosec, dependency, image, and configuration findings
fail at their configured thresholds; CodeQL uploads findings to GitHub Code
Scanning for review and repository policy enforcement. GitHub Actions are referenced by commit, and the image base references
are digest-pinned. The runtime image uses current Go and Node/Alpine lines, runs
as non-root `app`, removes npm tooling, keeps application files read-only, and
CI verifies operation with a read-only root filesystem, dropped capabilities,
and `no-new-privileges`.

## Consequences

- The hosted Fly deployment must set `CORS_ALLOWED_ORIGIN` to its exact Pages
  origin; CORS remains a browser policy, not an access-control mechanism.
- Production still requires an identity provider, server-side authorization,
  rate limits, durable tamper-evident audit storage, backups, and coordinated
  transactions before real data is accepted.
- Base image digest updates and scan findings are release work. Vulnerability
  ignores are not added silently.
- The static browser fallback and localStorage remain suitable only for the
  existing fictional demonstration boundary.
