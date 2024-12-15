import { Request, Response } from 'express';
import { ProductRepository } from '../../infrastructure/repositories/ProductRepository';
import { PriceUpdateService } from '../../application/services/PriceUpdateService';
import { ShopifyApi } from '../../infrastructure/shopify/ShopifyApi';

const productRepo = new ProductRepository();
const shopifyApi = new ShopifyApi();
const priceUpdateService = new PriceUpdateService(productRepo, shopifyApi);

export const updatePrices = async (req: Request, res: Response) => {
  const { strategy } = req.body; // 'average' | 'min' | 'max' | 'median'
  await priceUpdateService.updatePrices(strategy);
  res.status(200).json({ message: 'Prices updated successfully' });
};
