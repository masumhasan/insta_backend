import mongoose, { Document, Schema } from 'mongoose';

export interface IAppSettingDocument extends Document {
  key: string;
  value: any;
  updatedBy?: string;
}

const appSettingSchema = new Schema<IAppSettingDocument>(
  {
    key: { type: String, required: true, unique: true, index: true },
    value: { type: Schema.Types.Mixed, default: {} },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

export const AppSetting = mongoose.model<IAppSettingDocument>('AppSetting', appSettingSchema);

export interface IMediaTaskDocument extends Document {
  orderNumber?: string;
  address: string;
  client: string;
  taskName: string;
  tags: string[];
  dueDate: string;
  shotBy?: string;
  editor?: string;
  listingPrice?: string;
  notes: { id: string; author: string; createdAt: string; text: string }[];
  media: { gallery: number; videos: number; threeD: number; floorPlan: number; files: number };
  status: string;
  category: string;
  hasActions: boolean;
}

const mediaTaskSchema = new Schema<IMediaTaskDocument>(
  {
    orderNumber: { type: String, default: '', index: true },
    address: { type: String, required: true },
    client: { type: String, required: true },
    taskName: { type: String, required: true },
    tags: [{ type: String }],
    dueDate: { type: String, default: '' },
    shotBy: { type: String, default: '' },
    editor: { type: String, default: '' },
    listingPrice: { type: String, default: '$0.00' },
    notes: [{ id: String, author: String, createdAt: String, text: String }],
    media: {
      gallery: { type: Number, default: 0 },
      videos: { type: Number, default: 0 },
      threeD: { type: Number, default: 0 },
      floorPlan: { type: Number, default: 0 },
      files: { type: Number, default: 0 },
    },
    status: { type: String, default: 'clock' },
    category: { type: String, default: 'photography' },
    hasActions: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const MediaTask = mongoose.model<IMediaTaskDocument>('MediaTask', mediaTaskSchema);

export interface ICalendarEventDocument extends Document {
  date: string;
  time: string;
  photographer: string;
  title: string;
  address?: string;
  durationMinutes: number;
  type: 'appointment' | 'reserved';
}

const calendarEventSchema = new Schema<ICalendarEventDocument>(
  {
    date: { type: String, required: true, index: true },
    time: { type: String, required: true },
    photographer: { type: String, required: true, default: 'All' },
    title: { type: String, required: true },
    address: { type: String, default: '' },
    durationMinutes: { type: Number, default: 60 },
    type: { type: String, enum: ['appointment', 'reserved'], default: 'appointment' },
  },
  { timestamps: true }
);

export const CalendarEvent = mongoose.model<ICalendarEventDocument>('CalendarEvent', calendarEventSchema);

export interface IMediaDeliveryDocument extends Document {
  address: string;
  clientName: string;
  status: 'Delivered' | 'Ready' | 'In Review' | 'Draft';
  galleryUrl?: string;
  photoCount: number;
  videoCount: number;
  orderNumber?: string;
}

const mediaDeliverySchema = new Schema<IMediaDeliveryDocument>(
  {
    address: { type: String, required: true },
    clientName: { type: String, required: true },
    status: { type: String, enum: ['Delivered', 'Ready', 'In Review', 'Draft'], default: 'Ready' },
    galleryUrl: { type: String, default: '' },
    photoCount: { type: Number, default: 0 },
    videoCount: { type: Number, default: 0 },
    orderNumber: { type: String, default: '' },
  },
  { timestamps: true }
);

export const MediaDelivery = mongoose.model<IMediaDeliveryDocument>('MediaDelivery', mediaDeliverySchema);

