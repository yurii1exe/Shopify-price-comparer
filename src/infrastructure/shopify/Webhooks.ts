import { createHmac, timingSafeEqual } from 'crypto';
import { PriceComparisonService } from '../../application/services/PriceComparisonService';
import { Product } from '../../domain/entities/Product';
import { ShopifyProductMapper } from './ShopifyProductMapper';
import { ShopifyProduct } from './ShopifyApi';

/**
 * Verify the `X-Shopify-Hmac-Sha256` header against the raw request body.
 *
 * Three things have to be right or this silently accepts anything:
 *
 * 1. **The raw bytes.** The digest is over the body exactly as sent. Once
 *    `express.json()` has parsed and re-serialised it, key order and whitespace
 *    are no longer guaranteed and the digest will not match — so the webhook
 *    route mounts `express.raw()` and nothing else.
 * 2. **Constant-time comparison.** `===` on a digest leaks how many leading
 *    bytes were right, which is enough to forge one byte at a time.
 * 3. **Equal lengths first.** `timingSafeEqual` throws on a length mismatch, so
 *    a short header would become a 500 rather than a rejection.
 */
export function verifyShopifyWebhook(rawBody: Buffer, hmacHeader: string | undefined, secret: string): boolean {
  if (!hmacHeader || !secret) return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest();
  let received: Buffer;
  try {
    received = Buffer.from(hmacHeader, 'base64');
  } catch {
    return false;
  }

  if (received.length !== expected.length) return false;
  return timingSafeEqual(received, expected);
}

/**
 * `products/create`: a product that has just appeared in the store has no
 * competitor prices, so it cannot be repriced by the next run. This gives it
 * some.
 */
export class ProductCreatedHandler {
  constructor(private comparisonService: PriceComparisonService) {}

  async handle(payload: ShopifyProduct): Promise<Product> {
    const product = ShopifyProductMapper.toDomain(payload);
    return this.comparisonService.compareProduct(product);
  }
}
