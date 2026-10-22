# Engineering rules

1. Keep browser code in `apps/web`; never import server identity, PostgreSQL, secrets or migrations into it. `packages/contracts` must remain browser-safe.
2. Keep domain behavior within its API module. Put transport/auth/database lifecycle in `platform` and reusable request controls in `lib`. Avoid cross-module access without an explicit interface. Existing route modules contain orchestration and parameterized SQL; extract repositories when a domain grows, preserving resource authorization at every call boundary.
3. Validate mutation input at the boundary. Resolve the authenticated user on each request. Derive workspace and session access from database membership; a supplied resource ID is not permission.
4. Use parameters for values. SQL identifiers must be fixed code or validated administrative migration metadata. All multi-write operations requiring consistency use a transaction.
5. Carry optimistic versions through edits. Reject stale writes with 409; do not silently overwrite another participant's work. Audit records must describe committed changes.
6. Keep access tokens in memory and server keys outside browser configuration and source control. Never log content, bearer tokens, invitation codes, raw headers or connection strings.
7. Add forward migrations; do not rewrite applied migrations. Back up and test restore before schema changes. Keep DTO changes compatible with the currently deployed frontend until both deployments have rolled forward.
8. Show loading, empty, failure and read-only states honestly. Buttons must perform real actions. Unconfigured calling and absent AI features must not pretend to work. Preserve keyboard access, mobile layouts and unsaved draft warnings.
9. Test behavior at trust boundaries and transactional failure points. The PostgreSQL integration suite can run against PGlite for local checks and a real PostgreSQL service in CI. Concurrent transaction checks require the real service.
10. Run lint, type checking, tests, independent builds and runtime dependency audit before review. CI builds both images. Pin lockfile dependencies and reviewed CI actions; review base-image updates before release.

## API conventions

`GET /api/me` returns the verified caller. `GET/POST /api/workspace`, `/api/discussions` and `/api/rooms` preserve the current client contracts. POST requests are JSON action unions validated by Zod. Their schemas live in the corresponding domain module. Canvas types and schema are shared in `packages/contracts`.

Use 400 for invalid input, 401 for absent/invalid identity, 403 for denied resource access, 409 for stale versions or conflicting state, 413 for oversized bodies, 415 for unsupported content type, 429 for request limits and 503 for unavailable dependencies. Do not expose driver errors, stack traces or private content. `GET /health/live` indicates process availability and `/health/ready` checks database connectivity; neither returns business data.
