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

![A terminal session: the seeded catalogue, the shared secret on the pricing routes, a failed Shopify write, and a dry run whose change limit refuses to cut 169 to 92](docs/demo.gif)

The recording is the compiled service on `node dist/index.js` against a local stack — MongoDB
in Docker, a placeholder Shopify token, no eBay credentials. In order: `/health`, reporting
which sources are configured and that the pricing routes want a key; the seeded catalogue in
Mongo, with the competitor prices already collected; `/api/pricing/compare` refused without
the shared secret, refused with the wrong one, and answering `503` with the variables to set
once it has the right one; a webhook rejected on a wrong HMAC and accepted on one computed
with `openssl`, and the product it stored; a real update whose Shopify writes answer `404`,
each reported with its variant ID, after which the stored prices and their `lastPriceUpdate`
are exactly where they were; and a `median` dry run, where the change limit refuses to cut the
grinder from 169 to 92 and reports the price it would have set. The eBay Browse API is not
called, and no price reaches a live store.

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
$ curl -s -XPOST localhost:3000/api/pricing/update -H "X-Api-Key: $PRICING_API_KEY" \
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

Before any rule runs, the sample it runs over is trimmed: competitor prices further than 1.5
interquartile ranges outside the quartiles are dropped. A marketplace search returns the
occasional listing that is not the product, and one of those is enough to drag an average.
A sample of fewer than four prices is left alone, because with three listings there is nothing
to distinguish an outlier from a spread.

`min` then gets a guard the other rules do not need. Every other rule survives one bad match —
the median ignores it, the average is dragged a little — but `min` is *defined* by the worst
match in the sample, so the single listing the filters did not catch becomes the shop price.
So the lowest price has to be corroborated: at least three prices, and a minimum no further
than 40% below the sample's median. A product that fails that is skipped as
`min-not-corroborated` and reported with the price it would have set.

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

A keyword search answers "what is relevant to these words". A repricer needs "what is this
same item selling for", and the gap between those two questions is where a repricer gets a
price wrong. Four rules close it, and every one of them keeps the returned array homogeneous —
one array of landed prices for one new unit of one item:

- **Fixed-price, new listings only** (`buyingOptions:{FIXED_PRICE}`, `conditions:{NEW}`). An
  auction's current bid is what somebody has offered so far, not what the item sells for. A
  used, refurbished or for-parts unit is a different product at a different price, and under
  the `min` rule it is exactly the one that gets selected.
- **The listing title has to match the product's.** A listing has to carry at least 60% of the
  product's title tokens, normalised and stripped of the words that carry no identity. Beyond
  that it is dropped if it is a multipack or a lot — "set of 6" enters a keyword search as
  readily as anything else, and its price is six unit prices — if it is salvage, or if it
  names an accessory the product does not name, which is how a dust cover for a grinder gets
  into the sample at a tenth of the price. `infrastructure/external-apis/titleMatch.ts` holds
  those checks as pure functions and is tested on its own.
- **Landed cost, not item cost.** A buyer compares the total, so the reported shipping cost is
  added. A listing that reports no shipping cost at all is dropped rather than counted as
  free: its item price is not a landed price, and one array holding both leaves the rule
  averaging two different quantities. Free shipping is reported as `0.00`, which is a reported
  cost, and is kept.
- **One currency.** Listings quoted in another are dropped rather than converted — guessing an
  FX rate would put a wrong number into a price.

What the matching does not do: it reads titles, not item specifics, so it cannot tell a 250 g
bag from a 1 kg one when the titles otherwise agree; it has no synonym list and no notion that
a model number is a model number; and a listing whose title contains the whole of the
product's passes the token check whatever else it says. That is why the outlier trim sits in
front of the pricing rule and the change limit sits in front of the write.

A source that fails does not abandon the run. The failure is recorded against the source and
the product, and the remaining sources still contribute; a thrown error halfway through the
catalogue would otherwise leave half the products holding prices from this run and half from
the last, with nothing recording which is which.

## Reaching it

`/api/pricing/sync`, `/api/pricing/compare` and `/api/pricing/update` require the shared secret
in `PRICING_API_KEY`, sent as an `X-Api-Key` header and compared in constant time. Repricing a
catalogue and spending somebody's eBay quota are not public operations. With no key configured
those routes answer `503` naming the variable to set, rather than running unauthenticated.

`POST /webhooks/shopify` is the one route designed to be reachable from outside, and it
authenticates its callers itself — by HMAC over the raw body, which is what Shopify signs.

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

`PRICING_API_KEY` is what the pricing routes check, and `openssl rand -hex 32` is a fine way
to produce one. `npm run dev` runs it from TypeScript through `ts-node` without building. If 27017 is already
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
mounted, and needs no key. eBay credentials are optional: without them the source is not registered and
`/api/pricing/compare` answers `503` naming the variables to set, rather than reporting an
empty comparison as a success.

```bash
npm test                      # 155 tests
npm run typecheck
```

The suite covers the four pricing rules, the outlier trim and the money rounding, the Shopify
client's pagination and error handling against a stubbed HTTP client, the eBay adapter's token
caching, listing filters and title matching, the HMAC verification, the shared secret on the
pricing routes, the mapper, and every endpoint through `supertest`. None of it reaches the network or a database — the repository has an in-memory
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
| `PRICING_API_KEY` | shared secret for `/api/pricing/*`, sent as `X-Api-Key` |
| `MAX_PRICE_CHANGE_PERCENT` | largest single move, default `20` |
| `PORT` | default `3000` |

## Stack

TypeScript · Node.js · Express · Mongoose / MongoDB · Shopify Admin REST API · eBay Browse API · Jest

## Licence

MIT — see [LICENSE](LICENSE).
