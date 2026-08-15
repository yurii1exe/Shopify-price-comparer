import { IProductRepository } from '../../domain/repositories/IProductRepository';
import { ShopifyApi } from '../../infrastructure/shopify/ShopifyApi';

// Simulation of dynamic pricing based on supply and demand
export class DynamicPricingService {
  constructor(
    private productRepo: IProductRepository,
    private shopifyApi: ShopifyApi
  ) {}

  async applyDynamicPricing() {
    const products = await this.productRepo.getAll();
    for (const product of products) {
      // Placeholder. A real signal would be derived from sales and view data.
      const demandFactor = Math.random();
      let adjustedPrice = product.currentPrice;
      if (demandFactor > 0.7) {
        // High demand - raise the price by 5%
        adjustedPrice = product.currentPrice * 1.05;
      } else if (demandFactor < 0.3) {
        // Low demand - lower the price by 5%
        adjustedPrice = product.currentPrice * 0.95;
      }

      if (adjustedPrice !== product.currentPrice) {
        await this.shopifyApi.updateProductPrice(
          product.shopifyId,
          adjustedPrice
        );
        product.currentPrice = adjustedPrice;
        product.lastPriceUpdate = new Date();
        await this.productRepo.createOrUpdate(product);
        await this.productRepo.markPriceChanged(product.shopifyId, true);
      }
    }
  }
}
