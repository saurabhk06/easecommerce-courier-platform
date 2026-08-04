# EaseCommerce Courier Platform

A courier integration service built with Express.js, TypeScript, PostgreSQL, Redis, BullMQ, and Prisma.

It provides one API for creating, retrieving, tracking, and cancelling shipments. UrbaneBolt is the default courier, and MockCourier demonstrates how another courier can be plugged in without changing the order flow.

## Prerequisites

- Node.js 22.13 or newer
- pnpm 11.9.0
- Docker with Docker Compose

## Setup

```bash
git clone https://github.com/saurabhk06/easecommerce-courier-platform.git
cd easecommerce-courier-platform
git checkout develop
cp .env.example .env
docker compose up -d postgres redis
pnpm install
pnpm prisma:deploy
```

The assignment's shared UrbaneBolt UAT configuration is included in `.env.example`. Replace it before using a private or production courier account.

If PostgreSQL port `5432` is already occupied:

```bash
POSTGRES_PORT=5433 docker compose up -d postgres redis
```

Then use port `5433` in `DATABASE_URL` inside `.env`.

## Run

Start the API:

```bash
pnpm dev
```

Start the bulk-order worker in another terminal:

```bash
pnpm dev:worker
```

Open Swagger at [http://localhost:3000/api-docs/](http://localhost:3000/api-docs/).

The worker is needed only for bulk shipment processing.

## Test with Swagger

Swagger is the easiest way to review and test the APIs:

1. Keep the API running with `pnpm dev`.
2. Keep `pnpm dev:worker` running when testing bulk orders.
3. Open [http://localhost:3000/api-docs/](http://localhost:3000/api-docs/).
4. Expand an endpoint, click **Try it out**, enter the required values, and click **Execute**.

UrbaneBolt is the default courier. Creating a shipment calls its shared UAT API. Use a new `order_id` for every new shipment; reusing an ID intentionally demonstrates idempotency.

For the recommended testing order, request examples, and expected responses, see the [Swagger API Testing Guide](SWAGGER_GUIDE.md).

## API overview

| Method | Endpoint                          | Purpose                                  |
| ------ | --------------------------------- | ---------------------------------------- |
| `GET`  | `/health/live`                    | Check whether the API process is running |
| `GET`  | `/health/ready`                   | Check PostgreSQL and Redis connectivity  |
| `POST` | `/api/v1/orders`                  | Create one shipment                      |
| `GET`  | `/api/v1/orders/:orderId`         | Retrieve a saved order                   |
| `GET`  | `/api/v1/orders/:orderId/track`   | Refresh shipment tracking                |
| `POST` | `/api/v1/orders/:orderId/cancel`  | Cancel a shipment                        |
| `POST` | `/api/v1/orders/bulk`             | Queue 1–100 shipments                    |
| `GET`  | `/api/v1/batches/:batchId`        | Check bulk-processing progress           |
| `GET`  | `/api/v1/serviceability/pincodes` | Check pincode availability               |

UrbaneBolt is used when `courier_partner` is omitted. Send `"courier_partner": "mock"` to use MockCourier.

## Postman

Import [postman/EaseCommerce.postman_collection.json](postman/EaseCommerce.postman_collection.json) into Postman.

The collection contains every endpoint and automatically:

- generates unique order and invoice numbers;
- stores the latest order ID for retrieve, track, and cancel requests;
- stores the `batch_id` returned by a bulk request.

Keep the collection variable `baseUrl` as `http://localhost:3000` for local testing.

## Environment variables

| Variable                      | Default                  | Purpose                            |
| ----------------------------- | ------------------------ | ---------------------------------- |
| `NODE_ENV`                    | `development`            | Runtime environment                |
| `PORT`                        | `3000`                   | API port                           |
| `LOG_LEVEL`                   | `info`                   | Application log level              |
| `DATABASE_URL`                | See `.env.example`       | PostgreSQL connection string       |
| `REDIS_URL`                   | `redis://localhost:6379` | Redis and BullMQ connection        |
| `BULK_WORKER_CONCURRENCY`     | `5`                      | Concurrent jobs per worker         |
| `BULK_JOB_ATTEMPTS`           | `3`                      | Infrastructure retry attempts      |
| `COURIER_TIMEOUT_MS`          | `5000`                   | Courier HTTP timeout               |
| `COURIER_RETRY_COUNT`         | `3`                      | Transient courier retries          |
| `COURIER_RETRY_BASE_DELAY_MS` | `250`                    | Initial retry delay                |
| `DEFAULT_COURIER_PARTNER`     | `urbanebolt`             | Courier used when none is supplied |
| `URBANEBOLT_BASE_URL`         | UAT URL                  | UrbaneBolt API URL                 |
| `URBANEBOLT_USERNAME`         | Assignment UAT account   | Authentication username            |
| `URBANEBOLT_PASSWORD`         | Assignment UAT account   | Authentication password            |
| `URBANEBOLT_CUSTOMER_CODE`    | Assignment UAT account   | Manifest customer account code     |

`.env` is ignored by Git. Do not commit private or production credentials.

## Test

Run formatting, linting, compilation, and unit tests:

```bash
pnpm check
```

Run integration tests with PostgreSQL and Redis running:

```bash
pnpm test:integration
```

Other useful commands:

```bash
pnpm test
pnpm test:coverage
pnpm build
```

## Add a new courier

1. Create a folder such as `src/modules/couriers/fastship/`.
2. Implement `CourierAdapter` from `src/modules/couriers/courier-adapter.ts`:

```ts
export class FastShipAdapter implements CourierAdapter {
  readonly name = 'fastship';

  createShipment(input) {
    // Map the normalized order and call FastShip.
  }

  trackShipment(reference) {
    // Return normalized tracking data.
  }

  cancelShipment(reference) {
    // Return a normalized cancellation result.
  }
}
```

3. Keep authentication, HTTP calls, and payload mapping inside the courier folder.
4. Register the adapter in `src/modules/couriers/create-courier-registry.ts`.
5. Add its identifier to the request validation and `openapi.yaml`.
6. Add adapter and mapper tests.

No order controller, order service, repository, or batch worker change should be required.

Pincode availability is optional. Implement `ServiceabilityAdapter` only when the courier supports that capability.

## Design

Architecture, database schema, patterns, and trade-offs are described in [DESIGN.md](DESIGN.md).
