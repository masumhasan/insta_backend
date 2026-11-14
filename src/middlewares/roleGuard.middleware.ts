import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { AppError } from '../utils/apiError';
import { UserRole } from '../modules/auth/user.model';

export const authorizeRoles = (...roles: UserRole[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Unauthorized. Please authenticate first.', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(
          `Access forbidden: Role '${req.user.role}' does not have permission to perform this action.`,
          403
        )
      );
    }

    next();
  };
};

