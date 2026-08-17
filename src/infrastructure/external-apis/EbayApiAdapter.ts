import axios, { AxiosInstance } from 'axios';
import { IExternalApi } from './ExternalApiInterface';
import { DEFAULT_TITLE_MATCH_THRESHOLD, isComparableListing } from './titleMatch';

export interface EbayApiOptions {
  clientId: string;
  clientSecret: string;
  /** e.g. EBAY_US, EBAY_GB — decides which site's listings and currency come back. */
  marketplaceId?: string;
  /** Currency to keep. Listings quoted in anything else are dropped, not converted. */
  currency?: string;
  /**
   * Compare landed cost — item price plus the listing's reported shipping.
   * Default true. A listing that reports no shipping cost is dropped rather
   * than counted as free; see the class comment.
   */
  includeShipping?: boolean;
  /**
   * Share of the product's title tokens a listing has to carry, 0 to 1.
   * Default 0.6.
   */
  titleMatchThreshold?: number;
  /** Listings to consider per search. eBay's own ceiling is 200. */
  limit?: number;
  /** Injected in tests; defaults to a real axios instance against api.ebay.com. */
  http?: AxiosInstance;
  /** Injected in tests. */
  now?: () => number;
}

interface EbayItemSummary {
  title?: string;
  price?: { value?: string; currency?: string };
  shippingOptions?: { shippingCost?: { value?: string; currency?: string } }[];
}

/**
 * Competitor prices from the eBay Browse API.
 *
 * A keyword search answers "what is relevant to these words"; a repricer needs
 * "what is this same item selling for". Four rules close that gap, and every
 * one of them is there to keep the returned array homogeneous — one array of
 * landed prices for one new unit of one item:
 *
 * 1. **Fixed-price, new listings only** (`buyingOptions:{FIXED_PRICE}`,
 *    `conditions:{NEW}`). An auction's current bid is what somebody has
 *    offered so far, not what the item sells for. A used or refurbished unit
 *    is a different product at a different price, and under the `min` rule it
 *    is the one that gets selected.
 * 2. **The title has to match the product's.** A listing has to carry at least
 *    `titleMatchThreshold` of the product's title tokens, and must not be a
 *    multipack, a lot, salvage, or an accessory the product does not name.
 *    See `titleMatch.ts`.
 * 3. **Landed cost, not item cost.** A buyer compares the total, so the
 *    reported shipping cost is added. A listing that reports no shipping cost
 *    at all is dropped rather than counted as free: its item price is not a
 *    landed price, and mixing the two into one array leaves the rule averaging
 *    two different quantities. Free shipping reports `0.00`, which is a
 *    reported cost and is kept.
 * 4. **One currency.** Listings quoted in another are dropped rather than
 *    converted — guessing an FX rate would put a wrong number into a price.
 *
 * What it does not do: it reads titles, not item specifics, so it cannot tell
 * a 250 g bag from a 1 kg one when the titles otherwise agree, and it does not
 * know that a model number is a model number.
 */
export class EbayApiAdapter implements IExternalApi {
  readonly name = 'ebay';

  private readonly http: AxiosInstance;
  private readonly marketplaceId: string;
  private readonly currency: string;
  private readonly includeShipping: boolean;
  private readonly titleMatchThreshold: number;
  private readonly limit: number;
  private readonly now: () => number;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly options: EbayApiOptions) {
    this.http = options.http ?? axios.create({ baseURL: 'https://api.ebay.com', timeout: 15000 });
    this.marketplaceId = options.marketplaceId ?? 'EBAY_US';
    this.currency = options.currency ?? 'USD';
    this.includeShipping = options.includeShipping ?? true;
    this.titleMatchThreshold = options.titleMatchThreshold ?? DEFAULT_TITLE_MATCH_THRESHOLD;
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
        filter: `buyingOptions:{FIXED_PRICE},conditions:{NEW},priceCurrency:${this.currency}`,
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-EBAY-C-MARKETPLACE-ID': this.marketplaceId,
      },
    });

    const summaries: EbayItemSummary[] = response.data?.itemSummaries ?? [];
    const prices: number[] = [];

    for (const item of summaries) {
      if (!isComparableListing(title, item.title, this.titleMatchThreshold)) continue;
      if (item.price?.currency !== this.currency) continue;
      const value = Number.parseFloat(item.price?.value ?? '');
      if (!Number.isFinite(value)) continue;

      if (!this.includeShipping) {
        prices.push(round(value));
        continue;
      }

      const shipping = item.shippingOptions?.[0]?.shippingCost;
      if (shipping?.currency !== this.currency) continue;
      const shippingValue = Number.parseFloat(shipping.value ?? '');
      if (!Number.isFinite(shippingValue)) continue;

      prices.push(round(value + shippingValue));
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

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
