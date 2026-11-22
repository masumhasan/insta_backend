import mongoose, { Document, Schema } from 'mongoose';

export const PACKAGE_CATEGORIES = ['media', 'open_house', 'for_sale'] as const;
export type PackageCategory = (typeof PACKAGE_CATEGORIES)[number];

export interface IPackageDocument extends Document {
  title: string;
  category: PackageCategory;
  linkedServices: { id: string; name: string; price?: number; image?: string; icon?: string; active?: boolean }[];
  price: number;
  imageUrl?: string;
  publicId?: string;
  description?: string;
  visibility: 'agent' | 'office' | 'all';
  agents: string[];
  offices: string[];
  features: { id: string; name: string }[];
  /** Onsite minutes for the Media Services schedule; 0 = sum of the featured services' durations. */
  durationMinutes?: number;
  createdAt: Date;
  updatedAt: Date;
}

const packageSchema = new Schema<IPackageDocument>(
  {
    title: { type: String, required: true, trim: true },
    // Which Packages tab / order form the package belongs to.
    category: { type: String, enum: PACKAGE_CATEGORIES, default: 'media', index: true },
    // Optional upsell services shown with the package on the order page.
    linkedServices: [
      {
        _id: false,
        id: { type: String },
        name: { type: String, required: true },
        price: { type: Number, default: 0 },
        image: { type: String, default: '' },
        icon: { type: String, default: '' },
        active: { type: Boolean, default: true },
      },
    ],
    price: { type: Number, required: true, default: 0 },
    durationMinutes: { type: Number, default: 0, min: 0 },
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
