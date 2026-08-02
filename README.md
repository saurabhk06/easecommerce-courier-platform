# EaseCommerce Courier Platform

A courier-agnostic shipment service built for the EaseCommerce backend assignment. The service exposes one normalized API while courier-specific payloads and behavior stay behind adapters.

Interactive API documentation: `http://localhost:3000/api-docs/`. See [API_EXAMPLES.md](API_EXAMPLES.md) for copy-paste curl flows and [openapi.yaml](openapi.yaml) for the complete contract.

The implementation contains an Express/TypeScript API, PostgreSQL persistence, a pluggable courier registry, MockCourier, the UrbaneBolt adapter, unified create/read/track/cancel workflows, and a Redis/BullMQ background worker for bulk shipments. [DESIGN.md](DESIGN.md) explains the architecture and tradeoffs.

## Local setup

Requirements:

- Node.js 22.13 or newer
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

## Runtime processes

| Process | Development       | Production          | Responsibility                                    |
| ------- | ----------------- | ------------------- | ------------------------------------------------- |
| API     | `pnpm dev`        | `pnpm start`        | HTTP API, validation, persistence, queue producer |
| Worker  | `pnpm dev:worker` | `pnpm start:worker` | Concurrent background shipment creation           |

Both processes must receive the same database, Redis, and courier configuration. Apply migrations once before starting them.

## Quality checks

```bash
pnpm format:check
pnpm lint
pnpm build
pnpm test
pnpm test:integration
```

`pnpm check` runs formatting, linting, compilation, and unit tests together. GitHub Actions repeats these checks, applies migrations to PostgreSQL, runs Redis-backed integration tests, and builds the runtime container.

Integration tests use PostgreSQL and require `DATABASE_URL` to point to a local database. If port `5432` is already occupied, start this project's container on another host port and update the URL accordingly:

```bash
POSTGRES_PORT=5433 docker compose up -d postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/courier_platform?schema=public pnpm prisma:deploy
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/courier_platform?schema=public REDIS_URL=redis://localhost:6379 pnpm test:integration
```

## Current endpoints

```http
GET /health/live
GET /health/ready
GET /api-docs/
GET /api-docs/openapi.json
POST /api/v1/orders
GET /api/v1/orders/:orderId
GET /api/v1/orders/:orderId/track
POST /api/v1/orders/:orderId/cancel
POST /api/v1/orders/bulk
GET /api/v1/batches/:batchId
```

Create requests are idempotent by `order_id`: an identical replay returns the existing shipment, while a changed payload returns `409 ORDER_ID_CONFLICT`. Courier request/response payloads and raw tracking events are retained for audit purposes but never exposed by the public API.

Bulk requests accept 1–100 orders and return `202 Accepted` after persisting the batch and enqueueing its jobs. The batch endpoint reports queued, successful, and failed orders individually, so one courier rejection does not hide successful shipments from the same batch.

## Container build

The same image can run either process:

```bash
docker build -t easecommerce-courier-platform .
docker run --env-file .env -p 3000:3000 easecommerce-courier-platform
docker run --env-file .env easecommerce-courier-platform node dist/worker.js
```

The image runs as the unprivileged `node` user. PostgreSQL and Redis must be reachable from the container; `localhost` inside a container refers to that container, not the host.

## Important operational behavior

- PostgreSQL is the source of truth; Redis contains disposable queue coordination state.
- Unknown shipment-creation outcomes enter `RECONCILIATION_REQUIRED` to avoid unsafe duplicate creation.
- Raw courier payloads are persisted for audit but excluded from public presenters.
- Tracking history is append-only and duplicate courier events are ignored.
- API readiness requires both PostgreSQL and Redis; liveness only confirms the process is running.
