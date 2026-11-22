import mongoose, { Document, Schema, Types } from 'mongoose';

/** A testimonial shown in the landing page reviews strip, managed by staff. */
export interface IReviewDocument extends Document {
  reviewerName: string;
  reviewerTitle?: string;
  imageUrl?: string;
  publicId?: string;
  rating: number;
  text: string;
  taggedUser?: Types.ObjectId | null;
  displayOrder: number;
  published: boolean;
  createdBy?: string;
}

const reviewSchema = new Schema<IReviewDocument>(
  {
    reviewerName: { type: String, required: true, trim: true, maxlength: 120 },
    reviewerTitle: { type: String, default: '', trim: true, maxlength: 120 },
    imageUrl: { type: String, default: '' },
    publicId: { type: String, default: '' },
    rating: { type: Number, required: true, min: 1, max: 5, default: 5 },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    taggedUser: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    displayOrder: { type: Number, default: 0, index: true },
    published: { type: Boolean, default: false, index: true },
    createdBy: { type: String, default: '' },
  },
  { timestamps: true }
);

export const Review = mongoose.model<IReviewDocument>('Review', reviewSchema);
