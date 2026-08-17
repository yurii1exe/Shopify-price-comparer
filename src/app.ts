import express, { Application, NextFunction, Request, Response } from 'express';
import { requireApiKey } from './api/middleware/requireApiKey';
import { createPricingRoutes } from './api/routes/PricingRoutes';
import { createWebhookRoutes, WebhookRouteOptions } from './api/routes/WebhookRoutes';
import { Services } from './container';
import { AppConfig } from './shared/config/config';

export interface AppOptions {
  webhooks?: WebhookRouteOptions;
}

export function createApp(services: Services, config: AppConfig, options: AppOptions = {}): Application {
  const app = express();

  // Webhooks first, and with their own raw body parser: once express.json has
  // touched the request the HMAC can no longer be verified.
  if (config.shopify.webhookSecret) {
    app.use('/webhooks', createWebhookRoutes(services, config.shopify.webhookSecret, options.webhooks));
  }

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      sources: services.sources.map((s) => s.name),
      webhooks: config.shopify.webhookSecret ? 'enabled' : 'disabled',
    });
  });

  // Every pricing route is behind the shared secret. The webhook route above is
  // the only one meant to be reachable from outside, and it verifies its own
  // caller by HMAC.
  app.use('/api/pricing', requireApiKey(config.pricing.apiKey), createPricingRoutes(services));

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled error:', error);
    res.status(500).json({ error: error.message });
  });

  return app;
}
