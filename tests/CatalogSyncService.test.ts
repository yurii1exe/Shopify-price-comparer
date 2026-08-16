import { CatalogSyncService } from '../src/application/services/CatalogSyncService';
import { ShopifyApi } from '../src/infrastructure/shopify/ShopifyApi';
import { InMemoryProductRepository, makeProduct } from './helpers/InMemoryProductRepository';

const shopifyProducts = [
  { id: 1001, title: 'Widget', variants: [{ id: 5001, title: 'Default', price: '100.00' }] },
  { id: 1002, title: 'Gadget', variants: [{ id: 5002, title: 'Default', price: '55.50' }] },
];

function fakeShopify(products: unknown[]): ShopifyApi {
  return { getAllProducts: async () => products } as unknown as ShopifyApi;
}

describe('CatalogSyncService', () => {
  it('stores every product Shopify returns', async () => {
    const repo = new InMemoryProductRepository();
    const result = await new CatalogSyncService(repo, fakeShopify(shopifyProducts)).sync();

    expect(result).toMatchObject({ fetched: 2, stored: 2, rejected: [] });
    expect((await repo.getAll()).map((p) => p.title)).toEqual(['Widget', 'Gadget']);
  });

  it('takes the store price as authoritative but keeps competitor prices already collected', async () => {
    const repo = new InMemoryProductRepository([
      makeProduct({ shopifyId: '1001', currentPrice: 80, competitorPrices: [90, 95], priceChanged: true }),
    ]);

    await new CatalogSyncService(repo, fakeShopify(shopifyProducts)).sync();

    const stored = (await repo.getByShopifyId('1001'))!;
    expect(stored.currentPrice).toBe(100);
    expect(stored.competitorPrices).toEqual([90, 95]);
    expect(stored.priceChanged).toBe(true);
  });

  it('rejects an unmappable product by name and stores the rest', async () => {
    const repo = new InMemoryProductRepository();
    const result = await new CatalogSyncService(
      repo,
      fakeShopify([...shopifyProducts, { id: 1003, title: 'Broken', variants: [] }])
    ).sync();

    expect(result.stored).toBe(2);
    expect(result.rejected).toEqual([{ shopifyId: '1003', error: expect.stringContaining('no variants') }]);
  });
});
