import mongoose, { Document, Schema } from 'mongoose';

export interface IInventoryHistoryEntry {
  id: string;
  date: string;
  status: string;
  address: string;
  installer?: string;
  agent?: string;
  notes?: string;
}

export interface IInventoryDocument extends Document {
  product: string;
  itemType?: string;
  size: string;
  owner: string;
  office?: string;
  barcode?: string;
  available: number;
  installed: number;
  total: number;
  location: string;
  imageUrl?: string;
  publicId?: string;
  qrCode?: string;
  serialNo?: string;
  shelveNo?: string;
  unitPrice?: string;
  shipment?: string;
  replacementCost?: string;
  enableReplacementBilling?: boolean;
  hardwareCosts?: Record<string, any>;
  color?: string;
  material?: string;
  postHeight?: string;
  mountType?: string;
  lockboxType?: string;
  comboCode?: string;
  shackleCode?: string;
  riderHeading?: string;
  grommetPlacement?: string;
  additionalSpecs?: string;
  notes?: string;
  allowCustomization?: boolean;
  lastUpdated?: string;
  history?: IInventoryHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const inventorySchema = new Schema<IInventoryDocument>(
  {
    product: { type: String, required: true, trim: true },
    itemType: { type: String, default: 'Sign post' },
    size: { type: String, required: true, default: 'Standard' },
    owner: { type: String, required: true, default: 'Instapost LLC' },
    office: { type: String, default: '' },
    barcode: { type: String, default: '', index: true },
    available: { type: Number, required: true, default: 0 },
    installed: { type: Number, required: true, default: 0 },
    total: { type: Number, required: true, default: 0 },
    location: { type: String, default: 'Warehouse-1 (Aisle 2, Bin 12)' },
    imageUrl: { type: String, default: '' },
    publicId: { type: String, default: '' },
    qrCode: { type: String, default: '' },
    serialNo: { type: String, default: '' },
    shelveNo: { type: String, default: '' },
    unitPrice: { type: String, default: '$100.00' },
    shipment: { type: String, default: '' },
    replacementCost: { type: String, default: '75.00' },
    enableReplacementBilling: { type: Boolean, default: true },
    hardwareCosts: { type: Schema.Types.Mixed, default: {} },
    color: { type: String, default: '' },
    material: { type: String, default: '' },
    postHeight: { type: String, default: '' },
    mountType: { type: String, default: '' },
    lockboxType: { type: String, default: '' },
    comboCode: { type: String, default: '' },
    shackleCode: { type: String, default: '' },
    riderHeading: { type: String, default: '' },
    grommetPlacement: { type: String, default: '' },
    additionalSpecs: { type: String, default: '' },
    notes: { type: String, default: '' },
    allowCustomization: { type: Boolean, default: false },
    lastUpdated: { type: String, default: '' },
    history: [
      {
        id: { type: String },
        date: { type: String },
        status: { type: String },
        address: { type: String },
        installer: { type: String, default: '' },
        agent: { type: String, default: '' },
        notes: { type: String, default: '' },
      },
    ],
  },
  { timestamps: true }
);

export const Inventory = mongoose.model<IInventoryDocument>('Inventory', inventorySchema);
