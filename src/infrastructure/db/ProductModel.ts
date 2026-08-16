import { Document, Schema, model } from 'mongoose';
import { Product } from '../../domain/entities/Product';

/** The Mongoose document. Identical fields to {@link Product}, plus what Mongoose adds. */
export interface ProductDocument extends Document, Omit<Product, 'lastPriceUpdate'> {
  lastPriceUpdate: Date | null;
}

const ProductSchema = new Schema<ProductDocument>(
  {
    shopifyId: { type: String, required: true, unique: true, index: true },
    variantId: { type: Number, required: true },
    title: { type: String, required: true },
    currentPrice: { type: Number, required: true },
    competitorPrices: { type: [Number], default: [] },
    lastPriceUpdate: { type: Date, default: null },
    priceChanged: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const ProductModel = model<ProductDocument>('Product', ProductSchema);

/** Strip the document down to the domain shape. */
export function toDomain(doc: ProductDocument): Product {
  return {
    shopifyId: doc.shopifyId,
    variantId: doc.variantId,
    title: doc.title,
    currentPrice: doc.currentPrice,
    competitorPrices: [...doc.competitorPrices],
    lastPriceUpdate: doc.lastPriceUpdate,
    priceChanged: doc.priceChanged,
  };
}
