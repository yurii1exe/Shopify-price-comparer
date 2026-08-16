import { Product } from '../../domain/entities/Product';
import { ShopifyProduct } from './ShopifyApi';

export class ShopifyProductMapper {
  /**
   * Map a Shopify product onto the domain shape.
   *
   * The first variant is taken as the one being repriced. A product with no
   * variants has no price to write, and a product whose price will not parse
   * would otherwise become a `NaN` that propagates into every average — both
   * are rejected here rather than downstream.
   */
  static toDomain(shopifyProduct: ShopifyProduct): Product {
    const mainVariant = shopifyProduct.variants?.[0];
    if (!mainVariant) {
      throw new Error(`Shopify product ${shopifyProduct.id} has no variants; nothing to price`);
    }

    const currentPrice = Number.parseFloat(mainVariant.price);
    if (!Number.isFinite(currentPrice)) {
      throw new Error(
        `Shopify product ${shopifyProduct.id} variant ${mainVariant.id} has unparseable price "${mainVariant.price}"`
      );
    }

    return {
      shopifyId: String(shopifyProduct.id),
      variantId: mainVariant.id,
      title: shopifyProduct.title,
      currentPrice,
      competitorPrices: [],
      lastPriceUpdate: null,
      priceChanged: false,
    };
  }

  static toDomainMultiple(shopifyProducts: ShopifyProduct[]): Product[] {
    return shopifyProducts.map((p) => this.toDomain(p));
  }
}
