import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ApiResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { config } from '../../config/env';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.env === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

const ACCESS_COOKIE_OPTIONS = {
  ...COOKIE_OPTIONS,
  maxAge: 24 * 60 * 60 * 1000,
};

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password, portal } = req.body;
  const result = await AuthService.login(email, password, portal);

  res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);
  res.cookie('token', result.accessToken, ACCESS_COOKIE_OPTIONS);
  return ApiResponse.success(res, 200, 'Login successful', result);
});

export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken || req.body?.refreshToken;
  const result = await AuthService.refreshToken(token);
  if ((result as any)?.accessToken) {
    res.cookie('token', (result as any).accessToken, ACCESS_COOKIE_OPTIONS);
  }
  return ApiResponse.success(res, 200, 'Token refreshed successfully', result);
});

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  res.clearCookie('refreshToken', COOKIE_OPTIONS);
  res.clearCookie('token', ACCESS_COOKIE_OPTIONS);
  return ApiResponse.success(res, 200, 'Logged out successfully');
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const { email } = req.body;
  const result = await AuthService.forgotPassword(email);
  return ApiResponse.success(res, 200, result.message);
});

export const verifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const { email, otp, otpCode } = req.body;
  const result = await AuthService.verifyOtp(email, otp || otpCode || '');
  return ApiResponse.success(res, 200, result.message, { resetToken: result.resetToken });
});

export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  const resetToken = (req.headers['x-reset-token'] as string) || req.body?.resetToken;
  const newPassword = req.body?.newPassword || req.body?.password;
  const result = await AuthService.resetPassword(resetToken, newPassword);
  return ApiResponse.success(res, 200, result.message);
});

export const signUp = asyncHandler(async (req: Request, res: Response) => {
  const result = await AuthService.signUp(req.body);
  res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);
  res.cookie('token', result.accessToken, ACCESS_COOKIE_OPTIONS);
  return ApiResponse.success(res, 201, 'Account created successfully', result);
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  return ApiResponse.success(res, 200, 'Current user retrieved', { user: (req as any).user });
});

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?._id?.toString();
  const user = await AuthService.updateProfile(userId, req.body);
  return ApiResponse.success(res, 200, 'Profile updated successfully', { user });
});

export const changePassword = asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?._id?.toString();
  const { currentPassword, newPassword } = req.body;
  const result = await AuthService.changePassword(userId, currentPassword, newPassword);
  return ApiResponse.success(res, 200, result.message);
});
