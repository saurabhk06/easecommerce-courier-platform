import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Router } from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { parse } from 'yaml';

const specificationPath = resolve(__dirname, '../../../openapi.yaml');
export const openApiDocument = parse(readFileSync(specificationPath, 'utf8')) as Record<
  string,
  unknown
>;

export function createApiDocsRouter(): Router {
  const router = Router();

  router.get('/openapi.json', (_req, res) => res.status(200).json(openApiDocument));
  router.use(
    helmet.contentSecurityPolicy({
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    }),
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customCss: '',
      customSiteTitle: 'EaseCommerce Courier API',
      swaggerOptions: { displayRequestDuration: true, persistAuthorization: true },
    }),
  );

  return router;
}
