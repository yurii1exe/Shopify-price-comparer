/**
 * The domain view of a product being repriced.
 *
 * This is a plain object with no Mongoose types on it. The persistence layer
 * owns its own document type and maps to and from this shape, so the services
 * and their tests never need a database driver in scope.
 */
export interface Product {
  /** Shopify product ID, as a string because Shopify IDs exceed 2^53. */
  shopifyId: string;
  /**
   * Shopify variant ID of the variant whose price is written.
   * Prices live on variants, not products — a repricer that only knows the
   * product ID has nothing it can PUT to.
   */
  variantId: number;
  title: string;
  /** Price currently on the store, in the store's currency. */
  currentPrice: number;
  /** Competitor prices collected on the last comparison run. */
  competitorPrices: number[];
  /** When this product's price was last written to Shopify. */
  lastPriceUpdate: Date | null;
  /** Set when the last run moved the price, so an admin can review only what changed. */
  priceChanged: boolean;
}
