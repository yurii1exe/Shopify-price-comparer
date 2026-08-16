import axios, { AxiosInstance } from 'axios';
import { IExternalApi } from './ExternalApiInterface';

export interface EbayApiOptions {
  clientId: string;
  clientSecret: string;
  /** e.g. EBAY_US, EBAY_GB — decides which site's listings and currency come back. */
  marketplaceId?: string;
  /** Currency to keep. Listings quoted in anything else are dropped, not converted. */
  currency?: string;
  /** Add the reported shipping cost to each price. Default true. */
  includeShipping?: boolean;
  /** Listings to consider per search. eBay's own ceiling is 200. */
  limit?: number;
  /** Injected in tests; defaults to a real axios instance against api.ebay.com. */
  http?: AxiosInstance;
  /** Injected in tests. */
  now?: () => number;
}

interface EbayItemSummary {
  price?: { value?: string; currency?: string };
  shippingOptions?: { shippingCost?: { value?: string; currency?: string } }[];
}

/**
 * Competitor prices from the eBay Browse API.
 *
 * Two decisions in here are what make the numbers comparable to a shop price:
 *
 * 1. **Fixed-price listings only.** An auction's current bid is what somebody
 *    has offered so far, not what the item sells for, and averaging it in drags
 *    every rule downward. The request filters on `buyingOptions:{FIXED_PRICE}`.
 * 2. **Landed cost, not item cost.** A buyer compares the total, so the
 *    reported shipping cost is added where eBay gives one. Free-shipping
 *    listings report 0.00 and are unaffected.
 *
 * Listings quoted in another currency are dropped rather than converted —
 * guessing an FX rate would put a wrong number into a price.
 */
export class EbayApiAdapter implements IExternalApi {
  readonly name = 'ebay';

  private readonly http: AxiosInstance;
  private readonly marketplaceId: string;
  private readonly currency: string;
  private readonly includeShipping: boolean;
  private readonly limit: number;
  private readonly now: () => number;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly options: EbayApiOptions) {
    this.http = options.http ?? axios.create({ baseURL: 'https://api.ebay.com', timeout: 15000 });
    this.marketplaceId = options.marketplaceId ?? 'EBAY_US';
    this.currency = options.currency ?? 'USD';
    this.includeShipping = options.includeShipping ?? true;
    this.limit = options.limit ?? 50;
    this.now = options.now ?? Date.now;
  }

  async getCompetitorPrices(productTitle: string): Promise<number[]> {
    const title = productTitle.trim();
    if (!title) return [];

    const accessToken = await this.getAccessToken();
    const response = await this.http.get('/buy/browse/v1/item_summary/search', {
      params: {
        q: title,
        limit: this.limit,
        filter: `buyingOptions:{FIXED_PRICE},priceCurrency:${this.currency}`,
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-EBAY-C-MARKETPLACE-ID': this.marketplaceId,
      },
    });

    const summaries: EbayItemSummary[] = response.data?.itemSummaries ?? [];
    const prices: number[] = [];

    for (const item of summaries) {
      if (item.price?.currency !== this.currency) continue;
      const value = Number.parseFloat(item.price?.value ?? '');
      if (!Number.isFinite(value)) continue;

      let landed = value;
      if (this.includeShipping) {
        const shipping = item.shippingOptions?.[0]?.shippingCost;
        if (shipping?.currency === this.currency) {
          const shippingValue = Number.parseFloat(shipping.value ?? '');
          if (Number.isFinite(shippingValue)) landed += shippingValue;
        }
      }
      prices.push(Math.round(landed * 100) / 100);
    }

    return prices;
  }

  /**
   * Application access token, via the client-credentials grant.
   *
   * Cached until 60 seconds before it expires. eBay issues these for two hours
   * and expects them to be reused; fetching one per product would turn every
   * search into two round trips against an endpoint not meant to carry that.
   */
  private async getAccessToken(): Promise<string> {
    const now = this.now();
    if (this.token && this.token.expiresAt > now) return this.token.value;

    const basic = Buffer.from(`${this.options.clientId}:${this.options.clientSecret}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'https://api.ebay.com/oauth/api_scope',
    });

    const response = await this.http.post('/identity/v1/oauth2/token', body.toString(), {
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const value: string | undefined = response.data?.access_token;
    if (!value) throw new Error('eBay token endpoint returned no access_token');
    const expiresIn: number = Number(response.data?.expires_in) || 7200;

    this.token = { value, expiresAt: now + (expiresIn - 60) * 1000 };
    return value;
  }
}
