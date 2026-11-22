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

export interface IInventoryUnit {
  /** Generated unit code, e.g. PST-0042-07. */
  unitId: string;
  /** Code printed on the label: the custom barcode when set, else `unitId`. */
  barcode: string;
  /** The sign company's own barcode for this unit (optional). */
  customBarcode?: string;
  /** Older codes that still scan (e.g. PST-0042-001). */
  legacyCodes?: string[];
  status: string;
  notes?: string;
  updatedAt?: string;
}

export interface IInventoryDocument extends Document {
  product: string;
  itemType?: string;
  size: string;
  owner: string;
  assignedAgent?: string;
  assignedAgentId?: mongoose.Types.ObjectId | string;
  itemId?: string;
  ownerType?: "Agent" | "Office" | "Sign company";
  ownerId?: string;
  /** Legacy single post type; kept equal to `compatiblePostTypes[0]`. */
  postType?: string;
  /** Post types (Sign post item names) this main panel / rider can be mounted on. Empty = not restricted. */
  compatiblePostTypes?: string[];
  /** Rider thickness. */
  ply?: string;
  ownerLinkChecked?: boolean;
  units?: IInventoryUnit[];
  office?: string;
  /** Code printed on the item label: `customBarcode` when set, else `itemId`. */
  barcode?: string;
  /** The sign company's own barcode for this item (optional). */
  customBarcode?: string;
  /** Older codes that still scan (e.g. BAR-123456). */
  legacyCodes?: string[];
  available: number;
  installed: number;
  total: number;
  location: string;
  status: string;
  imageUrl?: string;
  publicId?: string;
  qrCode?: string;
  serialNo?: string;
  shelveNo?: string;
  unitPrice?: string;
  rentalPrice?: string;
  removalPrice?: string;
  installPrice?: string;
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
  /** Personnel @mentioned in `notes` (set by inventory.notes.ts). */
  notesMentions?: string[];
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
    assignedAgent: { type: String, default: '', trim: true },
    assignedAgentId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    office: { type: String, default: '' },
    barcode: { type: String, default: '', index: true },
    customBarcode: { type: String, default: '', trim: true },
    legacyCodes: { type: [String], default: [], index: true },
    available: { type: Number, required: true, default: 0 },
    installed: { type: Number, required: true, default: 0 },
    total: { type: Number, required: true, default: 0 },
    location: { type: String, default: 'Warehouse-1 (Aisle 2, Bin 12)' },
    status: { type: String, default: 'In Stock', trim: true },
    imageUrl: { type: String, default: '' },
    publicId: { type: String, default: '' },
    qrCode: { type: String, default: '' },
    serialNo: { type: String, default: '' },
    shelveNo: { type: String, default: '' },
    unitPrice: { type: String, default: '$100.00' },
    rentalPrice: { type: String, default: '' },
    removalPrice: { type: String, default: '' },
    installPrice: { type: String, default: '' },
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
    notesMentions: { type: [String], default: [] },
    allowCustomization: { type: Boolean, default: false },
    itemId: { type: String, index: true, sparse: true, unique: true },
    ownerType: { type: String, enum: ['Agent', 'Office', 'Sign company'], default: 'Sign company' },
    ownerId: { type: String, default: '', index: true },
    postType: { type: String, default: '' },
    compatiblePostTypes: { type: [String], default: [] },
    ply: { type: String, enum: ['', 'Single Ply', 'Double Ply'], default: '' },
    ownerLinkChecked: { type: Boolean, default: false },
    units: [
      {
        unitId: { type: String },
        barcode: { type: String, index: true },
        customBarcode: { type: String, default: '' },
        legacyCodes: { type: [String], default: [] },
        status: { type: String, default: 'Available' },
        notes: { type: String, default: '' },
        updatedAt: { type: String, default: '' },
        _id: false,
      },
    ],
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
