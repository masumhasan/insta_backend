import mongoose, { Document, Schema } from 'mongoose';

export interface IWarehouseDocument extends Document {
  name: string;
  location: string;
  assignedStaff: {
    userId: string;
    name: string;
    designation: string;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const warehouseSchema = new Schema<IWarehouseDocument>(
  {
    name: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    assignedStaff: [
      {
        userId: { type: String, required: true },
        name: { type: String, required: true },
        designation: { type: String, required: true },
      },
    ],
  },
  { timestamps: true }
);

export const Warehouse = mongoose.model<IWarehouseDocument>('Warehouse', warehouseSchema);

