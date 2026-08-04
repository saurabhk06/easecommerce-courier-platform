# Swagger API Testing Guide

This guide shows how to test every EaseCommerce Courier Platform API from Swagger UI.

## Before you start

Complete the setup from `README.md`, then run these processes in separate terminals.

API server:

```bash
pnpm dev
```

Bulk worker:

```bash
pnpm dev:worker
```

Open:

```text
http://localhost:3000/api-docs/
```

For each request:

1. Expand the endpoint.
2. Click **Try it out**.
3. Enter the parameters or request body.
4. Click **Execute**.
5. Check the response status and body.

UrbaneBolt is the default courier and uses the assignment's shared UAT account. Set `courier_partner` to `mock` when you want a local response without calling UrbaneBolt.

## Recommended testing order

### 1. Check liveness

```http
GET /health/live
```

Expected response: `200 OK`

```json
{
  "status": "ok"
}
```

This confirms that the API process is running.

### 2. Check readiness

```http
GET /health/ready
```

Expected response: `200 OK`

```json
{
  "status": "ready"
}
```

A `503` response means PostgreSQL or Redis is unavailable.

### 3. Check pincode availability

```http
GET /api/v1/serviceability/pincodes
```

Enter:

```text
pincodes: 122001,560001
```

`courier_partner` is optional and defaults to `urbanebolt`.

Expected response: `200 OK` with one availability result for each pincode.

### 4. Create a shipment

```http
POST /api/v1/orders
```

Swagger provides an UrbaneBolt request example. Change these values before each new shipment:

```json
{
  "order_id": "EC-URBANEBOLT-101",
  "invoice": {
    "number": "INV-URBANEBOLT-101"
  }
}
```

Keep the remaining example fields unchanged for the initial UAT test.

Expected response for a new shipment: `201 Created` with:

- `courier_partner: urbanebolt`
- `processing_status: SUCCEEDED`
- `shipment_status: CREATED`
- an `awb_number`

Save the `order_id`; it is used in the next APIs.

#### Idempotency behavior

- Same `order_id` and identical body: returns the saved shipment without another courier call.
- Same `order_id` and changed body: returns `409 ORDER_ID_CONFLICT`.
- New shipment: always use a new `order_id`.

### 5. Retrieve the saved order

```http
GET /api/v1/orders/{orderId}
```

Enter the successful order ID:

```text
EC-URBANEBOLT-101
```

Expected response: `200 OK`. This reads PostgreSQL and does not call UrbaneBolt.

### 6. Refresh tracking

```http
GET /api/v1/orders/{orderId}/track
```

Enter the same order ID.

Expected response: `200 OK` containing the normalized shipment status and tracking history. This request contacts UrbaneBolt and saves new, non-duplicate events.

### 7. Cancel the shipment

```http
POST /api/v1/orders/{orderId}/cancel
```

Enter the same order ID. No request body is required.

Expected response: `200 OK` with `shipment_status: CANCELLED`. Repeating the request is safe and returns the existing cancelled order.

Run tracking before cancellation because a cancelled shipment may no longer produce useful tracking updates.

### 8. Submit a bulk shipment

```http
POST /api/v1/orders/bulk
```

The bulk worker must be running. Replace generated placeholder data with realistic values and use a unique order and invoice number, for example:

```text
order_id: EC-BULK-URBANEBOLT-101
invoice.number: INV-BULK-URBANEBOLT-101
service_level: NEXT_DAY
consignee.postal_code: 560001
shipper.postal_code: 122001
```

Expected response: `202 Accepted`. Copy the returned `data.batch_id`.

`202` means the batch was queued; it does not yet mean every shipment succeeded.

### 9. Check batch progress

```http
GET /api/v1/batches/{batchId}
```

Paste the `batch_id` from the previous response.

Call this endpoint until the batch reaches one of these final states:

- `COMPLETED`
- `PARTIALLY_COMPLETED`
- `FAILED`

The response includes totals and the result for each order.

## Common errors

### `ORDER_ID_CONFLICT`

The order ID already exists with different data. Use a new `order_id`.

### `SHIPMENT_STATE_UNKNOWN`

The courier outcome could not be confirmed. Do not immediately submit the same shipment again because the courier might have created it.

### `COURIER_AUTHENTICATION_FAILED`

Confirm the `URBANEBOLT_*` settings in `.env`, then restart the API.

### Readiness returns `503`

Check the infrastructure:

```bash
docker compose ps
```

PostgreSQL and Redis should both be healthy.

### A bulk batch remains queued

Start or restart the worker:

```bash
pnpm dev:worker
```

## Alternative: Postman

For repeatable testing with automatically generated order IDs, import:

```text
postman/EaseCommerce.postman_collection.json
```

The Postman collection stores the latest order and batch IDs automatically.
