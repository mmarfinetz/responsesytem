import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { RateLimitError } from '@/middleware/errorHandler';
import { logger } from '@/utils/logger';
import { getCorrelationContext } from './logger';

// Rate limiter configuration
interface RateLimitConfig {
  keyPrefix: string;
  points: number;
  duration: number;
  blockDuration: number;
  execEvenly?: boolean;
  skipFailedRequests?: boolean;
  skipSuccessfulRequests?: boolean;
}

// Environment-based rate limiting configurations
const getRateLimiterOptions = (): RateLimitConfig => ({
  keyPrefix: 'plumbing_ai_rl',
  points: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000'), // Max requests
  duration: parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS || '3600'), // 1 hour window
  blockDuration: parseInt(process.env.RATE_LIMIT_BLOCK_DURATION || '300'), // 5 minutes block
  execEvenly: false,
  skipFailedRequests: false,
  skipSuccessfulRequests: false,
});

// Initialize memory-based rate limiter
const rateLimiterInstance = new RateLimiterMemory(getRateLimiterOptions());

// Enhanced rate limiting middleware with correlation context
export const rateLimiterMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const context = getCorrelationContext();
    const clientIP = getClientIP(req);
    const userAgent = req.get('User-Agent') || 'unknown';
    
    // Create a composite key for better rate limiting
    const rateLimitKey = `${clientIP}:${userAgent.substring(0, 50)}`;
    
    // Attempt to consume a point
    const rateLimiterRes = await rateLimiterInstance.consume(rateLimitKey);
    
    // Add rate limit headers to response
    res.set({
      'X-RateLimit-Limit': String(getRateLimiterOptions().points),
      'X-RateLimit-Remaining': String(rateLimiterRes.remainingPoints || 0),
      'X-RateLimit-Reset': String(new Date(Date.now() + (rateLimiterRes.msBeforeNext || 0))),
    });

    // Log successful rate limit check
    logger.debug('Rate limit check passed', {
      correlationId: context?.correlationId,
      requestId: context?.requestId,
      ip: clientIP,
      userAgent,
      remainingPoints: rateLimiterRes.remainingPoints,
    });

    next();
  } catch (rateLimiterRes: any) {
    const context = getCorrelationContext();
    const clientIP = getClientIP(req);
    
    // Rate limit exceeded
    if (rateLimiterRes?.remainingPoints !== undefined) {
      const secs = Math.round(rateLimiterRes.msBeforeNext / 1000) || 1;
      
      res.set({
        'X-RateLimit-Limit': String(getRateLimiterOptions().points),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(new Date(Date.now() + rateLimiterRes.msBeforeNext)),
        'Retry-After': String(secs),
      });

      // Enhanced logging for rate limit violations
      logger.warn('Rate limit exceeded', {
        correlationId: context?.correlationId,
        requestId: context?.requestId,
        securityAlert: true,
        ip: clientIP,
        userAgent: req.get('User-Agent'),
        method: req.method,
        url: req.url,
        path: req.path,
        retryAfter: secs,
        remainingPoints: rateLimiterRes.remainingPoints,
      });

      const error = new RateLimitError(`Too many requests. Try again in ${secs} seconds.`);
      next(error);
    } else {
      // Unexpected error
      logger.error('Rate limiter error', {
        correlationId: context?.correlationId,
        requestId: context?.requestId,
        error: rateLimiterRes,
        ip: clientIP,
      });
      next(rateLimiterRes);
    }
  }
};

// Helper function to get client IP
function getClientIP(req: Request): string {
  return (
    req.headers['x-forwarded-for'] as string ||
    req.headers['x-real-ip'] as string ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress ||
    req.ip ||
    'unknown'
  );
}

// API-specific rate limiters
export const apiRateLimiter = rateLimiterMiddleware;

// Webhook rate limiter (more permissive)
const webhookRateLimiter = new RateLimiterMemory({
  keyPrefix: 'webhook_rl',
  points: 5000, // Allow more webhook requests
  duration: 3600,
  blockDuration: 60,
});

export const webhookRateLimiterMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clientIP = getClientIP(req);
    await webhookRateLimiter.consume(clientIP);
    next();
  } catch (rateLimiterRes: any) {
    const secs = Math.round(rateLimiterRes.msBeforeNext / 1000) || 1;
    res.set('Retry-After', String(secs));
    
    const clientIP = getClientIP(req);
    logger.warn('Webhook rate limit exceeded', {
      ip: clientIP,
      retryAfter: secs,
    });
    
    const error = new RateLimitError(`Too many webhook requests. Try again in ${secs} seconds.`);
    next(error);
  }
};

// Export default rate limiter
export default rateLimiterMiddleware;