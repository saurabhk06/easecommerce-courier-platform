# EaseCommerce Courier Platform

A courier-agnostic shipment orchestration service built for the EaseCommerce backend assignment. It provides one normalized API for shipment creation, tracking, cancellation, bulk processing, and pincode availability while keeping courier-specific behavior behind adapters.

The first real integration is UrbaneBolt. MockCourier is included so the complete application can be evaluated locally without external credentials or UAT availability.

## What is included

- Express.js and TypeScript API
- PostgreSQL persistence with Prisma migrations
- Redis and BullMQ asynchronous bulk processing
- UrbaneBolt authentication, shipment creation, tracking, cancellation, and pincode availability
- MockCourier for deterministic local demonstrations
- Idempotent order creation and concurrency-safe processing claims
- Append-only, deduplicated tracking history
- OpenAPI 3.1 and interactive Swagger UI
- Unit, database, Redis, and worker integration tests
- Multi-stage, non-root production Docker image

Architecture decisions and tradeoffs are explained in [DESIGN.md](DESIGN.md).

## Prerequisites

Install:

- Node.js 22.13 or newer
- pnpm 11.9.0
- Docker Desktop or Docker Engine with Docker Compose

Verify the tools:

```bash
node --version
pnpm --version
docker --version
docker compose version
```

## Quick start from a fresh clone

### 1. Clone and enter the repository

```bash
git clone https://github.com/saurabhk06/easecommerce-courier-platform.git
cd easecommerce-courier-platform
git checkout develop
```

### 2. Create local configuration

```bash
cp .env.example .env
```

UrbaneBolt is the default courier. The assignment's shared public UAT credentials are already present in `.env.example`, so copying it is enough to test the integration. MockCourier remains available by explicitly sending `courier_partner: mock`.

### 3. Start PostgreSQL and Redis

```bash
docker compose up -d postgres redis
docker compose ps
```

Both services should become `healthy`.

If port `5432` is already occupied, use port `5433`:

```bash
POSTGRES_PORT=5433 docker compose up -d postgres redis
```

Then update these two lines in `.env`:

```env
POSTGRES_PORT=5433
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/courier_platform?schema=public
```

### 4. Install dependencies and apply migrations

```bash
pnpm install
pnpm prisma:deploy
```

### 5. Start the API

```bash
pnpm dev
```

The API runs at `http://localhost:3000`.

### 6. Start the bulk worker

Open a second terminal in the repository:

```bash
pnpm dev:worker
```

The worker is required for `POST /api/v1/orders/bulk`. Single-order APIs work without it.

### 7. Open Swagger

Visit:

```text
http://localhost:3000/api-docs/
```

The machine-readable contract is available at:

```text
http://localhost:3000/api-docs/openapi.json
```

Swagger uses an `UrbaneBolt UAT` example by default. It already contains `courier_partner: urbanebolt`, so the evaluator does not need to edit the courier field. If `courier_partner` is omitted from an order or bulk-order item, the API uses `DEFAULT_COURIER_PARTNER`, which is configured as `urbanebolt`.

## Environment variables

| Variable                      | Required       | Default/example                                                                | Purpose                                                         |
| ----------------------------- | -------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `NODE_ENV`                    | No             | `development`                                                                  | Runtime mode: `development`, `test`, or `production`            |
| `PORT`                        | No             | `3000`                                                                         | API HTTP port                                                   |
| `LOG_LEVEL`                   | No             | `info`                                                                         | Pino log level                                                  |
| `DATABASE_URL`                | Yes            | `postgresql://postgres:postgres@localhost:5432/courier_platform?schema=public` | PostgreSQL connection used by Prisma                            |
| `POSTGRES_PORT`               | Docker only    | `5432`                                                                         | Host port exposed by the PostgreSQL container                   |
| `REDIS_URL`                   | Yes            | `redis://localhost:6379`                                                       | Redis connection used by readiness, BullMQ producer, and worker |
| `REDIS_PORT`                  | Docker only    | `6379`                                                                         | Host port exposed by the Redis container                        |
| `BULK_WORKER_CONCURRENCY`     | No             | `5`                                                                            | Maximum jobs processed concurrently by one worker               |
| `BULK_JOB_ATTEMPTS`           | No             | `3`                                                                            | Maximum BullMQ attempts for infrastructure-level job failures   |
| `COURIER_TIMEOUT_MS`          | No             | `5000`                                                                         | Outbound courier request timeout                                |
| `COURIER_RETRY_COUNT`         | No             | `3`                                                                            | Transient courier retry count                                   |
| `COURIER_RETRY_BASE_DELAY_MS` | No             | `250`                                                                          | Base delay for exponential retry backoff                        |
| `DEFAULT_COURIER_PARTNER`     | No             | `urbanebolt`                                                                   | Courier used when an order or serviceability request omits it   |
| `URBANEBOLT_BASE_URL`         | Yes            | `https://uat.urbanebolt.in`                                                    | UrbaneBolt UAT base URL                                         |
| `URBANEBOLT_USERNAME`         | For UrbaneBolt | Assignment UAT account                                                         | UAT API username                                                |
| `URBANEBOLT_PASSWORD`         | For UrbaneBolt | Assignment UAT account                                                         | UAT API password                                                |
| `URBANEBOLT_CUSTOMER_CODE`    | For UrbaneBolt | `UEBCUS0008`                                                                   | Courier account code sent by the UrbaneBolt adapter             |

The committed `.env.example` contains only the shared UAT account published with the assignment. Never commit a populated `.env` containing private or production credentials; `.env` is ignored by Git.

## API overview

| Method | Endpoint                          | Purpose                                                         |
| ------ | --------------------------------- | --------------------------------------------------------------- |
| `GET`  | `/health/live`                    | Confirms that the API process is alive                          |
| `GET`  | `/health/ready`                   | Confirms that PostgreSQL and Redis are reachable                |
| `POST` | `/api/v1/orders`                  | Creates one shipment synchronously                              |
| `GET`  | `/api/v1/orders/:orderId`         | Returns the saved normalized order                              |
| `GET`  | `/api/v1/orders/:orderId/track`   | Refreshes and returns deduplicated tracking history             |
| `POST` | `/api/v1/orders/:orderId/cancel`  | Cancels a shipment; repeated cancellation is a successful no-op |
| `POST` | `/api/v1/orders/bulk`             | Validates and queues 1–100 shipments                            |
| `GET`  | `/api/v1/batches/:batchId`        | Returns batch totals and per-order results                      |
| `GET`  | `/api/v1/serviceability/pincodes` | Checks up to 50 pincodes through a courier capability           |
| `GET`  | `/api-docs/`                      | Interactive Swagger UI                                          |
| `GET`  | `/api-docs/openapi.json`          | Machine-readable OpenAPI document                               |

Copy-paste curl flows are available in [API_EXAMPLES.md](API_EXAMPLES.md).

## How to test

Run formatting, linting, TypeScript compilation, and unit tests together:

```bash
pnpm check
```

Run PostgreSQL and Redis integration tests:

```bash
pnpm test:integration
```

If PostgreSQL is exposed on port `5433`:

```bash
DATABASE_URL='postgresql://postgres:postgres@localhost:5433/courier_platform?schema=public' \
REDIS_URL='redis://localhost:6379' \
pnpm test:integration
```

Individual commands are also available:

```bash
pnpm format:check
pnpm lint
pnpm build
pnpm test
pnpm test:coverage
```

Tests use MockCourier and isolated fixtures. They do not require UrbaneBolt UAT to be available.

## Runtime processes

| Process | Development       | Production          | Responsibility                                              |
| ------- | ----------------- | ------------------- | ----------------------------------------------------------- |
| API     | `pnpm dev`        | `pnpm start`        | HTTP, validation, persistence, tracking, and queue producer |
| Worker  | `pnpm dev:worker` | `pnpm start:worker` | Concurrent background shipment creation                     |

Both processes must use the same PostgreSQL, Redis, and courier configuration. Apply migrations once before starting them.

## How to add a new courier

Suppose the new courier identifier is `fastship`.

### 1. Implement the required adapter

Create:

```text
src/modules/couriers/fastship/fastship.adapter.ts
```

Implement `CourierAdapter` from:

```text
src/modules/couriers/courier-adapter.ts
```

The adapter must provide:

```ts
readonly name = 'fastship';

createShipment(input);
trackShipment(reference);
cancelShipment(reference);
```

The adapter translates normalized application types into FastShip requests and maps FastShip responses, statuses, and errors back into normalized results.

### 2. Keep courier HTTP details isolated

Recommended files:

```text
src/modules/couriers/fastship/
├── fastship.adapter.ts
├── fastship.client.ts
├── fastship.mapper.ts
└── create-fastship-adapter.ts
```

Courier payload fields must not be added to order controllers, public schemas, or order services.

### 3. Add environment configuration

Add FastShip credentials to `src/config/env.ts` and `.env.example`, for example:

```env
FASTSHIP_BASE_URL=https://sandbox.fastship.example
FASTSHIP_API_KEY=replace-me
```

Secrets must come from configuration, never from an order request.

### 4. Register the adapter

Update:

```text
src/modules/couriers/create-courier-registry.ts
```

```ts
return new CourierRegistry([
  new MockCourierAdapter(),
  createUrbaneBoltAdapter(env),
  createFastShipAdapter(env),
]);
```

No order route, controller, repository, batch worker, or order service change is required.

### 5. Add optional capabilities only when supported

Pincode availability is intentionally separate from the required shipment interface. If FastShip supports it, implement `ServiceabilityAdapter` from:

```text
src/modules/couriers/serviceability-adapter.ts
```

Couriers without this optional capability can still create, track, and cancel shipments.

### 6. Add tests and documentation

Add adapter/client/mapper fixtures under `tests/couriers/fastship/`, then add `fastship` to the `courier_partner` enum and examples in `openapi.yaml`.

Run:

```bash
pnpm check
pnpm test:integration
```

## Persistence and operational behavior

- PostgreSQL is the source of truth; Redis coordinates background work.
- `order_id` is the idempotency key and has a database unique constraint.
- Identical successful replays return the saved order; changed payloads return `409 ORDER_ID_CONFLICT`.
- Ambiguous shipment-creation failures enter `RECONCILIATION_REQUIRED` instead of being blindly retried.
- Raw courier request/response payloads are persisted for audit but never returned publicly.
- Tracking history is append-only and duplicate events are ignored.
- Bulk input is validated completely before records are written.
- Runtime courier failures can produce `PARTIALLY_COMPLETED` batches.

## Production container

Build the image:

```bash
docker build -t easecommerce-courier-platform .
```

Run the API:

```bash
docker run --env-file .env -p 3000:3000 easecommerce-courier-platform
```

Run the worker from the same image:

```bash
docker run --env-file .env easecommerce-courier-platform node dist/worker.js
```

The container runs as the unprivileged `node` user. PostgreSQL and Redis must be reachable from inside the container; `localhost` inside a container refers to that container, not the host.

## Troubleshooting

### Prisma connects to the wrong PostgreSQL instance

Check the port reported by:

```bash
docker compose ps postgres
```

Make `DATABASE_URL` in `.env` use that host port.

### Readiness returns `503`

```bash
docker compose ps
curl http://localhost:3000/health/ready
```

Both PostgreSQL and Redis must be healthy.

### Bulk orders remain queued

Start the worker:

```bash
pnpm dev:worker
```

### UrbaneBolt requests fail while MockCourier works

Confirm all four `URBANEBOLT_*` variables contain real UAT values. MockCourier does not use them.
