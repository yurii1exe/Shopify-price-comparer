# Shopify Price Comparer

A dynamic pricing service for Shopify: pull competitor prices for each product,
apply a pricing rule, and push the new price back to the store.

> **Status: partial implementation. It does not compile.**
> The domain model, the layered structure and the Shopify Admin API client are
> written. The competitor-price adapter returns fixed values, the webhook handler
> is an empty file, and the composition root is unwired — the pieces do not run
> end to end. `tsc --noEmit` currently reports 14 errors, listed under
> [what is not finished](#what-is-not-finished).
>
> The full intended design is in [`src/README.md`](src/README.md). That document
> describes the design, not the state. This file describes what is actually in
> the repository.

## The problem

A store with a few thousand SKUs cannot price them by hand. Competitor prices
move daily across several marketplaces, and each store owner wants a different
rule — match the lowest, sit on the median, hold a margin above the average. The
repricing logic and the marketplace APIs change on completely different
schedules, so the interesting design question is how to keep them apart.

## What I built

**A layered structure that isolates every external dependency behind an
interface.**

```
domain/          Product entity, IProductRepository
application/     PriceComparisonService, PriceUpdateService, DynamicPricingService
infrastructure/  ShopifyApi, external-api adapters, MongoDB repository
api/             REST controller + route
```

- **`IExternalApi`** is a one-method interface — `getCompetitorPrices(title):
  Promise<number[]>`. Every marketplace is one implementation of it, and
  `PriceComparisonService` takes an array of them, so adding a source is adding a
  file. `EbayApiAdapter` is the only implementation present, and it returns a
  fixed array rather than calling eBay.
- **Pricing rules are a strategy**, selected per request from the POST body:
  `average`, `min`, `max`, `median` over the collected competitor prices. The
  maths lives in `shared/utils/mathUtils.ts` and is the only part of the system
  with no dependencies at all.
- **`ShopifyApi`** wraps the Shopify Admin REST API: versioned base URL,
  `X-Shopify-Access-Token` authentication, `getAllProducts` at the 250-item page
  ceiling, `searchProductsByTitle`, and `updateProductVariantPrice`. Errors are
  caught and rethrown with the variant ID attached, because "Shopify returned
  422" without a variant is not an actionable log line.
- **The Mongoose schema** holds each product's current price, the competitor
  prices last collected, the timestamp of the last change, and a `priceChanged`
  flag — the intent being that an admin reviews only what moved rather than the
  whole catalogue. The flag is written; no endpoint reads it back yet.
- **Writes are upserts** keyed on the Shopify product ID, so a re-run reconciles
  rather than duplicates.

**Two files in this repository are finished: `ShopifyApi.ts` and
`mathUtils.ts`.** Nothing else here is at that standard, and the rest of this
README should be read with that in mind. `ShopifyApi.ts` is the one I would point
at — it is a correct, defensively written Admin REST client. The remaining files
are a skeleton in various states of completion.

## What is not finished

Stated plainly so nobody clones it expecting a working service.

**It does not compile.** `npx tsc --noEmit` reports 14 errors from these causes:

- `index.ts` imports three modules that were never written —
  `infrastructure/db/mongo`, `shared/config/config`, and
  `interfaces/routes/PricingRoutes` (the routes are at `api/routes/`; there is no
  `interfaces/` directory).
- All three application services import
  `domain/repositories/IProductRepository`. The directory is
  `domain/iRepositories/`. `ProductRepository.ts` imports the correct path, so
  both spellings coexist in the repo.
- `PricingController.ts` calls `new ShopifyApi()` with no arguments; the
  constructor requires `storeName` and `accessToken`.
- `PriceUpdateService` and `DynamicPricingService` call
  `shopifyApi.updateProductPrice(...)`, which `ShopifyApi` does not define — the
  method is `updateProductVariantPrice`, and it takes a numeric variant ID where
  a string `shopifyId` is being passed.
- `ShopifyApi.ts` imports `axios`, which is not in `package.json`.
- `tsconfig.json` does not set `esModuleInterop`, which the default `express` and
  `body-parser` imports require.
- `ShopifyProductMapper.toDomain` assigns `null` to a `Date` field and returns an
  object literal typed as a Mongoose `Document`.

**Stubs, not implementations:**

- `EbayApiAdapter` returns `[100, 105, 99]`. No marketplace API is called
  anywhere in this repository.
- `infrastructure/shopify/Webhooks.ts` is a zero-byte file. The products/create
  trigger is designed in `src/README.md` but not implemented.
- `DynamicPricingService` derives its demand signal from `Math.random()` as a
  placeholder. As written it would move real prices on a coin flip.
- `PriceComparisonService` and `EbayApiAdapter` are never instantiated — the only
  wired path is `POST /api/pricing/update`.

**Also absent:** any tests, an OAuth flow (the Shopify client takes a token
directly), a build or start script, and a `docker-compose` for the MongoDB
dependency.

## Stack

TypeScript · Node.js · Express · Mongoose / MongoDB · Shopify Admin REST API

## Licence

MIT — see [LICENSE](LICENSE).
