import { ShopifyProductMapper } from '../src/infrastructure/shopify/ShopifyProductMapper';

const shopifyProduct = {
  id: 8123456789012,
  title: 'Widget',
  variants: [
    { id: 4400112233, title: 'Default', price: '19.99' },
    { id: 4400112234, title: 'Large', price: '29.99' },
  ],
};

describe('ShopifyProductMapper.toDomain', () => {
  it('maps the product and takes the first variant as the one to reprice', () => {
    const product = ShopifyProductMapper.toDomain(shopifyProduct);

    expect(product).toEqual({
      shopifyId: '8123456789012',
      variantId: 4400112233,
      title: 'Widget',
      currentPrice: 19.99,
      competitorPrices: [],
      lastPriceUpdate: null,
      priceChanged: false,
    });
  });

  it('keeps the Shopify ID as a string, because it exceeds what a JS number holds exactly', () => {
    const product = ShopifyProductMapper.toDomain({ ...shopifyProduct, id: 9007199254740993 });
    expect(typeof product.shopifyId).toBe('string');
  });

  it('leaves lastPriceUpdate null rather than inventing a timestamp', () => {
    expect(ShopifyProductMapper.toDomain(shopifyProduct).lastPriceUpdate).toBeNull();
  });

  it('rejects a product with no variants, which has no price to write', () => {
    expect(() => ShopifyProductMapper.toDomain({ id: 1, title: 'Empty', variants: [] })).toThrow(
      /has no variants/
    );
  });

  it('rejects an unparseable price rather than letting NaN into an average', () => {
    expect(() =>
      ShopifyProductMapper.toDomain({ id: 2, title: 'Broken', variants: [{ id: 9, title: 'D', price: '' }] })
    ).toThrow(/unparseable price/);
  });

  it('maps many products', () => {
    const products = ShopifyProductMapper.toDomainMultiple([shopifyProduct, { ...shopifyProduct, id: 42 }]);
    expect(products.map((p) => p.shopifyId)).toEqual(['8123456789012', '42']);
  });
});
