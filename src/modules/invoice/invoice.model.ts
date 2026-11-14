import mongoose, { Document, Schema } from 'mongoose';

export type ClientPaymentStatus = 'Paid' | 'Unpaid' | 'Failed' | 'Refunded' | 'Partially Refunded';

export interface IInvoiceRefund {
  id: string;
  type: 'full' | 'partial';
  amount: number;
  reason: string;
  createdAt: string;
}

export interface IInvoiceLineItem {
  label: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface IClientInvoiceDocument extends Document {
  invoiceNo: string;
  orderId: string;
  clientName: string;
  clientEmail: string;
  address: string;
  type: string;
  orderDate: string;
  dueDate: string;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  price: number;
  payment: ClientPaymentStatus;
  paymentMethod: string;
  paymentDate: string;
  paymentReference: string;
  notes: string;
  lineItems: IInvoiceLineItem[];
  refunds: IInvoiceRefund[];
  createdAt: Date;
  updatedAt: Date;
}

const clientInvoiceSchema = new Schema<IClientInvoiceDocument>(
  {
    invoiceNo: { type: String, required: true, unique: true, index: true },
    orderId: { type: String, default: '', index: true },
    clientName: { type: String, required: true, default: 'Client' },
    clientEmail: { type: String, default: '' },
    address: { type: String, default: '' },
    type: { type: String, required: true, default: 'Installation' },
    orderDate: { type: String, default: () => new Date().toISOString().split('T')[0] },
    dueDate: { type: String, default: '' },
    subtotal: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    price: { type: Number, required: true, default: 0 },
    payment: {
      type: String,
      enum: ['Paid', 'Unpaid', 'Failed', 'Refunded', 'Partially Refunded'],
      default: 'Unpaid',
      index: true,
    },
    paymentMethod: { type: String, default: '' },
    paymentDate: { type: String, default: '' },
    paymentReference: { type: String, default: '' },
    notes: { type: String, default: '' },
    lineItems: [
      {
        _id: false,
        label: { type: String, required: true },
        quantity: { type: Number, default: 1 },
        unitPrice: { type: Number, default: 0 },
        total: { type: Number, default: 0 },
      },
    ],
    refunds: [
      {
        _id: false,
        id: { type: String, required: true },
        type: { type: String, enum: ['full', 'partial'], required: true },
        amount: { type: Number, required: true },
        reason: { type: String, default: '' },
        createdAt: { type: String, required: true },
      },
    ],
  },
  { timestamps: true }
);

export const ClientInvoice = mongoose.model<IClientInvoiceDocument>('ClientInvoice', clientInvoiceSchema);

export interface ITechServiceLine {
  id: string;
  name: string;
  category: 'base' | 'addon';
  icon?: 'camera' | 'video' | 'wrench';
  subtitle?: string;
  payout: number;
  overrideAmount: number | null;
  overrideReason: string;
  enabled: boolean;
}

export interface ITechCustomFee {
  id: string;
  amount: number;
  reason: string;
}

export interface ITechAppointment {
  id: string;
  orderId: string;
  address: string;
  date: string;
  dateTimeLabel: string;
  aboveGroundSqFt: number;
  belowGroundSqFt: number;
  services: ITechServiceLine[];
  customFees: ITechCustomFee[];
  mileageFee: number;
}

export interface ITechnicianInvoiceDocument extends Document {
  invoiceNumber: string;
  technicianName: string;
  technicianEmail: string;
  technicianAvatar: string;
  role: 'Installer' | 'Photographer';
  dateRange: string;
  periodStart: string;
  periodEnd: string;
  edited: 'Yes' | 'No';
  status: 'pending' | 'paid';
  paidAt: string;
  paymentMethod: string;
  paymentReference: string;
  mileageTotal: number;
  billableMileage: number;
  mileageCost: number;
  mileageOverride: {
    amount: number | null;
    note: string;
    isOverridden: boolean;
  };
  appointmentList: ITechAppointment[];
  servicesTotal: number;
  mileageTotalFee: number;
  charge: number;
  createdAt: Date;
  updatedAt: Date;
}

const technicianInvoiceSchema = new Schema<ITechnicianInvoiceDocument>(
  {
    invoiceNumber: { type: String, required: true, unique: true, index: true },
    technicianName: { type: String, required: true, index: true },
    technicianEmail: { type: String, default: '' },
    technicianAvatar: { type: String, default: '' },
    role: { type: String, enum: ['Installer', 'Photographer'], required: true, default: 'Installer' },
    dateRange: { type: String, required: true },
    periodStart: { type: String, default: '' },
    periodEnd: { type: String, default: '' },
    edited: { type: String, enum: ['Yes', 'No'], default: 'No' },
    status: { type: String, enum: ['pending', 'paid'], default: 'pending', index: true },
    paidAt: { type: String, default: '' },
    paymentMethod: { type: String, default: '' },
    paymentReference: { type: String, default: '' },
    mileageTotal: { type: Number, default: 0 },
    billableMileage: { type: Number, default: 0 },
    mileageCost: { type: Number, default: 0 },
    mileageOverride: {
      amount: { type: Number, default: null },
      note: { type: String, default: '' },
      isOverridden: { type: Boolean, default: false },
    },
    appointmentList: [
      {
        _id: false,
        id: { type: String, required: true },
        orderId: { type: String, default: '' },
        address: { type: String, required: true },
        date: { type: String, required: true },
        dateTimeLabel: { type: String, default: '' },
        aboveGroundSqFt: { type: Number, default: 0 },
        belowGroundSqFt: { type: Number, default: 0 },
        services: [
          {
            _id: false,
            id: { type: String, required: true },
            name: { type: String, required: true },
            category: { type: String, enum: ['base', 'addon'], default: 'base' },
            icon: { type: String, enum: ['camera', 'video', 'wrench'], default: 'wrench' },
            subtitle: { type: String, default: '' },
            payout: { type: Number, default: 0 },
            overrideAmount: { type: Number, default: null },
            overrideReason: { type: String, default: '' },
            enabled: { type: Boolean, default: true },
          },
        ],
        customFees: [
          {
            _id: false,
            id: { type: String, required: true },
            amount: { type: Number, default: 0 },
            reason: { type: String, default: '' },
          },
        ],
        mileageFee: { type: Number, default: 0 },
      },
    ],
    servicesTotal: { type: Number, default: 0 },
    mileageTotalFee: { type: Number, default: 0 },
    charge: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const TechnicianInvoice = mongoose.model<ITechnicianInvoiceDocument>('TechnicianInvoice', technicianInvoiceSchema);

