import { IProductRepository } from '../../domain/repositories/IProductRepository';
import { ShopifyApi } from '../../infrastructure/shopify/ShopifyApi';
import { ShopifyProductMapper } from '../../infrastructure/shopify/ShopifyProductMapper';

export interface SyncResult {
  fetched: number;
  stored: number;
  rejected: { shopifyId: string; error: string }[];
}

/**
 * Pull the catalogue into the local collection.
 *
 * The local copy is a projection, not a second source of truth: the price on
 * the store always wins, so a sync overwrites `currentPrice` and leaves the
 * competitor prices already collected in place. Without that, a sync run
 * between a comparison and an update would silently discard the prices the
 * update was about to act on.
 */
export class CatalogSyncService {
  constructor(
    private productRepo: IProductRepository,
    private shopifyApi: ShopifyApi
  ) {}

  async sync(): Promise<SyncResult> {
    const shopifyProducts = await this.shopifyApi.getAllProducts();
    const result: SyncResult = { fetched: shopifyProducts.length, stored: 0, rejected: [] };

    for (const shopifyProduct of shopifyProducts) {
      try {
        const mapped = ShopifyProductMapper.toDomain(shopifyProduct);
        const existing = await this.productRepo.getByShopifyId(mapped.shopifyId);
        if (existing) {
          mapped.competitorPrices = existing.competitorPrices;
          mapped.lastPriceUpdate = existing.lastPriceUpdate;
          mapped.priceChanged = existing.priceChanged;
        }
        await this.productRepo.createOrUpdate(mapped);
        result.stored++;
      } catch (error) {
        result.rejected.push({
          shopifyId: String(shopifyProduct.id),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }
}
