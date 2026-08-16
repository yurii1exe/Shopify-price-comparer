import { Product } from '../entities/Product';

export interface IProductRepository {
  getAll(): Promise<Product[]>;
  getByShopifyId(id: string): Promise<Product | null>;
  createOrUpdate(product: Product): Promise<Product>;
  markPriceChanged(id: string, changed: boolean): Promise<void>;
}
