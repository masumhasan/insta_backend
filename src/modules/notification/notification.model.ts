import mongoose, { Document, Schema } from 'mongoose';

export interface INotificationDocument extends Document {
  recipientUserId?: string;
  recipientEmail?: string;
  recipientRole?: string;
  title: string;
  message: string;
  type: 'mention' | 'order' | 'approval' | 'team_lead' | 'due_date' | 'system';
  referenceId?: string;
  read: boolean;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotificationDocument>(
  {
    recipientUserId: { type: String, default: '', index: true },
    recipientEmail: { type: String, default: '', index: true },
    recipientRole: { type: String, default: '', index: true },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ['mention', 'order', 'approval', 'team_lead', 'due_date', 'system'],
      default: 'system',
    },
    referenceId: { type: String, default: '' },
    read: { type: Boolean, default: false, index: true },
    createdBy: { type: String, default: 'System' },
  },
  { timestamps: true }
);

export const Notification = mongoose.model<INotificationDocument>('Notification', notificationSchema);

