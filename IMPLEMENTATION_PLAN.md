# EaseCommerce Multi-Courier Platform - Implementation Plan

## 1. Purpose

This document records the architecture and implementation decisions agreed before development begins. The goal is to produce a backend assignment that is:

- Simple enough to understand and explain confidently in an interview.
- Complete enough to satisfy every core assignment requirement.
- Production-minded without unnecessary infrastructure or abstractions.
- Realistic to complete before the submission deadline.

No implementation has started. This document is the agreement to review before writing code.

## 2. Assignment Summary

Build a courier-agnostic backend for an e-commerce logistics platform. UrbaneBolt is the first real integration, but adding another courier must not require changes to:

- Controllers or routes.
- Shared request or response DTOs.
- Existing courier implementations.
- Order business logic.

The minimum supported operations are:

- Authenticate with the courier.
- Create an order or shipment.
- Track a shipment.
- Cancel a shipment.
- Create up to 100 shipments asynchronously in one batch.
- Retrieve per-order batch results, including partial failures.

Every order, courier request, courier response, failure, and tracking update must be persisted.

## 3. Agreed Technology Stack

- Node.js 20 or newer.
- Express.js with TypeScript.
- PostgreSQL.
- Prisma ORM.
- Redis and BullMQ for asynchronous batch processing.
- Zod for request and environment validation.
- Axios for outbound courier HTTP calls.
- Pino for structured logging.
- Vitest and Supertest for automated tests.
- Swagger/OpenAPI and curl examples for API documentation.
- Docker Compose for local PostgreSQL and Redis services.

### Why Express.js

Express.js is preferred over NestJS because it matches the developer's experience and can be explained confidently during the interview. The project will use explicit modules and dependency composition to retain clear boundaries without relying on a framework-specific dependency injection system.

### Why Redis and BullMQ

The assignment explicitly requires bulk orders to be processed concurrently or asynchronously without keeping one HTTP request open for 100 sequential courier calls. BullMQ provides:

- Background processing.
- Controlled concurrency.
- Per-job retry configuration.
- Job state and failure visibility.
- A clean separation between the API process and worker process.

## 4. Architectural Style

The application will be a modular monolith with two runtime processes:

1. An Express API process.
2. A BullMQ worker process.

Both processes will use the same codebase, PostgreSQL database, Redis instance, services, repositories, and courier adapters.

```text
Internal consumer
       |
       v
Express routes and controllers
       |
       v
Order and batch services
       |------------------------|
       v                        v
Courier registry          Repositories
       |                        |
       v                        v
Courier adapter            PostgreSQL
   |          |
   v          v
UrbaneBolt  MockCourier
```

Bulk processing follows a separate asynchronous path:

```text
POST /api/v1/orders/bulk
       |
       v
Create batch and order records
       |
       v
Enqueue one job per order in BullMQ
       |
       v
Return HTTP 202 with batch_id
       |
       v
Worker processes jobs with controlled concurrency
       |
       v
GET /api/v1/batches/:batchId returns per-order results
```

## 5. Main Design Patterns

### Adapter pattern

Each courier adapter translates between the normalized application contract and that courier's API contract.

### Strategy pattern

The courier named by `courier_partner` determines which adapter is selected at runtime.

### Registry pattern

A central courier registry maps identifiers such as `urbanebolt` and `mock` to adapter instances.

```ts
interface CourierAdapter {
  readonly name: string;

  createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult>;
  trackShipment(reference: ShipmentReference): Promise<TrackingResult>;
  cancelShipment(reference: ShipmentReference): Promise<CancelShipmentResult>;
}
```

Adding a courier will require only:

1. Implementing the `CourierAdapter` interface.
2. Registering the adapter during application startup.
3. Providing its environment configuration.

It will not require changes to order routes, controllers, normalized DTOs, or order business logic.

### Repository pattern

Database access will be encapsulated in repositories. Services will not contain scattered Prisma queries, making business logic easier to test.

### Anti-corruption layer

Courier-specific payloads, statuses, and errors will remain inside courier modules. They will not leak into the shared API contract.

## 6. Proposed Source Structure

```text
src/
|-- app.ts
|-- server.ts
|-- worker.ts
|
|-- config/
|   |-- env.ts
|   `-- logger.ts
|
|-- modules/
|   |-- orders/
|   |   |-- order.routes.ts
|   |   |-- order.controller.ts
|   |   |-- order.service.ts
|   |   |-- order.repository.ts
|   |   |-- order.schema.ts
|   |   `-- order.types.ts
|   |
|   |-- batches/
|   |   |-- batch.routes.ts
|   |   |-- batch.controller.ts
|   |   |-- batch.service.ts
|   |   |-- batch.repository.ts
|   |   `-- batch.worker.ts
|   |
|   `-- couriers/
|       |-- courier.interface.ts
|       |-- courier.registry.ts
|       |-- courier.types.ts
|       |-- urbanebolt/
|       |   |-- urbanebolt.adapter.ts
|       |   |-- urbanebolt.client.ts
|       |   |-- urbanebolt.auth.ts
|       |   `-- urbanebolt.mapper.ts
|       `-- mock/
|           `-- mock-courier.adapter.ts
|
|-- middleware/
|   |-- error-handler.ts
|   |-- request-id.ts
|   `-- validate.ts
|
|-- infrastructure/
|   |-- database.ts
|   |-- redis.ts
|   `-- queue.ts
|
`-- shared/
    |-- errors/
    |-- retry.ts
    `-- status.ts
```

## 7. Layer Responsibilities

### Routes

- Declare URLs and HTTP methods.
- Attach request validation and controllers.
- Contain no business logic.

### Controllers

- Translate HTTP requests into service calls.
- Select appropriate HTTP status codes.
- Contain no Prisma queries or courier-specific code.

### Services

- Coordinate order and batch workflows.
- Enforce idempotency.
- Select adapters through the courier registry.
- Persist order state and tracking history through repositories.
- Apply business rules such as cancellation behavior.

### Repositories

- Encapsulate Prisma operations.
- Provide focused persistence methods to services.
- Handle atomic state transitions where required.

### Courier adapters

- Map normalized requests to courier requests.
- Call the courier client.
- Map courier responses to normalized results.
- Translate courier statuses and errors.
- Prevent raw courier data from leaking to consumers.

## 8. Normalized Order Contract

The exact validation rules will be finalized before implementation, but the normalized model will cover:

```ts
type NormalizedOrder = {
  orderId: string;
  courierPartner: string;
  serviceType: string;

  consignee: ContactAddress;
  shipper: ContactAddress;
  returnAddress: ContactAddress;

  package: {
    weightKg: number;
    lengthCm: number;
    widthCm: number;
    heightCm: number;
    pieces: number;
    description: string;
    quantity: number;
  };

  payment: {
    mode: 'PREPAID' | 'COD';
    collectableAmount: number;
    declaredValue: number;
  };

  invoice: {
    number: string;
    date: string;
    value: number;
  };
};
```

UrbaneBolt's `customerCode` is courier-account configuration rather than order-domain data. It will come from an environment variable instead of being supplied by API consumers.

## 9. Proposed Public API

```http
POST /api/v1/orders
GET  /api/v1/orders/:orderId
GET  /api/v1/orders/:orderId/track
POST /api/v1/orders/:orderId/cancel

POST /api/v1/orders/bulk
GET  /api/v1/batches/:batchId

GET  /health/live
GET  /health/ready
```

### Create order

Creates a normalized order and shipment. A repeated successful `order_id` must return the saved shipment without calling the courier again.

### Track order

The server loads the order by `order_id`, obtains its courier and AWB, calls the appropriate adapter, updates the current status, and appends new tracking events.

### Cancel order

The server loads the courier and AWB from the existing order. Repeated cancellation of an already-cancelled order will behave as a successful no-op.

### Bulk create

The endpoint accepts between 1 and 100 orders and returns immediately:

```http
HTTP/1.1 202 Accepted
```

```json
{
  "data": {
    "batch_id": "batch-uuid",
    "status": "QUEUED",
    "total": 100,
    "status_url": "/api/v1/batches/batch-uuid"
  }
}
```

The batch status endpoint returns totals and a result for every order, including failure reasons.

## 10. Persistence Model

### Orders table

Stores at least:

- Internal UUID.
- Unique client-provided `order_id`.
- Courier partner.
- Courier shipment ID.
- AWB number.
- Normalized shipment status.
- Internal processing status.
- Normalized request.
- Exact courier request.
- Exact courier response.
- Internal failure code and details.
- Optional batch ID.
- Created and updated timestamps.

Shipment status and processing status will be kept separate:

- Shipment status: `PENDING`, `CREATED`, `PICKED_UP`, `IN_TRANSIT`, `DELIVERED`, `CANCELLED`, `FAILED`.
- Processing status: `QUEUED`, `PROCESSING`, `SUCCEEDED`, `FAILED`.

### Tracking history table

Append-only table containing:

- Order reference.
- Normalized status.
- Original courier status.
- Raw courier payload.
- Courier event timestamp when available.
- Record creation timestamp.

### Batches table

Contains:

- Batch UUID.
- Batch status.
- Total order count.
- Success count.
- Failure count.
- Created and updated timestamps.

A separate batch-items table is not initially planned because orders can carry the batch ID and individual processing result.

## 11. Idempotency and Concurrency

`order_id` will have a unique database constraint. An application-only "find then insert" check is insufficient because concurrent requests can pass that check simultaneously.

The intended flow is:

1. Insert or claim the order atomically before contacting the courier.
2. If the order already succeeded, return the stored result.
3. If another request or worker owns the processing claim, do not call the courier again.
4. Only the successful claimant may invoke the courier adapter.
5. Persist the courier result and final state.

Where the courier supports a client reference, internal `order_id` will be sent as that reference.

### Unknown-outcome limitation

If the courier creates a shipment but the network times out before our application receives the response, blindly retrying may create a duplicate shipment. A fully safe recovery requires courier-side idempotency or lookup by client reference. This limitation and the chosen reconciliation behavior will be documented explicitly.

## 12. Error Contract

Every endpoint will use one normalized error structure:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid fields",
    "request_id": "request-uuid",
    "details": [
      {
        "field": "consignee.phone",
        "message": "Phone number is required"
      }
    ]
  }
}
```

Candidate normalized codes include:

- `VALIDATION_ERROR`.
- `UNSUPPORTED_COURIER`.
- `ORDER_NOT_FOUND`.
- `ORDER_ALREADY_PROCESSING`.
- `SHIPMENT_NOT_CANCELLABLE`.
- `COURIER_REQUEST_REJECTED`.
- `COURIER_AUTHENTICATION_FAILED`.
- `COURIER_UNAVAILABLE`.
- `SHIPMENT_STATE_UNKNOWN`.
- `INTERNAL_ERROR`.

Raw courier error bodies will be stored for internal diagnosis but never returned to API consumers.

## 13. Retry and Authentication Policy

Transient retry applies to:

- Network failures.
- Timeouts.
- HTTP 429.
- HTTP 5xx.

Ordinary courier 4xx validation errors will not be retried.

Retries will use configurable exponential backoff with jitter. Timeouts, retry count, and base delay will come from environment variables.

For an authentication failure:

1. Invalidate the cached UrbaneBolt token.
2. Authenticate again.
3. Replay the original request once.

Authentication replay will remain separate from transient retries so its behavior is explicit and bounded.

## 14. Logging

Pino will produce structured logs. Every failure log will include:

- `order_id` when available.
- `courier_partner` when available.
- Request ID.
- Normalized error type.
- Stack trace where appropriate.

Passwords, authorization headers, tokens, and sensitive personal data will be redacted.

## 15. UrbaneBolt API Findings

Documentation:

`https://documenter.getpostman.com/view/19172174/2sAYHzFhxb`

UAT base URL:

`https://uat.urbanebolt.in`

### Required endpoints

| Operation       | Method | Path                                       |
| --------------- | ------ | ------------------------------------------ |
| Authenticate    | POST   | `/api/v1/auth/getToken/`                   |
| Create shipment | POST   | `/api/v1/services/manifest/`               |
| Track shipment  | GET    | `/api/v1/services/tracking-pub/?awb={awb}` |
| Cancel shipment | POST   | `/api/v1/services/cancel/`                 |

Other documented operations such as pincode availability, labels, NDR, ePOD, payment-mode changes, and global manifest are outside the initial assignment scope.

### Authentication

The token request accepts username and password. Subsequent required requests use a bearer token. The token will be cached and refreshed automatically following an authentication failure.

### Manifest mapping

The standard Manifest API accepts an array, even for a single shipment. Important mappings include:

| Normalized field         | UrbaneBolt field |
| ------------------------ | ---------------- |
| `orderId`                | `orderNumber`    |
| `consignee.*`            | `cons*`          |
| `shipper.*`              | `shpr*`          |
| `returnAddress.*`        | `rtn*`           |
| `package.widthCm`        | `breadth`        |
| `payment.mode = PREPAID` | `payMode = PPD`  |
| `payment.mode = COD`     | `payMode = COD`  |
| Configured account code  | `customerCode`   |

### Tracking

Tracking accepts one AWB query parameter and is documented as returning shipment details and travel history. The adapter will normalize the current state and append new courier events to tracking history.

### Cancellation

Cancellation accepts an AWB in this shape:

```json
{
  "awbs": "200000001170"
}
```

The documentation says a shipment can be cancelled before pickup.

### Documentation limitations

The public Postman collection has several limitations:

- It contains request examples but no saved response examples.
- It publicly exposes example credentials and bearer tokens; these will not be copied into the project.
- Several examples include cookies that should not be part of the integration contract.
- Token expiry is not documented.
- Error response formats and status codes are not documented.
- The complete courier shipment-status catalogue is not documented.
- Required versus optional manifest fields are not identified.
- Courier-side idempotency is not documented.
- One unrelated label example uses an inconsistent authorization format.

The UrbaneBolt response mapper will therefore validate critical fields and remain isolated so observed UAT response formats can be accommodated without changing application services.

## 16. UrbaneBolt Module Responsibilities

The real courier integration will be split into:

- `urbanebolt.client.ts`: HTTP requests, timeouts, and transport behavior.
- `urbanebolt.auth.ts`: token acquisition, caching, invalidation, and refresh.
- `urbanebolt.mapper.ts`: request, response, error, and status translation.
- `urbanebolt.adapter.ts`: implementation of the shared `CourierAdapter` contract.

This separation keeps authentication, HTTP transport, and field mapping independently testable.

## 17. Testing Priorities

The test suite will prioritize business risk rather than artificial 100% coverage:

- Request validation and field-level errors.
- Courier registry selection.
- Unsupported courier response with supported couriers.
- UrbaneBolt request mapping.
- UrbaneBolt status and response mapping.
- MockCourier end-to-end behavior.
- Repeated and concurrent `order_id` submissions.
- Bulk partial success.
- Maximum batch-size validation.
- Retry on timeout, HTTP 429, and HTTP 5xx.
- No retry for courier validation errors.
- Token refresh followed by one replay.
- Append-only tracking events.
- Prevention of raw courier error leakage.

Tests will mock courier HTTP interactions and will not depend on UAT availability.

## 18. Deliberate Non-Goals

The initial submission will not include:

- NestJS.
- Microservices.
- Kafka or RabbitMQ.
- Kubernetes.
- Event sourcing.
- A generic dependency-injection framework.
- A frontend.
- Every optional UrbaneBolt endpoint.
- Speculative abstractions for courier features not required by the assignment.

These omissions keep the system focused, explainable, and achievable within the deadline.

## 19. Scope Gate and Optional Features

The implementation will follow a strict priority order. Optional courier features must not delay, destabilize, or reduce test coverage for the required submission.

### Phase 1: required courier operations

Complete the four required UrbaneBolt operations first:

1. Authentication.
2. Shipment creation through the standard Manifest API.
3. Shipment tracking.
4. Shipment cancellation.

This phase also includes the unified API, persistence, idempotency, asynchronous bulk processing, normalized errors, retries, logging, tracking history, and MockCourier required to demonstrate the architecture.

### Phase 2: thorough verification

Before adding optional operations, verify the required application thoroughly:

- Build, lint, and automated tests pass.
- Required API flows work end to end.
- Duplicate and concurrent order submissions are covered.
- Bulk partial-success behavior is covered.
- Retry and token-refresh behavior is covered.
- Database records and append-only tracking history are correct.
- Raw courier errors and secrets do not leak to clients or logs.
- README, DESIGN, Swagger, and API examples match the implementation.

### Phase 3: optional capabilities, only if time permits

After Phase 2 is complete, optional features may be added in this order:

1. Pincode serviceability.
2. Shipping-label retrieval.

These features will use separate optional capability interfaces rather than expanding the required `CourierAdapter` contract. NDR, ePOD, payment-mode changes, and Global Manifest remain outside the submission scope.

## 20. Proposed Delivery Order

Implementation will start only after this plan is approved.

1. Finalize normalized request and response contracts.
2. Scaffold the Express and TypeScript application.
3. Create the GitHub repository and push the first safe, runnable baseline.
4. Add database schema and repositories.
5. Implement the courier interface and registry.
6. Implement MockCourier first to validate the plug-in architecture.
7. Implement create, track, and cancel services and endpoints.
8. Implement UrbaneBolt authentication, mapping, and adapter.
9. Add BullMQ batch creation and worker processing.
10. Add retries, error normalization, logging, and redaction.
11. Add automated tests.
12. Add Swagger, curl examples, README, DESIGN, and Docker setup.
13. Run final build, test, lint, API, and documentation checks.
14. Push the verified submission and confirm the public repository is accessible to HR.

### GitHub delivery workflow

- Initialize Git at the beginning of implementation.
- Include a complete `.gitignore` before the first commit.
- Never commit `.env`, credentials, bearer tokens, generated logs, or UAT secrets.
- Push the first runnable application baseline early so the repository link exists from the start.
- Push after each stable checkpoint rather than waiting until the entire project is finished.
- Keep commit messages small and descriptive so evaluators can follow the implementation history.
- Before the final push, run the complete verification suite and scan tracked files for secrets.
- Verify the repository URL in a signed-out/private browser session to ensure HR can access it.

## 21. Open Decisions Before Implementation

The following decisions were open when this plan was drafted. Items confirmed in the approved contract documents are marked complete:

1. [x] Final normalized create-order request fields and which are optional.
2. [x] Use normalized `service_level` values `SAME_DAY` and `NEXT_DAY`.
3. [x] Exact response contract for synchronous order creation.
4. [x] Tracking appends only new courier events and deduplicates repeated polls.
5. Behavior after an uncertain courier timeout when no lookup-by-reference API exists.
6. Whether valid company-provided UAT credentials and response samples are available.
7. Default BullMQ concurrency and retry values.
