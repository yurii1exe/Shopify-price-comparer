import { AxiosInstance } from 'axios';
import { ShopifyApi, ShopifyApiError, parseNextPageInfo } from '../src/infrastructure/shopify/ShopifyApi';

function axiosError(status: number, data?: unknown) {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data },
  });
}

function fakeClient(overrides: Partial<AxiosInstance> = {}): AxiosInstance {
  return { get: jest.fn(), put: jest.fn(), ...overrides } as unknown as AxiosInstance;
}

describe('parseNextPageInfo', () => {
  it('reads the cursor out of a rel="next" link', () => {
    const header =
      '<https://s.myshopify.com/admin/api/2024-10/products.json?limit=250&page_info=abc123>; rel="next"';
    expect(parseNextPageInfo(header)).toBe('abc123');
  });

  it('ignores the previous-page link when both are present', () => {
    const header =
      '<https://s.myshopify.com/admin/api/2024-10/products.json?page_info=older>; rel="previous", ' +
      '<https://s.myshopify.com/admin/api/2024-10/products.json?page_info=newer>; rel="next"';
    expect(parseNextPageInfo(header)).toBe('newer');
  });

  it('returns null on the last page, where only a previous link is sent', () => {
    const header = '<https://s.myshopify.com/admin/api/2024-10/products.json?page_info=older>; rel="previous"';
    expect(parseNextPageInfo(header)).toBeNull();
  });

  it('returns null for a missing header', () => {
    expect(parseNextPageInfo(undefined)).toBeNull();
  });
});

describe('ShopifyApi.getAllProducts', () => {
  it('follows the cursor across pages and stops when the link header runs out', async () => {
    const get = jest
      .fn()
      .mockResolvedValueOnce({
        data: { products: [{ id: 1, title: 'A', variants: [] }] },
        headers: {
          link: '<https://s.myshopify.com/admin/api/2024-10/products.json?page_info=cursor2>; rel="next"',
        },
      })
      .mockResolvedValueOnce({
        data: { products: [{ id: 2, title: 'B', variants: [] }] },
        headers: {},
      });

    const api = new ShopifyApi('store', 'token', '2024-10', fakeClient({ get } as never));
    const products = await api.getAllProducts();

    expect(products.map((p) => p.id)).toEqual([1, 2]);
    expect(get).toHaveBeenCalledTimes(2);
    expect(get.mock.calls[0][1].params).toEqual({ limit: 250 });
    // page_info is mutually exclusive with other filters, so the second page sends only these two.
    expect(get.mock.calls[1][1].params).toEqual({ limit: 250, page_info: 'cursor2' });
  });

  it('stops at maxPages even if Shopify keeps returning a cursor', async () => {
    const get = jest.fn().mockResolvedValue({
      data: { products: [{ id: 1, title: 'A', variants: [] }] },
      headers: { link: '<https://s.myshopify.com/x?page_info=loop>; rel="next"' },
    });

    const api = new ShopifyApi('store', 'token', '2024-10', fakeClient({ get } as never));
    await api.getAllProducts(3);

    expect(get).toHaveBeenCalledTimes(3);
  });

  it('wraps a failure as a ShopifyApiError carrying the status', async () => {
    const get = jest.fn().mockRejectedValue(axiosError(401, { errors: 'Invalid API key or access token' }));
    const api = new ShopifyApi('store', 'token', '2024-10', fakeClient({ get } as never));

    await expect(api.getAllProducts()).rejects.toBeInstanceOf(ShopifyApiError);
    await expect(api.getAllProducts()).rejects.toThrow(/401 — Invalid API key or access token/);
  });
});

describe('ShopifyApi.updateProductVariantPrice', () => {
  it('PUTs the variant with the price as a string', async () => {
    const put = jest.fn().mockResolvedValue({ data: {} });
    const api = new ShopifyApi('store', 'token', '2024-10', fakeClient({ put } as never));

    await api.updateProductVariantPrice(5001, '19.99');

    expect(put).toHaveBeenCalledWith('/variants/5001.json', {
      variant: { id: 5001, price: '19.99' },
    });
  });

  it('attaches the variant ID to the error, because a bare 422 is not actionable', async () => {
    const put = jest.fn().mockRejectedValue(axiosError(422, { errors: { price: ['is not a number'] } }));
    const api = new ShopifyApi('store', 'token', '2024-10', fakeClient({ put } as never));

    const error = await api.updateProductVariantPrice(5001, 'abc').catch((e) => e);

    expect(error).toBeInstanceOf(ShopifyApiError);
    expect(error.variantId).toBe(5001);
    expect(error.status).toBe(422);
    expect(error.message).toContain('variant 5001');
    expect(error.message).toContain('price: is not a number');
  });

  it('survives a transport failure that has no HTTP response at all', async () => {
    const put = jest.fn().mockRejectedValue(
      Object.assign(new Error('connect ETIMEDOUT'), { isAxiosError: true, code: 'ETIMEDOUT' })
    );
    const api = new ShopifyApi('store', 'token', '2024-10', fakeClient({ put } as never));

    const error = await api.updateProductVariantPrice(7, '1.00').catch((e) => e);

    expect(error).toBeInstanceOf(ShopifyApiError);
    expect(error.status).toBeUndefined();
    expect(error.message).toContain('ETIMEDOUT');
  });
});

describe('ShopifyApi.searchProductsByTitle', () => {
  it('returns an empty array when Shopify sends no products key', async () => {
    const get = jest.fn().mockResolvedValue({ data: {}, headers: {} });
    const api = new ShopifyApi('store', 'token', '2024-10', fakeClient({ get } as never));

    await expect(api.searchProductsByTitle('nothing')).resolves.toEqual([]);
  });

  it('reports the search term in the error message', async () => {
    const get = jest.fn().mockRejectedValue(axiosError(429));
    const api = new ShopifyApi('store', 'token', '2024-10', fakeClient({ get } as never));

    await expect(api.searchProductsByTitle('Widget')).rejects.toThrow(/"Widget": 429/);
  });
});
