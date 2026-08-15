import axios, { AxiosInstance } from 'axios';

// Types for the data returned by the Shopify API
interface ShopifyProductVariant {
  id: number;
  title: string;
  price: string;
  // ... other fields
}

interface ShopifyProduct {
  id: number;
  title: string;
  variants: ShopifyProductVariant[];
  // ... other fields
}

export class ShopifyApi {
  private client: AxiosInstance;

  constructor(
    private storeName: string,
    private accessToken: string,
    private apiVersion: string = '2023-07' // Example API version
  ) {
    this.client = axios.create({
      baseURL: `https://${storeName}.myshopify.com/admin/api/${this.apiVersion}`,
      headers: {
        'X-Shopify-Access-Token': this.accessToken,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Fetch all products from Shopify.
   * Pagination can be added if the catalogue exceeds one page.
   */
  async getAllProducts(): Promise<ShopifyProduct[]> {
    try {
      const response = await this.client.get('/products.json', {
        params: {
          limit: 250, // maximum number of products in a single request
        },
      });

      // response.data.products is the array of products from Shopify
      return response.data.products;
    } catch (error: any) {
      console.error('Error fetching products from Shopify:', error);
      throw new Error('Failed to fetch products from Shopify');
    }
  }

  /**
   * Update the price of a product variant.
   * @param variantId ID of the product variant
   * @param newPrice New price as a string (for example "19.99")
   */
  async updateProductVariantPrice(
    variantId: number,
    newPrice: string
  ): Promise<void> {
    try {
      const payload = {
        variant: {
          id: variantId,
          price: newPrice,
        },
      };

      await this.client.put(`/variants/${variantId}.json`, payload);
    } catch (error: any) {
      console.error(`Error updating price for variant ${variantId}:`, error);
      throw new Error('Failed to update variant price');
    }
  }

  /**
   * Search for products by title or SKU using query filters.
   * The title parameter is used as the search term.
   */
  async searchProductsByTitle(title: string): Promise<ShopifyProduct[]> {
    try {
      const response = await this.client.get('/products.json', {
        params: {
          title,
          limit: 50,
        },
      });
      return response.data.products;
    } catch (error: any) {
      console.error(`Error searching products by title "${title}":`, error);
      throw new Error('Failed to search products by title');
    }
  }
}
