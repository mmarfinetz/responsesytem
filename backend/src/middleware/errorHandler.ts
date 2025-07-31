import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: any;
  isOperational?: boolean;
}

export class CustomError extends Error implements AppError {
  statusCode: number;
  code: string;
  details?: any;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500, code?: string, details?: any) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || 'INTERNAL_ERROR';
    this.details = details;
    this.isOperational = true;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

// Predefined error classes
export class ValidationError extends CustomError {
  constructor(message: string, details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class AuthenticationError extends CustomError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

export class AuthorizationError extends CustomError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

export class NotFoundError extends CustomError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends CustomError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT_ERROR');
  }
}

export class RateLimitError extends CustomError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_ERROR');
  }
}

export class ExternalServiceError extends CustomError {
  constructor(service: string, message?: string) {
    super(message || `External service ${service} unavailable`, 502, 'EXTERNAL_SERVICE_ERROR', { service });
  }
}

// Main error handler middleware
export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Set default values
  err.statusCode = err.statusCode || 500;
  err.code = err.code || 'INTERNAL_ERROR';

  // Log the error
  const errorDetails = {
    message: err.message,
    code: err.code,
    statusCode: err.statusCode,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    body: req.body,
    params: req.params,
    query: req.query,
  };

  if (err.statusCode >= 500) {
    logger.error('Server error:', errorDetails);
  } else {
    logger.warn('Client error:', errorDetails);
  }

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  const errorResponse: any = {
    error: {
      message: err.message,
      code: err.code,
      timestamp: new Date().toISOString(),
      path: req.path,
    }
  };

  // Add additional details in development
  if (isDevelopment) {
    errorResponse.error.stack = err.stack;
    errorResponse.error.details = err.details;
  }

  // Add validation details for client errors
  if (err.statusCode < 500 && err.details) {
    errorResponse.error.details = err.details;
  }

  res.status(err.statusCode).json(errorResponse);
};

// Async wrapper to handle promise rejections
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 404 handler
export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  const error = new NotFoundError(`Route ${req.originalUrl}`);
  next(error);
};

// Database error handler
export const handleDatabaseError = (error: any): AppError => {
  // SQLite constraint errors
  if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return new ConflictError('Resource already exists');
  }
  
  if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return new ValidationError('Referenced resource does not exist');
  }

  if (error.code === 'SQLITE_CONSTRAINT_NOTNULL') {
    return new ValidationError('Required field is missing');
  }

  // PostgreSQL errors
  if (error.code === '23505') {
    return new ConflictError('Resource already exists');
  }

  if (error.code === '23503') {
    return new ValidationError('Referenced resource does not exist');
  }

  if (error.code === '23502') {
    return new ValidationError('Required field is missing');
  }

  // Connection errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    return new ExternalServiceError('Database', 'Database connection failed');
  }

  // Default to internal server error
  return new CustomError('Database operation failed', 500, 'DATABASE_ERROR');
};

// Validation error formatter
export const formatValidationErrors = (errors: any[]): any => {
  const formatted = errors.reduce((acc, error) => {
    const field = error.param || error.path || 'unknown';
    if (!acc[field]) {
      acc[field] = [];
    }
    acc[field].push(error.msg || error.message);
    return acc;
  }, {});

  return formatted;
};