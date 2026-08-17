import { createApp } from './app';
import { buildServices } from './container';
import { connectDB, disconnectDB } from './infrastructure/db/mongo';
import { ConfigError, loadConfig, loadDotEnv } from './shared/config/config';

async function main(): Promise<void> {
  loadDotEnv();

  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }

  await connectDB(config.mongoUri);
  console.log('Connected to MongoDB');

  const services = buildServices(config);
  const app = createApp(services, config);

  const server = app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
    console.log(
      `Competitor sources: ${services.sources.length > 0 ? services.sources.map((s) => s.name).join(', ') : 'none configured'}`
    );
    console.log(`Shopify webhooks: ${config.shopify.webhookSecret ? 'enabled' : 'disabled (no SHOPIFY_WEBHOOK_SECRET)'}`);
    console.log(
      `Pricing routes: ${config.pricing.apiKey ? 'X-Api-Key required' : 'not configured (set PRICING_API_KEY)'}`
    );
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`${signal} received, shutting down`);
    server.close();
    await disconnectDB();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('Failed to start:', error);
  process.exit(1);
});
