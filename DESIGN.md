# Design notes

## Why this shape

This service is a modular monolith with two runtime processes: an Express API and a BullMQ worker. They share domain services, courier adapters, repositories, and PostgreSQL. This keeps the assignment deployable and easy to explain while still separating synchronous HTTP work from asynchronous bulk processing.

PostgreSQL is the source of truth. Redis coordinates background jobs but is not used as the permanent record of an order or batch.

```text
HTTP consumer
    |
    v
Express routes -> services -> repositories -> PostgreSQL
                       |
                       v
                courier registry
                  /         \
             MockCourier  UrbaneBolt

Bulk request -> PostgreSQL batch + queued orders -> BullMQ -> worker
                                                        |
                                                        v
                                                   same services
```

## Adding another courier

A courier integration implements `CourierAdapter` and is registered at application startup. It owns request mapping, status mapping, transport behavior, and error translation. Order routes, normalized schemas, and business services do not change.

This is deliberately an adapter/strategy design rather than a generic plugin framework. The boundary is explicit enough for the assignment and simple enough to debug.

Optional features use narrower capability interfaces. Pincode availability implements `ServiceabilityAdapter`, so couriers can support shipment creation without being forced to implement every optional operation.

## Consistency and idempotency

- `order_id` has a database unique constraint.
- The processing claim is an atomic conditional update, so concurrent requests cannot both call a courier.
- An identical successful replay returns saved data; changed data returns `409 ORDER_ID_CONFLICT`.
- Tracking history has a deduplication key and database triggers that reject updates and deletes.
- Terminal shipment states are protected from stale tracking responses.
- Bulk input is inserted in one PostgreSQL transaction before queueing.
- If Redis rejects enqueueing, the saved batch and its orders are explicitly marked failed instead of remaining silently queued.

The database insert and Redis enqueue are not a distributed transaction. A larger system would use a transactional outbox and a relay process. For this assignment, explicit enqueue-failure compensation and deterministic BullMQ job IDs provide a practical, explainable tradeoff.

## Courier failure policy

Transient HTTP failures (`429`, `5xx`, timeouts, and network failures) use bounded exponential backoff with jitter. Ordinary courier validation failures are not retried. A `401` or `403` invalidates the cached UrbaneBolt token and replays the request once.

A network failure during shipment creation can be ambiguous: the courier may have accepted the shipment before the connection failed. Such orders enter `RECONCILIATION_REQUIRED`; they are not blindly retried as ordinary failures.

## Data exposure

Normalized public presenters are separate from persistence models. Exact courier request/response and tracking payloads are stored for audit but never returned publicly. Passwords, authorization headers, cookies, and token fields are redacted from structured logs.

## Deliberate limits

- Indian shipments only (`country = IN`, six-digit postal codes).
- `SAME_DAY` and `NEXT_DAY` service levels initially.
- No distributed transaction between PostgreSQL and Redis.
- No live UrbaneBolt test in CI because credentials and UAT availability are external.
- The public UrbaneBolt documentation provides no saved pincode response example, so response-shape interpretation is isolated in a defensive mapper and covered with fixtures.
- Shipping labels remain an optional follow-up feature.
