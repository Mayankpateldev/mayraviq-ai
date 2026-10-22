# Mayraviq

An internal collaboration workspace for team calls, discussions, shared designs, notes and reviewable decisions.

The frontend and backend are separate deployable applications:

```
apps/web/             React + Vite frontend
apps/api/             Node API + PostgreSQL migrations
packages/contracts/   Shared browser-safe types and canvas validation
infra/docker/         Independent Dockerfiles and web gateway
compose.yaml          Production web/API/PostgreSQL/migration services
compose.database.yaml Local PostgreSQL service
scripts/              Development tooling
tests/               Unit and integration checks
docs/                Architecture, operations, security and code guidelines
```

Use Node 24. Install with `npm ci`. Start the API with `npm run dev:api` and the frontend with `npm run dev:web` after setting their `.env` files and migrating PostgreSQL. See [Operations](docs/OPERATIONS.md) for exact setup, Docker deployment, separate hosts and legacy-data import.

`npm run build:web` and `npm run build:api` produce independent outputs. `npm run lint`, `npm run typecheck` and `npm test` validate the source. CI runs PostgreSQL integration tests and builds both images.

Read [Architecture](docs/ARCHITECTURE.md), [Engineering rules](docs/ENGINEERING.md) and [Security review](docs/SECURITY.md) before extending the system. Calling requires LiveKit configuration; the room AI assistant supports reviewed drafts through a private Ollama model. See [AI setup](docs/AI.md). Opt-in local speech transcription and background meeting recaps are available; retained audio/video recording and automatic task execution are not implemented. Production identity-provider configuration and infrastructure validation remain required.

See [calling setup](docs/CALLING.md) for a working local media service and [product design system](docs/DESIGN.md) for the shared visual direction.

See [working local setup](docs/LOCAL_DEVELOPMENT.md) and the [completion checklist](docs/ROADMAP.md) for verified capabilities and remaining work.

Automatic local speech notes: [setup and limits](docs/MEETING_NOTES.md).

Meeting invitations: [in-app inbox, email previews and SMTP setup](docs/INVITATIONS.md).
