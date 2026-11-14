import mongoose, { Document, Schema } from 'mongoose';

export interface IServiceItemDocument extends Document {
  type:
    | 'service'
    | 'sign_type'
    | 'size'
    | 'delivery_method'
    | 'installer_charge'
    | 'trip_charge'
    | 'variant'
    | 'option'
    | 'brokerage'
    | 'announcement'
    | 'settings_service'
    | 'category'
    | 'service_category'
    | 'faq'
    | 'service_area'
    | 'auto_renew'
    | 'subscriber'
    | 'task_builder'
    | 'terms_pricing'
    | 'academy'
    | 'entry_method';
  name: string;
  category?: string;
  price: number;
  description?: string;
  imageUrl?: string;
  publicId?: string;
  options?: any;
  createdAt: Date;
  updatedAt: Date;
}

const serviceItemSchema = new Schema<IServiceItemDocument>(
  {
    type: {
      type: String,
      required: true,
      enum: [
        'service',
        'sign_type',
        'size',
        'delivery_method',
        'installer_charge',
        'trip_charge',
        'variant',
        'option',
        'brokerage',
        'announcement',
        'settings_service',
        'category',
        'service_category',
        'faq',
        'service_area',
        'auto_renew',
        'subscriber',
        'task_builder',
        'terms_pricing',
        'academy',
        'entry_method',
      ],
      index: true,
    },
    name: { type: String, required: true, trim: true },
    category: { type: String, default: '' },
    price: { type: Number, required: true, default: 0 },
    description: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    publicId: { type: String, default: '' },
    options: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export const ServiceItem = mongoose.model<IServiceItemDocument>('ServiceItem', serviceItemSchema);
