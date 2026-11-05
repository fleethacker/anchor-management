# Dependencies

CASREP Command has no PostgreSQL, Valkey, MinIO, SSO, or metrics dependency.
It persists fictional demonstration data in a single JSON file on its own
ReadWriteOnce persistent volume. This requires a single replica.

The application bundles its Go API, static client, Node.js workflow helper, and
seed data in one pinned image. UDS Core provides ambient mesh, ingress exposure,
and declarative network policy through the package custom resource.
