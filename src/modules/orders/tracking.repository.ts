import { Prisma, type PrismaClient, type ShipmentStatus, type TrackingEvent } from '@prisma/client';

export type AppendTrackingEvent = {
  orderId: string;
  courierEventId?: string;
  deduplicationKey: string;
  status: ShipmentStatus;
  courierStatus: string;
  description?: string;
  location?: string;
  occurredAt: Date;
  rawPayload: Prisma.InputJsonValue;
};

export type AppendTrackingResult =
  { appended: true; event: TrackingEvent } | { appended: false; event: TrackingEvent };

export class TrackingRepository {
  constructor(private readonly database: PrismaClient) {}

  async append(input: AppendTrackingEvent): Promise<AppendTrackingResult> {
    try {
      const event = await this.database.trackingEvent.create({
        data: {
          orderId: input.orderId,
          deduplicationKey: input.deduplicationKey,
          status: input.status,
          courierStatus: input.courierStatus,
          occurredAt: input.occurredAt,
          rawPayload: input.rawPayload,
          ...(input.courierEventId ? { courierEventId: input.courierEventId } : {}),
          ...(input.description ? { description: input.description } : {}),
          ...(input.location ? { location: input.location } : {}),
        },
      });

      return { appended: true, event };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;

      const event = await this.database.trackingEvent.findUniqueOrThrow({
        where: {
          orderId_deduplicationKey: {
            orderId: input.orderId,
            deduplicationKey: input.deduplicationKey,
          },
        },
      });

      return { appended: false, event };
    }
  }

  async findByOrderId(orderId: string): Promise<TrackingEvent[]> {
    return this.database.trackingEvent.findMany({
      where: { orderId },
      orderBy: [{ occurredAt: 'asc' }, { recordedAt: 'asc' }],
    });
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
