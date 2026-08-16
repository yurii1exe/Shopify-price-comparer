# Shopify Price Comparer

**Competitor prices in, a pricing rule applied, a new price on the store.** A Shopify store's
catalogue is pulled into a local collection, competitor listings are collected for each
product from the eBay Browse API, one of four rules turns those into a number, and the number
is written back to the variant through the Shopify Admin API.

A store with a few thousand SKUs cannot be priced by hand. Competitor prices move daily, and
every store owner wants a different rule — match the lowest, sit on the median, hold above the
average. The repricing rule and the marketplace APIs change on completely different schedules,
so the whole service is arranged around keeping them apart: a marketplace is one file behind a
one-method interface, and a pricing rule is one function over an array of numbers.

![A terminal session: a dry run, webhook HMAC verification, and a failed Shopify write that leaves the stored price alone](docs/demo.gif)

The recording is the compiled service on `node dist/index.js` against a local stack — MongoDB in
Docker, a placeholder Shopify token, no eBay credentials. In order: `/health`; the seeded
catalogue in Mongo; a `median` dry run, where the change limit skips a competitor match 46% below
the shop price; a webhook rejected on a wrong HMAC and accepted on one computed with `openssl`,
and the product it stored; `/api/pricing/compare` answering `503` with the variables to set; and
a real update whose Shopify write answers `404` — the failure is reported with the variant ID,
and the stored price does not move. The eBay Browse API is not called, and no price reaches a
live store.

## The loop

```
POST /api/pricing/sync      Shopify catalogue ──► local collection
POST /api/pricing/compare   eBay Browse API   ──► competitor prices per product
POST /api/pricing/update    rule + guard rail ──► new price on the variant

POST /webhooks/shopify      products/create   ──► a new product gets prices immediately
```

Three steps rather than one endpoint that does everything, because they fail differently and
on different schedules. A sync is cheap and safe. A comparison is slow and depends on somebody
else's API being up. An update is the only one that changes anything a customer can see, and
it is the one you want to be able to run on its own, look at, and run again.

## The brake

The dangerous property of a repricer is that it takes an instruction from a feed it does not
control and acts on it with no human in the loop. One bad match — a competitor listing for an
accessory rather than the product — and the rule computes a price a tenth of cost, and the
service writes it.

So `PriceUpdateService` will not make an arbitrarily large move. Every product whose computed
price is further than `MAX_PRICE_CHANGE_PERCENT` from its current price is skipped and
reported with the price it would have set, rather than being written and discovered later:

```console
$ curl -s -XPOST localhost:3000/api/pricing/update \
    -H 'Content-Type: application/json' -d '{"strategy":"median","dryRun":true}'
{
  "strategy": "median",
  "dryRun": true,
  "productsExamined": 3,
  "changes": [
    { "shopifyId": "9001", "variantId": 77001, "title": "Verification Widget",
      "from": 49, "to": 45.63 }
  ],
  "skipped": [
    { "shopifyId": "9002", "title": "Runaway Widget",
      "reason": "exceeds-max-change", "proposed": 10.25 },
    { "shopifyId": "9003", "title": "Unmatched Widget",
      "reason": "no-competitor-prices" }
  ],
  "failures": []
}
```

`dryRun` computes everything and writes nothing — no Shopify call, no database write — so the
request that would reprice the catalogue can first be used to read what it is about to do.
`maxChangePercent` can be sent per request to widen or tighten the brake for one run.

Two smaller decisions in the same service:

- **Shopify is written before the database.** If the local copy were written first and the
  Shopify call then failed, the collection would record a price the store never took, and the
  next run would compute against a fiction. A failed write leaves the stored price alone and
  lands in `failures` with the variant ID.
- **A product with no competitor prices is skipped, not priced at zero.** Every rule in
  `shared/utils/mathUtils.ts` also returns `0` for an empty array rather than `NaN` or the
  `Infinity` that `Math.min()` produces with no arguments — that is the second line of
  defence, and the skip is the first.

## Competitor prices

`IExternalApi` is one method — `getCompetitorPrices(title): Promise<number[]>` — so a
marketplace is one file, and `PriceComparisonService` takes an array of them. `EbayApiAdapter`
implements it against the eBay Browse API, authenticating with the OAuth client-credentials
grant and caching the application token until a minute before it expires. eBay issues these
for two hours and expects them to be reused; fetching one per product turns every search into
two round trips against an endpoint that is not meant to carry that traffic.

Two decisions there are what make the numbers comparable to a shop price:

- **Fixed-price listings only** (`buyingOptions:{FIXED_PRICE}`). An auction's current bid is
  what somebody has offered so far, not what the item sold for, and averaging it in drags
  every rule downward.
- **Landed cost, not item cost.** A buyer compares the total, so the reported shipping cost is
  added to each listing. Free-shipping listings report `0.00` and are unaffected.

Listings quoted in another currency are dropped rather than converted — guessing an FX rate
would put a wrong number into a price.

A source that fails does not abandon the run. The failure is recorded against the source and
the product, and the remaining sources still contribute; a thrown error halfway through the
catalogue would otherwise leave half the products holding prices from this run and half from
the last, with nothing recording which is which.

## Webhooks

`POST /webhooks/shopify` verifies `X-Shopify-Hmac-Sha256` and dispatches on
`X-Shopify-Topic`. Three things have to be right or the verification silently accepts
anything:

1. **The digest is over the raw bytes.** Once `express.json()` has parsed and re-serialised
   the body, key order and whitespace are no longer what Shopify signed. So the webhook router
   mounts `express.raw()` and is registered before the JSON parser — the rest of the app still
   gets parsed bodies.
2. **The comparison is constant-time.** `===` on a digest leaks how many leading bytes were
   right, which is enough to forge one byte at a time.
3. **Lengths are checked first.** `crypto.timingSafeEqual` throws on a length mismatch, so a
   truncated header would become a 500 rather than a rejection.

A verified `products/create` is answered `202` *before* the work starts. Shopify allows a
webhook endpoint five seconds, and collecting competitor prices involves another marketplace's
API, which has no business on that clock. A topic the service does not act on is acknowledged
`200` rather than rejected — Shopify retries a non-2xx for two days and then removes the
subscription, which would break the topics it does handle.

Without `SHOPIFY_WEBHOOK_SECRET` the route is not mounted at all, rather than mounted and
accepting unverified requests.

## The Shopify client

`ShopifyApi` wraps the Admin REST API: versioned base URL, `X-Shopify-Access-Token`
authentication, and three calls — `getAllProducts`, `searchProductsByTitle`,
`updateProductVariantPrice`.

**Pagination is cursor-based and the cursor exists only in a header.** Shopify returns
`Link: <...page_info=xyz>; rel="next"` and will not accept a cursor you construct yourself, so
`getAllProducts` reads that header and follows it. `parseNextPageInfo` is exported and tested
on its own, because parsing the header is the part that goes wrong, not the HTTP. Two details
that bite: a response may carry a `rel="previous"` link and no `rel="next"`, and `page_info`
is mutually exclusive with every other filter — send it alongside `title` and Shopify answers
400.

Everything thrown is a `ShopifyApiError` carrying the status, the variant ID where the call
was about one variant, and the reason flattened out of Shopify's body:

```
Failed to update price for variant 5001: 422 — price: is not a number
```

Shopify puts the actual complaint in `{"errors": {"price": ["is not a number"]}}`, and a log
line that says only "Shopify returned 422" is not actionable.

Prices are sent as decimal strings, because Shopify stores money as a string and a float here
rounds where you cannot see it.

## Running it

```bash
docker compose up -d          # MongoDB on 27017
cp .env.example .env          # fill in SHOPIFY_STORE_NAME and SHOPIFY_ACCESS_TOKEN
npm install
npm run build
npm start                     # http://localhost:3000
```

`npm run dev` runs it from TypeScript through `ts-node` without building. If 27017 is already
taken on the host, `MONGO_PORT=27018 docker compose up -d` moves it — `MONGODB_URI` has to
agree.

Missing configuration is reported once, naming every absent variable together, rather than one
per restart:

```console
$ npm start

> price-comparer@1.0.0 start
> node dist/index.js

Missing required environment variables: SHOPIFY_STORE_NAME, SHOPIFY_ACCESS_TOKEN, MONGODB_URI. Copy .env.example to .env and fill them in.
$ echo $?
1
```

`GET /health` reports which competitor sources are configured and whether webhooks are
mounted. eBay credentials are optional: without them the source is not registered and
`/api/pricing/compare` answers `503` naming the variables to set, rather than reporting an
empty comparison as a success.

```bash
npm test                      # 91 tests
npm run typecheck
```

The suite covers the four pricing rules and the money rounding, the Shopify client's
pagination and error handling against a stubbed HTTP client, the eBay adapter's token caching
and currency filtering, the HMAC verification, the mapper, and every endpoint through
`supertest`. None of it reaches the network or a database — the repository has an in-memory
implementation, so the services are exercised with no Mongo running.

## Layout

```
domain/          Product, IProductRepository — plain types, no framework
application/     PriceComparisonService, PriceUpdateService, CatalogSyncService
infrastructure/  ShopifyApi, EbayApiAdapter, Mongo repository, webhook verification
api/             controller and routes
container.ts     the composition root — the only place anything is constructed
```

The domain `Product` is a plain object with no Mongoose types on it. The persistence layer
owns its own document type and maps to and from that shape, which is why the services can be
tested with no database driver in scope. `container.ts` is the only file that calls a
constructor with a real dependency; everything else receives its collaborators.

More on the layer rules in [`src/README.md`](src/README.md).

## Configuration

| Variable | |
|---|---|
| `SHOPIFY_STORE_NAME` | the `acme` in `acme.myshopify.com` — required |
| `SHOPIFY_ACCESS_TOKEN` | Admin API access token — required |
| `MONGODB_URI` | required |
| `SHOPIFY_API_VERSION` | Admin API version, default `2024-10` |
| `SHOPIFY_WEBHOOK_SECRET` | enables `/webhooks/shopify` |
| `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | enables the eBay source |
| `EBAY_MARKETPLACE_ID`, `EBAY_CURRENCY` | default `EBAY_US`, `USD` |
| `MAX_PRICE_CHANGE_PERCENT` | largest single move, default `20` |
| `PORT` | default `3000` |

## Stack

TypeScript · Node.js · Express · Mongoose / MongoDB · Shopify Admin REST API · eBay Browse API · Jest

## Licence

MIT — see [LICENSE](LICENSE).
