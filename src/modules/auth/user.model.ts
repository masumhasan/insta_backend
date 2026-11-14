import mongoose, { Document, Schema, Model } from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../../config/env';

export const USER_ROLES = [
  'Admin',
  'Sign company',
  'Assistant',
  'Installer',
  'Photographer',
  'Warehouse manager',
  'Agent',
  'Team Lead',
  'Office Manager',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export interface IUserDocument extends Document {
  name: string;
  email: string;
  password?: string;
  phone?: string;
  address?: string;
  role: UserRole;
  company?: string;
  office?: string;
  brokerage?: string;
  imageUrl?: string;
  publicId?: string;
  staffRole?: string;
  parentAgentId?: string;
  paymentMethodPreference?: 'credit_card' | 'invoice_later' | '';
  teamLeadApplication?: {
    status: 'none' | 'pending' | 'approved' | 'rejected';
    companyOffice?: string;
    title?: string;
    streetAddress?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    submittedAt?: string;
  };
  crm?: Record<string, any>;
  permissions?: Record<string, boolean>;
  status: 'active' | 'blocked' | 'pending_approval' | 'pending' | 'rejected';
  failedLoginAttempts: number;
  lockUntil?: Date;
  otp?: string;
  otpExpiry?: Date;
  otpAttempts: number;
  refreshToken?: string;
  joinDate: string;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
  isLocked(): boolean;
  generateAccessToken(): string;
  generateRefreshToken(): string;
}

const userSchema = new Schema<IUserDocument>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    password: { type: String, required: true, select: false },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    role: { type: String, enum: USER_ROLES, default: 'Agent', index: true },
    company: { type: String, default: 'Instapost' },
    office: { type: String, default: '' },
    brokerage: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    publicId: { type: String, default: '' },
    staffRole: { type: String, default: '' },
    parentAgentId: { type: String, default: '', index: true },
    paymentMethodPreference: {
      type: String,
      enum: ['credit_card', 'invoice_later', ''],
      default: '',
    },
    teamLeadApplication: { type: Schema.Types.Mixed, default: { status: 'none' } },
    crm: { type: Schema.Types.Mixed, default: {} },
    permissions: { type: Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ['active', 'blocked', 'pending_approval', 'pending', 'rejected'],
      default: 'active',
      index: true,
    },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    otp: { type: String, select: false },
    otpExpiry: { type: Date, select: false },
    otpAttempts: { type: Number, default: 0, select: false },
    refreshToken: { type: String, select: false },
    joinDate: {
      type: String,
      default: () =>
        new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
    },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.isLocked = function (): boolean {
  return !!(this.lockUntil && this.lockUntil.getTime() > Date.now());
};

userSchema.methods.generateAccessToken = function (): string {
  return jwt.sign(
    { id: this._id, email: this.email, role: this.role, name: this.name, company: this.company },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn as any }
  );
};

userSchema.methods.generateRefreshToken = function (): string {
  return jwt.sign({ id: this._id }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn as any,
  });
};

export const User: Model<IUserDocument> = mongoose.model<IUserDocument>('User', userSchema);
