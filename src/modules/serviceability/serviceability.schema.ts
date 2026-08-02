import { z } from 'zod';

const pincode = z.string().regex(/^\d{6}$/, 'Pincode must contain six digits');

export const serviceabilityQuerySchema = z
  .object({
    courier_partner: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_-]{1,31}$/, 'Courier partner must be a lowercase identifier'),
    pincodes: z
      .string()
      .trim()
      .min(1)
      .transform((value) => value.split(',').map((item) => item.trim()))
      .pipe(z.array(pincode).min(1).max(50)),
  })
  .superRefine(({ pincodes }, context) => {
    const seen = new Set<string>();
    pincodes.forEach((value, index) => {
      if (seen.has(value)) {
        context.addIssue({
          code: 'custom',
          path: ['pincodes', index],
          message: 'Duplicate pincode',
        });
      }
      seen.add(value);
    });
  });

export type ServiceabilityQuery = z.infer<typeof serviceabilityQuerySchema>;
