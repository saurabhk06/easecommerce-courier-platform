-- CreateEnum
CREATE TYPE "ServiceLevel" AS ENUM ('SAME_DAY', 'NEXT_DAY');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('PENDING', 'CREATED', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED', 'RTO_INITIATED', 'RETURNED', 'FAILED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ProcessingStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'RECONCILIATION_REQUIRED');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "order_id" VARCHAR(64) NOT NULL,
    "request_fingerprint" CHAR(64) NOT NULL,
    "courier_partner" VARCHAR(32) NOT NULL,
    "service_level" "ServiceLevel" NOT NULL,
    "courier_shipment_id" VARCHAR(128),
    "awb_number" VARCHAR(128),
    "shipment_status" "ShipmentStatus" NOT NULL DEFAULT 'PENDING',
    "processing_status" "ProcessingStatus" NOT NULL DEFAULT 'QUEUED',
    "normalized_request" JSONB NOT NULL,
    "courier_request" JSONB,
    "courier_response" JSONB,
    "failure_code" VARCHAR(64),
    "failure_details" JSONB,
    "processing_started_at" TIMESTAMPTZ(3),
    "batch_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracking_history" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "courier_event_id" VARCHAR(128),
    "deduplication_key" CHAR(64) NOT NULL,
    "status" "ShipmentStatus" NOT NULL,
    "courier_status" VARCHAR(128) NOT NULL,
    "description" VARCHAR(500),
    "location" VARCHAR(200),
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw_payload" JSONB NOT NULL,

    CONSTRAINT "tracking_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batches" (
    "id" UUID NOT NULL,
    "status" "BatchStatus" NOT NULL DEFAULT 'QUEUED',
    "total_count" INTEGER NOT NULL,
    "success_count" INTEGER NOT NULL DEFAULT 0,
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_id_key" ON "orders"("order_id");

-- CreateIndex
CREATE INDEX "orders_batch_id_idx" ON "orders"("batch_id");

-- CreateIndex
CREATE INDEX "orders_courier_partner_shipment_status_idx" ON "orders"("courier_partner", "shipment_status");

-- CreateIndex
CREATE INDEX "orders_processing_status_created_at_idx" ON "orders"("processing_status", "created_at");

-- CreateIndex
CREATE INDEX "tracking_history_order_id_occurred_at_idx" ON "tracking_history"("order_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "tracking_history_order_id_deduplication_key_key" ON "tracking_history"("order_id", "deduplication_key");

-- CreateIndex
CREATE INDEX "batches_status_created_at_idx" ON "batches"("status", "created_at");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_history" ADD CONSTRAINT "tracking_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep batch counters internally valid even when data is changed outside the application.
ALTER TABLE "batches" ADD CONSTRAINT "batches_total_count_check" CHECK ("total_count" BETWEEN 1 AND 100);
ALTER TABLE "batches" ADD CONSTRAINT "batches_success_count_check" CHECK ("success_count" >= 0);
ALTER TABLE "batches" ADD CONSTRAINT "batches_failure_count_check" CHECK ("failure_count" >= 0);

-- Tracking history is an audit log. New events may be inserted, but existing rows are immutable.
CREATE FUNCTION prevent_tracking_history_mutation()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'tracking_history is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tracking_history_append_only
BEFORE UPDATE OR DELETE ON "tracking_history"
FOR EACH ROW EXECUTE FUNCTION prevent_tracking_history_mutation();
