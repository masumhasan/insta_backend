import mongoose, { Document, Schema } from 'mongoose';

export interface IReturnRecordDocument extends Document {
  inventoryId?: string;
  itemName: string;
  orderId?: string;
  quantity: number;
  condition: 'reusable' | 'repair' | 'damaged' | 'scrap' | 'new_item';
  queueType: 'new_item' | 'repair' | 'damaged' | 'reusable';
  status: 'Pending Review' | 'Processed' | 'Restored & Added to Inventory' | 'Permanently Decommissioned';
  agent?: string;
  office?: string;
  recoveredFrom?: string;
  recoveredBy?: string;
  inspectionNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const returnRecordSchema = new Schema<IReturnRecordDocument>(
  {
    inventoryId: { type: String, default: '' },
    itemName: { type: String, required: true, trim: true },
    orderId: { type: String, default: '' },
    quantity: { type: Number, default: 1 },
    condition: {
      type: String,
      enum: ['reusable', 'repair', 'damaged', 'scrap', 'new_item'],
      default: 'reusable',
    },
    queueType: {
      type: String,
      enum: ['new_item', 'repair', 'damaged', 'reusable'],
      default: 'reusable',
    },
    status: {
      type: String,
      enum: ['Pending Review', 'Processed', 'Restored & Added to Inventory', 'Permanently Decommissioned'],
      default: 'Pending Review',
      index: true,
    },
    agent: { type: String, default: 'Instapost LLC' },
    office: { type: String, default: 'Main Office' },
    recoveredFrom: { type: String, default: '' },
    recoveredBy: { type: String, default: '' },
    inspectionNotes: { type: String, default: '' },
  },
  { timestamps: true }
);

export const ReturnRecord = mongoose.model<IReturnRecordDocument>('ReturnRecord', returnRecordSchema);

