import { IProduct } from '../entities/Product';

export interface IProductRepository {
  getAll(): Promise<IProduct[]>;
  getByShopifyId(id: string): Promise<IProduct | null>;
  createOrUpdate(product: IProduct): Promise<IProduct>;
  markPriceChanged(id: string, changed: boolean): Promise<void>;
}
