import { Router } from 'express';

export type ReadinessCheck = () => Promise<void>;

export function createHealthRouter(readinessChecks: ReadinessCheck[] = []): Router {
  const router = Router();

  router.get('/live', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  router.get('/ready', async (_req, res) => {
    const results = await Promise.allSettled(readinessChecks.map((check) => check()));
    const isReady = results.every((result) => result.status === 'fulfilled');

    res.status(isReady ? 200 : 503).json({ status: isReady ? 'ready' : 'not_ready' });
  });

  return router;
}
