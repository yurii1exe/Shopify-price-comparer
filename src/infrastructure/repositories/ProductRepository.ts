import { Product } from '../../domain/entities/Product';
import { IProductRepository } from '../../domain/repositories/IProductRepository';
import { ProductModel, toDomain } from '../db/ProductModel';

export class ProductRepository implements IProductRepository {
  async getAll(): Promise<Product[]> {
    const docs = await ProductModel.find();
    return docs.map(toDomain);
  }

  async getByShopifyId(id: string): Promise<Product | null> {
    const doc = await ProductModel.findOne({ shopifyId: id });
    return doc ? toDomain(doc) : null;
  }

  /**
   * Upsert keyed on the Shopify product ID, so a re-run reconciles rather than
   * duplicates — the catalogue is the source of truth, this collection is a
   * projection of it.
   */
  async createOrUpdate(product: Product): Promise<Product> {
    const doc = await ProductModel.findOneAndUpdate(
      { shopifyId: product.shopifyId },
      { $set: product },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return toDomain(doc);
  }

  async markPriceChanged(id: string, changed: boolean): Promise<void> {
    await ProductModel.updateOne({ shopifyId: id }, { $set: { priceChanged: changed } });
  }
}
