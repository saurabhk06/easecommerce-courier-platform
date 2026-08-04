import { Router } from 'express';
import { validateQuery } from '../../middleware/validate.js';
import { checkPincodesController } from './serviceability.controller.js';
import { createServiceabilityQuerySchema } from './serviceability.schema.js';
import type { ServiceabilityService } from './serviceability.service.js';

export function createServiceabilityRouter(
  service: ServiceabilityService,
  defaultCourierPartner = 'urbanebolt',
): Router {
  const router = Router();
  const serviceabilityQuerySchema = createServiceabilityQuerySchema(defaultCourierPartner);
  router.get(
    '/pincodes',
    validateQuery(serviceabilityQuerySchema),
    checkPincodesController(service),
  );
  return router;
}
