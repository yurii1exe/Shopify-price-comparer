# Project Description

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
