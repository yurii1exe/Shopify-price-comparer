# Layer rules

The top-level [README](../README.md) covers what the service does. This file is about how the
source is arranged and which direction dependencies are allowed to point.

```
domain/          entities/Product.ts, repositories/IProductRepository.ts
application/     PriceComparisonService, PriceUpdateService, CatalogSyncService
infrastructure/  db/, shopify/, external-apis/, repositories/
api/             controllers/, routes/
shared/          config/, utils/
container.ts     composition root
app.ts           Express wiring
index.ts         entry point
```

**Dependencies point inward.** `domain` imports nothing outside itself. `application` imports
`domain` and the two interfaces it collaborates through. `infrastructure` and `api` import
everything they need. Nothing in `domain` or `application` imports Mongoose, Express or axios.

That rule is what makes the services testable. `Product` is a plain interface, not a Mongoose
`Document`, so a fake repository is a `Map` behind the interface —
`tests/helpers/InMemoryProductRepository.ts` — and every application-layer test runs against
it with no database process anywhere.

## The pieces

### `domain`

- **`Product`** — `shopifyId` (string, because Shopify IDs exceed what a JS number holds
  exactly), `variantId` (number: prices live on variants, and a repricer that only knows the
  product ID has nothing it can PUT to), `title`, `currentPrice`, `competitorPrices`,
  `lastPriceUpdate`, `priceChanged`.
- **`IProductRepository`** — `getAll`, `getByShopifyId`, `createOrUpdate`, `markPriceChanged`,
  all in terms of `Product`.

### `application`

- **`CatalogSyncService`** — pulls the catalogue from Shopify into the local collection. The
  local copy is a projection, not a second source of truth: the store's price always wins, and
  competitor prices already collected are carried across, so a sync between a comparison and
  an update does not discard the prices the update was about to act on.
- **`PriceComparisonService`** — collects from every configured `IExternalApi` and stores the
  combined array, replacing the previous run rather than accumulating across runs. One source
  failing is recorded, not thrown.
- **`PriceUpdateService`** — applies one of `average`, `min`, `max`, `median`, enforces the
  maximum-change limit, and writes Shopify first and the database second.

### `infrastructure`

- **`db/`** — the Mongoose schema and `connectDB`. `toDomain` strips the document down to the
  domain shape; nothing above this directory sees a `Document`. `bufferCommands` is off, so a
  query issued before the connection is up fails with the connection error rather than a
  timeout that names no host.
- **`shopify/ShopifyApi.ts`** — the Admin REST client. Takes an optional axios instance so
  tests inject one.
- **`shopify/ShopifyProductMapper.ts`** — Shopify product to `Product`. Rejects a product with
  no variants and a price that will not parse, rather than letting a `NaN` reach an average.
- **`shopify/Webhooks.ts`** — `verifyShopifyWebhook` (raw bytes, constant-time comparison) and
  the `products/create` handler.
- **`external-apis/`** — `IExternalApi` and `EbayApiAdapter`.
- **`repositories/ProductRepository.ts`** — `IProductRepository` over Mongoose, upserting on
  `shopifyId`.

### `api`

`PricingController` is a class holding the services it uses; `createPricingRoutes` builds the
router from them. Async handlers are wrapped so a rejected promise reaches the error
middleware — Express 4 does not catch one on its own, and an unwrapped handler hangs the
request until the client times out.

### `container.ts`

The composition root. `buildServices(config)` is the only place a real `ShopifyApi`,
`ProductRepository` or `EbayApiAdapter` is constructed. Everything else takes its
collaborators through a constructor, which is why the same services can be assembled over
fakes in `tests/api.test.ts`.

The eBay adapter is registered only when both halves of the credential are present. An
unconfigured source is a source that is switched off, not an error: the service starts, and
the endpoint that would need it says so.

## Data flow

```
POST /api/pricing/sync
  PricingController.sync
    CatalogSyncService.sync
      ShopifyApi.getAllProducts        (follows the Link cursor)
      ShopifyProductMapper.toDomain
      IProductRepository.createOrUpdate

POST /api/pricing/compare
  PricingController.compare
    PriceComparisonService.compareAllProducts
      IExternalApi.getCompetitorPrices  for each source, per product
      IProductRepository.createOrUpdate

POST /api/pricing/update
  PricingController.update
    PriceUpdateService.updatePrices
      mathUtils rule over competitorPrices
      change-limit check
      ShopifyApi.updateProductVariantPrice
      IProductRepository.createOrUpdate + markPriceChanged

POST /webhooks/shopify   (X-Shopify-Topic: products/create)
  verifyShopifyWebhook over the raw body
  202 returned
    ProductCreatedHandler.handle
      ShopifyProductMapper.toDomain
      PriceComparisonService.compareProduct
```

## Credentials

The Shopify Admin API access token, the webhook shared secret and the eBay application
credentials all come from the environment through `shared/config/config.ts`, which is the only
module that reads `process.env`. `loadConfig` takes the environment as an argument so it can
be tested without mutating the process. `.env` is gitignored; `.env.example` lists every
variable.

## Tests

`tests/` mirrors the source. Ten suites: the pricing rules and money rounding, the Shopify
client, the eBay adapter, the mapper, the webhook verification, the three application
services, configuration loading, and the HTTP surface through `supertest`. No test opens a
socket or a database connection — external collaborators are injected, which is the practical
payoff of the layer rules above.
