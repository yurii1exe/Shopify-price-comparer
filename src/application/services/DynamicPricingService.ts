import { IProductRepository } from '../../domain/repositories/IProductRepository';
import { ShopifyApi } from '../../infrastructure/shopify/ShopifyApi';

// Імітація динамічного ціноутворення на основі попиту та пропозиції
export class DynamicPricingService {
  constructor(
    private productRepo: IProductRepository,
    private shopifyApi: ShopifyApi
  ) {}

  async applyDynamicPricing() {
    const products = await this.productRepo.getAll();
    for (const product of products) {
      const demandFactor = Math.random(); // Логіка реальна може базуватися на даних продажів, переглядів
      let adjustedPrice = product.currentPrice;
      if (demandFactor > 0.7) {
        // Високий попит - підняти ціну на 5%
        adjustedPrice = product.currentPrice * 1.05;
      } else if (demandFactor < 0.3) {
        // Низький попит - знизити ціну на 5%
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
