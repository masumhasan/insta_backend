import jwt from 'jsonwebtoken';
import { User, IUserDocument } from './user.model';
import { config } from '../../config/env';
import { AppError } from '../../utils/apiError';
import { sendOtpEmail } from '../../config/mailer';
import { extractImageFields, cleanupReplacedAsset } from '../../utils/imageGuard';

const PORTAL_ALLOWED_ROLES: Record<string, string[]> = {
  admin: ['Admin'],
  sign_company: ['Sign company', 'Office Manager', 'Team Lead'],
  installer: ['Installer', 'Photographer'],
  warehouse: ['Warehouse manager', 'Agent', 'Assistant', 'Team Lead', 'Office Manager'],
};

const PUBLIC_SIGNUP_ROLES = ['Agent', 'Sign company'] as const;

export class AuthService {
  static async login(email: string, candidatePass: string, portal?: string) {
    if (!email || !candidatePass) {
      throw new AppError('Email and password are required.', 400);
    }
    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
    if (!user) {
      throw new AppError('Invalid email or password.', 401);
    }

    if (user.isLocked()) {
      const waitMinutes = Math.ceil(((user.lockUntil?.getTime() || 0) - Date.now()) / (1000 * 60));
      throw new AppError(`Account is temporarily locked due to failed attempts. Try again in ${waitMinutes} minute(s).`, 429);
    }

    if (user.status === 'blocked') {
      throw new AppError('Account is suspended. Please contact administrator.', 403);
    }

    const isMatch = await user.comparePassword(candidatePass);
    if (!isMatch) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 min lock
      }
      await user.save();
      throw new AppError('Invalid email or password.', 401);
    }

    if (portal && PORTAL_ALLOWED_ROLES[portal] && !PORTAL_ALLOWED_ROLES[portal].includes(user.role)) {
      throw new AppError(
        `Access denied: '${user.role}' accounts are not authorized to sign in to this portal.`,
        403
      );
    }

    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();
    user.refreshToken = refreshToken;
    await user.save();

    const sanitized = user.toObject();
    delete sanitized.password;
    delete sanitized.refreshToken;

    return { user: sanitized, accessToken, refreshToken };
  }

  static async refreshToken(incomingToken: string) {
    if (!incomingToken) throw new AppError('Refresh token required.', 401);
    try {
      const decoded = jwt.verify(incomingToken, config.jwt.refreshSecret) as { id: string };
      const user = await User.findById(decoded.id);
      if (!user) throw new AppError('User not found.', 401);
      if (user.status === 'blocked') throw new AppError('Account is suspended.', 403);
      const accessToken = user.generateAccessToken();
      return { accessToken };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError('Invalid or expired refresh token.', 401);
    }
  }

  static async forgotPassword(email: string) {
    if (!email || !email.trim()) {
      throw new AppError('Email is required.', 400);
    }
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return { message: 'If that email exists, an OTP code has been sent.' };
    }
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otpCode;
    user.otpExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 mins
    user.otpAttempts = 0;
    await user.save();

    const sent = await sendOtpEmail(user.email, otpCode);
    if (!sent && config.env !== 'production') {
      console.warn(`[Auth] Dev OTP fallback for ${user.email}: ${otpCode}`);
    }
    return { message: 'Verification code sent to your email.' };
  }

  static async verifyOtp(email: string, otpCode: string) {
    const user = await User.findOne({ email: email.toLowerCase() }).select('+otp +otpExpiry +otpAttempts');
    if (!user || !user.otp || !user.otpExpiry) {
      throw new AppError('Invalid or expired OTP request.', 400);
    }

    if (Date.now() > user.otpExpiry.getTime()) {
      throw new AppError('OTP has expired. Please request a new one.', 400);
    }

    if (user.otp !== otpCode.trim()) {
      user.otpAttempts += 1;
      if (user.otpAttempts >= 3) {
        user.lockUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 min lock
        user.otp = undefined;
      }
      await user.save();
      throw new AppError('Incorrect OTP code.', 400);
    }

    const resetToken = jwt.sign({ id: user._id, email: user.email }, config.jwt.secret, { expiresIn: '15m' });
    return { resetToken, message: 'OTP verified successfully.' };
  }

  static async resetPassword(resetToken: string, newPass: string) {
    if (!newPass || newPass.length < 8) {
      throw new AppError('Password must be at least 8 characters long.', 400);
    }

    let decoded: any;
    try {
      decoded = jwt.verify(resetToken, config.jwt.secret);
    } catch {
      throw new AppError('Invalid or expired password reset session.', 401);
    }

    const user = await User.findById(decoded.id);
    if (!user) throw new AppError('User not found.', 404);

    user.password = newPass;
    user.otp = undefined;
    user.otpExpiry = undefined;
    user.otpAttempts = 0;
    await user.save();

    return { message: 'Password has been reset successfully. You can now sign in.' };
  }

  static async signUp(payload: { name: string; email: string; password: string; role?: any; company?: string; phone?: string }) {
    if (!payload.name?.trim() || !payload.email?.trim() || !payload.password || payload.password.length < 8) {
      throw new AppError('Name, valid email, and password (at least 8 characters) are required.', 400);
    }
    const exists = await User.findOne({ email: payload.email.toLowerCase().trim() });
    if (exists) throw new AppError('An account with this email already exists.', 409);

    const safeRole = PUBLIC_SIGNUP_ROLES.includes(payload.role) ? payload.role : 'Agent';

    const user = await User.create({
      name: payload.name.trim(),
      email: payload.email.toLowerCase().trim(),
      password: payload.password,
      role: safeRole,
      company: payload.company || 'Instapost',
      phone: payload.phone || '',
    });

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();
    user.refreshToken = refreshToken;
    await user.save();

    const { NotificationService } = await import('../notification/notification.service');
    await NotificationService.safeNotify({
      recipientRole: 'Admin',
      title: `New User Registered: ${user.name}`,
      message: `${user.email} (${user.role}) created an account.`,
      type: 'approval',
      referenceId: user._id.toString(),
      createdBy: user.name,
    });

    const sanitized = user.toObject();
    delete sanitized.password;
    delete sanitized.refreshToken;

    return { user: sanitized, accessToken, refreshToken };
  }

  static async changePassword(userId: string, currentPassword: string, newPassword: string) {
    if (!currentPassword || !newPassword || newPassword.length < 8) {
      throw new AppError('Current password and a new password of at least 8 characters are required.', 400);
    }
    const user = await User.findById(userId).select('+password');
    if (!user) throw new AppError('User not found.', 404);

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      throw new AppError('Current password is incorrect.', 401);
    }

    user.password = newPassword;
    await user.save();
    return { message: 'Password updated successfully.' };
  }

  static async updateProfile(userId: string, payload: any) {
    const user = await User.findById(userId);
    if (!user) throw new AppError('User not found.', 404);

    if (payload.name) user.name = payload.name;
    if (payload.phone !== undefined) user.phone = payload.phone;
    if (payload.company !== undefined) user.company = payload.company;
    if (payload.office !== undefined) user.office = payload.office;
    if (payload.brokerage !== undefined) user.brokerage = payload.brokerage;

    const { hasImageUpdate, imageUrl, publicId } = extractImageFields(payload);
    if (hasImageUpdate) {
      const oldPublicId = user.publicId;
      user.imageUrl = imageUrl;
      user.publicId = publicId;
      await cleanupReplacedAsset(oldPublicId, publicId);
    }

    await user.save();
    const sanitized = user.toObject();
    delete sanitized.password;
    delete sanitized.refreshToken;
    return sanitized;
  }
}

