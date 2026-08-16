import * as dotenv from 'dotenv';

export interface EbayConfig {
  clientId: string;
  clientSecret: string;
  marketplaceId: string;
  currency: string;
}

export interface AppConfig {
  port: number;
  mongoUri: string;
  shopify: {
    storeName: string;
    accessToken: string;
    apiVersion: string;
    /** Shared secret for webhook HMAC. Absent means the webhook route is not mounted. */
    webhookSecret: string | null;
  };
  /** Null when no eBay credentials are set: the service runs, that source does not. */
  ebay: EbayConfig | null;
  pricing: {
    maxChangePercent: number;
  };
}

export class ConfigError extends Error {
  constructor(readonly missing: string[]) {
    super(
      `Missing required environment variable${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. ` +
        `Copy .env.example to .env and fill them in.`
    );
    this.name = 'ConfigError';
  }
}

/**
 * Read configuration from the environment.
 *
 * Every missing variable is reported in one error rather than one per restart.
 * A competitor source with no credentials is not an error — it is a source that
 * is switched off, and the rest of the service still works without it.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const missing: string[] = [];
  const required = (name: string): string => {
    const value = env[name]?.trim();
    if (!value) {
      missing.push(name);
      return '';
    }
    return value;
  };

  const storeName = required('SHOPIFY_STORE_NAME');
  const accessToken = required('SHOPIFY_ACCESS_TOKEN');
  const mongoUri = required('MONGODB_URI');

  if (missing.length > 0) throw new ConfigError(missing);

  const ebayClientId = env.EBAY_CLIENT_ID?.trim();
  const ebayClientSecret = env.EBAY_CLIENT_SECRET?.trim();

  return {
    port: Number(env.PORT ?? 3000),
    mongoUri,
    shopify: {
      storeName,
      accessToken,
      apiVersion: env.SHOPIFY_API_VERSION?.trim() || '2024-10',
      webhookSecret: env.SHOPIFY_WEBHOOK_SECRET?.trim() || null,
    },
    ebay:
      ebayClientId && ebayClientSecret
        ? {
            clientId: ebayClientId,
            clientSecret: ebayClientSecret,
            marketplaceId: env.EBAY_MARKETPLACE_ID?.trim() || 'EBAY_US',
            currency: env.EBAY_CURRENCY?.trim() || 'USD',
          }
        : null,
    pricing: {
      maxChangePercent: Number(env.MAX_PRICE_CHANGE_PERCENT ?? 20),
    },
  };
}

/** Load `.env` into `process.env`. Called once, from the entry point. */
export function loadDotEnv(): void {
  dotenv.config();
}
