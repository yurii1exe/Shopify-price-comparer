import express from 'express';
import bodyParser from 'body-parser';
import { connectDB } from './infrastructure/db/mongo';
import pricingRoutes from './interfaces/routes/PricingRoutes';
import { config } from './shared/config/config';

const app = express();

app.use(bodyParser.json());
app.use('/api/pricing', pricingRoutes);

connectDB();

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});
