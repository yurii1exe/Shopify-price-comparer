import { PriceComparisonService } from '../src/application/services/PriceComparisonService';
import { IExternalApi } from '../src/infrastructure/external-apis/ExternalApiInterface';
import { InMemoryProductRepository, makeProduct } from './helpers/InMemoryProductRepository';

const source = (name: string, prices: number[]): IExternalApi => ({
  name,
  getCompetitorPrices: async () => prices,
});

const failing = (name: string, message: string): IExternalApi => ({
  name,
  getCompetitorPrices: async () => {
    throw new Error(message);
  },
});

describe('PriceComparisonService', () => {
  it('collects from every source and stores the combined result', async () => {
    const repo = new InMemoryProductRepository([makeProduct()]);
    const service = new PriceComparisonService(repo, [source('a', [10, 11]), source('b', [12])]);

    const result = await service.compareAllProducts();

    expect((await repo.getByShopifyId('1001'))!.competitorPrices).toEqual([10, 11, 12]);
    expect(result).toMatchObject({ productsExamined: 1, productsWithPrices: 1, pricesCollected: 3 });
  });

  it('replaces the previous run rather than accumulating prices across runs', async () => {
    const repo = new InMemoryProductRepository([makeProduct({ competitorPrices: [99, 98] })]);
    await new PriceComparisonService(repo, [source('a', [10])]).compareAllProducts();

    expect((await repo.getByShopifyId('1001'))!.competitorPrices).toEqual([10]);
  });

  it('keeps the working sources when one marketplace fails', async () => {
    const repo = new InMemoryProductRepository([makeProduct()]);
    const service = new PriceComparisonService(repo, [
      failing('ebay', 'eBay token endpoint returned no access_token'),
      source('other', [15]),
    ]);

    const result = await service.compareAllProducts();

    expect((await repo.getByShopifyId('1001'))!.competitorPrices).toEqual([15]);
    expect(result.sourceFailures).toEqual([
      { source: 'ebay', product: '1001', error: 'eBay token endpoint returned no access_token' },
    ]);
  });

  it('records an empty result rather than failing when no source has a match', async () => {
    const repo = new InMemoryProductRepository([makeProduct()]);
    const result = await new PriceComparisonService(repo, [source('a', [])]).compareAllProducts();

    expect(result.productsWithPrices).toBe(0);
    expect((await repo.getByShopifyId('1001'))!.competitorPrices).toEqual([]);
  });

  it('compares a single product for the webhook path', async () => {
    const repo = new InMemoryProductRepository();
    const stored = await new PriceComparisonService(repo, [source('a', [7, 8])]).compareProduct(
      makeProduct({ shopifyId: '2002' })
    );

    expect(stored.competitorPrices).toEqual([7, 8]);
    expect(await repo.getByShopifyId('2002')).not.toBeNull();
  });
});
