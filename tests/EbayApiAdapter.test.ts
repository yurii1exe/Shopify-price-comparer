import { AxiosInstance } from 'axios';
import { EbayApiAdapter } from '../src/infrastructure/external-apis/EbayApiAdapter';

interface ListingOptions {
  title?: string;
  currency?: string;
  /** Omitted entirely when undefined, which is how a listing with no shipping option comes back. */
  shipping?: string;
  shippingCurrency?: string;
}

function listing(value: string, options: ListingOptions = {}) {
  const currency = options.currency ?? 'USD';
  return {
    title: options.title ?? 'Widget',
    price: { value, currency },
    ...(options.shipping !== undefined
      ? {
          shippingOptions: [
            { shippingCost: { value: options.shipping, currency: options.shippingCurrency ?? currency } },
          ],
        }
      : {}),
  };
}

function fakeHttp(searchData: unknown, tokenData: unknown = { access_token: 'tok', expires_in: 7200 }) {
  const post = jest.fn().mockResolvedValue({ data: tokenData });
  const get = jest.fn().mockResolvedValue({ data: searchData });
  return { post, get, http: { post, get } as unknown as AxiosInstance };
}

const credentials = { clientId: 'id', clientSecret: 'secret' };

describe('EbayApiAdapter', () => {
  it('returns the landed price of each listing: item price plus reported shipping', async () => {
    const { http, get } = fakeHttp({
      itemSummaries: [listing('19.99', { shipping: '4.50' }), listing('21.00', { shipping: '0.00' })],
    });

    const prices = await new EbayApiAdapter({ ...credentials, http }).getCompetitorPrices('Widget');

    expect(prices).toEqual([24.49, 21]);
    expect(get).toHaveBeenCalledWith(
      '/buy/browse/v1/item_summary/search',
      expect.objectContaining({
        params: expect.objectContaining({
          q: 'Widget',
          filter: 'buyingOptions:{FIXED_PRICE},conditions:{NEW},priceCurrency:USD',
        }),
      })
    );
  });

  it('asks eBay for new stock only, so a used or refurbished unit never reaches the rule', async () => {
    const { http, get } = fakeHttp({ itemSummaries: [] });
    await new EbayApiAdapter({ ...credentials, http }).getCompetitorPrices('Widget');
    expect(get.mock.calls[0][1].params.filter).toContain('conditions:{NEW}');
  });

  it('sends the marketplace header and the bearer token', async () => {
    const { http, get } = fakeHttp({ itemSummaries: [] });
    await new EbayApiAdapter({ ...credentials, marketplaceId: 'EBAY_GB', http }).getCompetitorPrices('X');

    expect(get.mock.calls[0][1].headers).toEqual({
      Authorization: 'Bearer tok',
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_GB',
    });
  });

  describe('every price in the array is the same quantity', () => {
    it('drops a listing that reports no shipping cost rather than entering a bare item price', async () => {
      const { http } = fakeHttp({
        itemSummaries: [listing('19.99', { shipping: '4.50' }), listing('25.00')],
      });

      const prices = await new EbayApiAdapter({ ...credentials, http }).getCompetitorPrices('Widget');

      // 25.00 is an item price, not a landed one. Keeping it would leave the
      // rule averaging two different quantities.
      expect(prices).toEqual([24.49]);
    });

    it('drops a listing whose shipping is quoted in another currency', async () => {
      const { http } = fakeHttp({
        itemSummaries: [
          listing('19.99', { shipping: '5.00', shippingCurrency: 'EUR' }),
          listing('21.00', { shipping: '0.00' }),
        ],
      });

      expect(await new EbayApiAdapter({ ...credentials, http }).getCompetitorPrices('Widget')).toEqual([21]);
    });

    it('drops a listing whose shipping cost will not parse', async () => {
      const { http } = fakeHttp({ itemSummaries: [listing('19.99', { shipping: 'n/a' })] });
      expect(await new EbayApiAdapter({ ...credentials, http }).getCompetitorPrices('Widget')).toEqual([]);
    });

    it('keeps free shipping, which is reported as 0.00', async () => {
      const { http } = fakeHttp({ itemSummaries: [listing('19.99', { shipping: '0.00' })] });
      expect(await new EbayApiAdapter({ ...credentials, http }).getCompetitorPrices('Widget')).toEqual([19.99]);
    });

    it('compares item prices when shipping is switched off, and then needs no shipping option', async () => {
      const { http } = fakeHttp({
        itemSummaries: [listing('19.99', { shipping: '4.50' }), listing('25.00')],
      });

      const prices = await new EbayApiAdapter({ ...credentials, includeShipping: false, http }).getCompetitorPrices(
        'Widget'
      );

      expect(prices).toEqual([19.99, 25]);
    });
  });

  it('drops listings quoted in another currency rather than converting them', async () => {
    const { http } = fakeHttp({
      itemSummaries: [
        listing('19.99', { shipping: '0.00' }),
        listing('18.00', { currency: 'EUR', shipping: '0.00' }),
        listing('25.00', { shipping: '0.00' }),
      ],
    });
    const prices = await new EbayApiAdapter({ ...credentials, http }).getCompetitorPrices('Widget');
    expect(prices).toEqual([19.99, 25]);
  });

  it('skips a listing with an unparseable price', async () => {
    const { http } = fakeHttp({
      itemSummaries: [
        listing('19.99', { shipping: '0.00' }),
        {
          title: 'Widget',
          price: { value: 'n/a', currency: 'USD' },
          shippingOptions: [{ shippingCost: { value: '0.00', currency: 'USD' } }],
        },
      ],
    });
    expect(await new EbayApiAdapter({ ...credentials, http }).getCompetitorPrices('Widget')).toEqual([19.99]);
  });

  it('returns an empty array when eBay has no matches', async () => {
    const { http } = fakeHttp({});
    expect(await new EbayApiAdapter({ ...credentials, http }).getCompetitorPrices('Widget')).toEqual([]);
  });

  it('does not call eBay at all for a blank title', async () => {
    const { http, get, post } = fakeHttp({ itemSummaries: [] });
    expect(await new EbayApiAdapter({ ...credentials, http }).getCompetitorPrices('   ')).toEqual([]);
    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  describe('matching a listing to the product', () => {
    const PRODUCT = 'Baratza Encore Grinder';

    async function pricesFor(titles: string[], titleMatchThreshold?: number): Promise<number[]> {
      const { http } = fakeHttp({
        itemSummaries: titles.map((title) => listing('150.00', { title, shipping: '0.00' })),
      });
      return new EbayApiAdapter({
        ...credentials,
        http,
        ...(titleMatchThreshold !== undefined ? { titleMatchThreshold } : {}),
      }).getCompetitorPrices(PRODUCT);
    }

    it('keeps a listing that carries the product title and adds words to it', async () => {
      expect(await pricesFor(['Baratza Encore Conical Burr Coffee Grinder Black - Brand New Sealed'])).toEqual([150]);
    });

    it('drops a listing that only shares the brand', async () => {
      expect(await pricesFor(['Baratza Virtuoso Burr Mill'])).toEqual([]);
    });

    it('drops a multipack, whose price is a multiple of a unit price', async () => {
      expect(await pricesFor(['Baratza Encore Grinder Lot of 3', 'Set of 6 Baratza Encore Grinder'])).toEqual([]);
    });

    it('drops an accessory for the product', async () => {
      expect(
        await pricesFor(['Dust Cover for Baratza Encore Grinder', 'Baratza Encore Grinder Filter Basket'])
      ).toEqual([]);
    });

    it('drops a listing selling the product for parts', async () => {
      expect(await pricesFor(['Baratza Encore Grinder for parts not working'])).toEqual([]);
    });

    it('drops a listing with no title, which cannot be checked against anything', async () => {
      const { http } = fakeHttp({
        itemSummaries: [
          {
            price: { value: '150.00', currency: 'USD' },
            shippingOptions: [{ shippingCost: { value: '0.00', currency: 'USD' } }],
          },
        ],
      });
      expect(await new EbayApiAdapter({ ...credentials, http }).getCompetitorPrices(PRODUCT)).toEqual([]);
    });

    it('takes the threshold from its options', async () => {
      expect(await pricesFor(['Baratza Virtuoso Burr Mill'], 0.3)).toEqual([150]);
    });
  });

  describe('the OAuth token', () => {
    it('is requested once with the client-credentials grant and reused', async () => {
      const { http, post } = fakeHttp({ itemSummaries: [] });
      const adapter = new EbayApiAdapter({ ...credentials, http });

      await adapter.getCompetitorPrices('A');
      await adapter.getCompetitorPrices('B');
      await adapter.getCompetitorPrices('C');

      expect(post).toHaveBeenCalledTimes(1);
      const [url, body, options] = post.mock.calls[0];
      expect(url).toBe('/identity/v1/oauth2/token');
      expect(body).toContain('grant_type=client_credentials');
      expect(options.headers.Authorization).toBe(`Basic ${Buffer.from('id:secret').toString('base64')}`);
      expect(options.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    });

    it('is refreshed once it has expired', async () => {
      const { http, post } = fakeHttp({ itemSummaries: [] }, { access_token: 'tok', expires_in: 120 });
      let clock = 1_000_000;
      const adapter = new EbayApiAdapter({ ...credentials, http, now: () => clock });

      await adapter.getCompetitorPrices('A');
      clock += 59_000; // still inside the 60-second safety margin
      await adapter.getCompetitorPrices('B');
      expect(post).toHaveBeenCalledTimes(1);

      clock += 5_000; // now past it
      await adapter.getCompetitorPrices('C');
      expect(post).toHaveBeenCalledTimes(2);
    });

    it('fails loudly when the token endpoint returns no token', async () => {
      const { http } = fakeHttp({ itemSummaries: [] }, { error: 'invalid_client' });
      await expect(new EbayApiAdapter({ ...credentials, http }).getCompetitorPrices('A')).rejects.toThrow(
        /no access_token/
      );
    });
  });
});
