# Configuration

CASREP Command exposes only workload-scale and scheduling settings through Zarf
values. Image, networking, security, and environment settings stay package-owned
to preserve airgap integrity and UDS policy compatibility.

| Value | Default | Effect |
| --- | --- | --- |
| `app.resources` | `500m/1Gi` requests, `2 CPU/1Gi` limits | Container compute and memory. The embedded local model requires the 1Gi memory baseline. |
| `app.storageSize` | `1Gi` | Persistent volume size for fictional demonstration data. |
| `app.podAnnotations` | `{}` | Pod metadata annotations. |
| `app.nodeSelector` | `{}` | Node selector. |
| `app.tolerations` | `[]` | Pod tolerations. |
| `app.affinity` | `{}` | Pod affinity rules. |

Deploy with a values file:

```yaml
app:
  storageSize: 2Gi
```

Use `uds zarf package deploy <package> --values values.yaml`, or a targeted
override such as `--set-values app.storageSize=2Gi`. The package fixes the
deployment at one replica because the application uses a ReadWriteOnce,
file-backed store; shared transactional storage is required before replicas can
become configurable.

## Embedded local Assistant

The package configures the image's verified `llama-server` and
SmolLM2-360M-Instruct Q8 model as the loopback-only Assistant provider. The
model path, executable, provider, two threads, 4096-token context, 600-token response limit,
and 60-second startup allowance are package-owned. They are not Zarf values:
allowing deployment callers to select a binary, model path, or endpoint would
weaken the packaged inference boundary.

Chart defaults and `zarf-values.yaml` both set 500m CPU / 1Gi requests and
2 CPU / 1Gi limits. A CPU limit below this profile can cause inference to exceed
the server's 30-second request timeout even while ordinary health passes.
The model is loaded before the API listens, so the liveness probe waits 75
seconds. The 1Gi memory request/limit is the documented initial benchmark
profile, not a measured universal capacity guarantee. Increase the package
resource values only after measuring the approved target environment.

## One package and versioned builds

There is one `casrep-command` component, with no local/upstream flavors. Every
package build uses the checked-out source and `backend/Dockerfile`, including the
verified GGUF model and `llama-server`. A separately published GHCR image is an
optional distribution artifact, not a second package input.

`zarf.yaml`'s `metadata.version` is the release source of truth, currently
`0.1.2`. Before distributing a changed package, bump the version explicitly:

```bash
uds run set-version --set VERSION=0.1.3
```

This updates the package, bundle/ref, image base tag, and first-party chart/app
versions together. Versions must increase; builds reject drift. Review and
commit these changes with the release. A `vX.Y.Z` image-publication tag must
match the package version. Building does not change tracked version files.

Each build also tags the image as `zarf.internal/casrep-command:<version>-<image-id>`
using Docker's complete SHA-256 image ID. The prepared Zarf image declaration and
Helm values use that same tag. Changed image bytes therefore change the pod
template and avoid a cached older image, even during development iterations
within one package version. Unchanged image bytes keep the same identity.

Generated manifests, image archives, build metadata, and versioned artifacts live
under `.build/<arch>/` and are excluded from Git and the Docker context. Package
and bundle filenames contain the semantic version, with no flavor suffix or
renamed archive alias. Builds within one version replace that version's generated
artifacts; bump the version before sharing a new release.

The helper records input and artifact hashes. Changed source, altered prepared
manifests, missing/corrupt artifacts, or a failed preceding build stop deployment
instead of silently selecting an older archive. Use the task runner rather than
creating a package directly from the unprepared root definition.

The application chart uses Zarf's `serverSideApply: "false"` and explicitly
clears `rollingUpdate` so existing deployments can transition to `Recreate`.
Helm 4 server-side apply retained that server-defaulted field during testing.

## Task runner

Requirements are Node.js 20+, Docker with Buildx, and UDS CLI with image-archive
support (Zarf 0.68+). Run `uds run --list` to list tasks.

- `uds run prepare-package` builds the image and generates concrete package inputs.
- `uds run create-package` also lints and creates the Zarf archive.
- `uds run create-test-bundle` builds the image, package, and bundle without deployment.
- `uds run dev` builds everything, deploys to the current cluster, waits for rollout,
  verifies that `/app/static/index.html` matches the built checkout, and requires
  two real model responses plus rejection/recovery checks.
- `uds run verify-inference` repeats the deployed-model checks from the image.
  See [the inference runbook](INFERENCE-VERIFICATION.md#uds-development).
- `uds run verify` repeats the rollout/UI check for the recorded build.
- `uds run default` first invokes the pinned UDS Common disposable cluster setup task.

The architecture defaults to the Node runtime's host architecture. Set
`--set ARCH=arm64` or `--set ARCH=amd64` to build explicitly for a target cluster;
Docker must support that target. The same architecture is passed to image, package,
bundle, and deployment commands. The checked-in build tests exercise both paths;
native runtime verification must still be performed on each target architecture.

The namespace, Helm release names, and PVC remain `casrep-command`. Upgrades use
`Recreate` to keep a single JSON-store writer; expect a brief interruption while
the model loads. Existing persistent records are preserved rather than reseeded.
