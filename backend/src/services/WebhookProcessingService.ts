import { DatabaseService } from './DatabaseService';
import { BusinessRulesService, MessageClassification } from './BusinessRulesService';
import { CustomerMatchingService } from './CustomerMatchingService';
import { WebhookModel, WebhookProcessingJobModel, Webhook, WebhookProcessingJob } from '../models/WebhookModels';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface GoogleVoiceEvent {
  eventType: 'message_received' | 'call_received' | 'voicemail_received' | 'call_ended' | 'message_status_update';
  timestamp: string;
  messageId?: string;
  callId?: string;
  voicemailId?: string;
  phoneNumber: string;
  content?: string;
  direction: 'inbound' | 'outbound';
  metadata?: {
    duration?: number;
    transcription?: string;
    confidence?: number;
    audioUrl?: string;
    attachments?: any[];
  };
}

export interface ProcessingResult {
  success: boolean;
  customerId?: string;
  conversationId?: string;
  classification?: MessageClassification;
  jobsCreated?: string[];
  notifications?: string[];
  errors?: string[];
  processingTimeMs: number;
}

export interface CustomerInfo {
  id: string;
  phone: string;
  name?: string;
  address?: string;
  isNewCustomer: boolean;
  lastContact?: Date;
  totalJobs: number;
  activeJobs: number;
}

export class WebhookProcessingService {
  private webhookModel: WebhookModel;
  private jobModel: WebhookProcessingJobModel;
  private businessRulesService: BusinessRulesService;
  private customerMatchingService: CustomerMatchingService;

  constructor(private db: DatabaseService) {
    this.webhookModel = new WebhookModel(db);
    this.jobModel = new WebhookProcessingJobModel(db);
    this.businessRulesService = new BusinessRulesService(db);
    this.customerMatchingService = new CustomerMatchingService(db);
  }

  /**
   * Process a Google Voice webhook event end-to-end
   */
  async processGoogleVoiceWebhook(
    eventPayload: any,
    headers: Record<string, any>,
    signature?: string
  ): Promise<ProcessingResult> {
    const startTime = Date.now();
    let webhook: Webhook | null = null;
    
    try {
      // 1. Parse and validate the event
      const event = this.parseGoogleVoiceEvent(eventPayload);
      
      // 2. Create webhook record
      webhook = await this.createWebhookRecord(event, headers, signature);
      
      // 3. Process the event based on type
      const result = await this.processEventByType(webhook, event);
      
      // 4. Mark webhook as completed
      const processingTimeMs = Date.now() - startTime;
      await this.webhookModel.markCompleted(webhook.id, result, processingTimeMs);
      
      result.processingTimeMs = processingTimeMs;
      
      logger.info('Successfully processed Google Voice webhook', {
        webhookId: webhook.id,
        eventType: event.eventType,
        phoneNumber: event.phoneNumber,
        processingTimeMs
      });
      
      return result;
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      
      if (webhook) {
        await this.webhookModel.markFailed(webhook.id, (error as Error).message);
      }
      
      logger.error('Failed to process Google Voice webhook', {
        webhookId: webhook?.id,
        error: (error as Error).message,
        stack: (error as Error).stack,
        processingTimeMs
      });
      
      return {
        success: false,
        errors: [(error as Error).message],
        processingTimeMs
      };
    }
  }

  /**
   * Parse Google Voice event payload
   */
  private parseGoogleVoiceEvent(payload: any): GoogleVoiceEvent {
    try {
      // Handle Pub/Sub message format
      if (payload.message && payload.message.data) {
        const decodedData = Buffer.from(payload.message.data, 'base64').toString('utf-8');
        const eventData = JSON.parse(decodedData);
        return this.normalizeGoogleVoiceEvent(eventData);
      }
      
      // Handle direct webhook format
      return this.normalizeGoogleVoiceEvent(payload);
    } catch (error) {
      logger.error('Failed to parse Google Voice event', { payload, error });
      throw new Error(`Invalid Google Voice event format: ${(error as Error).message}`);
    }
  }

  /**
   * Normalize Google Voice event to standard format
   */
  private normalizeGoogleVoiceEvent(eventData: any): GoogleVoiceEvent {
    // Map various Google Voice event formats to our standard format
    const eventType = this.mapEventType(eventData);
    
    return {
      eventType,
      timestamp: eventData.timestamp || eventData.time || new Date().toISOString(),
      messageId: eventData.messageId || eventData.id,
      callId: eventData.callId,
      voicemailId: eventData.voicemailId,
      phoneNumber: this.normalizePhoneNumber(eventData.phoneNumber || eventData.from || eventData.to),
      content: eventData.content || eventData.message || eventData.text,
      direction: eventData.direction || (eventData.from ? 'inbound' : 'outbound'),
      metadata: {
        duration: eventData.duration,
        transcription: eventData.transcription,
        confidence: eventData.confidence,
        audioUrl: eventData.audioUrl,
        attachments: eventData.attachments || []
      }
    };
  }

  /**
   * Map various Google Voice event types to our standard types
   */
  private mapEventType(eventData: any): GoogleVoiceEvent['eventType'] {
    const type = eventData.type || eventData.eventType || eventData.event;
    
    switch (type?.toLowerCase()) {
      case 'sms':
      case 'message':
      case 'text':
      case 'message_received':
        return 'message_received';
      case 'call':
      case 'call_received':
      case 'incoming_call':
        return 'call_received';
      case 'voicemail':
      case 'voicemail_received':
        return 'voicemail_received';
      case 'call_ended':
      case 'call_completed':
        return 'call_ended';
      case 'message_status':
      case 'delivery_status':
        return 'message_status_update';
      default:
        logger.warn('Unknown Google Voice event type', { type, eventData });
        return 'message_received'; // Default fallback
    }
  }

  /**
   * Normalize phone number format
   */
  private normalizePhoneNumber(phoneNumber: string): string {
    if (!phoneNumber) return '';
    
    // Remove all non-digit characters
    const digits = phoneNumber.replace(/\D/g, '');
    
    // Handle US numbers
    if (digits.length === 10) {
      return `+1${digits}`;
    }
    if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    }
    
    // Return as-is for international numbers
    return phoneNumber;
  }

  /**
   * Create webhook record in database
   */
  private async createWebhookRecord(
    event: GoogleVoiceEvent,
    headers: Record<string, any>,
    signature?: string
  ): Promise<Webhook> {
    const eventId = event.messageId || event.callId || event.voicemailId || uuidv4();
    
    // Determine initial priority based on event type
    let priority: Webhook['priority'] = 'medium';
    if (event.eventType === 'voicemail_received') priority = 'high';
    if (event.eventType === 'call_received') priority = 'high';
    
    const webhook = await this.webhookModel.create({
      source: 'google_voice',
      event: event.eventType,
      eventId,
      payload: event,
      headers,
      signature,
      status: 'received',
      priority,
      retryCount: 0,
      maxRetries: 3,
      isDuplicate: false
    });
    
    return webhook;
  }

  /**
   * Process event based on its type
   */
  private async processEventByType(
    webhook: Webhook,
    event: GoogleVoiceEvent
  ): Promise<ProcessingResult> {
    await this.webhookModel.markProcessing(webhook.id);
    
    switch (event.eventType) {
      case 'message_received':
        return this.processMessageReceived(webhook, event);
      case 'call_received':
        return this.processCallReceived(webhook, event);
      case 'voicemail_received':
        return this.processVoicemailReceived(webhook, event);
      case 'call_ended':
        return this.processCallEnded(webhook, event);
      case 'message_status_update':
        return this.processMessageStatusUpdate(webhook, event);
      default:
        logger.warn('Unhandled event type', { eventType: event.eventType });
        return { success: false, errors: [`Unhandled event type: ${event.eventType}`], processingTimeMs: 0 };
    }
  }

  /**
   * Process incoming message
   */
  private async processMessageReceived(
    webhook: Webhook,
    event: GoogleVoiceEvent
  ): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      success: true,
      jobsCreated: [],
      notifications: [],
      errors: [],
      processingTimeMs: 0
    };
    
    try {
      // 1. Find or create customer
      const customer = await this.findOrCreateCustomer(event.phoneNumber);
      result.customerId = customer.id;
      
      // 2. Classify the message
      if (event.content) {
        const classification = await this.businessRulesService.classifyMessage(
          event.content,
          event.phoneNumber,
          new Date(event.timestamp)
        );
        result.classification = classification;
        
        // 3. Update webhook priority based on classification
        if (classification.estimatedPriority === 'emergency') {
          await this.updateWebhookPriority(webhook.id, 'emergency');
        } else if (classification.estimatedPriority === 'high') {
          await this.updateWebhookPriority(webhook.id, 'high');
        }
        
        // 4. Create conversation record
        result.conversationId = await this.createConversationRecord(
          customer.id,
          event,
          classification
        );
        
        // 5. Create processing jobs based on classification
        const jobs = await this.createProcessingJobs(webhook.id, event, classification, customer);
        result.jobsCreated = jobs.map(job => job.id);
        
        // 6. Send immediate notifications if required
        if (classification.requiresImmediate) {
          const notifications = await this.sendImmediateNotifications(event, classification, customer);
          result.notifications = notifications;
        }
      }
      
      return result;
    } catch (error) {
      result.success = false;
      result.errors?.push((error as Error).message);
      logger.error('Failed to process message received', { webhookId: webhook.id, error });
      return result;
    }
  }

  /**
   * Process incoming call
   */
  private async processCallReceived(
    webhook: Webhook,
    event: GoogleVoiceEvent
  ): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      success: true,
      jobsCreated: [],
      notifications: [],
      errors: [],
      processingTimeMs: 0
    };
    
    try {
      // 1. Find or create customer
      const customer = await this.findOrCreateCustomer(event.phoneNumber);
      result.customerId = customer.id;
      
      // 2. Create call record
      result.conversationId = await this.createCallRecord(customer.id, event);
      
      // 3. Create notification job for incoming call
      const job = await this.jobModel.create({
        webhookId: webhook.id,
        jobType: 'notify_incoming_call',
        status: 'pending',
        priority: 'high',
        jobData: { event, customer },
        retryCount: 0,
        maxRetries: 2,
        scheduledAt: new Date()
      });
      
      result.jobsCreated = [job.id];
      
      return result;
    } catch (error) {
      result.success = false;
      result.errors?.push((error as Error).message);
      logger.error('Failed to process call received', { webhookId: webhook.id, error });
      return result;
    }
  }

  /**
   * Process voicemail
   */
  private async processVoicemailReceived(
    webhook: Webhook,
    event: GoogleVoiceEvent
  ): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      success: true,
      jobsCreated: [],
      notifications: [],
      errors: [],
      processingTimeMs: 0
    };
    
    try {
      // 1. Find or create customer
      const customer = await this.findOrCreateCustomer(event.phoneNumber);
      result.customerId = customer.id;
      
      // 2. Classify voicemail if transcription available
      let classification: MessageClassification | undefined;
      if (event.metadata?.transcription) {
        classification = await this.businessRulesService.classifyMessage(
          event.metadata.transcription,
          event.phoneNumber,
          new Date(event.timestamp)
        );
        result.classification = classification;
      }
      
      // 3. Create voicemail record
      result.conversationId = await this.createVoicemailRecord(customer.id, event, classification);
      
      // 4. Create processing jobs
      const jobs = await this.createVoicemailProcessingJobs(webhook.id, event, classification, customer);
      result.jobsCreated = jobs.map(job => job.id);
      
      // 5. High priority notification for voicemails
      const notifications = await this.sendVoicemailNotifications(event, classification, customer);
      result.notifications = notifications;
      
      return result;
    } catch (error) {
      result.success = false;
      result.errors?.push((error as Error).message);
      logger.error('Failed to process voicemail', { webhookId: webhook.id, error });
      return result;
    }
  }

  /**
   * Process call ended event
   */
  private async processCallEnded(
    webhook: Webhook,
    event: GoogleVoiceEvent
  ): Promise<ProcessingResult> {
    try {
      // Update call record with end time and duration
      await this.updateCallRecord(event);
      
      return {
        success: true,
        jobsCreated: [],
        notifications: [],
        errors: [],
        processingTimeMs: 0
      };
    } catch (error) {
      logger.error('Failed to process call ended', { webhookId: webhook.id, error });
      return {
        success: false,
        errors: [(error as Error).message],
        processingTimeMs: 0
      };
    }
  }

  /**
   * Process message status update
   */
  private async processMessageStatusUpdate(
    webhook: Webhook,
    event: GoogleVoiceEvent
  ): Promise<ProcessingResult> {
    try {
      // Update message delivery status
      await this.updateMessageStatus(event);
      
      return {
        success: true,
        jobsCreated: [],
        notifications: [],
        errors: [],
        processingTimeMs: 0
      };
    } catch (error) {
      logger.error('Failed to process message status update', { webhookId: webhook.id, error });
      return {
        success: false,
        errors: [(error as Error).message],
        processingTimeMs: 0
      };
    }
  }

  /**
   * Find or create customer record
   */
  private async findOrCreateCustomer(phoneNumber: string): Promise<CustomerInfo> {
    try {
      const matchResult = await this.customerMatchingService.matchCustomer({
        phoneNumber,
        createIfNotFound: true
      });
      
      if (!matchResult.customer) {
        throw new Error(`Failed to find or create customer for phone: ${phoneNumber}`);
      }
      
      const customer = matchResult.customer;
      
      // Get additional customer stats
      const knex = DatabaseService.getInstance();
      const stats = await knex('jobs')
        .where('customer_id', customer.id)
        .select([
          knex.raw('COUNT(*) as total_jobs'),
          knex.raw('COUNT(CASE WHEN status IN (?, ?, ?) THEN 1 END) as active_jobs', 
            ['quoted', 'scheduled', 'in_progress']),
          knex.raw('MAX(created_at) as last_contact')
        ])
        .first();
      
      return {
        id: customer.id,
        phone: customer.phone,
        name: `${customer.firstName} ${customer.lastName}`,
        address: customer.address,
        isNewCustomer: !customer.lastServiceDate,
        lastContact: (stats as any)?.last_contact ? new Date((stats as any).last_contact) : undefined,
        totalJobs: (stats as any)?.total_jobs || 0,
        activeJobs: (stats as any)?.active_jobs || 0
      };
    } catch (error) {
      logger.error('Failed to find or create customer', { phoneNumber, error });
      throw error;
    }
  }

  /**
   * Create conversation record
   */
  private async createConversationRecord(
    customerId: string,
    event: GoogleVoiceEvent,
    classification?: MessageClassification
  ): Promise<string> {
    try {
      const knex = DatabaseService.getInstance();
      const conversationId = uuidv4();
      
      await knex('conversations').insert({
        id: conversationId,
        customer_id: customerId,
        phone_number: event.phoneNumber,
        message_content: event.content,
        direction: event.direction,
        message_id: event.messageId,
        classification: classification ? JSON.stringify(classification) : null,
        priority: classification?.estimatedPriority || 'medium',
        is_emergency: classification?.isEmergency || false,
        requires_callback: classification?.requiresImmediate || false,
        created_at: new Date(event.timestamp),
        updated_at: new Date()
      });
      
      logger.info('Created conversation record', {
        conversationId,
        customerId,
        priority: classification?.estimatedPriority,
        isEmergency: classification?.isEmergency
      });
      
      return conversationId;
    } catch (error) {
      logger.error('Failed to create conversation record', { customerId, error });
      throw error;
    }
  }

  /**
   * Create processing jobs based on message classification
   */
  private async createProcessingJobs(
    webhookId: string,
    event: GoogleVoiceEvent,
    classification: MessageClassification,
    customer: CustomerInfo
  ): Promise<WebhookProcessingJob[]> {
    const jobs: WebhookProcessingJob[] = [];
    
    try {
      // Always create AI response generation job
      const responseJob = await this.jobModel.create({
        webhookId,
        jobType: 'generate_ai_response',
        status: 'pending',
        priority: classification.estimatedPriority,
        jobData: { event, classification, customer },
        retryCount: 0,
        maxRetries: 3,
        scheduledAt: new Date()
      });
      jobs.push(responseJob);
      
      // Create quote generation job if service type identified
      if (classification.serviceType && !classification.isEmergency) {
        const quoteJob = await this.jobModel.create({
          webhookId,
          jobType: 'generate_quote',
          status: 'pending',
          priority: 'medium',
          jobData: { event, classification, customer },
          retryCount: 0,
          maxRetries: 3,
          scheduledAt: new Date(Date.now() + 5 * 60 * 1000) // Delay 5 minutes
        });
        jobs.push(quoteJob);
      }
      
      // Create follow-up job for non-emergency messages
      if (!classification.isEmergency) {
        const followUpJob = await this.jobModel.create({
          webhookId,
          jobType: 'schedule_follow_up',
          status: 'pending',
          priority: 'low',
          jobData: { event, classification, customer },
          retryCount: 0,
          maxRetries: 2,
          scheduledAt: new Date(Date.now() + classification.estimatedResponseTime * 60 * 1000)
        });
        jobs.push(followUpJob);
      }
      
      return jobs;
    } catch (error) {
      logger.error('Failed to create processing jobs', { webhookId, error });
      throw error;
    }
  }

  // Additional helper methods would continue here...
  
  private async updateWebhookPriority(webhookId: string, priority: Webhook['priority']): Promise<void> {
    try {
      const knex = DatabaseService.getInstance();
      await knex('webhooks').where({ id: webhookId }).update({
        priority,
        updated_at: new Date()
      });
    } catch (error) {
      logger.error('Failed to update webhook priority', { webhookId, priority, error });
    }
  }

  private async createCallRecord(customerId: string, event: GoogleVoiceEvent): Promise<string> {
    // Implementation for creating call records
    const callId = uuidv4();
    // Database logic here...
    return callId;
  }

  private async createVoicemailRecord(
    customerId: string, 
    event: GoogleVoiceEvent, 
    classification?: MessageClassification
  ): Promise<string> {
    // Implementation for creating voicemail records
    const voicemailId = uuidv4();
    // Database logic here...
    return voicemailId;
  }

  private async createVoicemailProcessingJobs(
    webhookId: string,
    event: GoogleVoiceEvent,
    classification: MessageClassification | undefined,
    customer: CustomerInfo
  ): Promise<WebhookProcessingJob[]> {
    // Implementation for voicemail-specific jobs
    return [];
  }

  private async sendImmediateNotifications(
    event: GoogleVoiceEvent,
    classification: MessageClassification,
    customer: CustomerInfo
  ): Promise<string[]> {
    // Implementation for immediate notifications
    return [];
  }

  private async sendVoicemailNotifications(
    event: GoogleVoiceEvent,
    classification: MessageClassification | undefined,
    customer: CustomerInfo
  ): Promise<string[]> {
    // Implementation for voicemail notifications
    return [];
  }

  private async updateCallRecord(event: GoogleVoiceEvent): Promise<void> {
    // Implementation for updating call records
  }

  private async updateMessageStatus(event: GoogleVoiceEvent): Promise<void> {
    // Implementation for updating message status
  }
}