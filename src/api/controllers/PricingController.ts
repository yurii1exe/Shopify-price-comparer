import { Request, Response } from 'express';
import { Services } from '../../container';
import { isPricingStrategy, PRICING_STRATEGIES } from '../../application/services/PriceUpdateService';

export class PricingController {
  constructor(private services: Services) {}

  /** POST /api/pricing/sync — pull the catalogue from Shopify into the local collection. */
  sync = async (_req: Request, res: Response): Promise<void> => {
    const result = await this.services.catalogSyncService.sync();
    res.status(200).json(result);
  };

  /** POST /api/pricing/compare — collect competitor prices for every stored product. */
  compare = async (_req: Request, res: Response): Promise<void> => {
    if (this.services.sources.length === 0) {
      res.status(503).json({
        error: 'No competitor price sources are configured',
        detail: 'Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET to enable the eBay source.',
      });
      return;
    }
    const result = await this.services.comparisonService.compareAllProducts();
    res.status(200).json({ sources: this.services.sources.map((s) => s.name), ...result });
  };

  /** POST /api/pricing/update — apply a pricing rule and write the results to Shopify. */
  update = async (req: Request, res: Response): Promise<void> => {
    const { strategy, dryRun, maxChangePercent } = req.body ?? {};

    if (!isPricingStrategy(strategy)) {
      res.status(400).json({
        error: 'Unknown pricing strategy',
        received: strategy ?? null,
        expected: PRICING_STRATEGIES,
      });
      return;
    }

    if (maxChangePercent !== undefined && (typeof maxChangePercent !== 'number' || maxChangePercent < 0)) {
      res.status(400).json({ error: 'maxChangePercent must be a non-negative number' });
      return;
    }

    const result = await this.services.priceUpdateService.updatePrices(strategy, {
      dryRun: dryRun === true,
      ...(maxChangePercent !== undefined ? { maxChangePercent } : {}),
    });

    res.status(200).json(result);
  };
}
