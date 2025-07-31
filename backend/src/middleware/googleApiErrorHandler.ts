import { Request, Response, NextFunction } from 'express';
import { AxiosError } from 'axios';
import { logger } from '../utils/logger';

export interface GoogleApiError {
  code: string;
  message: string;
  status: number;
  retryable: boolean;
  category: 'auth' | 'rate_limit' | 'quota' | 'network' | 'server' | 'client' | 'unknown';
  details?: any;
  retryAfter?: number;
}

export class GoogleApiErrorHandler {
  /**
   * Parse Google API error response and create structured error
   */
  static parseGoogleApiError(error: any): GoogleApiError {
    let parsedError: GoogleApiError = {
      code: 'UNKNOWN_ERROR',
      message: 'An unknown error occurred',
      status: 500,
      retryable: false,
      category: 'unknown'
    };

    if (error.isAxiosError) {
      const axiosError = error as AxiosError;
      parsedError = this.parseAxiosError(axiosError);
    } else if (error.code && error.message) {
      // Google API client library error
      parsedError = this.parseGoogleClientError(error);
    } else if (error instanceof Error) {
      parsedError.message = error.message;
      parsedError.code = error.name || 'GENERIC_ERROR';
    }

    return parsedError;
  }

  /**
   * Parse Axios HTTP errors from Google API calls
   */
  private static parseAxiosError(error: AxiosError): GoogleApiError {
    const status = error.response?.status || 500;
    const responseData = error.response?.data as any;
    
    let code = 'HTTP_ERROR';
    let message = error.message;
    let category: GoogleApiError['category'] = 'unknown';
    let retryable = false;
    let retryAfter: number | undefined;

    // Parse standard Google API error response format
    if (responseData?.error) {
      const apiError = responseData.error;
      
      if (apiError.code) {
        code = `GOOGLE_API_${apiError.code}`;
      }
      
      if (apiError.message) {
        message = apiError.message;
      }

      // Parse error details for more specific handling
      if (apiError.details) {
        const details = Array.isArray(apiError.details) ? apiError.details[0] : apiError.details;
        if (details['@type']?.includes('QuotaFailure')) {
          category = 'quota';
          code = 'QUOTA_EXCEEDED';
        } else if (details['@type']?.includes('ErrorInfo')) {
          code = details.reason || code;
        }
      }
    }

    // Categorize by HTTP status code
    switch (status) {
      case 400:
        category = 'client';
        code = code === 'HTTP_ERROR' ? 'BAD_REQUEST' : code;
        break;
      case 401:
        category = 'auth';
        code = code === 'HTTP_ERROR' ? 'UNAUTHORIZED' : code;
        message = 'Authentication failed - token may be expired or invalid';
        break;
      case 403:
        if (message.toLowerCase().includes('quota') || message.toLowerCase().includes('limit')) {
          category = 'quota';
          code = 'QUOTA_EXCEEDED';
          retryable = true;
        } else if (message.toLowerCase().includes('scope')) {
          category = 'auth';
          code = 'INSUFFICIENT_SCOPE';
        } else {
          category = 'auth';
          code = 'FORBIDDEN';
        }
        break;
      case 404:
        category = 'client';
        code = 'NOT_FOUND';
        break;
      case 429:
        category = 'rate_limit';
        code = 'RATE_LIMITED';
        retryable = true;
        
        // Extract retry-after header
        const retryAfterHeader = error.response?.headers['retry-after'];
        if (retryAfterHeader) {
          retryAfter = parseInt(retryAfterHeader);
        }
        break;
      case 500:
      case 502:
      case 503:
      case 504:
        category = 'server';
        code = 'SERVER_ERROR';
        retryable = true;
        break;
      default:
        if (status >= 400 && status < 500) {
          category = 'client';
        } else if (status >= 500) {
          category = 'server';
          retryable = true;
        }
    }

    // Network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      category = 'network';
      retryable = true;
      code = `NETWORK_${error.code}`;
    }

    return {
      code,
      message,
      status,
      retryable,
      category,
      details: responseData,
      retryAfter
    };
  }

  /**
   * Parse errors from Google client libraries
   */
  private static parseGoogleClientError(error: any): GoogleApiError {
    let category: GoogleApiError['category'] = 'unknown';
    let retryable = false;

    // Common Google client error patterns
    if (error.code === 'invalid_grant') {
      category = 'auth';
      error.message = 'OAuth grant is invalid or expired - re-authentication required';
    } else if (error.code === 'access_denied') {
      category = 'auth';
    } else if (error.code === 'insufficient_scope') {
      category = 'auth';
    } else if (error.code === 'quota_exceeded') {
      category = 'quota';
      retryable = true;
    } else if (error.code === 'rate_limit_exceeded') {
      category = 'rate_limit';
      retryable = true;
    }

    return {
      code: error.code?.toUpperCase() || 'GOOGLE_CLIENT_ERROR',
      message: error.message || 'Google client error',
      status: error.status || 500,
      retryable,
      category,
      details: error.details
    };
  }

  /**
   * Determine if error should trigger token refresh
   */
  static shouldRefreshToken(error: GoogleApiError): boolean {
    return (
      error.category === 'auth' && 
      (error.code === 'UNAUTHORIZED' || error.code === 'INVALID_GRANT')
    );
  }

  /**
   * Determine if operation should be retried
   */
  static shouldRetry(error: GoogleApiError, attemptCount: number, maxAttempts: number = 3): boolean {
    if (attemptCount >= maxAttempts) {
      return false;
    }

    // Don't retry client errors (except rate limits)
    if (error.category === 'client' && error.category !== 'rate_limit') {
      return false;
    }

    // Don't retry auth errors (they need token refresh)
    if (error.category === 'auth') {
      return false;
    }

    return error.retryable;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  static getRetryDelay(error: GoogleApiError, attemptCount: number): number {
    // Use retry-after header if available
    if (error.retryAfter) {
      return error.retryAfter * 1000; // Convert to milliseconds
    }

    // Exponential backoff: 1s, 2s, 4s, 8s...
    const baseDelay = 1000;
    const maxDelay = 30000; // Max 30 seconds
    const delay = Math.min(baseDelay * Math.pow(2, attemptCount - 1), maxDelay);
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.3 * delay;
    return delay + jitter;
  }

  /**
   * Get user-friendly error message
   */
  static getUserFriendlyMessage(error: GoogleApiError): string {
    switch (error.category) {
      case 'auth':
        if (error.code === 'INSUFFICIENT_SCOPE') {
          return 'Additional permissions are required. Please re-authorize your Google Voice account.';
        }
        return 'Authentication failed. Please reconnect your Google Voice account.';
      
      case 'rate_limit':
        return 'Too many requests to Google Voice. Please wait a moment and try again.';
      
      case 'quota':
        return 'Google Voice API quota exceeded. Please try again later or contact support.';
      
      case 'network':
        return 'Network connection issue. Please check your internet connection and try again.';
      
      case 'server':
        return 'Google Voice service is temporarily unavailable. Please try again later.';
      
      case 'client':
        if (error.code === 'NOT_FOUND') {
          return 'The requested resource was not found.';
        }
        return 'Invalid request. Please check your input and try again.';
      
      default:
        return 'An unexpected error occurred. Please try again or contact support if the problem persists.';
    }
  }

  /**
   * Log error with appropriate level and context
   */
  static logError(error: GoogleApiError, context: Record<string, any> = {}): void {
    const logLevel = this.getLogLevel(error);
    const logContext = {
      ...context,
      errorCode: error.code,
      errorCategory: error.category,
      errorStatus: error.status,
      retryable: error.retryable,
      ...(error.retryAfter && { retryAfter: error.retryAfter })
    };

    switch (logLevel) {
      case 'error':
        logger.error(`Google API Error: ${error.message}`, logContext);
        break;
      case 'warn':
        logger.warn(`Google API Warning: ${error.message}`, logContext);
        break;
      case 'info':
        logger.info(`Google API Info: ${error.message}`, logContext);
        break;
      default:
        logger.debug(`Google API Debug: ${error.message}`, logContext);
    }
  }

  /**
   * Determine appropriate log level for error
   */
  private static getLogLevel(error: GoogleApiError): 'error' | 'warn' | 'info' | 'debug' {
    switch (error.category) {
      case 'auth':
        return error.code === 'INSUFFICIENT_SCOPE' ? 'warn' : 'error';
      case 'rate_limit':
        return 'warn'; // Rate limits are expected occasionally
      case 'quota':
        return 'error'; // Quota issues need attention
      case 'network':
        return 'warn'; // Network issues are usually temporary
      case 'server':
        return 'warn'; // Server issues are Google's problem
      case 'client':
        return error.status === 404 ? 'info' : 'error';
      default:
        return 'error';
    }
  }
}

/**
 * Express middleware to handle Google API errors
 */
export const googleApiErrorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Only handle Google API related errors
  if (!isGoogleApiError(error)) {
    return next(error);
  }

  const parsedError = GoogleApiErrorHandler.parseGoogleApiError(error);
  
  // Log the error
  GoogleApiErrorHandler.logError(parsedError, {
    url: req.url,
    method: req.method,
    userId: req.user?.id,
    tokenId: req.params?.tokenId || req.body?.tokenId
  });

  // Send appropriate response
  const response = {
    success: false,
    error: {
      code: parsedError.code,
      message: GoogleApiErrorHandler.getUserFriendlyMessage(parsedError),
      category: parsedError.category,
      retryable: parsedError.retryable,
      ...(parsedError.retryAfter && { retryAfter: parsedError.retryAfter })
    },
    ...(process.env.NODE_ENV === 'development' && {
      debug: {
        originalMessage: parsedError.message,
        details: parsedError.details
      }
    })
  };

  res.status(parsedError.status).json(response);
};

/**
 * Check if error is related to Google API
 */
function isGoogleApiError(error: any): boolean {
  // Axios error from Google API endpoint
  if (error.isAxiosError && error.config?.baseURL?.includes('google')) {
    return true;
  }

  // Google client library error
  if (error.code && (
    error.message?.toLowerCase().includes('google') ||
    error.code.includes('invalid_grant') ||
    error.code.includes('access_denied') ||
    error.code.includes('insufficient_scope')
  )) {
    return true;
  }

  // Custom Google API error
  if (error.name === 'GoogleApiError' || error.type === 'google_api_error') {
    return true;
  }

  // Error from our Google services
  if (error.stack?.includes('GoogleVoice') || error.stack?.includes('google')) {
    return true;
  }

  return false;
}

export default googleApiErrorHandler;