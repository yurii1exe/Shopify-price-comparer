import express, { Router } from 'express';
import { Services } from '../../container';
import { verifyShopifyWebhook } from '../../infrastructure/shopify/Webhooks';

export interface WebhookRouteOptions {
  /** Awaited in tests so assertions do not race the background work. */
  onProcessed?: (promise: Promise<unknown>) => void;
}

/**
 * `POST /webhooks/shopify`, dispatching on the `X-Shopify-Topic` header.
 *
 * `express.raw` is mounted here and `express.json` deliberately is not: the
 * HMAC is computed over the bytes Shopify sent, and a parsed-then-reserialised
 * body is not those bytes.
 */
export function createWebhookRoutes(
  services: Services,
  webhookSecret: string,
  options: WebhookRouteOptions = {}
): Router {
  const router = Router();

  router.post('/shopify', express.raw({ type: '*/*', limit: '2mb' }), (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
    const hmac = req.header('X-Shopify-Hmac-Sha256');

    if (!verifyShopifyWebhook(rawBody, hmac, webhookSecret)) {
      res.status(401).json({ error: 'Webhook HMAC verification failed' });
      return;
    }

    const topic = req.header('X-Shopify-Topic') ?? '';

    // Anything not handled is acknowledged rather than rejected. Shopify retries
    // a non-2xx for two days and then removes the subscription, so answering 4xx
    // to a topic this service simply does not act on eventually breaks the
    // topics it does.
    if (topic !== 'products/create') {
      res.status(200).json({ status: 'ignored', topic });
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      res.status(400).json({ error: 'Webhook body is not valid JSON' });
      return;
    }

    // Acknowledged before the work starts. Shopify gives a webhook endpoint five
    // seconds; collecting competitor prices involves another marketplace's API
    // and has no business being on that clock.
    res.status(202).json({ status: 'accepted', topic });

    const processing = services.productCreatedHandler
      .handle(payload as never)
      .catch((error: unknown) => {
        console.error('products/create webhook processing failed:', error);
      });

    options.onProcessed?.(processing);
  });

  return router;
}
