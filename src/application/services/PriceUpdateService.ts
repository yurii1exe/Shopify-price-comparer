import { IProductRepository } from '../../domain/repositories/IProductRepository';
import { ShopifyApi } from '../../infrastructure/shopify/ShopifyApi';
import { average, median, min, max } from '../../shared/utils/mathUtils';

type PricingStrategy = 'average' | 'min' | 'max' | 'median';

export class PriceUpdateService {
  constructor(
    private productRepo: IProductRepository,
    private shopifyApi: ShopifyApi
  ) {}

  async updatePrices(strategy: PricingStrategy) {
    const products = await this.productRepo.getAll();
    for (const product of products) {
      if (product.competitorPrices.length === 0) continue;

      let newPrice: number;

      switch (strategy) {
        case 'average':
          newPrice = average(product.competitorPrices);
          break;
        case 'min':
          newPrice = min(product.competitorPrices);
          break;
        case 'max':
          newPrice = max(product.competitorPrices);
          break;
        case 'median':
          newPrice = median(product.competitorPrices);
          break;
      }

      if (product.currentPrice !== newPrice) {
        await this.shopifyApi.updateProductPrice(product.shopifyId, newPrice);
        product.currentPrice = newPrice;
        product.lastPriceUpdate = new Date();
        await this.productRepo.createOrUpdate(product);
        await this.productRepo.markPriceChanged(product.shopifyId, true);
      }
    }
  }
}
