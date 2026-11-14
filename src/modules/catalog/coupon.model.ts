import mongoose, { Document, Schema } from 'mongoose';

export interface ICouponDocument extends Document {
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  minOrderAmount?: number;
  validUntil?: Date;
  status: 'active' | 'expired' | 'disabled';
  createdAt: Date;
  updatedAt: Date;
}

const couponSchema = new Schema<ICouponDocument>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    discountType: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
    discountValue: { type: Number, required: true, default: 0 },
    minOrderAmount: { type: Number, default: 0 },
    validUntil: { type: Date },
    status: { type: String, enum: ['active', 'expired', 'disabled'], default: 'active' },
  },
  { timestamps: true }
);

export const Coupon = mongoose.model<ICouponDocument>('Coupon', couponSchema);

