import { Router } from 'express';
import { WebhookController } from '../controllers/webhookController';
import { DatabaseService } from '../services/DatabaseService';
import { QueueService } from '../services/QueueService';
import { NotificationService } from '../services/NotificationService';
import { WebSocketService } from '../services/WebSocketService';
import { asyncHandler } from '../middleware/errorHandler';
import { webhookRateLimiterMiddleware } from '../middleware/rateLimiter';
import { logger } from '../utils/logger';

const router = Router();

// Services will be initialized lazily
let queueService: QueueService;
let notificationService: NotificationService;
let webhookController: WebhookController;

// Lazy initialization of services
function getServices() {
  if (!queueService || !notificationService) {
    const db = DatabaseService.getInstance();
    queueService = new QueueService(db);
    notificationService = new NotificationService(db);
  }
  return { queueService, notificationService };
}

// Factory function to create webhook controller with WebSocket service
export const initializeWebhookController = (webSocketService?: WebSocketService) => {
  const { queueService: qs, notificationService: ns } = getServices();
  const db = DatabaseService.getInstance();
  webhookController = new WebhookController(db, qs, ns, webSocketService);
  logger.info('Webhook controller initialized', { hasWebSocket: !!webSocketService });
};

// Middleware for webhook security and logging
const webhookSecurityMiddleware = (req: any, res: any, next: any) => {
  // Log webhook request
  logger.info('Webhook request received', {
    source: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type')
  });

  // Add request timestamp
  req.webhookTimestamp = Date.now();
  
  next();
};

// Apply security middleware to all webhook routes
router.use(webhookSecurityMiddleware);

// Apply rate limiting to webhook routes
router.use(webhookRateLimiterMiddleware);

/**
 * Google Voice webhook endpoint
 * Handles real-time notifications from Google Voice API
 */
router.post('/google-voice', 
  WebhookController.validateGoogleVoiceWebhook,
  asyncHandler(async (req, res, next) => {
    if (!webhookController) {
      logger.error('Webhook controller not initialized');
      return res.status(500).json({ error: 'Service not available' });
    }
    
    return await webhookController.handleGoogleVoiceWebhook(req, res, next);
  })
);

/**
 * Google Pub/Sub webhook endpoint
 * Alternative endpoint for Google Pub/Sub push notifications
 */
router.post('/google-pubsub',
  WebhookController.validateGoogleVoiceWebhook,
  asyncHandler(async (req, res, next) => {
    if (!webhookController) {
      logger.error('Webhook controller not initialized');
      return res.status(500).json({ error: 'Service not available' });
    }
    
    // Process as Google Voice webhook (same handler)
    return await webhookController.handleGoogleVoiceWebhook(req, res, next);
    await webhookController.handleGoogleVoiceWebhook(req, res, next);
  })
);

/**
 * Twilio webhook endpoint
 * For SMS/Voice via Twilio (alternative provider)
 */
router.post('/twilio',
  WebhookController.validateTwilioWebhook,
  asyncHandler(async (req, res, next) => {
    if (!webhookController) {
      logger.error('Webhook controller not initialized');
      return res.status(500).json({ error: 'Service not available' });
    }
    
    return await webhookController.handleTwilioWebhook(req, res, next);
  })
);

/**
 * Generic webhook endpoint for testing
 * Useful for development and debugging
 */
router.post('/generic',
  asyncHandler(async (req, res, next) => {
    if (!webhookController) {
      logger.error('Webhook controller not initialized');
      return res.status(500).json({ error: 'Service not available' });
    }
    
    return await webhookController.handleGenericWebhook(req, res, next);
  })
);

/**
 * Webhook health check endpoint
 */
router.get('/health', asyncHandler(async (req, res) => {
  const { queueService: qs, notificationService: ns } = getServices();
  const db = DatabaseService.getInstance();
  
  const healthCheck = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      webhookController: !!webhookController,
      database: true, // DatabaseService.getInstance() always succeeds or throws
      queueService: !!qs,
      notificationService: !!ns
    },
    version: process.env.npm_package_version || '1.0.0'
  };

  // Check database connectivity
  try {
    await db.raw('SELECT 1');
    healthCheck.services.database = true;
  } catch (error) {
    healthCheck.services.database = false;
    healthCheck.status = 'degraded';
  }

  // Check queue service
  try {
    const metrics = await qs.getMetrics();
    healthCheck.services.queueService = true;
  } catch (error) {
    healthCheck.services.queueService = false;
    healthCheck.status = 'degraded';
  }

  const statusCode = healthCheck.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(healthCheck);
}));

/**
 * Webhook metrics endpoint
 * Returns processing statistics and performance metrics
 */
router.get('/metrics', asyncHandler(async (req, res, next) => {
  if (!webhookController) {
    return res.status(500).json({ error: 'Service not available' });
  }
  
  return await webhookController.getWebhookMetrics(req, res, next);
}));

/**
 * Webhook configuration endpoint
 * Returns current webhook configuration for debugging
 */
router.get('/config', asyncHandler(async (req, res) => {
  const config = {
    endpoints: {
      googleVoice: '/api/webhooks/google-voice',
      googlePubSub: '/api/webhooks/google-pubsub',
      twilio: '/api/webhooks/twilio',
      generic: '/api/webhooks/generic'
    },
    security: {
      signatureVerification: {
        googleVoice: !!process.env.GOOGLE_WEBHOOK_SECRET,
        twilio: !!process.env.TWILIO_WEBHOOK_SECRET
      },
      rateLimiting: {
        enabled: true,
        windowMs: 60000,
        maxRequests: 200
      }
    },
    processing: {
      queueEnabled: true,
      notificationsEnabled: true,
      webSocketEnabled: !!webhookController
    },
    timestamp: new Date().toISOString()
  };

  res.json(config);
}));

/**
 * Test webhook endpoint
 * Allows manual testing of webhook processing
 */
router.post('/test', asyncHandler(async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Test endpoint not available in production' });
  }

  const testPayload = {
    eventType: 'message_received',
    timestamp: new Date().toISOString(),
    messageId: `test-${Date.now()}`,
    phoneNumber: req.body.phoneNumber || '+15551234567',
    content: req.body.content || 'This is a test message for webhook processing',
    direction: 'inbound',
    metadata: {
      test: true,
      source: 'webhook-test-endpoint'
    }
  };

  logger.info('Test webhook triggered', { testPayload });

  if (!webhookController) {
    return res.status(500).json({ error: 'Webhook controller not available' });
  }

  // Create a mock request object
  const mockReq = {
    ...req,
    body: testPayload,
    ip: req.ip,
    get: (header: string) => req.get(header)
  };

  try {
    await webhookController.handleGoogleVoiceWebhook(mockReq as any, res, () => {});
    return;
  } catch (error) {
    logger.error('Test webhook failed', { error: (error as Error).message });
    return res.status(500).json({ 
      error: 'Test webhook failed', 
      details: (error as Error).message 
    });
  }
}));

export default router;