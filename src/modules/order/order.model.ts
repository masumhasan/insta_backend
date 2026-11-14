import mongoose, { Document, Schema } from 'mongoose';

export interface IOrderPhoto {
  imageUrl: string;
  publicId: string;
}

export interface IOrderDocument extends Document {
  orderNumber: string;
  type: string;
  address: string;
  agent: string;
  agentId?: string;
  parentAgentId?: string;
  orderDate: string;
  dueDate: string;
  price: string;
  status: string;
  paymentMethod?: string;
  paymentStatus?: string;
  poNumber?: string;
  subtotal?: number;
  discountAmount?: number;
  rushFee?: number;
  taxAmount?: number;
  totalAmount?: number;
  appointmentTime?: string;
  onsiteDuration?: number;
  notes?: string;
  installerName?: string;
  installerEmail?: string;
  installerId?: string;
  photos?: IOrderPhoto[];
  missingItems?: string[];
  dueDateRequest?: {
    requestedDate?: string;
    reason?: string;
    status?: 'none' | 'pending' | 'approved' | 'rejected';
    requestedBy?: string;
  };
  pullList?: {
    id: string;
    product: string;
    quantity: number;
    owner: string;
    location: string;
    checked: boolean;
    instruction: string;
    imageUrl?: string;
    publicId?: string;
  }[];
  specifications?: any;
  refunds?: {
    id: string;
    type: 'full' | 'partial';
    amount: number;
    reason: string;
    createdAt: string;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const orderPhotoSchema = new Schema<IOrderPhoto>(
  {
    imageUrl: { type: String, required: true },
    publicId: { type: String, default: '' },
  },
  { _id: false }
);

const orderSchema = new Schema<IOrderDocument>(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    type: { type: String, required: true, default: 'Installation' },
    address: { type: String, required: true },
    agent: { type: String, required: true },
    agentId: { type: String },
    parentAgentId: { type: String },
    orderDate: { type: String, default: () => new Date().toLocaleDateString('en-GB') },
    dueDate: { type: String, default: 'Standard' },
    price: { type: String, default: '$150.00' },
    status: { type: String, required: true, default: 'Pending Up', index: true },
    paymentMethod: { type: String, default: 'credit_card' },
    paymentStatus: { type: String, default: 'Paid' },
    poNumber: { type: String, default: '' },
    subtotal: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    rushFee: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    appointmentTime: { type: String, default: '' },
    onsiteDuration: { type: Number, default: 60 },
    notes: { type: String, default: '' },
    installerName: { type: String, default: '', index: true },
    installerEmail: { type: String, default: '', index: true },
    installerId: { type: String, default: '', index: true },
    photos: [orderPhotoSchema],
    missingItems: [{ type: String }],
    dueDateRequest: { type: Schema.Types.Mixed, default: { status: 'none' } },
    pullList: [
      {
        id: { type: String },
        product: { type: String },
        quantity: { type: Number, default: 1 },
        owner: { type: String },
        location: { type: String },
        checked: { type: Boolean, default: false },
        instruction: { type: String, default: '' },
        imageUrl: { type: String, default: '' },
        publicId: { type: String, default: '' },
      },
    ],
    specifications: { type: Schema.Types.Mixed, default: {} },
    refunds: [
      {
        id: { type: String },
        type: { type: String, enum: ['full', 'partial'] },
        amount: { type: Number },
        reason: { type: String },
        createdAt: { type: String },
      },
    ],
  },
  { timestamps: true }
);

export const Order = mongoose.model<IOrderDocument>('Order', orderSchema);
