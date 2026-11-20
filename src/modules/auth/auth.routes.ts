import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  login,
  refreshToken,
  logout,
  forgotPassword,
  verifyOtp,
  resetPassword,
  signUp,
  getMe,
  updateProfile,
  changePassword,
} from './auth.controller';
import { authenticate } from '../../middlewares/auth.middleware';

const router = Router();

// Brute-force protection. Limits are per IP (and per server instance on Vercel, so they are a first line, not a hard cap).
const limiter = (max: number, minutes: number) =>
  rateLimit({ windowMs: minutes * 60_000, limit: max, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many attempts. Please try again later.' } });

router.post('/login', limiter(20, 15), login);
router.post('/refresh-token', refreshToken);
router.post('/logout', logout);
router.post('/forgot-password', limiter(5, 15), forgotPassword);
router.post('/verify-otp', limiter(10, 15), verifyOtp);
router.post('/reset-password', limiter(10, 15), resetPassword);
router.post('/sign-up', limiter(10, 60), signUp);
router.get('/me', authenticate, getMe);
router.patch('/profile', authenticate, updateProfile);
router.post('/change-password', authenticate, changePassword);

export const authRoutes = router;

