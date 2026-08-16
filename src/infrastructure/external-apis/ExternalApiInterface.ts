/**
 * One marketplace, one implementation. `PriceComparisonService` takes an array
 * of these and knows nothing else about where prices come from, so adding a
 * source is adding a file.
 */
export interface IExternalApi {
  /** Human-readable source name, used in logs and in the comparison summary. */
  readonly name: string;
  /**
   * Prices for products matching this title, in the currency the adapter was
   * configured for. Returns an empty array when the marketplace has no
   * comparable listing — that is a normal answer, not an error.
   */
  getCompetitorPrices(productTitle: string): Promise<number[]>;
}
