import { createHmac } from 'crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { Services } from '../src/container';
import { CatalogSyncService } from '../src/application/services/CatalogSyncService';
import { PriceComparisonService } from '../src/application/services/PriceComparisonService';
import { PriceUpdateService } from '../src/application/services/PriceUpdateService';
import { ProductCreatedHandler } from '../src/infrastructure/shopify/Webhooks';
import { ShopifyApi } from '../src/infrastructure/shopify/ShopifyApi';
import { IExternalApi } from '../src/infrastructure/external-apis/ExternalApiInterface';
import { AppConfig } from '../src/shared/config/config';
import { InMemoryProductRepository, makeProduct } from './helpers/InMemoryProductRepository';

const WEBHOOK_SECRET = 'shpss_test_secret';
const API_KEY = 'test-pricing-key';

function config(overrides: Partial<AppConfig['shopify']> = {}, apiKey: string | null = API_KEY): AppConfig {
  return {
    port: 0,
    mongoUri: 'mongodb://unused',
    shopify: {
      storeName: 'acme',
      accessToken: 'shpat_test',
      apiVersion: '2024-10',
      webhookSecret: WEBHOOK_SECRET,
      ...overrides,
    },
    ebay: null,
    pricing: { maxChangePercent: 20, apiKey },
  };
}

interface Harness {
  services: Services;
  repo: InMemoryProductRepository;
  updateVariantPrice: jest.Mock;
  processed: Promise<unknown>[];
}

function harness(
  sources: IExternalApi[] = [],
  products = [makeProduct({ competitorPrices: [90, 95, 100] })]
): Harness {
  const repo = new InMemoryProductRepository(products);
  const updateVariantPrice = jest.fn().mockResolvedValue(undefined);
  const shopifyApi = {
    updateProductVariantPrice: updateVariantPrice,
    getAllProducts: async () => [
      { id: 1001, title: 'Widget', variants: [{ id: 5001, title: 'Default', price: '100.00' }] },
    ],
  } as unknown as ShopifyApi;

  const comparisonService = new PriceComparisonService(repo, sources);
  const processed: Promise<unknown>[] = [];

  return {
    repo,
    updateVariantPrice,
    processed,
    services: {
      productRepo: repo,
      shopifyApi,
      sources,
      comparisonService,
      priceUpdateService: new PriceUpdateService(repo, shopifyApi, { maxChangePercent: 20 }),
      catalogSyncService: new CatalogSyncService(repo, shopifyApi),
      productCreatedHandler: new ProductCreatedHandler(comparisonService),
    },
  };
}

function app(h: Harness, cfg = config()) {
  return createApp(h.services, cfg, { webhooks: { onProcessed: (p) => h.processed.push(p) } });
}

describe('GET /health', () => {
  it('reports which sources are configured', async () => {
    const h = harness([{ name: 'ebay', getCompetitorPrices: async () => [] }]);
    const response = await request(app(h)).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', sources: ['ebay'], webhooks: 'enabled' });
  });

  it('says webhooks are disabled when no secret is configured', async () => {
    const h = harness();
    const response = await request(app(h, config({ webhookSecret: null }))).get('/health');
    expect(response.body.webhooks).toBe('disabled');
  });
});

describe('POST /api/pricing/update', () => {
  it('rejects an unknown strategy with the list of valid ones', async () => {
    const h = harness();
    const response = await request(app(h)).post('/api/pricing/update').set('X-Api-Key', API_KEY).send({ strategy: 'cheapest' });

    expect(response.status).toBe(400);
    expect(response.body.expected).toEqual(['average', 'min', 'max', 'median']);
    expect(h.updateVariantPrice).not.toHaveBeenCalled();
  });

  it('rejects a missing strategy', async () => {
    const response = await request(app(harness())).post('/api/pricing/update').set('X-Api-Key', API_KEY).send({});
    expect(response.status).toBe(400);
  });

  it('applies the rule and returns what moved', async () => {
    const h = harness();
    const response = await request(app(h)).post('/api/pricing/update').set('X-Api-Key', API_KEY).send({ strategy: 'min' });

    expect(response.status).toBe(200);
    expect(response.body.changes).toEqual([
      { shopifyId: '1001', variantId: 5001, title: 'Widget', from: 100, to: 90 },
    ]);
    expect(h.updateVariantPrice).toHaveBeenCalledWith(5001, '90.00');
  });

  it('writes nothing when asked for a dry run', async () => {
    const h = harness();
    const response = await request(app(h)).post('/api/pricing/update').set('X-Api-Key', API_KEY).send({ strategy: 'min', dryRun: true });

    expect(response.body).toMatchObject({ dryRun: true, changes: [{ to: 90 }] });
    expect(h.updateVariantPrice).not.toHaveBeenCalled();
  });

  it('rejects a negative maxChangePercent', async () => {
    const response = await request(app(harness()))
      .post('/api/pricing/update').set('X-Api-Key', API_KEY)
      .send({ strategy: 'min', maxChangePercent: -1 });
    expect(response.status).toBe(400);
  });
});

describe('POST /api/pricing/compare', () => {
  it('answers 503 when no competitor source is configured', async () => {
    const response = await request(app(harness())).post('/api/pricing/compare').set('X-Api-Key', API_KEY).send({});
    expect(response.status).toBe(503);
    expect(response.body.error).toMatch(/No competitor price sources/);
  });

  it('collects prices when a source is configured', async () => {
    const h = harness([{ name: 'fake', getCompetitorPrices: async () => [11, 12] }]);
    const response = await request(app(h)).post('/api/pricing/compare').set('X-Api-Key', API_KEY).send({});

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ sources: ['fake'], productsExamined: 1, pricesCollected: 2 });
  });
});

describe('POST /api/pricing/sync', () => {
  it('pulls the catalogue from Shopify into the repository', async () => {
    const h = harness([], []);
    const response = await request(app(h)).post('/api/pricing/sync').set('X-Api-Key', API_KEY).send({});

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ fetched: 1, stored: 1 });
    expect(await h.repo.getByShopifyId('1001')).toMatchObject({ variantId: 5001, currentPrice: 100 });
  });
});

describe('POST /webhooks/shopify', () => {
  const body = JSON.stringify({
    id: 2002,
    title: 'New Widget',
    variants: [{ id: 6002, title: 'Default', price: '30.00' }],
  });
  const sign = (payload: string, secret = WEBHOOK_SECRET) =>
    createHmac('sha256', secret).update(Buffer.from(payload, 'utf8')).digest('base64');

  it('rejects an unsigned request', async () => {
    const response = await request(app(harness()))
      .post('/webhooks/shopify')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Topic', 'products/create')
      .send(body);

    expect(response.status).toBe(401);
  });

  it('rejects a request signed with the wrong secret', async () => {
    const response = await request(app(harness()))
      .post('/webhooks/shopify')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Topic', 'products/create')
      .set('X-Shopify-Hmac-Sha256', sign(body, 'wrong'))
      .send(body);

    expect(response.status).toBe(401);
  });

  it('accepts a correctly signed products/create and stores the product with competitor prices', async () => {
    const h = harness([{ name: 'fake', getCompetitorPrices: async () => [28, 33] }], []);
    const response = await request(app(h))
      .post('/webhooks/shopify')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Topic', 'products/create')
      .set('X-Shopify-Hmac-Sha256', sign(body))
      .send(body);

    // Acknowledged before the work runs: Shopify allows five seconds.
    expect(response.status).toBe(202);

    await Promise.all(h.processed);
    expect(await h.repo.getByShopifyId('2002')).toMatchObject({
      title: 'New Widget',
      variantId: 6002,
      competitorPrices: [28, 33],
    });
  });

  it('acknowledges a topic it does not handle, so Shopify keeps the subscription', async () => {
    const otherBody = JSON.stringify({ id: 1 });
    const response = await request(app(harness()))
      .post('/webhooks/shopify')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Topic', 'orders/create')
      .set('X-Shopify-Hmac-Sha256', sign(otherBody))
      .send(otherBody);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ignored', topic: 'orders/create' });
  });

  it('is not mounted at all when no webhook secret is configured', async () => {
    const response = await request(app(harness(), config({ webhookSecret: null }))).post('/webhooks/shopify');
    expect(response.status).toBe(404);
  });
});

describe('the shared secret on /api/pricing', () => {
  it('refuses a request with no key and touches nothing', async () => {
    const h = harness();
    const response = await request(app(h)).post('/api/pricing/update').send({ strategy: 'min' });

    expect(response.status).toBe(401);
    expect(h.updateVariantPrice).not.toHaveBeenCalled();
  });

  it('refuses a request with the wrong key', async () => {
    const h = harness();
    const response = await request(app(h))
      .post('/api/pricing/update')
      .set('X-Api-Key', 'not-the-key')
      .send({ strategy: 'min' });

    expect(response.status).toBe(401);
    expect(h.updateVariantPrice).not.toHaveBeenCalled();
  });

  it('refuses a key of the right length but the wrong bytes', async () => {
    const response = await request(app(harness()))
      .post('/api/pricing/sync')
      .set('X-Api-Key', 'x'.repeat(API_KEY.length))
      .send({});

    expect(response.status).toBe(401);
  });

  it('covers every pricing route, not only the one that writes', async () => {
    for (const route of ['/api/pricing/sync', '/api/pricing/compare', '/api/pricing/update']) {
      const response = await request(app(harness())).post(route).send({});
      expect([route, response.status]).toEqual([route, 401]);
    }
  });

  it('answers 503 naming the variable to set when no key is configured', async () => {
    const h = harness();
    const response = await request(app(h, config({}, null)))
      .post('/api/pricing/update')
      .set('X-Api-Key', API_KEY)
      .send({ strategy: 'min' });

    expect(response.status).toBe(503);
    expect(response.body.detail).toMatch(/PRICING_API_KEY/);
    expect(h.updateVariantPrice).not.toHaveBeenCalled();
  });

  it('leaves the webhook route alone: it authenticates its callers by HMAC', async () => {
    const body = JSON.stringify({ id: 3003, title: 'W', variants: [{ id: 7003, title: 'D', price: '10.00' }] });
    const response = await request(app(harness([], []), config({}, null)))
      .post('/webhooks/shopify')
      .set('Content-Type', 'application/json')
      .set('X-Shopify-Topic', 'orders/create')
      .set('X-Shopify-Hmac-Sha256', createHmac('sha256', WEBHOOK_SECRET).update(Buffer.from(body, 'utf8')).digest('base64'))
      .send(body);

    expect(response.status).toBe(200);
  });
});
