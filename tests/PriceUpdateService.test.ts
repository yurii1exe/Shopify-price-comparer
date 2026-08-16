import { PriceUpdateService } from '../src/application/services/PriceUpdateService';
import { ShopifyApi } from '../src/infrastructure/shopify/ShopifyApi';
import { InMemoryProductRepository, makeProduct } from './helpers/InMemoryProductRepository';

function fakeShopify(update = jest.fn().mockResolvedValue(undefined)): { api: ShopifyApi; update: jest.Mock } {
  return { api: { updateProductVariantPrice: update } as unknown as ShopifyApi, update };
}

describe('PriceUpdateService', () => {
  it('applies the requested rule and writes the new price to the variant', async () => {
    const repo = new InMemoryProductRepository([
      makeProduct({ currentPrice: 100, competitorPrices: [90, 95, 100] }),
    ]);
    const { api, update } = fakeShopify();
    const result = await new PriceUpdateService(repo, api, { maxChangePercent: 50 }).updatePrices('min');

    expect(update).toHaveBeenCalledWith(5001, '90.00');
    expect(result.changes).toEqual([
      { shopifyId: '1001', variantId: 5001, title: 'Widget', from: 100, to: 90 },
    ]);
  });

  it.each([
    ['average', '95.00'],
    ['min', '90.00'],
    ['max', '100.00'],
    ['median', '95.00'],
  ] as const)('%s produces %s', async (strategy, expected) => {
    const repo = new InMemoryProductRepository([
      makeProduct({ currentPrice: 120, competitorPrices: [90, 95, 100] }),
    ]);
    const { api, update } = fakeShopify();
    await new PriceUpdateService(repo, api, { maxChangePercent: 100 }).updatePrices(strategy);
    expect(update).toHaveBeenCalledWith(5001, expected);
  });

  it('sends the price as a two-decimal string, not a float', async () => {
    const repo = new InMemoryProductRepository([
      makeProduct({ currentPrice: 20, competitorPrices: [14.435, 14.435] }),
    ]);
    const { api, update } = fakeShopify();
    await new PriceUpdateService(repo, api, { maxChangePercent: 100 }).updatePrices('average');
    expect(update).toHaveBeenCalledWith(5001, '14.44');
  });

  it('skips a product with no competitor prices instead of pricing it at zero', async () => {
    const repo = new InMemoryProductRepository([makeProduct({ competitorPrices: [] })]);
    const { api, update } = fakeShopify();
    const result = await new PriceUpdateService(repo, api, { maxChangePercent: 50 }).updatePrices('average');

    expect(update).not.toHaveBeenCalled();
    expect(result.skipped[0].reason).toBe('no-competitor-prices');
  });

  it('skips a price that has not moved, so a run over an unchanged catalogue writes nothing', async () => {
    const repo = new InMemoryProductRepository([
      makeProduct({ currentPrice: 95, competitorPrices: [90, 95, 100] }),
    ]);
    const { api, update } = fakeShopify();
    const result = await new PriceUpdateService(repo, api, { maxChangePercent: 50 }).updatePrices('average');

    expect(update).not.toHaveBeenCalled();
    expect(result.skipped[0].reason).toBe('unchanged');
  });

  describe('the change limit', () => {
    it('refuses a move larger than maxChangePercent and reports what it would have been', async () => {
      const repo = new InMemoryProductRepository([
        makeProduct({ currentPrice: 100, competitorPrices: [10, 12, 11] }),
      ]);
      const { api, update } = fakeShopify();
      const result = await new PriceUpdateService(repo, api, { maxChangePercent: 20 }).updatePrices('average');

      expect(update).not.toHaveBeenCalled();
      expect(result.skipped[0]).toEqual({
        shopifyId: '1001',
        title: 'Widget',
        reason: 'exceeds-max-change',
        proposed: 11,
      });
    });

    it('allows a move exactly at the limit', async () => {
      const repo = new InMemoryProductRepository([
        makeProduct({ currentPrice: 100, competitorPrices: [80] }),
      ]);
      const { api, update } = fakeShopify();
      await new PriceUpdateService(repo, api, { maxChangePercent: 20 }).updatePrices('average');
      expect(update).toHaveBeenCalledWith(5001, '80.00');
    });

    it('applies in both directions', async () => {
      const repo = new InMemoryProductRepository([
        makeProduct({ currentPrice: 100, competitorPrices: [200] }),
      ]);
      const { api, update } = fakeShopify();
      const result = await new PriceUpdateService(repo, api, { maxChangePercent: 20 }).updatePrices('average');
      expect(update).not.toHaveBeenCalled();
      expect(result.skipped[0].reason).toBe('exceeds-max-change');
    });

    it('can be overridden per request', async () => {
      const repo = new InMemoryProductRepository([
        makeProduct({ currentPrice: 100, competitorPrices: [10] }),
      ]);
      const { api, update } = fakeShopify();
      await new PriceUpdateService(repo, api, { maxChangePercent: 20 }).updatePrices('average', {
        maxChangePercent: 95,
      });
      expect(update).toHaveBeenCalledWith(5001, '10.00');
    });
  });

  describe('dry run', () => {
    it('reports the changes without calling Shopify or touching the database', async () => {
      const repo = new InMemoryProductRepository([
        makeProduct({ currentPrice: 100, competitorPrices: [90] }),
      ]);
      const { api, update } = fakeShopify();
      const result = await new PriceUpdateService(repo, api, { maxChangePercent: 50 }).updatePrices('min', {
        dryRun: true,
      });

      expect(result.dryRun).toBe(true);
      expect(result.changes).toHaveLength(1);
      expect(update).not.toHaveBeenCalled();
      expect((await repo.getByShopifyId('1001'))!.currentPrice).toBe(100);
    });
  });

  describe('when Shopify rejects a write', () => {
    it('records the failure, leaves the stored price alone and carries on with the rest', async () => {
      const repo = new InMemoryProductRepository([
        makeProduct({ shopifyId: '1', variantId: 11, currentPrice: 100, competitorPrices: [90] }),
        makeProduct({ shopifyId: '2', variantId: 22, currentPrice: 100, competitorPrices: [95] }),
      ]);
      const update = jest
        .fn()
        .mockRejectedValueOnce(new Error('Failed to update price for variant 11: 422'))
        .mockResolvedValueOnce(undefined);
      const { api } = fakeShopify(update);

      const result = await new PriceUpdateService(repo, api, { maxChangePercent: 50 }).updatePrices('min');

      expect(result.failures).toEqual([{ shopifyId: '1', error: expect.stringContaining('variant 11') }]);
      expect(result.changes.map((c) => c.shopifyId)).toEqual(['2']);
      // The store never took the price, so the local copy must not claim it did.
      expect((await repo.getByShopifyId('1'))!.currentPrice).toBe(100);
      expect((await repo.getByShopifyId('2'))!.currentPrice).toBe(95);
    });
  });

  it('marks a changed product for review', async () => {
    const repo = new InMemoryProductRepository([
      makeProduct({ currentPrice: 100, competitorPrices: [90] }),
    ]);
    const { api } = fakeShopify();
    await new PriceUpdateService(repo, api, { maxChangePercent: 50 }).updatePrices('min');

    const stored = (await repo.getByShopifyId('1001'))!;
    expect(stored.priceChanged).toBe(true);
    expect(stored.lastPriceUpdate).toBeInstanceOf(Date);
  });
});
