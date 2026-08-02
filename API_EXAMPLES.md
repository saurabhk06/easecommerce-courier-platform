# API examples

These examples use MockCourier, so they are safe to run without UrbaneBolt credentials. Start the API and worker in separate terminals before running the bulk example.

```bash
pnpm dev
pnpm dev:worker
```

Swagger UI is available at `http://localhost:3000/api-docs/`; the machine-readable contract is at `http://localhost:3000/api-docs/openapi.json`.

## Create one shipment

```bash
curl --request POST 'http://localhost:3000/api/v1/orders' \
  --header 'Content-Type: application/json' \
  --header 'x-request-id: local-create-demo' \
  --data '{
    "order_id": "EC-DEMO-001",
    "courier_partner": "mock",
    "service_level": "NEXT_DAY",
    "consignee": {
      "name": "Aarav Sharma",
      "phone": "+919876543210",
      "email": "aarav@example.com",
      "address_line_1": "12 MG Road",
      "address_type": "HOME",
      "city": "Bengaluru",
      "state": "Karnataka",
      "country": "IN",
      "postal_code": "560001"
    },
    "shipper": {
      "name": "EaseCommerce Warehouse",
      "phone": "+919811111111",
      "address_line_1": "Plot 18, Sector 17",
      "address_type": "BUSINESS",
      "city": "Gurugram",
      "state": "Haryana",
      "country": "IN",
      "postal_code": "122001"
    },
    "package": {
      "weight_kg": 1.25,
      "length_cm": 20,
      "width_cm": 15,
      "height_cm": 10,
      "pieces": 1,
      "item_description": "Cotton shirts",
      "item_quantity": 2
    },
    "payment": {
      "mode": "COD",
      "collectable_amount": 1499,
      "declared_value": 1499
    },
    "invoice": {
      "number": "INV-DEMO-001",
      "date": "2025-08-03",
      "value": 1499
    }
  }'
```

An identical replay returns `200` without another courier call. Changing the payload while keeping `EC-DEMO-001` returns `409 ORDER_ID_CONFLICT`.

## Retrieve, track, and cancel

```bash
curl 'http://localhost:3000/api/v1/orders/EC-DEMO-001'
curl 'http://localhost:3000/api/v1/orders/EC-DEMO-001/track'
curl --request POST 'http://localhost:3000/api/v1/orders/EC-DEMO-001/cancel'
```

Cancellation intentionally has no request body.

## Queue a bulk shipment batch

The example reuses the complete order contract. Every `order_id` must be unique globally.

```bash
curl --request POST 'http://localhost:3000/api/v1/orders/bulk' \
  --header 'Content-Type: application/json' \
  --data '{
    "orders": [
      {
        "order_id": "EC-BULK-DEMO-001",
        "courier_partner": "mock",
        "service_level": "NEXT_DAY",
        "consignee": {
          "name": "Aarav Sharma",
          "phone": "+919876543210",
          "address_line_1": "12 MG Road",
          "address_type": "HOME",
          "city": "Bengaluru",
          "state": "Karnataka",
          "country": "IN",
          "postal_code": "560001"
        },
        "shipper": {
          "name": "EaseCommerce Warehouse",
          "phone": "+919811111111",
          "address_line_1": "Plot 18, Sector 17",
          "address_type": "BUSINESS",
          "city": "Gurugram",
          "state": "Haryana",
          "country": "IN",
          "postal_code": "122001"
        },
        "package": {
          "weight_kg": 1.25,
          "length_cm": 20,
          "width_cm": 15,
          "height_cm": 10,
          "pieces": 1,
          "item_description": "Cotton shirts",
          "item_quantity": 2
        },
        "payment": {
          "mode": "PREPAID",
          "collectable_amount": 0,
          "declared_value": 1499
        },
        "invoice": {
          "number": "INV-BULK-DEMO-001",
          "date": "2025-08-03",
          "value": 1499
        }
      }
    ]
  }'
```

Copy `data.batch_id` from the `202` response:

```bash
curl 'http://localhost:3000/api/v1/batches/REPLACE_WITH_BATCH_ID'
```

Poll until the status becomes `COMPLETED`, `PARTIALLY_COMPLETED`, or `FAILED`.
