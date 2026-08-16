import { createHmac } from 'crypto';
import { verifyShopifyWebhook, ProductCreatedHandler } from '../src/infrastructure/shopify/Webhooks';
import { PriceComparisonService } from '../src/application/services/PriceComparisonService';
import { InMemoryProductRepository } from './helpers/InMemoryProductRepository';

const SECRET = 'shpss_test_secret';

function sign(body: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(Buffer.from(body, 'utf8')).digest('base64');
}

describe('verifyShopifyWebhook', () => {
  const body = JSON.stringify({ id: 1, title: 'Widget' });

  it('accepts a body signed with the shared secret', () => {
    expect(verifyShopifyWebhook(Buffer.from(body), sign(body), SECRET)).toBe(true);
  });

  it('rejects a body altered after signing', () => {
    const signature = sign(body);
    expect(verifyShopifyWebhook(Buffer.from(body.replace('Widget', 'Widgit')), signature, SECRET)).toBe(false);
  });

  it('rejects a signature made with a different secret', () => {
    expect(verifyShopifyWebhook(Buffer.from(body), sign(body, 'other_secret'), SECRET)).toBe(false);
  });

  it('rejects a missing header without throwing', () => {
    expect(verifyShopifyWebhook(Buffer.from(body), undefined, SECRET)).toBe(false);
  });

  it('rejects a truncated signature rather than throwing on the length mismatch', () => {
    // timingSafeEqual throws unless the buffers are the same length.
    expect(() => verifyShopifyWebhook(Buffer.from(body), sign(body).slice(0, 10), SECRET)).not.toThrow();
    expect(verifyShopifyWebhook(Buffer.from(body), sign(body).slice(0, 10), SECRET)).toBe(false);
  });

  it('rejects everything when no secret is configured', () => {
    expect(verifyShopifyWebhook(Buffer.from(body), sign(body), '')).toBe(false);
  });

  it('is sensitive to whitespace, which is why the raw bytes are hashed and not a reparsed body', () => {
    const reserialised = JSON.stringify(JSON.parse(body), null, 2);
    expect(verifyShopifyWebhook(Buffer.from(reserialised), sign(body), SECRET)).toBe(false);
  });
});

describe('ProductCreatedHandler', () => {
  it('stores the new product with the competitor prices collected for it', async () => {
    const repo = new InMemoryProductRepository();
    const comparison = new PriceComparisonService(repo, [
      { name: 'fake', getCompetitorPrices: async () => [18, 22] },
    ]);

    const stored = await new ProductCreatedHandler(comparison).handle({
      id: 55,
      title: 'New Widget',
      variants: [{ id: 66, title: 'Default', price: '20.00' }],
    });

    expect(stored.competitorPrices).toEqual([18, 22]);
    expect(await repo.getByShopifyId('55')).toMatchObject({ title: 'New Widget', variantId: 66 });
  });
});
