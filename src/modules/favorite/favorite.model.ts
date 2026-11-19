import mongoose, { Document, Schema } from 'mongoose';

export interface IFavoriteDocument extends Document {
  /** Owning agent/office — assistants save and use their parent agent's favorites. */
  ownerId: string;
  createdBy: string;
  name: string;
  propertyType: string;
  isDefault: boolean;
  /** Visualizer layout: posts, riders, main panel, lockbox … (item references + display data). */
  layout: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const favoriteSchema = new Schema<IFavoriteDocument>(
  {
    ownerId: { type: String, required: true, index: true },
    createdBy: { type: String, default: '' },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    propertyType: { type: String, default: '', trim: true, maxlength: 60 },
    isDefault: { type: Boolean, default: false },
    layout: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const Favorite = mongoose.model<IFavoriteDocument>('Favorite', favoriteSchema);
