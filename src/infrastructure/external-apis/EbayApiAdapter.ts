import { IExternalApi } from './ExternalApiInterface';

export class EbayApiAdapter implements IExternalApi {
  async getCompetitorPrices(productTitle: string): Promise<number[]> {
    // TODO: call the eBay Browse API here and return the real prices.
    // Placeholder only — these are fixed values, no network call is made.
    return [100, 105, 99];
  }
}
