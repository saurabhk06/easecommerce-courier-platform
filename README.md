# EaseCommerce Courier Platform

A courier-agnostic shipment service built for the EaseCommerce backend assignment. The service exposes one normalized API while courier-specific payloads and behavior stay behind adapters.

The repository is being built in small, verified checkpoints. The current baseline contains the Express/TypeScript foundation, PostgreSQL persistence, a pluggable courier registry, MockCourier, the UrbaneBolt adapter, unified create/read/track/cancel workflows, and a Redis/BullMQ background worker for bulk shipments.

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

Run the asynchronous shipment worker in a second terminal:

```bash
pnpm dev:worker
```

Redis-backed jobs use bounded exponential retries and configurable worker concurrency. PostgreSQL remains the source of truth for order and batch state; Redis only coordinates background work.

The placeholder UrbaneBolt values are sufficient for starting the application with MockCourier; real credentials are needed only when exercising the UrbaneBolt adapter.

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
POST /api/v1/orders
GET /api/v1/orders/:orderId
GET /api/v1/orders/:orderId/track
POST /api/v1/orders/:orderId/cancel
```

Create requests are idempotent by `order_id`: an identical replay returns the existing shipment, while a changed payload returns `409 ORDER_ID_CONFLICT`. Courier request/response payloads and raw tracking events are retained for audit purposes but never exposed by the public API.
