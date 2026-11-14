import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';
import { AppError } from '../utils/apiError';
import { User, IUserDocument } from '../modules/auth/user.model';

export interface AuthRequest extends Request {
  user?: IUserDocument;
}

export const authenticate = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token = '';

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (authHeader) {
      token = authHeader;
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return next(new AppError('Authentication required. Please sign in.', 401));
    }

    const decoded = jwt.verify(token, config.jwt.secret) as { id: string };
    const user = await User.findById(decoded.id);

    if (!user) {
      return next(new AppError('User belonging to this token no longer exists.', 401));
    }

    if (user.status === 'blocked') {
      return next(new AppError('Your account has been suspended. Please contact support.', 403));
    }

    req.user = user;
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Session expired. Please sign in again.', 401));
    }
    return next(new AppError('Invalid authentication token.', 401));
  }
};

/**
 * Populates req.user when a valid token is present without failing unauthenticated requests.
 */
export const optionalAuthenticate = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.split(' ')[1]
        : authHeader || req.cookies?.token || '';
    if (token) {
      const decoded = jwt.verify(token, config.jwt.secret) as { id: string };
      const user = await User.findById(decoded.id);
      if (user && user.status !== 'blocked') req.user = user;
    }
  } catch {
    // Ignore optional auth failures; downstream handlers treat req.user as anonymous
  }
  next();
};

