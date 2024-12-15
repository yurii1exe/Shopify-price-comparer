import { IExternalApi } from '../../infrastructure/external-apis/ExternalApiInterface';
import { IProductRepository } from '../../domain/repositories/IProductRepository';

export class PriceComparisonService {
  constructor(
    private productRepo: IProductRepository,
    private externalApis: IExternalApi[]
  ) {}

  async compareAllProducts() {
    const products = await this.productRepo.getAll();
    for (const product of products) {
      const competitorPrices: number[] = [];
      for (const api of this.externalApis) {
        const prices = await api.getCompetitorPrices(product.title);
        competitorPrices.push(...prices);
      }
      product.competitorPrices = competitorPrices;
      await this.productRepo.createOrUpdate(product);
    }
  }
}
