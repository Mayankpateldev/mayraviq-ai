# Deployment and operations

## Local development

Use Node 24 and run `npm ci` from the repository root. React and the API run as separate processes.

With Docker running, set a local `POSTGRES_PASSWORD` and run `docker compose -f compose.database.yaml up -d`. Copy `apps/api/.env.example` to `apps/api/.env` and set its local PostgreSQL connection string with the same password. Copy `apps/web/.env.example` to `apps/web/.env`. Run `npm run db:migrate`, `npm run dev:api` and, in another terminal, `npm run dev:web`. The frontend is `http://127.0.0.1:5174`; the API listens on loopback port 4000.

For a local preview while Docker is unavailable, run `npm run dev:embedded` and `VITE_DEV_AUTH=true npm run dev:web`. This explicit development-only entry point uses PGlite, an embedded PostgreSQL engine, and persists under `apps/api/.data`. It is excluded from production images and source exports. It is not a replacement for staging tests against the deployed PostgreSQL service.

## Production Docker deployment

Copy `.env.example` to an untracked `.env`, replace every placeholder, and configure a team OIDC application with authorization code + PKCE. Register the SPA callback `https://YOUR_FRONTEND/auth/callback` and logout URL. Configure the API audience and the verified access token's subject/group claims. The SPA is a public client: do not give it a client secret. For providers needing a custom API scope, set `OIDC_SCOPE` accordingly. Test a real login and unauthorized-account rejection before exposing business data.

Run `docker compose config --quiet`, then `docker compose up --build -d`. The migration job waits for PostgreSQL; the API waits for successful migrations. The web is bound to host loopback port 8080. Put an HTTPS ingress/reverse proxy in front of it, using `APP_ORIGIN` as the exact public frontend origin. Restrict ingress to the team network/VPN where appropriate. A certificate and DNS are infrastructure setup, not supplied by these files.

The API runs as a non-root user with a read-only filesystem, dropped capabilities and no-new-privileges. PostgreSQL has no production host port and uses an isolated network. Provide production secrets through your platform secret store; Compose environment values are for local/self-managed deployment and can be inspected by host administrators. Use verified TLS for managed PostgreSQL connections. No credential is included in either image.

## Separate hosts and release lifecycles

Build independently:

```
docker build -f infra/docker/web.Dockerfile -t mayraviq-web:VERSION .
docker build -f infra/docker/api.Dockerfile -t mayraviq-api:VERSION .
```

Deploy each image independently. On a separate web host, set `PUBLIC_API_URL=https://YOUR_API`, `API_UPSTREAM=YOUR_API_INTERNAL_HOST:4000` if using its proxy, and the public OIDC configuration. Browser calls can go directly to the HTTPS API; `APP_ORIGIN` permits only the frontend origin. For static hosting, publish `apps/web/dist` and generate `runtime-config.js` containing only public settings. SPA routes including `/auth/callback` must serve `index.html`. Restrict CSP `connect-src` to your exact API, identity and LiveKit hosts when they are known.

Run migrations as a one-shot job using the API image: `node dist/platform/migrate.js`. Roll out backward-compatible API changes before dependent frontend changes. Do not delete a database volume during upgrades. Failed migrations roll back; incompatible schemas require restore or a reviewed corrective migration, not an automatic destructive downgrade.

## Preserving the old local database

The SQLite source is retained in `.local/legacy-d1` after restructure. Stop writers to that old preview before a final production import, and take a copy of the SQLite database and WAL together or use SQLite's backup API. Migrate an empty PostgreSQL target, then run:

```
npm run db:import-legacy -- /absolute/path/to/source.sqlite
```

The importer runs in a transaction, reads SQLite without modifying it, preserves IDs, design contents, versions, notes and memberships, and refuses a nonempty destination. Verify record counts and representative designs before switching traffic. Imported `local_seedy` belongs to the former local development identity; map that identity and all related author/member/guest records to verified OIDC subjects before production use. Do not export the private database as part of a source handoff.

## Backups, monitoring and media

Configure encrypted PostgreSQL backups and, where available, point-in-time recovery. Keep copies off the application host and run a restore drill into an isolated environment. Backup scheduling, storage, retention and restore drills are not yet provisioned. Decide retention for private chat content, soft-deleted messages, notes, designs and invitations with the team owner.

Readiness verifies the required schema migrations as well as database connectivity. Monitor readiness, error rates, database pool saturation, migration failures and API latency. API logs contain method/path/status, not payloads. Set log access and retention in the hosting platform. Add edge/IP rate limiting before public ingress; current limits apply after authentication. Use alerts with a named owner.

Configure LiveKit server-only `LIVEKIT_URL`, `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`. The production URL must be WSS. See [calling setup](CALLING.md) for the explicit loopback-only `dev:call` preview. Test two-party calls, reconnect, screen sharing, guest expiry and media access removal. Expiry blocks new grants; existing media connections require explicit SFU removal/reconciliation for immediate revocation. Retained audiovisual recording is not implemented. Local transcription and automatic background notes have a separate development setup; production speech deployment is not provisioned. Media infrastructure, TURN reachability and provider accounts are separate from the API/web containers.

## Validation status

Local checks cover separate builds, TypeScript, lint, PostgreSQL-compatible migrations, signed-token validation, isolation, version conflicts, atomic rollback, design persistence and read-only legacy import. CI additionally runs against a PostgreSQL service, concurrent update checks and Docker image builds. The current workstation's Docker daemon is unavailable, so container builds/startup and real PostgreSQL concurrency have not been executed locally. Identity-provider and deployed LiveKit integration remain unconfigured. A real local LiveKit server was built from verified official v1.13.9 source; Join and Leave were verified in the in-app WebKit browser with microphone/camera off. Multi-party media across networks and production TURN remain untested.

For the current local setup, encrypted snapshots and isolated restore tooling, see [local development](LOCAL_DEVELOPMENT.md). Production backup provisioning remains deferred. The local database queue now serializes SQL/transactions rather than entire HTTP requests, so model generation does not block unrelated room/API work.

On 20 October 2026, both Compose configurations validated, 31 automated checks passed (one real PostgreSQL concurrency check skipped), and the local media service exchanged synthetic microphone/camera/screen tracks between two browser clients. Physical devices and production infrastructure remain unverified. Migration 007 adds leased, durable recap work; the API runs one background job at a time per process with database coordination. Monitor queued work and model availability before production use.
