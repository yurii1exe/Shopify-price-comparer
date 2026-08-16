import { Product } from '../../src/domain/entities/Product';
import { IProductRepository } from '../../src/domain/repositories/IProductRepository';

export function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    shopifyId: '1001',
    variantId: 5001,
    title: 'Widget',
    currentPrice: 100,
    competitorPrices: [],
    lastPriceUpdate: null,
    priceChanged: false,
    ...overrides,
  };
}

export class InMemoryProductRepository implements IProductRepository {
  private store = new Map<string, Product>();

  constructor(products: Product[] = []) {
    for (const p of products) this.store.set(p.shopifyId, { ...p });
  }

  async getAll(): Promise<Product[]> {
    return [...this.store.values()].map((p) => ({ ...p }));
  }

  async getByShopifyId(id: string): Promise<Product | null> {
    const found = this.store.get(id);
    return found ? { ...found } : null;
  }

  async createOrUpdate(product: Product): Promise<Product> {
    this.store.set(product.shopifyId, { ...product });
    return { ...product };
  }

  async markPriceChanged(id: string, changed: boolean): Promise<void> {
    const found = this.store.get(id);
    if (found) found.priceChanged = changed;
  }
}
