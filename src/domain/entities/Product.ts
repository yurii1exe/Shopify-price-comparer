import { Document, Schema, model } from 'mongoose';

export interface IProduct extends Document {
  shopifyId: string;
  title: string;
  currentPrice: number;
  competitorPrices: number[];
  lastPriceUpdate: Date;
  priceChanged: boolean;
}

const ProductSchema = new Schema({
  shopifyId: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  currentPrice: { type: Number, required: true },
  competitorPrices: { type: [Number], default: [] },
  lastPriceUpdate: { type: Date, default: null },
  priceChanged: { type: Boolean, default: false },
});

export const Product = model<IProduct>('Product', ProductSchema);
