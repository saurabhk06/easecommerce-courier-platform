# EaseCommerce Courier Platform

A courier-agnostic shipment service built for the EaseCommerce backend assignment. The service exposes one normalized API while courier-specific payloads and behavior stay behind adapters.

The repository is being built in small, verified checkpoints. The current baseline contains the Express/TypeScript foundation, configuration validation, structured logging, normalized errors, health checks, tests, and local PostgreSQL/Redis services. Shipment workflows will be added in the next checkpoints.

## Local setup

Requirements:

- Node.js 20 or newer
- pnpm
- Docker with Docker Compose

```bash
cp .env.example .env
pnpm install
docker compose up -d
pnpm prisma:deploy
pnpm dev
```

The placeholder UrbaneBolt values are sufficient for starting the foundation; real credentials will be needed only when exercising the UrbaneBolt adapter.

## Quality checks

```bash
pnpm format:check
pnpm lint
pnpm build
pnpm test
pnpm test:integration
```

Integration tests use PostgreSQL and require `DATABASE_URL` to point to a local database. If port `5432` is already occupied, start this project's container on another host port and update the URL accordingly:

```bash
POSTGRES_PORT=5433 docker compose up -d postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/courier_platform?schema=public pnpm prisma:deploy
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/courier_platform?schema=public pnpm test:integration
```

## Current endpoints

```http
GET /health/live
GET /health/ready
```

The detailed setup, API documentation, and architecture notes will be expanded as the shipment workflows are implemented.
