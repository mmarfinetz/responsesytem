import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { WebhookProcessingService } from '../services/WebhookProcessingService';
import { DatabaseService } from '../services/DatabaseService';
import { QueueService } from '../services/QueueService';
import { NotificationService } from '../services/NotificationService';
import { WebSocketService } from '../services/WebSocketService';
import * as crypto from 'crypto';
import { body, validationResult } from 'express-validator';

export interface WebhookSignatureVerifier {
  verify(payload: string, signature: string, secret: string): boolean;
}

export class GooglePubSubVerifier implements WebhookSignatureVerifier {
  verify(payload: string, signature: string, secret: string): boolean {
    try {
      // Google Pub/Sub uses JWT signatures
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('base64');
      
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'base64'),
        Buffer.from(expectedSignature, 'base64')
      );
    } catch (error) {
      logger.error('Failed to verify Google Pub/Sub signature', { error });
      return false;
    }
  }
}

export class TwilioVerifier implements WebhookSignatureVerifier {
  verify(payload: string, signature: string, secret: string): boolean {
    try {
      const expectedSignature = crypto
        .createHmac('sha1', secret)
        .update(payload)
        .digest('base64');
      
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      logger.error('Failed to verify Twilio signature', { error });
      return false;
    }
  }
}

export class WebhookController {
  private processingService: WebhookProcessingService;
  private queueService: QueueService;
  private notificationService: NotificationService;
  private webSocketService?: WebSocketService;
  
  private verifiers = new Map<string, WebhookSignatureVerifier>([
    ['google_pubsub', new GooglePubSubVerifier()],
    ['twilio', new TwilioVerifier()]
  ]);

  // Rate limiting tracking
  private rateLimitTracking = new Map<string, { count: number; resetTime: number }>();
  private readonly rateLimitWindow = 60 * 1000; // 1 minute
  private readonly rateLimitMax = 100; // 100 requests per minute per IP

  // Duplicate detection tracking
  private recentWebhooks = new Map<string, number>();
  private readonly duplicateWindowMs = 5 * 60 * 1000; // 5 minutes

  constructor(
    private db: DatabaseService,
    queueService: QueueService,
    notificationService: NotificationService,
    webSocketService?: WebSocketService
  ) {
    this.processingService = new WebhookProcessingService(db);
    this.queueService = queueService;
    this.notificationService = notificationService;
    this.webSocketService = webSocketService;
    
    // Link services
    if (webSocketService) {
      this.notificationService.setWebSocketService(webSocketService);
    }

    // Cleanup old tracking data periodically
    setInterval(() => {
      this.cleanupTrackingData();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Handle Google Voice webhook
   */
  async handleGoogleVoiceWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    const startTime = Date.now();
    let eventId: string | undefined;

    try {
      // 1. Extract and validate request data
      const { payload, signature, headers } = this.extractWebhookData(req);
      
      // 2. Verify signature if provided
      if (signature && process.env.GOOGLE_WEBHOOK_SECRET) {
        const isValid = this.verifySignature(payload, signature, 'google_pubsub');
        if (!isValid) {
          logger.warn('Invalid Google Voice webhook signature', {
            ip: req.ip,
            userAgent: req.get('User-Agent')
          });
          
          res.status(401).json({ 
            error: 'Invalid signature',
            timestamp: new Date().toISOString()
          });
          return;
        }
      }

      // 3. Rate limiting check
      if (!this.checkRateLimit(req.ip || '')) {
        logger.warn('Rate limit exceeded for Google Voice webhook', { ip: req.ip });
        res.status(429).json({ 
          error: 'Rate limit exceeded',
          retryAfter: Math.ceil(this.rateLimitWindow / 1000)
        });
        return;
      }

      // 4. Extract event ID for duplicate detection
      eventId = this.extractEventId(payload);
      if (eventId && this.isDuplicateWebhook(eventId)) {
        logger.info('Duplicate Google Voice webhook ignored', { eventId });
        res.status(200).json({ 
          status: 'duplicate',
          eventId,
          message: 'Webhook already processed'
        });
        return;
      }

      // 5. Process the webhook
      const processingResult = await this.processingService.processGoogleVoiceWebhook(
        payload,
        headers,
        signature
      );

      // 6. Handle processing result
      if (processingResult.success) {
        // Mark as processed if we have an event ID
        if (eventId) {
          this.markWebhookProcessed(eventId);
        }

        // Send real-time updates via WebSocket
        await this.sendRealtimeUpdates(processingResult);

        // Log successful processing
        logger.info('Google Voice webhook processed successfully', {
          eventId,
          customerId: processingResult.customerId,
          classification: processingResult.classification?.estimatedPriority,
          processingTimeMs: processingResult.processingTimeMs,
          jobsCreated: processingResult.jobsCreated?.length || 0
        });

        res.status(200).json({
          status: 'success',
          eventId,
          customerId: processingResult.customerId,
          conversationId: processingResult.conversationId,
          priority: processingResult.classification?.estimatedPriority,
          jobsCreated: processingResult.jobsCreated?.length || 0,
          processingTimeMs: processingResult.processingTimeMs
        });
      } else {
        // Handle processing failure
        logger.error('Google Voice webhook processing failed', {
          eventId,
          errors: processingResult.errors,
          processingTimeMs: processingResult.processingTimeMs
        });

        res.status(500).json({
          status: 'error',
          eventId,
          errors: processingResult.errors,
          processingTimeMs: processingResult.processingTimeMs
        });
      }

    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      
      logger.error('Google Voice webhook handling failed', {
        eventId,
        error: (error as Error).message,
        stack: (error as Error).stack,
        processingTimeMs,
        ip: req.ip
      });

      // Send system alert for webhook failures
      if (this.notificationService) {
        try {
          await this.notificationService.sendSystemAlert(
            'Webhook Processing Failed',
            `Failed to process Google Voice webhook: ${(error as Error).message}`,
            'high',
            { eventId, error: (error as Error).message, ip: req.ip }
          );
        } catch (notificationError) {
          logger.error('Failed to send webhook failure notification', { notificationError });
        }
      }

      res.status(500).json({
        status: 'error',
        eventId,
        error: 'Internal server error',
        processingTimeMs
      });
    }
  }

  /**
   * Handle Twilio webhook (for SMS/Voice via Twilio)
   */
  async handleTwilioWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { payload, signature, headers } = this.extractWebhookData(req);
      
      // Verify Twilio signature
      if (signature && process.env.TWILIO_WEBHOOK_SECRET) {
        const isValid = this.verifySignature(payload, signature, 'twilio');
        if (!isValid) {
          logger.warn('Invalid Twilio webhook signature', { ip: req.ip });
          res.status(401).json({ error: 'Invalid signature' });
          return;
        }
      }

      // Rate limiting
      if (!this.checkRateLimit(req.ip || '')) {
        res.status(429).json({ error: 'Rate limit exceeded' });
        return;
      }

      // For now, acknowledge Twilio webhooks
      // Future implementation would process Twilio events similarly to Google Voice
      logger.info('Twilio webhook received', { payload: JSON.stringify(payload) });
      
      res.status(200).json({ status: 'received' });
    } catch (error) {
      logger.error('Twilio webhook handling failed', { error: (error as Error).message });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Handle generic webhook for testing
   */
  async handleGenericWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { payload, headers } = this.extractWebhookData(req);
      
      logger.info('Generic webhook received', {
        payload: JSON.stringify(payload),
        headers: JSON.stringify(headers),
        ip: req.ip
      });

      // For testing/development purposes
      res.status(200).json({
        status: 'received',
        timestamp: new Date().toISOString(),
        payload
      });
    } catch (error) {
      logger.error('Generic webhook handling failed', { error: (error as Error).message });
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Get webhook metrics and status
   */
  async getWebhookMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const knex = this.db;
      
      // Get webhook statistics from the database service
      const stats: any[] = [];
      const recentActivity: any[] = [];
      
      // Note: Database queries would need to be implemented in DatabaseService
      // For now, returning empty arrays to prevent compilation errors

      // Get queue metrics
      const queueMetrics = await this.queueService.getMetrics();

      // Get current rate limit status
      const rateLimitStatus = {
        windowMs: this.rateLimitWindow,
        maxRequests: this.rateLimitMax,
        currentTrackedIPs: this.rateLimitTracking.size
      };

      res.json({
        statistics: stats,
        recentActivity,
        queueMetrics,
        rateLimitStatus,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to get webhook metrics', { error: (error as Error).message });
      res.status(500).json({ error: 'Failed to get metrics' });
    }
  }

  /**
   * Validation middleware for Google Voice webhooks
   */
  static validateGoogleVoiceWebhook = [
    body().custom((value, { req }) => {
      // Check if request has body
      if (!req.body || Object.keys(req.body).length === 0) {
        throw new Error('Request body is required');
      }
      return true;
    }),
    
    (req: Request, res: Response, next: NextFunction) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Google Voice webhook validation failed', {
          errors: errors.array(),
          ip: req.ip
        });
        
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }
      next();
      return;
    }
  ];

  /**
   * Validation middleware for Twilio webhooks
   */
  static validateTwilioWebhook = [
    body('From').notEmpty().withMessage('From field is required'),
    body('To').optional(),
    body('Body').optional(),
    
    (req: Request, res: Response, next: NextFunction) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        logger.warn('Twilio webhook validation failed', {
          errors: errors.array(),
          ip: req.ip
        });
        
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array()
        });
      }
      next();
      return;
    }
  ];

  // Private helper methods

  private extractWebhookData(req: Request): { payload: any; signature?: string; headers: Record<string, any> } {
    return {
      payload: req.body,
      signature: req.get('X-Signature') || req.get('X-Twilio-Signature') || req.get('Authorization'),
      headers: {
        'content-type': req.get('Content-Type'),
        'user-agent': req.get('User-Agent'),
        'x-forwarded-for': req.get('X-Forwarded-For'),
        'x-real-ip': req.get('X-Real-IP')
      }
    };
  }

  private verifySignature(payload: string, signature: string, verifierType: string): boolean {
    const verifier = this.verifiers.get(verifierType);
    if (!verifier) {
      logger.error('Unknown signature verifier type', { verifierType });
      return false;
    }

    const secret = verifierType === 'google_pubsub' 
      ? process.env.GOOGLE_WEBHOOK_SECRET!
      : process.env.TWILIO_WEBHOOK_SECRET!;

    return verifier.verify(JSON.stringify(payload), signature, secret);
  }

  private checkRateLimit(ip: string): boolean {
    const now = Date.now();
    const limit = this.rateLimitTracking.get(ip);

    if (!limit) {
      this.rateLimitTracking.set(ip, { count: 1, resetTime: now + this.rateLimitWindow });
      return true;
    }

    if (now > limit.resetTime) {
      // Reset the counter
      this.rateLimitTracking.set(ip, { count: 1, resetTime: now + this.rateLimitWindow });
      return true;
    }

    if (limit.count >= this.rateLimitMax) {
      return false;
    }

    limit.count++;
    return true;
  }

  private extractEventId(payload: any): string | undefined {
    // Try to extract a unique event ID from various payload formats
    return payload.messageId || 
           payload.eventId || 
           payload.id || 
           payload.message?.messageId ||
           payload.data?.id;
  }

  private isDuplicateWebhook(eventId: string): boolean {
    const lastProcessed = this.recentWebhooks.get(eventId);
    if (!lastProcessed) {
      return false;
    }

    // Check if it's within the duplicate detection window
    return (Date.now() - lastProcessed) < this.duplicateWindowMs;
  }

  private markWebhookProcessed(eventId: string): void {
    this.recentWebhooks.set(eventId, Date.now());
  }

  private async sendRealtimeUpdates(processingResult: any): Promise<void> {
    if (!this.webSocketService) return;

    try {
      // Send dashboard update
      this.webSocketService.sendDashboardUpdate({
        type: 'conversation_update',
        data: {
          customerId: processingResult.customerId,
          conversationId: processingResult.conversationId,
          classification: processingResult.classification,
          priority: processingResult.classification?.estimatedPriority
        },
        timestamp: new Date(),
        priority: processingResult.classification?.estimatedPriority || 'medium'
      });

      // Send emergency alerts if needed
      if (processingResult.classification?.isEmergency) {
        this.webSocketService.sendNotification('all', {
          id: `emergency-${processingResult.conversationId}`,
          type: 'emergency_message',
          severity: processingResult.classification.emergencyLevel,
          title: `🚨 Emergency Alert`,
          message: `Emergency detected from customer ${processingResult.customerId}`,
          data: {
            customerId: processingResult.customerId,
            conversationId: processingResult.conversationId,
            classification: processingResult.classification
          }
        });
      }

    } catch (error) {
      logger.error('Failed to send realtime updates', { error: (error as Error).message });
    }
  }

  private cleanupTrackingData(): void {
    const now = Date.now();

    // Cleanup rate limit tracking
    const rateLimitEntries = Array.from(this.rateLimitTracking.entries());
    for (const [ip, limit] of rateLimitEntries) {
      if (now > limit.resetTime) {
        this.rateLimitTracking.delete(ip);
      }
    }

    // Cleanup duplicate tracking
    const webhookEntries = Array.from(this.recentWebhooks.entries());
    for (const [eventId, timestamp] of webhookEntries) {
      if ((now - timestamp) > this.duplicateWindowMs) {
        this.recentWebhooks.delete(eventId);
      }
    }

    logger.debug('Cleaned up webhook tracking data', {
      rateLimitEntries: this.rateLimitTracking.size,
      duplicateEntries: this.recentWebhooks.size
    });
  }
}