# Design

## Architecture

The application is a modular monolith with two processes:

- **API server:** validates HTTP requests, applies business rules, stores data, calls couriers, and submits bulk jobs.
- **Worker:** consumes BullMQ jobs and creates bulk shipments in the background.

PostgreSQL is the source of truth. Redis is used only for BullMQ and readiness checks.

```text
Client / Swagger / Postman
           |
           v
      Express API
           |
     routes + validation
           |
        services
       /        \
PostgreSQL    CourierRegistry
              /            \
       MockCourier       UrbaneBolt

Bulk API -> PostgreSQL -> BullMQ/Redis -> Worker -> same OrderService
```

Routes and controllers handle HTTP concerns. Services contain business rules. Repositories contain Prisma queries. Presenters produce public responses without exposing stored courier audit payloads.

## Design patterns

### Adapter and Strategy

Every courier implements `CourierAdapter`:

```text
createShipment
trackShipment
cancelShipment
```

`CourierRegistry` selects an adapter using `courier_partner`. `OrderService` depends on the interface rather than UrbaneBolt, so adding a courier does not change the order flow. MockCourier uses the same interface and proves that the integration is replaceable.

Serviceability uses a smaller optional interface because not every courier provides a pincode API.

### Dependency injection

`server.ts` creates repositories, services, adapters, and infrastructure clients and passes them into the application. Classes do not create hidden global dependencies. Tests can therefore supply MockCourier or lightweight test dependencies.

### Repository

Order, tracking, and batch database operations are isolated in repositories. Business services do not contain raw Prisma queries.

## Database schema

### `orders`

Stores the external `order_id`, courier, normalized request, request fingerprint, AWB, courier shipment ID, shipment status, processing status, failure details, audit payloads, and optional batch relationship.

`order_id` is unique and acts as the idempotency key.

### `tracking_history`

Stores normalized tracking events and their original courier payloads. A unique `(order_id, deduplication_key)` constraint prevents duplicate events. Tracking records are append-only.

### `batches`

Stores batch status, total orders, successful orders, and failed orders. Orders reference their batch through `batch_id`.

## Reliability decisions

- An identical successful `order_id` replay returns the saved shipment without another courier call.
- Reusing an order ID with different data returns `409 ORDER_ID_CONFLICT`.
- An atomic database update ensures only one concurrent request can call the courier.
- Tracking events are deduplicated, and stale events cannot replace terminal states.
- `401` and `403` responses refresh the cached UrbaneBolt token once.
- Temporary failures use bounded exponential retries.
- An uncertain create-shipment result becomes `RECONCILIATION_REQUIRED`; it is not blindly retried because that could create a duplicate shipment.
- Bulk input is validated and stored before jobs are submitted to BullMQ.

## Trade-offs

The database write and Redis enqueue are not one transaction. The service compensates for enqueue failures by marking the batch and orders failed. A larger system would use a transactional outbox.

BullMQ was selected instead of Kafka because this requirement is background job processing with retries and concurrency, not long-lived event streaming. It keeps the assignment small while still separating API response time from bulk courier calls.

Raw courier payloads are stored for audit but removed from public responses. This improves supportability at the cost of additional database storage.

The first version supports Indian addresses, six-digit pincodes, and `SAME_DAY`/`NEXT_DAY`. Shipping labels, reconciliation automation, and additional courier capabilities can be added behind the existing adapter boundary.
