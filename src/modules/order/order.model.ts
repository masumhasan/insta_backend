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
  /** Set when every pull-list item is verified and the order is marked Ready for Install. */
  pullReadyAt?: Date;
  pullReadyBy?: string;
  pullList?: {
    id: string;
    product: string;
    itemId?: string;
    barcode?: string;
    checkedAt?: string;
    checkedBy?: string;
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
  events?: { type: string; at: Date }[];
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
    pullReadyAt: { type: Date },
    pullReadyBy: { type: String, default: '' },
    pullList: [
      {
        id: { type: String },
        product: { type: String },
        itemId: { type: String, default: '' },
        barcode: { type: String, default: '' },
        checkedAt: { type: String, default: '' },
        checkedBy: { type: String, default: '' },
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
    events: [
      {
        type: { type: String },
        at: { type: Date, default: Date.now },
        _id: false,
      },
    ],
  },
  { timestamps: true }
);

// Records dashboard events (scheduled / confirmed / cancelled / rescheduled / schedule_cancelled)
// whenever an order is saved with a changed status or date.
orderSchema.pre('save', async function (next) {
  try {
    if (this.isNew) return next();

    // Automatic status progression (an explicit status change always wins).
    if (!this.isModified('status')) {
      const cur = String(this.status || '');
      const suffix = /^removal$/i.test(this.type) ? ' Down' : /^(media services|other services)$/i.test(this.type) ? '' : ' Up';
      const hasInstaller = !!String(this.installerName || '').trim();
      const hasSchedule = !!String(this.appointmentTime || '').trim();
      const isHold = /^(on hold|waiting on payment)$/i.test(cur);
      const isEarly = /^(pending|scheduled)/i.test(cur);
      if (isHold && this.isModified('paymentStatus') && this.paymentStatus === 'Paid') {
        // Payment processed → release the hold into the right stage of the pipeline.
        this.status = hasInstaller ? `Assigned${suffix}` : hasSchedule ? `Scheduled${suffix}` : `Pending${suffix}`;
      } else if (isEarly && this.isModified('installerName') && hasInstaller) {
        this.status = `Assigned${suffix}`;
      } else if (/^pending/i.test(cur) && this.isModified('appointmentTime') && hasSchedule) {
        this.status = `Scheduled${suffix}`;
      }
    }

    const statusChanged = this.isModified('status');
    const dateChanged = this.isModified('dueDate') || this.isModified('appointmentTime');
    if (!statusChanged && !dateChanged) return next();

    const now = new Date();
    const add = (type: string) => this.events!.push({ type, at: now });
    const cur = String(this.status || '');
    if (statusChanged) {
      const prevDoc = await mongoose.model('Order').findById(this._id).select('status').lean<{ status?: string }>();
      const prev = String(prevDoc?.status || '');
      if (/^cancelled$/i.test(cur)) add('cancelled');
      else if (/^scheduled/i.test(cur)) add('scheduled');
      else if (/^assigned/i.test(cur)) add('confirmed');
      if (/^(scheduled|assigned)/i.test(prev) && /^pending/i.test(cur)) add('schedule_cancelled');
    } else if (/^(scheduled|assigned)/i.test(cur)) {
      add('rescheduled');
    }
    next();
  } catch (e) {
    next(e as Error);
  }
});

export const Order = mongoose.model<IOrderDocument>('Order', orderSchema);
