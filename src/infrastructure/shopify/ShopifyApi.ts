import axios, { AxiosInstance } from 'axios';

export interface ShopifyProductVariant {
  id: number;
  title: string;
  price: string;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  variants: ShopifyProductVariant[];
}

/**
 * Everything `ShopifyApi` throws. Carries the HTTP status and, where the call
 * was about one variant, the variant ID — "Shopify returned 422" without a
 * variant is not an actionable log line.
 */
export class ShopifyApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly variantId?: number,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'ShopifyApiError';
  }
}

/**
 * Pull the `page_info` cursor out of a Shopify `Link` header.
 *
 * Shopify paginates with an opaque cursor and will not accept a reconstructed
 * one, so the next page is only reachable by reading this header. Exported
 * because the parsing, not the HTTP, is the part that goes wrong.
 */
export function parseNextPageInfo(linkHeader: string | undefined): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(',')) {
    const match = part.match(/<([^>]+)>;\s*rel="?next"?/);
    if (match) {
      const pageInfo = new URL(match[1]).searchParams.get('page_info');
      if (pageInfo) return pageInfo;
    }
  }
  return null;
}

export class ShopifyApi {
  private client: AxiosInstance;

  constructor(
    storeName: string,
    accessToken: string,
    private apiVersion: string = '2024-10',
    client?: AxiosInstance
  ) {
    this.client =
      client ??
      axios.create({
        baseURL: `https://${storeName}.myshopify.com/admin/api/${this.apiVersion}`,
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        timeout: 20000,
      });
  }

  /**
   * Every product in the store, following the cursor to the end.
   *
   * 250 is the hard page ceiling on the Admin REST API; asking for more is a
   * 400, not a larger page. `maxPages` is a stop so a catalogue that keeps
   * handing back a cursor cannot loop forever.
   */
  async getAllProducts(maxPages = 40): Promise<ShopifyProduct[]> {
    const products: ShopifyProduct[] = [];
    let pageInfo: string | null = null;

    for (let page = 0; page < maxPages; page++) {
      // page_info is mutually exclusive with every other filter on the request:
      // send it alongside `title` and Shopify answers 400.
      const params = pageInfo ? { limit: 250, page_info: pageInfo } : { limit: 250 };
      try {
        const response = await this.client.get('/products.json', { params });
        products.push(...(response.data.products ?? []));
        pageInfo = parseNextPageInfo(response.headers?.['link'] ?? response.headers?.['Link']);
        if (!pageInfo) break;
      } catch (error) {
        throw this.wrap(error, 'Failed to fetch products from Shopify');
      }
    }

    return products;
  }

  /**
   * Write a new price to one variant.
   * @param newPrice decimal string, e.g. "19.99" — Shopify stores money as a
   *   string and a float here rounds where you cannot see it.
   */
  async updateProductVariantPrice(variantId: number, newPrice: string): Promise<void> {
    try {
      await this.client.put(`/variants/${variantId}.json`, {
        variant: { id: variantId, price: newPrice },
      });
    } catch (error) {
      throw this.wrap(error, `Failed to update price for variant ${variantId}`, variantId);
    }
  }

  async searchProductsByTitle(title: string): Promise<ShopifyProduct[]> {
    try {
      const response = await this.client.get('/products.json', {
        params: { title, limit: 50 },
      });
      return response.data.products ?? [];
    } catch (error) {
      throw this.wrap(error, `Failed to search products by title "${title}"`);
    }
  }

  private wrap(error: unknown, message: string, variantId?: number): ShopifyApiError {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const details = error.response?.data;
      // Shopify puts the reason in the body — "price: is not a number" — and a
      // bare status code loses it.
      const reason = describeShopifyErrors(details);
      return new ShopifyApiError(
        reason ? `${message}: ${status ?? 'no response'} — ${reason}` : `${message}: ${status ?? error.code ?? 'no response'}`,
        status,
        variantId,
        details
      );
    }
    return new ShopifyApiError(message, undefined, variantId, error);
  }
}

/** Flatten Shopify's `{"errors": {"price": ["is not a number"]}}` into one line. */
function describeShopifyErrors(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const errors = (body as { errors?: unknown }).errors;
  if (typeof errors === 'string') return errors;
  if (errors && typeof errors === 'object') {
    return Object.entries(errors as Record<string, unknown>)
      .map(([field, value]) => `${field}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
      .join('; ');
  }
  return null;
}
