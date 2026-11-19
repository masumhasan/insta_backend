import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { AppError } from '../utils/apiError';

/**
 * Per-admin permissions are stored on the user as `{ [key]: boolean }`, where a key is a section
 * (e.g. "users") or a subsection ("users.agents"). Rules:
 *  - no permissions saved (legacy / primary admins) → full access
 *  - a key set to `false` denies it, and a section set to `false` denies all of its subsections
 */
export const hasPermission = (permissions: unknown, key: string): boolean => {
  if (!permissions || typeof permissions !== 'object') return true;
  const perms = permissions as Record<string, boolean>;
  if (Object.keys(perms).length === 0) return true;
  if (perms[key] === false) return false;
  const section = key.split('.')[0];
  return perms[section] !== false;
};

/** Enforces an admin permission on the API (only applies to role "Admin"; other roles use role guards). */
export const requirePermission = (key: string, ...legacyKeys: string[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new AppError('Unauthorized. Please authenticate first.', 401));
    if (req.user.role !== 'Admin') return next();
    if ([key, ...legacyKeys].some((k) => !hasPermission(req.user!.permissions, k))) {
      return next(new AppError('You do not have permission to access this section.', 403));
    }
    next();
  };
};
