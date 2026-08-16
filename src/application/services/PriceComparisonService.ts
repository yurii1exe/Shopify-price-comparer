import { Product } from '../../domain/entities/Product';
import { IProductRepository } from '../../domain/repositories/IProductRepository';
import { IExternalApi } from '../../infrastructure/external-apis/ExternalApiInterface';

export interface ComparisonResult {
  productsExamined: number;
  productsWithPrices: number;
  pricesCollected: number;
  sourceFailures: { source: string; product: string; error: string }[];
}

export class PriceComparisonService {
  constructor(
    private productRepo: IProductRepository,
    private externalApis: IExternalApi[]
  ) {}

  async compareAllProducts(): Promise<ComparisonResult> {
    const products = await this.productRepo.getAll();
    const result: ComparisonResult = {
      productsExamined: products.length,
      productsWithPrices: 0,
      pricesCollected: 0,
      sourceFailures: [],
    };

    for (const product of products) {
      const prices = await this.collect(product, result);
      product.competitorPrices = prices;
      await this.productRepo.createOrUpdate(product);
      if (prices.length > 0) result.productsWithPrices++;
      result.pricesCollected += prices.length;
    }

    return result;
  }

  /** Collect for a single product — the path the products/create webhook takes. */
  async compareProduct(product: Product): Promise<Product> {
    const result: ComparisonResult = {
      productsExamined: 1,
      productsWithPrices: 0,
      pricesCollected: 0,
      sourceFailures: [],
    };
    product.competitorPrices = await this.collect(product, result);
    return this.productRepo.createOrUpdate(product);
  }

  /**
   * One marketplace being down is not a reason to abandon the run. A failed
   * source is recorded and the remaining sources still contribute, because the
   * alternative — a thrown error halfway through the catalogue — leaves half
   * the products holding prices from the previous run and half from this one,
   * with nothing recording which is which.
   */
  private async collect(product: Product, result: ComparisonResult): Promise<number[]> {
    const prices: number[] = [];
    for (const api of this.externalApis) {
      try {
        prices.push(...(await api.getCompetitorPrices(product.title)));
      } catch (error) {
        result.sourceFailures.push({
          source: api.name,
          product: product.shopifyId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return prices;
  }
}
