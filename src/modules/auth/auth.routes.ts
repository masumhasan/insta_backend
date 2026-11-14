import { Router } from 'express';
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

router.post('/login', login);
router.post('/refresh-token', refreshToken);
router.post('/logout', logout);
router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOtp);
router.post('/reset-password', resetPassword);
router.post('/sign-up', signUp);
router.get('/me', authenticate, getMe);
router.patch('/profile', authenticate, updateProfile);
router.post('/change-password', authenticate, changePassword);

export const authRoutes = router;

