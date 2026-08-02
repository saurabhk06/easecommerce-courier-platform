import { Router } from 'express';
import { validateQuery } from '../../middleware/validate.js';
import { checkPincodesController } from './serviceability.controller.js';
import { serviceabilityQuerySchema } from './serviceability.schema.js';
import type { ServiceabilityService } from './serviceability.service.js';

export function createServiceabilityRouter(service: ServiceabilityService): Router {
  const router = Router();
  router.get(
    '/pincodes',
    validateQuery(serviceabilityQuerySchema),
    checkPincodesController(service),
  );
  return router;
}
