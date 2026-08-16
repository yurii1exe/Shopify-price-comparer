import { AxiosInstance } from 'axios';
import { EbayApiAdapter } from '../src/infrastructure/external-apis/EbayApiAdapter';

function itemSummary(value: string, currency = 'USD', shipping?: string) {
  return {
    price: { value, currency },
    ...(shipping !== undefined
      ? { shippingOptions: [{ shippingCost: { value: shipping, currency } }] }
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
  it('returns the price of each fixed-price listing, including reported shipping', async () => {
    const { http, get } = fakeHttp({
      itemSummaries: [itemSummary('19.99', 'USD', '4.50'), itemSummary('21.00', 'USD', '0.00')],
    });

    const prices = await new EbayApiAdapter({ ...credentials, http }).getCompetitorPrices('Widget');

    expect(prices).toEqual([24.49, 21]);
    expect(get).toHaveBeenCalledWith(
      '/buy/browse/v1/item_summary/search',
      expect.objectContaining({
        params: expect.objectContaining({
          q: 'Widget',
          filter: 'buyingOptions:{FIXED_PRICE},priceCurrency:USD',
        }),
      })
    );
  });

  it('sends the marketplace header and the bearer token', async () => {
    const { http, get } = fakeHttp({ itemSummaries: [] });
    await new EbayApiAdapter({ ...credentials, marketplaceId: 'EBAY_GB', http }).getCompetitorPrices('X');

    expect(get.mock.calls[0][1].headers).toEqual({
      Authorization: 'Bearer tok',
      'X-EBAY-C-MARKETPLACE-ID': 'EBAY_GB',
    });
  });

  it('leaves shipping out when configured to compare item price only', async () => {
    const { http } = fakeHttp({ itemSummaries: [itemSummary('19.99', 'USD', '4.50')] });
    const prices = await new EbayApiAdapter({ ...credentials, includeShipping: false, http }).getCompetitorPrices(
      'Widget'
    );
    expect(prices).toEqual([19.99]);
  });

  it('drops listings quoted in another currency rather than converting them', async () => {
    const { http } = fakeHttp({
      itemSummaries: [itemSummary('19.99', 'USD'), itemSummary('18.00', 'EUR'), itemSummary('25.00', 'USD')],
    });
    const prices = await new EbayApiAdapter({ ...credentials, http }).getCompetitorPrices('Widget');
    expect(prices).toEqual([19.99, 25]);
  });

  it('ignores a shipping cost quoted in another currency but keeps the item price', async () => {
    const { http } = fakeHttp({
      itemSummaries: [{ price: { value: '19.99', currency: 'USD' }, shippingOptions: [{ shippingCost: { value: '5.00', currency: 'EUR' } }] }],
    });
    const prices = await new EbayApiAdapter({ ...credentials, http }).getCompetitorPrices('Widget');
    expect(prices).toEqual([19.99]);
  });

  it('skips a listing with an unparseable price', async () => {
    const { http } = fakeHttp({ itemSummaries: [itemSummary('19.99'), { price: { value: 'n/a', currency: 'USD' } }] });
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
