# Dependencies

CASREP Command has no PostgreSQL, Valkey, MinIO, SSO, or metrics dependency.
It persists fictional demonstration data in a single JSON file on its own
ReadWriteOnce persistent volume. This requires a single replica.

The application bundles its Go API, static client, Node.js workflow helper, and
seed data in one pinned image. UDS Core provides ambient mesh, ingress exposure,
and declarative network policy through the package custom resource.

The `uds-casrep-command-config` chart installs the `packages.uds.dev` Package
resource first. It exposes `https://casrep-command.uds.dev` through the tenant
gateway and permits only intra-namespace traffic. The UDS Operator owns the
generated VirtualService and AuthorizationPolicy.

The development `bundle/uds-bundle.yaml` contains only CASREP Command. It uses
the locally built package during `uds run dev`; no dependency bundle is required.
The task runner copies the selected local-flavor archive to the flavor-neutral
filename expected by UDS bundle creation.
