# Dependency-free file-backed Go API

Status: accepted

The backend uses Go's standard library and an atomically replaced JSON file for
its first persistence adapter. This keeps local setup and later agent handoff
small while retaining a clear store boundary for a database adapter when
authentication, multi-instance writes, or stronger transaction guarantees are
needed.

## Considered options

A database and web framework would provide stronger production capabilities, but
would add setup and dependency choices before the domain/API contract is stable.
The current choice is deliberately limited to single-process development.
