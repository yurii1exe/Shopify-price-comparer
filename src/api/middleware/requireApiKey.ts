import { timingSafeEqual } from 'crypto';
import { RequestHandler } from 'express';

/** Header the pricing routes read the shared secret from. */
export const API_KEY_HEADER = 'X-Api-Key';

/**
 * A shared secret on every pricing route.
 *
 * `/api/pricing/update` reprices a catalogue and writes to a live store, and
 * `/api/pricing/compare` spends somebody's eBay quota. Neither is a public
 * operation, so both carry the same shared secret the operator sets in
 * `PRICING_API_KEY`. `/webhooks/shopify` is the one route designed to be
 * reachable from outside, and it authenticates its own callers by HMAC.
 *
 * The comparison is constant-time for the same reason the webhook's is: `===`
 * on a secret returns as soon as two bytes differ, and that timing is enough
 * to recover the secret one byte at a time.
 *
 * With no key configured the routes answer `503` rather than running
 * unauthenticated, and name the variable to set.
 */
export function requireApiKey(expected: string | null): RequestHandler {
  return (req, res, next) => {
    if (!expected) {
      res.status(503).json({
        error: 'The pricing routes are not configured',
        detail: 'Set PRICING_API_KEY to enable them.',
      });
      return;
    }

    const presented = req.header(API_KEY_HEADER);
    if (!presented || !constantTimeEquals(presented, expected)) {
      res.status(401).json({
        error: 'Missing or invalid API key',
        detail: `Send the shared secret in the ${API_KEY_HEADER} header.`,
      });
      return;
    }

    next();
  };
}

/**
 * Length is compared first because `timingSafeEqual` throws on buffers of
 * different lengths — an unequal length is a rejection, not a 500.
 */
function constantTimeEquals(presented: string, expected: string): boolean {
  const left = Buffer.from(presented, 'utf8');
  const right = Buffer.from(expected, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
