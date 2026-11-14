import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/apiError';
import { config } from '../config/env';

export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): Response => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  if (err.name === 'ValidationError') {
    statusCode = 400;
    const errors = Object.values(err.errors).map((el: any) => el.message);
    message = `Validation Error: ${errors.join(', ')}`;
  } else if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `Duplicate value entered for ${field}. Please use another value.`;
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid format for resource ID: ${err.value}`;
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid authentication token. Please sign in again.';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Authentication token expired. Please refresh your session.';
  }

  const responseBody: any = {
    success: false,
    statusCode,
    message,
  };

  if (config.env === 'development') {
    responseBody.stack = err.stack;
    responseBody.error = err;
  }

  return res.status(statusCode).json(responseBody);
};

