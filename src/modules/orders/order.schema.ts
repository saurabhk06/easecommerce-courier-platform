import { z } from 'zod';

const identifier = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'Only letters, digits, hyphens and underscores are allowed');

const money = z
  .number()
  .finite()
  .nonnegative()
  .refine(hasAtMostTwoDecimalPlaces, 'Amount must have at most two decimal places');

const addressSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z
    .string()
    .trim()
    .regex(/^\+?\d{8,16}$/, 'Phone must contain 8-16 digits and may start with +'),
  email: z.email().max(254).optional(),
  address_line_1: z.string().trim().min(5).max(200),
  address_line_2: z.string().trim().max(200).optional(),
  address_type: z.enum(['HOME', 'BUSINESS', 'OTHER']),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  country: z.literal('IN'),
  postal_code: z.string().regex(/^\d{6}$/, 'Postal code must contain six digits'),
});

const courierPartnerSchema = z
  .string()
  .trim()
  .regex(/^[a-z][a-z0-9_-]{1,31}$/, 'Courier partner must be a lowercase identifier');

export function createOrderSchemaWithDefault(defaultCourierPartner: string) {
  return z
    .object({
      order_id: identifier,
      courier_partner: courierPartnerSchema.default(defaultCourierPartner),
      service_level: z.enum(['SAME_DAY', 'NEXT_DAY']),
      consignee: addressSchema,
      shipper: addressSchema,
      return_address: addressSchema.optional(),
      package: z.object({
        weight_kg: z.number().finite().positive(),
        length_cm: z.number().finite().positive(),
        width_cm: z.number().finite().positive(),
        height_cm: z.number().finite().positive(),
        pieces: z.number().int().min(1).max(100),
        item_description: z.string().trim().min(1).max(250),
        item_quantity: z.number().int().min(1).max(10_000),
      }),
      payment: z.object({
        mode: z.enum(['PREPAID', 'COD']),
        collectable_amount: money,
        declared_value: money.positive(),
      }),
      invoice: z.object({
        number: z.string().trim().min(1).max(64),
        date: z.iso.date(),
        value: money.positive(),
      }),
    })
    .superRefine((order, context) => {
      if (order.payment.mode === 'PREPAID' && order.payment.collectable_amount !== 0) {
        addIssue(context, ['payment', 'collectable_amount'], 'Must be 0 for prepaid shipments');
      }

      if (order.payment.mode === 'COD' && order.payment.collectable_amount <= 0) {
        addIssue(context, ['payment', 'collectable_amount'], 'Must be greater than 0 for COD');
      }

      if (order.payment.collectable_amount > order.payment.declared_value) {
        addIssue(context, ['payment', 'collectable_amount'], 'Cannot exceed declared value');
      }

      if (order.invoice.value !== order.payment.declared_value) {
        addIssue(context, ['invoice', 'value'], 'Must equal payment.declared_value');
      }

      const invoiceDate = new Date(`${order.invoice.date}T00:00:00.000Z`);
      const today = new Date();
      today.setUTCHours(23, 59, 59, 999);
      if (invoiceDate > today) addIssue(context, ['invoice', 'date'], 'Cannot be in the future');
    });
}

export const createOrderSchema = createOrderSchemaWithDefault('urbanebolt');

export const orderIdSchema = identifier;

export function createBulkOrderSchemaWithDefault(defaultCourierPartner: string) {
  return z
    .object({
      orders: z.array(createOrderSchemaWithDefault(defaultCourierPartner)).min(1).max(100),
    })
    .superRefine(({ orders }, context) => {
      const firstIndexByOrderId = new Map<string, number>();
      orders.forEach((order, index) => {
        const firstIndex = firstIndexByOrderId.get(order.order_id);
        if (firstIndex === undefined) {
          firstIndexByOrderId.set(order.order_id, index);
          return;
        }

        addIssue(
          context,
          ['orders', index, 'order_id'],
          `Duplicate order_id; first used at orders.${firstIndex}.order_id`,
        );
      });
    });
}

export const bulkOrderSchema = createBulkOrderSchemaWithDefault('urbanebolt');

export type CreateOrderRequest = z.infer<typeof createOrderSchema>;
export type BulkOrderRequest = z.infer<typeof bulkOrderSchema>;

function hasAtMostTwoDecimalPlaces(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < Number.EPSILON * 100;
}

function addIssue(context: z.RefinementCtx, path: (string | number)[], message: string): void {
  context.addIssue({ code: 'custom', path, message });
}
