import { ConfigError, loadConfig } from '../src/shared/config/config';

const minimal = {
  SHOPIFY_STORE_NAME: 'acme',
  SHOPIFY_ACCESS_TOKEN: 'shpat_test',
  MONGODB_URI: 'mongodb://localhost:27017/price-comparer',
};

describe('loadConfig', () => {
  it('reads the required settings and applies defaults', () => {
    const config = loadConfig(minimal);

    expect(config.shopify).toEqual({
      storeName: 'acme',
      accessToken: 'shpat_test',
      apiVersion: '2024-10',
      webhookSecret: null,
    });
    expect(config.port).toBe(3000);
    expect(config.pricing).toEqual({ maxChangePercent: 20, apiKey: null });
  });

  it('leaves the pricing key unset when the variable is absent, and the routes then answer 503', () => {
    expect(loadConfig(minimal).pricing.apiKey).toBeNull();
    expect(loadConfig({ ...minimal, PRICING_API_KEY: '   ' }).pricing.apiKey).toBeNull();
  });

  it('names every missing variable in one error rather than one per restart', () => {
    const error = (() => {
      try {
        loadConfig({});
      } catch (e) {
        return e as ConfigError;
      }
    })();

    expect(error).toBeInstanceOf(ConfigError);
    expect(error!.missing).toEqual(['SHOPIFY_STORE_NAME', 'SHOPIFY_ACCESS_TOKEN', 'MONGODB_URI']);
  });

  it('treats a blank variable as missing', () => {
    expect(() => loadConfig({ ...minimal, SHOPIFY_ACCESS_TOKEN: '   ' })).toThrow(/SHOPIFY_ACCESS_TOKEN/);
  });

  it('leaves eBay unconfigured when no credentials are set, which is not an error', () => {
    expect(loadConfig(minimal).ebay).toBeNull();
  });

  it('configures eBay only when both halves of the credential are present', () => {
    expect(loadConfig({ ...minimal, EBAY_CLIENT_ID: 'id' }).ebay).toBeNull();
    expect(loadConfig({ ...minimal, EBAY_CLIENT_ID: 'id', EBAY_CLIENT_SECRET: 'secret' }).ebay).toEqual({
      clientId: 'id',
      clientSecret: 'secret',
      marketplaceId: 'EBAY_US',
      currency: 'USD',
    });
  });

  it('overrides the defaults from the environment', () => {
    const config = loadConfig({
      ...minimal,
      PORT: '8080',
      SHOPIFY_API_VERSION: '2025-01',
      SHOPIFY_WEBHOOK_SECRET: 'shpss_secret',
      MAX_PRICE_CHANGE_PERCENT: '5',
      PRICING_API_KEY: 'a-shared-secret',
      EBAY_CLIENT_ID: 'id',
      EBAY_CLIENT_SECRET: 'secret',
      EBAY_MARKETPLACE_ID: 'EBAY_GB',
      EBAY_CURRENCY: 'GBP',
    });

    expect(config.port).toBe(8080);
    expect(config.shopify.apiVersion).toBe('2025-01');
    expect(config.shopify.webhookSecret).toBe('shpss_secret');
    expect(config.pricing.maxChangePercent).toBe(5);
    expect(config.pricing.apiKey).toBe('a-shared-secret');
    expect(config.ebay).toMatchObject({ marketplaceId: 'EBAY_GB', currency: 'GBP' });
  });
});
