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

## Image publication prerequisite

The package pins `ghcr.io/fleethacker/casrep-command:0.1.0`. Tag a release as
`v0.1.0` (or the matching later version) to run
`.github/workflows/publish-casrep-command-image.yml`; it builds
`backend/Dockerfile` and pushes the image to GitHub Container Registry before a
Zarf artifact is created. That image build includes the checksum-verified GGUF
model and `llama-server`; publish it from the same source revision as the UDS
package. The upstream flavor does not build or substitute a local image.

For local development, `uds run dev` builds a host-architecture image from
`backend/Dockerfile`, saves it as an OCI archive, and creates the `local` Zarf
flavor from `zarf.internal/casrep-command:0.1.0`. The local archive is ignored
by Git. It is never used by the release package; release packages use the
multi-architecture GHCR image.

The local flavor uses `imagePullPolicy: Always` and a Helm release-revision pod
annotation to replace the pod on every upgrade, even when the image tag is
unchanged. The upstream flavor retains its normal versioned-image behavior.
Both flavors use `Recreate` deployment strategy so the file-backed store has
one writer throughout an upgrade. This causes brief downtime and preserves the
existing PVC; it does not reset data.
The application chart uses Zarf's `serverSideApply: "false"` and explicitly
clears `rollingUpdate` so existing deployments can transition to `Recreate`.
Helm 4 server-side apply retained that server-defaulted field during testing.

## Task runner

`tasks.yaml` uses version-pinned UDS Common remote task includes. Run
`uds run --list` to list tasks. On a running UDS Core cluster, `uds run dev`
creates the package, creates the test bundle, deploys it, and requires two real
model responses plus rejection/recovery checks. `uds run verify-inference`
repeats only the deployed-model checks. Both use the verifier shipped in the
image; neither requires host Node or npm. Open https://casrep-command.uds.dev.
`uds run default` first creates the standard k3d UDS Core test cluster.
See [the inference runbook](INFERENCE-VERIFICATION.md#uds-development) for
expected output, UI verification and storage troubleshooting.
