import { IExternalApi } from './ExternalApiInterface';

export class EbayApiAdapter implements IExternalApi {
  async getCompetitorPrices(productTitle: string): Promise<number[]> {
    // Логіка звернення до eBay API
    // Повертаємо масив цін
    return [100, 105, 99];
  }
}
