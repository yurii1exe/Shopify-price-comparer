import { IProduct } from '../../domain/entities/Product';

interface ShopifyProduct {
  id: number;
  title: string;
  variants: { id: number; title: string; price: string }[];
}

export class ShopifyProductMapper {
  static toDomain(shopifyProduct: ShopifyProduct): IProduct {
    // Take the first variant as the primary one (simplified example)
    const mainVariant = shopifyProduct.variants[0];
    const currentPrice = parseFloat(mainVariant.price);

    return {
      shopifyId: shopifyProduct.id.toString(),
      title: shopifyProduct.title,
      currentPrice: currentPrice,
      competitorPrices: [],
      lastPriceUpdate: null,
      priceChanged: false,
      _id: undefined as any, // With Mongoose, _id is assigned on save
    };
  }

  static toDomainMultiple(shopifyProducts: ShopifyProduct[]): IProduct[] {
    return shopifyProducts.map((p) => this.toDomain(p));
  }
}
