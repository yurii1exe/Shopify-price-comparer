export interface IExternalApi {
  getCompetitorPrices(productTitle: string): Promise<number[]>;
}
