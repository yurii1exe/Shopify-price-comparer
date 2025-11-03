## Technical Details

### Architecture

- **Clean / Hexagonal Architecture:**  
  The application is divided into layers:

  - **Domain (Entities, Repository Interfaces):** Defines core data structures (Products, Price History) and repository interfaces, independent of technology specifics.
  - **Application (Use Cases/Services):** Contains business logic (price analysis, strategy selection, dynamic pricing).
  - **Infrastructure (Repositories, Shopify Adapters, External API Adapters):** Actual implementations for MongoDB storage, integration with Shopify, and external competitor APIs.
  - **Interfaces (UI/HTTP):** REST API endpoints, webhooks, and admin interfaces.

- **API Layers:**

  - **Shopify API:** Interact with Shopify products (get/update).
  - **External Pricing APIs (eBay, Amazon, Walmart, PriceSpider, Google Shopping):**  
    Each will have an adapter returning competitor price arrays.

- **Database (MongoDB):**  
  Stores:

  - Product data (Shopify ID, current price, competitor prices, last update timestamp, priceChanged flag).
  - Price change history (audit trail).

- **Automation:**
  - Cron jobs for regular price updates.
  - Shopify webhooks to trigger analysis when new products are added.

### Key Components

1. **ShopifyApi (Infrastructure):**

   - `getAllProducts()`, `updateProductVariantPrice()`, `listenToWebhooks()`.

2. **ExternalApi Adapters (Infrastructure):**

   - `EbayApiAdapter`, `AmazonApiAdapter`, `WalmartApiAdapter`, `PriceSpiderApiAdapter`, `GoogleShoppingApiAdapter`.
   - Common Method: `getCompetitorPrices(productTitle: string): Promise<number[]>`.

3. **ProductRepository (Infrastructure):**

   - `getAll()`, `getByShopifyId(id)`, `createOrUpdate(product)`, `markPriceChanged(id, boolean)`.

4. **Services (Application):**

   - `PriceComparisonService`: Fetches products, gathers competitor prices, updates data in the database.
   - `PriceUpdateService`: Calculates new prices using the chosen strategy and updates Shopify.
   - `DynamicPricingService`: Applies demand/supply-based pricing adjustments.

5. **Use Cases (Application):**

   - `ComparePricesUseCase`: Invokes `PriceComparisonService`.
   - `UpdatePricesUseCase`: Invokes `PriceUpdateService` with the selected strategy.
   - `AnalyzeNewProductUseCase`: Triggered by new product webhook, runs `ComparePricesUseCase`.

6. **Controllers (Interfaces):**

   - `PricingController`: Endpoints to start price updates, configure strategies, and review changes.
   - `ProductController`: Endpoints for viewing products, filtering by price changes.

7. **Webhooks:**
   - `Products/Create` Webhook: On receiving a new product event, runs `AnalyzeNewProductUseCase`.

### Data Flow

1. **Price Update Request (via UI or Cron):**

   - `PricingController` → `UpdatePricesUseCase` → `PriceUpdateService`
   - Fetch products from DB, gather competitor prices, compute new price → `ShopifyApi.updateProductVariantPrice()` → Update DB records, mark price changes.

2. **New Product Handling (via Webhook):**
   - Shopify → Webhook → `AnalyzeNewProductUseCase` → `PriceComparisonService`
   - Collect competitor prices, determine initial strategy, possibly update Shopify and store product data in DB.

---

## Security & Authorization

- **Shopify App OAuth:**  
  Use OAuth2 flow to obtain and refresh access tokens for Shopify Admin API.

- **External API Credentials:**  
  Each external API key or token stored in `.env` or a secure storage solution.

- **HTTPS & Rate Limiting:**
  All communications secured via HTTPS.
  Rate limiting to prevent abuse and respect external APIs’ rate limits.

---

## Logging & Monitoring

- Log every price update operation.
- Store price change histories in MongoDB.
- Integrate with external logging/monitoring services (e.g., Datadog, LogDNA).
- Track metrics: number of updates, response times, error rates.

---

## Testing

- **Unit Tests:**  
  For use cases, services, and adapters.

- **Integration Tests:**  
  Validate interactions between repositories and external APIs.

- **End-to-End Tests:**  
  Full scenario: Add a product to Shopify → Webhook triggers → Price analysis and updates → Verification in Shopify.

---

## Deployment

- **Runtime:** Node.js + TypeScript
- **Hosting:**  
  Heroku, AWS (Lambda + API Gateway), Vercel, or DigitalOcean.
- **CI/CD:**  
  Automated pipeline for testing and deployment upon code commits.

---

## Summary

This documentation outlines the functional and technical details for building a Dynamic Price Manager integrated with Shopify. The described architecture and best practices will ensure the system is flexible, testable, and scalable. Further detailing and refinement will occur as the project progresses and specific needs arise.
