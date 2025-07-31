import winston from 'winston';
import path from 'path';

const logLevel = process.env.LOG_LEVEL || 'info';
const logFile = process.env.LOG_FILE || 'logs/app.log';

// Ensure logs directory exists
const logDir = path.dirname(logFile);

const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { 
    service: 'plumbing-voice-ai',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Write all logs with importance level of 'error' or less to error.log
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'), 
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Write all logs to combined log file
    new winston.transports.File({ 
      filename: logFile,
      maxsize: 5242880, // 5MB
      maxFiles: 10,
    }),
  ],
});

// If we're not in production, log to console as well
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
      winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
        let log = `${timestamp} [${service}] ${level}: ${message}`;
        
        // Add metadata if present
        const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
        if (metaStr) {
          log += `\\n${metaStr}`;
        }
        
        return log;
      })
    )
  }));
}

// Create a stream object for Morgan HTTP request logging
export const logStream = {
  write: (message: string) => {
    logger.info(message.trim());
  }
};

// Helper functions for structured logging
export const loggers = {
  // Business operation logging
  business: {
    customerCreated: (customerId: string, data: any) => {
      logger.info('Customer created', { 
        event: 'customer_created',
        customerId,
        data 
      });
    },
    jobCreated: (jobId: string, customerId: string, data: any) => {
      logger.info('Job created', { 
        event: 'job_created',
        jobId,
        customerId,
        data 
      });
    },
    quoteGenerated: (quoteId: string, jobId: string, amount: number) => {
      logger.info('Quote generated', { 
        event: 'quote_generated',
        quoteId,
        jobId,
        amount 
      });
    },
    conversationProcessed: (conversationId: string, messageCount: number) => {
      logger.info('Conversation processed', { 
        event: 'conversation_processed',
        conversationId,
        messageCount 
      });
    }
  },

  // API logging
  api: {
    request: (method: string, url: string, userId?: string) => {
      logger.info('API request', { 
        event: 'api_request',
        method,
        url,
        userId 
      });
    },
    response: (method: string, url: string, statusCode: number, duration: number) => {
      logger.info('API response', { 
        event: 'api_response',
        method,
        url,
        statusCode,
        duration 
      });
    },
    error: (method: string, url: string, error: any, userId?: string) => {
      logger.error('API error', { 
        event: 'api_error',
        method,
        url,
        error: error.message || error,
        stack: error.stack,
        userId 
      });
    }
  },

  // Integration logging
  integration: {
    googleVoiceWebhook: (event: string, data: any) => {
      logger.info('Google Voice webhook received', { 
        event: 'google_voice_webhook',
        webhookEvent: event,
        data 
      });
    },
    claudeApiCall: (prompt: string, response: any, duration: number) => {
      logger.info('Claude API called', { 
        event: 'claude_api_call',
        promptLength: prompt.length,
        responseLength: response?.length || 0,
        duration 
      });
    },
    googleApiCall: (service: string, method: string, success: boolean) => {
      logger.info('Google API called', { 
        event: 'google_api_call',
        service,
        method,
        success 
      });
    }
  },

  // Security logging
  security: {
    authAttempt: (success: boolean, email?: string, ip?: string) => {
      logger.info('Authentication attempt', { 
        event: 'auth_attempt',
        success,
        email,
        ip 
      });
    },
    rateLimitExceeded: (ip: string, endpoint: string) => {
      logger.warn('Rate limit exceeded', { 
        event: 'rate_limit_exceeded',
        ip,
        endpoint 
      });
    },
    suspiciousActivity: (description: string, data: any) => {
      logger.warn('Suspicious activity detected', { 
        event: 'suspicious_activity',
        description,
        data 
      });
    }
  }
};

export { logger };
export default logger;