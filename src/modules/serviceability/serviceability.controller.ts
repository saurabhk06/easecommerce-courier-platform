import type { RequestHandler } from 'express';
import type { ServiceabilityQuery } from './serviceability.schema.js';
import type { ServiceabilityService } from './serviceability.service.js';

export function checkPincodesController(service: ServiceabilityService): RequestHandler {
  return async (req, res) => {
    const query = res.locals.validatedQuery as ServiceabilityQuery;
    const result = await service.checkPincodes(query.courier_partner, query.pincodes);

    res.status(200).json({
      data: {
        courier_partner: result.courierPartner,
        results: result.results,
      },
    });
  };
}
