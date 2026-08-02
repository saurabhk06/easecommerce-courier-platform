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
pnpm dev
```

The placeholder UrbaneBolt values are sufficient for starting the foundation; real credentials will be needed only when exercising the UrbaneBolt adapter.

## Quality checks

```bash
pnpm format:check
pnpm lint
pnpm build
pnpm test
```

## Current endpoints

```http
GET /health/live
GET /health/ready
```

The detailed setup, API documentation, and architecture notes will be expanded as the shipment workflows are implemented.
