# Configuration

CASREP Command exposes only workload-scale and scheduling settings through Zarf
values. Image, networking, security, and environment settings stay package-owned
to preserve airgap integrity and UDS policy compatibility.

| Value | Default | Effect |
| --- | --- | --- |
| `app.resources` | `100m/128Mi` requests, `500m/512Mi` limits | Container compute and memory. |
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

## Image publication prerequisite

The package pins `ghcr.io/fleethacker/casrep-command:0.1.0`. Tag a release as
`v0.1.0` (or the matching later version) to run
`.github/workflows/publish-casrep-command-image.yml`; it builds
`backend/Dockerfile` and pushes the image to GitHub Container Registry before a
Zarf artifact is created. The package intentionally does not build or substitute
a local image.

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
