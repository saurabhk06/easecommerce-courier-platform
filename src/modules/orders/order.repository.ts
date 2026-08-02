import {
  Prisma,
  type Order,
  type PrismaClient,
  ProcessingStatus,
  ShipmentStatus,
  type ServiceLevel,
} from '@prisma/client';

export type CreateOrderRecord = {
  orderId: string;
  requestFingerprint: string;
  courierPartner: string;
  serviceLevel: ServiceLevel;
  normalizedRequest: Prisma.InputJsonValue;
  batchId?: string;
};

export type CreateOrderResult = {
  order: Order;
  created: boolean;
};

export type ClaimOrderResult = {
  order: Order;
  outcome:
    | 'CLAIMED'
    | 'ALREADY_PROCESSING'
    | 'ALREADY_SUCCEEDED'
    | 'ALREADY_FAILED'
    | 'RECONCILIATION_REQUIRED';
};

export class OrderRepository {
  constructor(private readonly database: PrismaClient) {}

  async createOrGet(input: CreateOrderRecord): Promise<CreateOrderResult> {
    try {
      const order = await this.database.order.create({
        data: {
          orderId: input.orderId,
          requestFingerprint: input.requestFingerprint,
          courierPartner: input.courierPartner,
          serviceLevel: input.serviceLevel,
          normalizedRequest: input.normalizedRequest,
          ...(input.batchId ? { batchId: input.batchId } : {}),
        },
      });

      return { order, created: true };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;

      const order = await this.database.order.findUniqueOrThrow({
        where: { orderId: input.orderId },
      });

      return { order, created: false };
    }
  }

  async findByOrderId(orderId: string): Promise<Order | null> {
    return this.database.order.findUnique({ where: { orderId } });
  }

  async claimForProcessing(orderId: string): Promise<ClaimOrderResult | null> {
    const claimed = await this.database.order.updateMany({
      where: {
        orderId,
        processingStatus: ProcessingStatus.QUEUED,
      },
      data: {
        processingStatus: ProcessingStatus.PROCESSING,
        processingStartedAt: new Date(),
      },
    });

    const order = await this.findByOrderId(orderId);
    if (!order) return null;

    if (claimed.count === 1) return { order, outcome: 'CLAIMED' };

    const outcomeByStatus = {
      [ProcessingStatus.QUEUED]: 'ALREADY_PROCESSING',
      [ProcessingStatus.PROCESSING]: 'ALREADY_PROCESSING',
      [ProcessingStatus.SUCCEEDED]: 'ALREADY_SUCCEEDED',
      [ProcessingStatus.FAILED]: 'ALREADY_FAILED',
      [ProcessingStatus.RECONCILIATION_REQUIRED]: 'RECONCILIATION_REQUIRED',
    } as const;

    return { order, outcome: outcomeByStatus[order.processingStatus] };
  }

  async completeShipmentCreation(
    orderId: string,
    result: {
      courierShipmentId: string;
      awbNumber: string;
      courierRequest: Prisma.InputJsonValue;
      courierResponse: Prisma.InputJsonValue;
    },
  ): Promise<Order> {
    return this.database.order.update({
      where: { orderId },
      data: {
        courierShipmentId: result.courierShipmentId,
        awbNumber: result.awbNumber,
        courierRequest: result.courierRequest,
        courierResponse: result.courierResponse,
        shipmentStatus: ShipmentStatus.CREATED,
        processingStatus: ProcessingStatus.SUCCEEDED,
        failureCode: null,
        failureDetails: Prisma.JsonNull,
      },
    });
  }

  async markProcessingFailure(
    orderId: string,
    failure: {
      code: string;
      details: Prisma.InputJsonValue;
      reconciliationRequired: boolean;
      courierRequest?: Prisma.InputJsonValue;
      courierResponse?: Prisma.InputJsonValue;
    },
  ): Promise<Order> {
    return this.database.order.update({
      where: { orderId },
      data: {
        processingStatus: failure.reconciliationRequired
          ? ProcessingStatus.RECONCILIATION_REQUIRED
          : ProcessingStatus.FAILED,
        failureCode: failure.code,
        failureDetails: failure.details,
        ...(failure.courierRequest ? { courierRequest: failure.courierRequest } : {}),
        ...(failure.courierResponse ? { courierResponse: failure.courierResponse } : {}),
      },
    });
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
