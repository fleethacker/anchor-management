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

Both package flavors configure the image's verified `llama-server` and
SmolLM2-360M-Instruct Q8 model as the loopback-only Assistant provider. The
model path, executable, provider, 4096-token context, 600-token response limit,
and 60-second startup allowance are package-owned. They are not Zarf values:
allowing deployment callers to select a binary, model path, or endpoint would
weaken the packaged inference boundary.

The model is loaded before the API listens, so the liveness probe waits 75
seconds. The 1Gi memory request/limit is the documented initial benchmark
profile, not a measured universal capacity guarantee. Increase the package
resource values only after measuring the approved target environment.

## Image publication prerequisite

The package pins `ghcr.io/fleethacker/casrep-command:0.1.0`. Tag a release as
`v0.1.0` (or the matching later version) to run
`.github/workflows/publish-casrep-command-image.yml`; it builds
`backend/Dockerfile` and pushes the image to GitHub Container Registry before a
Zarf artifact is created. That image build includes the checksum-verified GGUF
model and `llama-server`; publish it from the same source revision as the UDS
package. The package intentionally does not build or substitute a local image.

For local development, `uds run dev` builds a host-architecture image from
`backend/Dockerfile`, saves it as an OCI archive, and creates the `local` Zarf
flavor from `zarf.internal/casrep-command:0.1.0`. The local archive is ignored
by Git. It is never used by the release package; release packages use the
multi-architecture GHCR image.

## Task runner

`tasks.yaml` uses version-pinned UDS Common remote task includes. Run
`uds run --list` to list tasks. On a running UDS Core cluster, `uds run dev`
creates the package, creates the test bundle, and deploys it. `uds run default`
first creates the standard k3d UDS Core test cluster.
