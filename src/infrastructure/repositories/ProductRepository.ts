import { Product, IProduct } from '../../domain/entities/Product';
import { IProductRepository } from '../../domain/iRepositories/IProductRepository';

export class ProductRepository implements IProductRepository {
  async getAll(): Promise<IProduct[]> {
    return Product.find();
  }

  async getByShopifyId(id: string): Promise<IProduct | null> {
    return Product.findOne({ shopifyId: id });
  }

  async createOrUpdate(product: IProduct): Promise<IProduct> {
    return Product.findOneAndUpdate({ shopifyId: product.shopifyId }, product, {
      upsert: true,
      new: true,
    });
  }

  async markPriceChanged(id: string, changed: boolean): Promise<void> {
    await Product.updateOne({ shopifyId: id }, { priceChanged: changed });
  }
}
