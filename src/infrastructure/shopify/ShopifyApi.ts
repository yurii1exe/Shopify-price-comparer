import axios, { AxiosInstance } from 'axios';

// Типи для даних з Shopify API
interface ShopifyProductVariant {
  id: number;
  title: string;
  price: string;
  // ... інші поля
}

interface ShopifyProduct {
  id: number;
  title: string;
  variants: ShopifyProductVariant[];
  // ... інші поля
}

export class ShopifyApi {
  private client: AxiosInstance;

  constructor(
    private storeName: string,
    private accessToken: string,
    private apiVersion: string = '2023-07' // Приклад версії API
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
   * Отримати всі продукти з Shopify
   * Можна використати пагінацію, якщо продуктів багато.
   */
  async getAllProducts(): Promise<ShopifyProduct[]> {
    try {
      const response = await this.client.get('/products.json', {
        params: {
          limit: 250, // максимальна кількість продуктів за 1 запит
        },
      });

      // response.data.products - масив продуктів з Shopify
      return response.data.products;
    } catch (error: any) {
      console.error('Error fetching products from Shopify:', error);
      throw new Error('Failed to fetch products from Shopify');
    }
  }

  /**
   * Оновити ціну варіанта продукту
   * @param variantId ID варіанта продукту
   * @param newPrice Нова ціна у форматі рядка (наприклад "19.99")
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
   * Приклад: пошук продукту за назвою або SKU через фільтри (для реальних кейсів).
   * Використовується параметр title для пошуку.
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
