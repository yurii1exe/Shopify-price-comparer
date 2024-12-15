## Project Description

**Project Name:** Dynamic Price Manager for Shopify  
**Goal:** A Shopify app that automates dynamic pricing processes by utilizing competitor data from various APIs and internal pricing strategies.

This application aims to help Shopify store owners make data-driven pricing decisions, automate price updates, analyze new products, and propose optimal pricing adjustments based on demand and supply factors.

---

## Core Functionality

1. **Shopify Integration:**

   - Retrieve product lists from the Shopify store.
   - Update product prices on Shopify.
   - Handle webhooks (e.g., trigger analysis when a new product is added).

2. **Competitive Pricing Analysis:**

   - Choose from multiple external data sources:
     - eBay API
     - Amazon Product Advertising API
     - Walmart API
     - PriceSpider API
     - Google Shopping API
   - Collect competitor pricing data and create a price comparison dataset for each product.

3. **Pricing Update Strategies:**

   - Update Shopify prices based on:
     - Average competitor price
     - Lowest competitor price
     - Highest competitor price
     - Median competitor price
   - Easily switch between these strategies via the app’s configuration.

4. **New Product Analysis:**

   - Automatically analyze newly added products to the Shopify store.
   - Fetch competitor prices as soon as a new product is detected via Shopify webhooks.
   - Apply initial pricing strategy or prepare data for manual review.

5. **Dynamic Pricing Based on Demand and Supply:**

   - Consider real-time factors (e.g., sales data, views, seasonal demand).
   - Automatically suggest or apply price adjustments to maximize margins or meet sales targets.

6. **Filtering Products with Updated Prices:**
   - Mark products whose prices have changed.
   - Provide a filtered view of such products for administrative review.

---

## Use Cases

1. **Admin Updates Prices Using the “Average” Strategy:**

   - The admin logs into the app’s dashboard.
   - Chooses the “Update Prices” feature.
   - Selects “Average” as the strategy.
   - The system retrieves competitor prices, calculates the average, updates the prices in Shopify, and presents a summary.

2. **New Product Added in Shopify:**

   - A new product is added via the Shopify admin panel.
   - A Shopify webhook notifies the app.
   - The app automatically gathers competitor prices, applies the chosen pricing rule, and updates the store’s price if necessary.

3. **Admin Chooses Multiple Pricing Sources:**

   - In the app settings, the admin selects eBay, Amazon, and Google Shopping as sources.
   - Initiates a price update process.
   - The system aggregates data from all three sources, calculates the chosen metric, updates prices accordingly, and logs the changes.

4. **Admin Reviews Products with Changed Prices:**
   - Opens a “Price Changes” tab in the dashboard.
   - Sees a list of products with recently updated prices.
   - Can filter by date, product name, or other criteria for further analysis.

---

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
