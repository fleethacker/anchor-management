# Build one versioned package from source

Status: accepted

## Context

Local and upstream components deployed the same charts, namespace, and PVC using
different image inputs. The development task renamed a local-flavor archive for
bundle creation. Every image reused `0.1.0`, every package used `dev`, and the chart
used `IfNotPresent`. Changed HTML could be rebuilt and packaged without changing
the Deployment pod template or replacing a cached image.

## Decision

Use one `casrep-command` component and source-built image archive. Remove flavor
branches and archive aliasing. Keep the existing namespace, release names, and PVC.
The package version is explicitly maintained in `zarf.yaml`, initially `0.1.1`.
A monotonic version task updates the bundle reference and first-party chart/app
versions together. Unlike the generic UDS template's `dev` source convention, this
repository keeps real release versions in source at the user's request.

Use Docker's complete image ID in the deployed image tag, alongside the semantic
version. Prepare concrete Zarf and chart inputs with that same tag under the
ignored `.build/<arch>/` directory. Include only declared package sources and the
new image archive; old root package/bundle files never enter the build directory.
Use one explicit architecture for image, package, bundle, and deployment.

Record source, prepared-manifest, image-archive, package, bundle, and UI hashes.
Each dependent step rejects missing or changed inputs. Failed builds invalidate
the prior build state. The canonical `uds run dev` finishes by waiting for rollout
and comparing the running HTML with the built source. This catches a deployment
that reports success while serving the old UI.

Use `Recreate`, including clearing the rolling-update field, to preserve the
single-writer file store during upgrades. Align package resource defaults with the
existing chart/runtime contract of 1Gi memory and 500m/2 CPU requests/limits.

## Consequences

Node.js 20+, Docker Buildx, and UDS are build requirements. A GHCR image remains an
optional distribution artifact, not a separate package flavor; image publication
tags must match the package version. Existing Docker compiler/model caches remain
usable. Builds do not edit tracked version files. Development iterations may
replace generated archives within one version; shared releases require a version
bump. The development package task retains the existing skip-SBOM behavior.

The deployment has brief downtime while its single model-backed pod is replaced.
The persistent data volume is retained. Package tests cover architecture selection,
changed-image propagation, version drift, failure/stale-artifact guards, and stale
runtime HTML; native runtime verification remains required per architecture.
