import { CatalogSyncService } from './application/services/CatalogSyncService';
import { PriceComparisonService } from './application/services/PriceComparisonService';
import { PriceUpdateService } from './application/services/PriceUpdateService';
import { EbayApiAdapter } from './infrastructure/external-apis/EbayApiAdapter';
import { IExternalApi } from './infrastructure/external-apis/ExternalApiInterface';
import { ProductRepository } from './infrastructure/repositories/ProductRepository';
import { ShopifyApi } from './infrastructure/shopify/ShopifyApi';
import { ProductCreatedHandler } from './infrastructure/shopify/Webhooks';
import { IProductRepository } from './domain/repositories/IProductRepository';
import { AppConfig } from './shared/config/config';

export interface Services {
  productRepo: IProductRepository;
  shopifyApi: ShopifyApi;
  sources: IExternalApi[];
  comparisonService: PriceComparisonService;
  priceUpdateService: PriceUpdateService;
  catalogSyncService: CatalogSyncService;
  productCreatedHandler: ProductCreatedHandler;
}

/**
 * The composition root. Everything below this file receives its collaborators
 * through a constructor and constructs none of them, which is what makes the
 * services testable without a Shopify token or a database.
 */
export function buildServices(config: AppConfig): Services {
  const productRepo = new ProductRepository();
  const shopifyApi = new ShopifyApi(
    config.shopify.storeName,
    config.shopify.accessToken,
    config.shopify.apiVersion
  );

  const sources: IExternalApi[] = [];
  if (config.ebay) {
    sources.push(
      new EbayApiAdapter({
        clientId: config.ebay.clientId,
        clientSecret: config.ebay.clientSecret,
        marketplaceId: config.ebay.marketplaceId,
        currency: config.ebay.currency,
      })
    );
  }

  const comparisonService = new PriceComparisonService(productRepo, sources);

  return {
    productRepo,
    shopifyApi,
    sources,
    comparisonService,
    priceUpdateService: new PriceUpdateService(productRepo, shopifyApi, {
      maxChangePercent: config.pricing.maxChangePercent,
    }),
    catalogSyncService: new CatalogSyncService(productRepo, shopifyApi),
    productCreatedHandler: new ProductCreatedHandler(comparisonService),
  };
}
