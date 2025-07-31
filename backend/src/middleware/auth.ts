import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticationError, AuthorizationError } from '@/middleware/errorHandler';
import { logger } from '@/utils/logger';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
  apiKey?: {
    id: string;
    name: string;
    permissions: string[];
  };
  session?: {
    pkce?: {
      state: string;
      codeVerifier: string;
    };
  };
}

// JWT Authentication middleware
export const authenticateToken = (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    throw new AuthenticationError('Access token required');
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET not configured');
    }

    const decoded = jwt.verify(token, secret) as any;
    req.user = {
      id: decoded.sub || decoded.id,
      email: decoded.email,
      role: decoded.role || 'user',
    };

    logger.info('User authenticated', { 
      userId: req.user.id, 
      email: req.user.email,
      endpoint: req.path 
    });

    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Invalid access token');
    }
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Access token expired');
    }
    throw new AuthenticationError('Token verification failed');
  }
};

// API Key authentication middleware
export const validateApiKey = (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void => {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    throw new AuthenticationError('API key required');
  }

  // In a real implementation, validate against database
  // For now, use a simple check against environment variable
  const validApiKey = process.env.API_KEY || 'dev-api-key-change-this';
  
  if (apiKey !== validApiKey) {
    logger.warn('Invalid API key attempt', { 
      apiKey: apiKey.substring(0, 8) + '...', 
      ip: req.ip,
      endpoint: req.path 
    });
    throw new AuthenticationError('Invalid API key');
  }

  // Set API key info for logging and authorization
  req.apiKey = {
    id: 'default',
    name: 'Default API Key',
    permissions: ['read', 'write'],
  };

  next();
};

// Role-based authorization middleware
export const requireRole = (roles: string | string[]) => {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }

    const allowedRoles = Array.isArray(roles) ? roles : [roles];
    
    if (!allowedRoles.includes(req.user.role)) {
      logger.warn('Insufficient permissions', { 
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: allowedRoles,
        endpoint: req.path 
      });
      throw new AuthorizationError(`Required roles: ${allowedRoles.join(', ')}`);
    }

    next();
  };
};

// Permission-based authorization middleware
export const requirePermission = (permissions: string | string[]) => {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    if (!req.apiKey && !req.user) {
      throw new AuthenticationError('Authentication required');
    }

    const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];
    
    // Check API key permissions
    if (req.apiKey) {
      const hasPermission = requiredPermissions.every(permission =>
        req.apiKey!.permissions.includes(permission) || req.apiKey!.permissions.includes('admin')
      );
      
      if (!hasPermission) {
        throw new AuthorizationError(`Required permissions: ${requiredPermissions.join(', ')}`);
      }
    }
    
    // Check user permissions (you might have a user permissions system)
    if (req.user && req.user.role !== 'admin') {
      // Implement user permission checking logic here
      // For now, allow all authenticated users
    }

    next();
  };
};

// Optional authentication - doesn't throw if no auth provided
export const optionalAuth = (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next();
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return next();
    }

    const decoded = jwt.verify(token, secret) as any;
    req.user = {
      id: decoded.sub || decoded.id,
      email: decoded.email,
      role: decoded.role || 'user',
    };
  } catch (error) {
    // Ignore invalid tokens in optional auth
    logger.debug('Optional auth failed:', error);
  }

  next();
};

// Generate JWT token utility
export const generateToken = (payload: any, expiresIn?: string): string => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET not configured');
  }

  const options: any = {
    expiresIn: expiresIn || process.env.JWT_EXPIRES_IN || '7d',
    issuer: 'plumbing-voice-ai',
    audience: 'plumbing-voice-ai-client',
  };
  
  return jwt.sign(payload, secret, options);
};

// Verify token utility
export const verifyToken = (token: string): any => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET not configured');
  }

  return jwt.verify(token, secret);
};

// Extract user from token utility
export const getUserFromToken = (token: string): any => {
  try {
    return verifyToken(token);
  } catch (error) {
    return null;
  }
};