import mongoose, { Document, Schema } from 'mongoose';

export interface IPackageDocument extends Document {
  title: string;
  price: number;
  imageUrl?: string;
  publicId?: string;
  description?: string;
  visibility: 'agent' | 'office' | 'all';
  agents: string[];
  offices: string[];
  features: { id: string; name: string }[];
  createdAt: Date;
  updatedAt: Date;
}

const packageSchema = new Schema<IPackageDocument>(
  {
    title: { type: String, required: true, trim: true },
    price: { type: Number, required: true, default: 0 },
    imageUrl: { type: String, default: '' },
    publicId: { type: String, default: '' },
    description: { type: String, default: '' },
    visibility: { type: String, enum: ['agent', 'office', 'all'], default: 'all' },
    agents: [{ type: String }],
    offices: [{ type: String }],
    features: [
      {
        id: { type: String, default: () => Math.random().toString(36).substring(7) },
        name: { type: String, required: true },
      },
    ],
  },
  { timestamps: true }
);

export const Package = mongoose.model<IPackageDocument>('Package', packageSchema);
