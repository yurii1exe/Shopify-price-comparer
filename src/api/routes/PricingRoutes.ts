import { Router } from 'express';
import { PricingController } from '../controllers/PricingController';
import { Services } from '../../container';

export function createPricingRoutes(services: Services): Router {
  const controller = new PricingController(services);
  const router = Router();

  router.post('/sync', asyncRoute(controller.sync));
  router.post('/compare', asyncRoute(controller.compare));
  router.post('/update', asyncRoute(controller.update));

  return router;
}

/**
 * Express 4 does not catch a rejected promise from an async handler — it hangs
 * the request until the client times out. This forwards it to the error
 * middleware instead.
 */
function asyncRoute(handler: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => handler(req, res).catch(next);
}
