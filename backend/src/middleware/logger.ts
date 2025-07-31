import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';
import { AsyncLocalStorage } from 'async_hooks';

// Create context storage for correlation IDs
const correlationIdStorage = new AsyncLocalStorage<{
  correlationId: string;
  requestId: string;
  userId?: string;
  sessionId?: string;
  ipAddress: string;
  userAgent?: string;
}>();

// Extend Request interface to include correlation data
interface CorrelatedRequest extends Request {
  correlationId: string;
  requestId: string;
  startTime: number;
}

// Enhanced request logging middleware with correlation ID support
export const requestLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();
  const correlatedReq = req as CorrelatedRequest;
  correlatedReq.startTime = startTime;
  
  // Generate correlation ID and request ID
  const correlationId = req.headers['x-correlation-id'] as string || 
                       req.headers['x-request-id'] as string || 
                       generateCorrelationId();
  const requestId = generateRequestId();
  
  // Add to request object
  correlatedReq.correlationId = correlationId;
  correlatedReq.requestId = requestId;
  
  // Extract user context
  const userId = (req as any).user?.id || req.headers['x-user-id'] as string;
  const sessionId = req.headers['x-session-id'] as string || (req as any).session?.id;
  const ipAddress = getClientIP(req);
  const userAgent = req.get('User-Agent');
  
  // Create correlation context
  const context = {
    correlationId,
    requestId,
    userId,
    sessionId,
    ipAddress,
    userAgent,
  };
  
  // Set response headers
  res.setHeader('X-Correlation-ID', correlationId);
  res.setHeader('X-Request-ID', requestId);
  
  // Run the rest of the request in context
  correlationIdStorage.run(context, () => {
    const originalSend = res.send;

    // Override res.send to capture response
    res.send = function(body: any) {
      const duration = Date.now() - startTime;
      const responseSize = Buffer.isBuffer(body) ? body.length : 
                          (typeof body === 'string' ? body.length : 
                           JSON.stringify(body).length);

      // Determine log level based on status code
      const logLevel = res.statusCode >= 500 ? 'error' : 
                      res.statusCode >= 400 ? 'warn' : 'info';

      // Enhanced request/response logging
      const logData = {
        correlationId,
        requestId,
        userId,
        sessionId,
        method: req.method,
        url: req.url,
        path: req.path,
        query: Object.keys(req.query).length > 0 ? req.query : undefined,
        statusCode: res.statusCode,
        duration,
        requestSize: parseInt(req.get('content-length') || '0'),
        responseSize,
        userAgent,
        ip: ipAddress,
        referer: req.get('Referer'),
        protocol: req.protocol,
        httpVersion: req.httpVersion,
        // Performance indicators
        slow: duration > 1000,
        error: res.statusCode >= 400,
        // Security indicators
        suspicious: detectSuspiciousPatterns(req),
        // API specific
        apiVersion: req.headers['api-version'] || req.query.version,
        clientType: req.headers['x-client-type'],
      };

      // Log with appropriate level
      logger[logLevel]('HTTP Request Completed', logData);

      // Log slow requests with additional detail
      if (duration > 5000) {
        logger.warn('Slow HTTP Request Detected', {
          ...logData,
          threshold: 5000,
          performanceImpact: 'high',
        });
      }

      // Log errors with additional context
      if (res.statusCode >= 500) {
        logger.error('HTTP Server Error', {
          ...logData,
          responseBody: process.env.NODE_ENV === 'development' ? body : '[REDACTED]',
        });
      }

      // Call original send
      return originalSend.call(this, body);
    };

    next();
  });
};

// Utility functions for correlation ID generation
function generateCorrelationId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

function generateRequestId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

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

function detectSuspiciousPatterns(req: Request): boolean {
  const suspiciousPatterns = [
    /\.\.\//g, // Directory traversal
    /<script/gi, // XSS attempts
    /union.*select/gi, // SQL injection
    /javascript:/gi, // JavaScript injection
    /vbscript:/gi, // VBScript injection
    /onload=/gi, // Event handler injection
    /onerror=/gi,
    /eval\(/gi, // Code injection
    /document\.cookie/gi, // Cookie stealing
  ];

  const requestData = JSON.stringify({
    body: req.body,
    query: req.query,
    params: req.params,
    path: req.path,
  });

  return suspiciousPatterns.some(pattern => pattern.test(requestData));
}

// Export correlation context getter
export function getCorrelationContext() {
  return correlationIdStorage.getStore();
}

// Enhanced security logging middleware
export const securityLogger = (req: Request, res: Response, next: NextFunction): void => {
  const context = getCorrelationContext();
  const isSuspicious = detectSuspiciousPatterns(req);

  // Enhanced security logging with correlation context
  if (isSuspicious) {
    const correlatedReq = req as CorrelatedRequest;
    logger.warn('Suspicious request detected', {
      correlationId: context?.correlationId || correlatedReq.correlationId,
      requestId: context?.requestId || correlatedReq.requestId,
      securityAlert: true,
      threatLevel: 'medium',
      ip: context?.ipAddress || getClientIP(req),
      method: req.method,
      url: req.url,
      path: req.path,
      userAgent: context?.userAgent || req.get('User-Agent'),
      userId: context?.userId,
      sessionId: context?.sessionId,
      body: sanitizeForLogging(req.body),
      query: req.query,
      params: req.params,
      headers: sanitizeHeaders(req.headers),
      timestamp: new Date().toISOString(),
    });

    // Add security headers to response
    res.set({
      'X-Security-Alert': 'Suspicious activity detected',
      'X-Threat-Level': 'medium',
    });
  }

  // Log authentication attempts
  if (req.path.includes('/auth/') || req.path.includes('/login')) {
    const correlatedReq = req as CorrelatedRequest;
    logger.info('Authentication attempt', {
      correlationId: context?.correlationId || correlatedReq.correlationId,
      requestId: context?.requestId || correlatedReq.requestId,
      authType: 'api_key',
      method: req.method,
      path: req.path,
      ip: context?.ipAddress || getClientIP(req),
      userAgent: context?.userAgent || req.get('User-Agent'),
      timestamp: new Date().toISOString(),
    });
  }

  next();
};

// Data sanitization utilities
function sanitizeForLogging(data: any): any {
  if (!data) return data;
  
  const sensitiveFields = [
    'password', 'token', 'secret', 'key', 'auth', 'authorization',
    'cookie', 'session', 'csrf', 'ssn', 'credit_card', 'cvv',
    'api_key', 'access_token', 'refresh_token'
  ];
  
  if (typeof data === 'object') {
    const sanitized = { ...data };
    Object.keys(sanitized).forEach(key => {
      if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof sanitized[key] === 'object') {
        sanitized[key] = sanitizeForLogging(sanitized[key]);
      }
    });
    return sanitized;
  }
  
  return data;
}

function sanitizeHeaders(headers: any): any {
  const sanitized = { ...headers };
  const sensitiveHeaders = [
    'authorization', 'cookie', 'x-api-key', 'x-auth-token',
    'x-access-token', 'x-refresh-token'
  ];
  
  Object.keys(sanitized).forEach(key => {
    if (sensitiveHeaders.includes(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    }
  });
  
  return sanitized;
}

// Enhanced slow request logger with correlation context
export const slowRequestLogger = (threshold: number = 1000) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    const context = getCorrelationContext();

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      
      if (duration > threshold) {
        const correlatedReq = req as CorrelatedRequest;
        logger.warn('Slow request detected', {
          correlationId: context?.correlationId || correlatedReq.correlationId,
          requestId: context?.requestId || correlatedReq.requestId,
          performanceIssue: true,
          method: req.method,
          url: req.url,
          path: req.path,
          duration,
          threshold,
          statusCode: res.statusCode,
          ip: context?.ipAddress || getClientIP(req),
          userAgent: context?.userAgent || req.get('User-Agent'),
          userId: context?.userId,
          sessionId: context?.sessionId,
          timestamp: new Date().toISOString(),
        });
      }
    });

    next();
  };
};

// Enhanced error response logger with correlation context
export const errorResponseLogger = (req: Request, res: Response, next: NextFunction): void => {
  const originalSend = res.send;
  const context = getCorrelationContext();

  res.send = function(body: any) {
    if (res.statusCode >= 400) {
      const logLevel = res.statusCode >= 500 ? 'error' : 'warn';
      const errorCategory = categorizeHttpError(res.statusCode);
      
      const correlatedReq = req as CorrelatedRequest;
      logger[logLevel]('HTTP Error Response', {
        correlationId: context?.correlationId || correlatedReq.correlationId,
        requestId: context?.requestId || correlatedReq.requestId,
        errorResponse: true,
        errorCategory,
        method: req.method,
        url: req.url,
        path: req.path,
        statusCode: res.statusCode,
        ip: context?.ipAddress || getClientIP(req),
        userAgent: context?.userAgent || req.get('User-Agent'),
        userId: context?.userId,
        sessionId: context?.sessionId,
        response: sanitizeForLogging(body),
        timestamp: new Date().toISOString(),
      });
    }

    return originalSend.call(this, body);
  };

  next();
};

// HTTP error categorization
function categorizeHttpError(statusCode: number): string {
  if (statusCode >= 500) return 'server_error';
  if (statusCode >= 400 && statusCode < 500) {
    switch (statusCode) {
      case 400: return 'bad_request';
      case 401: return 'unauthorized';
      case 403: return 'forbidden';
      case 404: return 'not_found';
      case 409: return 'conflict';
      case 422: return 'validation_error';
      case 429: return 'rate_limited';
      default: return 'client_error';
    }
  }
  return 'unknown';
}

// Legacy correlation ID middleware (now handled by requestLogger)
export const correlationIdLogger = (req: Request, res: Response, next: NextFunction): void => {
  // This functionality is now handled by the enhanced requestLogger
  // Keeping for backward compatibility
  const correlatedReq = req as CorrelatedRequest;
  if (!correlatedReq.correlationId) {
    correlatedReq.correlationId = generateCorrelationId();
    res.setHeader('X-Correlation-ID', correlatedReq.correlationId);
  }
  next();
};

// Enhanced API version logger with correlation context
export const apiVersionLogger = (req: Request, res: Response, next: NextFunction): void => {
  const apiVersion = req.headers['api-version'] || req.query.version || 'v1';
  const context = getCorrelationContext();
  const correlatedReq = req as CorrelatedRequest;
  
  logger.debug('API version tracked', {
    correlationId: context?.correlationId || correlatedReq.correlationId,
    requestId: context?.requestId || correlatedReq.requestId,
    version: typeof apiVersion === 'string' ? apiVersion : String(apiVersion),
    method: req.method,
    url: req.url,
    path: req.path,
    ip: context?.ipAddress || getClientIP(req),
    userAgent: context?.userAgent || req.get('User-Agent'),
    userId: context?.userId,
  });

  // Add API version to response headers
  res.setHeader('X-API-Version', typeof apiVersion === 'string' ? apiVersion : String(apiVersion));

  next();
};

// Enhanced request body logger with correlation context
export const requestBodyLogger = (req: Request, _res: Response, next: NextFunction): void => {
  const context = getCorrelationContext();
  
  if (req.body && Object.keys(req.body).length > 0) {
    const shouldLog = process.env.NODE_ENV === 'development' || 
                     process.env.LOG_REQUEST_BODIES === 'true';
    
    if (shouldLog) {
      const correlatedReq = req as CorrelatedRequest;
      logger.debug('Request body received', {
        correlationId: context?.correlationId || correlatedReq.correlationId,
        requestId: context?.requestId || correlatedReq.requestId,
        method: req.method,
        url: req.url,
        path: req.path,
        body: sanitizeForLogging(req.body),
        bodySize: JSON.stringify(req.body).length,
        contentType: req.get('Content-Type'),
        userId: context?.userId,
      });
    }
  }

  next();
};

// Database operation logger (for tracking database calls with correlation)
export const databaseOperationLogger = (operation: string, table: string, correlationId?: string) => {
  const context = getCorrelationContext();
  
  logger.info('Database operation', {
    correlationId: correlationId || context?.correlationId,
    requestId: context?.requestId,
    operation,
    table,
    userId: context?.userId,
    timestamp: new Date().toISOString(),
  });
};

// External API call logger
export const externalApiLogger = (
  serviceName: string, 
  endpoint: string, 
  method: string, 
  duration: number, 
  success: boolean,
  correlationId?: string
) => {
  const context = getCorrelationContext();
  
  logger.info('External API call', {
    correlationId: correlationId || context?.correlationId,
    requestId: context?.requestId,
    serviceName,
    endpoint,
    method,
    duration,
    success,
    userId: context?.userId,
    timestamp: new Date().toISOString(),
  });
};