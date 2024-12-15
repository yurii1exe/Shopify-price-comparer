import express from 'express';
import { updatePrices } from '../controllers/PricingController';

const router = express.Router();

router.post('/update', updatePrices);

export default router;
