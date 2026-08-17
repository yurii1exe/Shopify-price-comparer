import { IProductRepository } from '../../domain/repositories/IProductRepository';
import { ShopifyApi } from '../../infrastructure/shopify/ShopifyApi';
import { average, median, min, max, roundToCents, trimOutliers } from '../../shared/utils/mathUtils';

export const PRICING_STRATEGIES = ['average', 'min', 'max', 'median'] as const;
export type PricingStrategy = (typeof PRICING_STRATEGIES)[number];

export function isPricingStrategy(value: unknown): value is PricingStrategy {
  return typeof value === 'string' && (PRICING_STRATEGIES as readonly string[]).includes(value);
}

const RULES: Record<PricingStrategy, (values: number[]) => number> = {
  average,
  min,
  max,
  median,
};

export interface PriceUpdateOptions {
  /**
   * Refuse any single move larger than this percentage of the current price.
   * A repricer that takes an unbounded instruction from a competitor feed is
   * one bad feed away from selling the catalogue at a tenth of cost.
   */
  maxChangePercent: number;
  /** Compute and report, write nothing to Shopify or the database. */
  dryRun?: boolean;
}

export interface PriceChange {
  shopifyId: string;
  variantId: number;
  title: string;
  from: number;
  to: number;
}

export interface SkippedProduct {
  shopifyId: string;
  title: string;
  reason:
    | 'no-competitor-prices'
    | 'unchanged'
    | 'exceeds-max-change'
    | 'invalid-price'
    | 'min-not-corroborated';
  proposed?: number;
}

export interface PriceUpdateResult {
  strategy: PricingStrategy;
  dryRun: boolean;
  productsExamined: number;
  changes: PriceChange[];
  skipped: SkippedProduct[];
  failures: { shopifyId: string; error: string }[];
}

export class PriceUpdateService {
  constructor(
    private productRepo: IProductRepository,
    private shopifyApi: ShopifyApi,
    private options: PriceUpdateOptions
  ) {}

  async updatePrices(strategy: PricingStrategy, overrides: Partial<PriceUpdateOptions> = {}): Promise<PriceUpdateResult> {
    const maxChangePercent = overrides.maxChangePercent ?? this.options.maxChangePercent;
    const dryRun = overrides.dryRun ?? this.options.dryRun ?? false;

    const products = await this.productRepo.getAll();
    const result: PriceUpdateResult = {
      strategy,
      dryRun,
      productsExamined: products.length,
      changes: [],
      skipped: [],
      failures: [],
    };

    for (const product of products) {
      if (product.competitorPrices.length === 0) {
        result.skipped.push({ shopifyId: product.shopifyId, title: product.title, reason: 'no-competitor-prices' });
        continue;
      }

      // One listing that is not the product is enough to move an average and
      // enough to define a minimum, so the obvious outliers go before the rule.
      const prices = trimOutliers(product.competitorPrices);

      if (strategy === 'min' && !isCorroborated(prices)) {
        result.skipped.push({
          shopifyId: product.shopifyId,
          title: product.title,
          reason: 'min-not-corroborated',
          proposed: roundToCents(min(prices)),
        });
        continue;
      }

      const newPrice = roundToCents(RULES[strategy](prices));

      if (!Number.isFinite(newPrice) || newPrice <= 0) {
        result.skipped.push({
          shopifyId: product.shopifyId,
          title: product.title,
          reason: 'invalid-price',
          proposed: newPrice,
        });
        continue;
      }

      if (newPrice === roundToCents(product.currentPrice)) {
        result.skipped.push({ shopifyId: product.shopifyId, title: product.title, reason: 'unchanged' });
        continue;
      }

      if (exceedsLimit(product.currentPrice, newPrice, maxChangePercent)) {
        result.skipped.push({
          shopifyId: product.shopifyId,
          title: product.title,
          reason: 'exceeds-max-change',
          proposed: newPrice,
        });
        continue;
      }

      const change: PriceChange = {
        shopifyId: product.shopifyId,
        variantId: product.variantId,
        title: product.title,
        from: product.currentPrice,
        to: newPrice,
      };

      if (dryRun) {
        result.changes.push(change);
        continue;
      }

      try {
        // Shopify is written first. If the database were written first and the
        // Shopify call then failed, the store would be recorded as holding a
        // price it never had, and the next run would compute against a fiction.
        await this.shopifyApi.updateProductVariantPrice(product.variantId, newPrice.toFixed(2));
        product.currentPrice = newPrice;
        product.lastPriceUpdate = new Date();
        product.priceChanged = true;
        await this.productRepo.createOrUpdate(product);
        await this.productRepo.markPriceChanged(product.shopifyId, true);
        result.changes.push(change);
      } catch (error) {
        result.failures.push({
          shopifyId: product.shopifyId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }
}

/**
 * The smallest sample `min` is allowed to run over. Below this the lowest
 * price is not a market floor, it is one listing.
 */
export const MIN_STRATEGY_SAMPLE_SIZE = 3;

/**
 * How far below the sample's median the lowest price may sit and still be
 * treated as a real price rather than a bad match.
 */
export const MIN_STRATEGY_MEDIAN_RATIO = 0.6;

/**
 * `min` is the most dangerous rule and the least defended one. Every other
 * rule survives one junk match — the median ignores it, the average is dragged
 * a little — but `min` is *defined* by the worst match in the sample, so the
 * one listing the filters failed to catch becomes the shop price.
 *
 * So the lowest price has to be corroborated: enough listings to have a
 * distribution, and a minimum that sits within reach of that distribution's
 * middle. A product that fails this is skipped and reported with the price it
 * would have set, the same way an over-large move is.
 */
function isCorroborated(prices: number[]): boolean {
  if (prices.length < MIN_STRATEGY_SAMPLE_SIZE) return false;
  const middle = median(prices);
  if (middle <= 0) return false;
  return min(prices) >= middle * MIN_STRATEGY_MEDIAN_RATIO;
}

function exceedsLimit(currentPrice: number, newPrice: number, maxChangePercent: number): boolean {
  if (maxChangePercent <= 0) return false;
  if (!Number.isFinite(currentPrice) || currentPrice <= 0) return false;
  const delta = Math.abs(newPrice - currentPrice) / currentPrice;
  return delta * 100 > maxChangePercent;
}
