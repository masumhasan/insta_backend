import mongoose, { Document, Schema } from 'mongoose';

export interface IMaterialDocument extends Document {
  name: string;
  price: number;
  category: string;
  vendorName: string;
  purchaseDate: string;
  receivedDate: string;
  unitCost: number;
  createdAt: Date;
  updatedAt: Date;
}

const materialSchema = new Schema<IMaterialDocument>(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, default: 0 },
    category: { type: String, required: true, trim: true },
    vendorName: { type: String, default: '' },
    purchaseDate: { type: String, default: () => new Date().toISOString().split('T')[0] },
    receivedDate: { type: String, default: () => new Date().toISOString().split('T')[0] },
    unitCost: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Material = mongoose.model<IMaterialDocument>('Material', materialSchema);

