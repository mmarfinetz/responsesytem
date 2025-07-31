import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../services/DatabaseService';
import { logger } from '../utils/logger';

export interface Webhook {
  id: string;
  source: 'google_voice' | 'google_calendar' | 'pubsub' | 'stripe' | 'twilio' | 'other';
  event: string;
  eventId: string;
  payload: Record<string, any>;
  headers?: Record<string, any>;
  signature?: string;
  status: 'received' | 'processing' | 'completed' | 'failed' | 'duplicate';
  priority: 'low' | 'medium' | 'high' | 'emergency';
  processedAt?: Date;
  processingResult?: Record<string, any>;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  nextRetryAt?: Date;
  isDuplicate: boolean;
  duplicateOfId?: string;
  processingDurationMs?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookProcessingJob {
  id: string;
  webhookId: string;
  jobType: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'emergency';
  jobData?: Record<string, any>;
  result?: Record<string, any>;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  scheduledAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  processingDurationMs?: number;
  workerId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookBusinessRule {
  id: string;
  name: string;
  description?: string;
  source: 'google_voice' | 'google_calendar' | 'pubsub' | 'stripe' | 'twilio' | 'any';
  eventPattern?: string;
  conditions: Record<string, any>;
  actions: Record<string, any>;
  priority: number;
  isActive: boolean;
  matchCount: number;
  lastMatchedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmergencyKeyword {
  id: string;
  keyword: string;
  pattern?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'flooding' | 'gas_leak' | 'no_water' | 'backup' | 'burst_pipe' | 'electrical' | 'other';
  description?: string;
  actions: string[];
  escalationMinutes: number;
  requiresImmediate: boolean;
  isActive: boolean;
  matchCount: number;
  lastMatchedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceTypePattern {
  id: string;
  pattern: string;
  serviceType: string;
  confidence: number;
  requiredSkills: string[];
  typicalParts: string[];
  estimatedDuration: number;
  isActive: boolean;
  matchCount: number;
  lastMatchedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface StaffNotificationRule {
  id: string;
  userId: string;
  notificationType: 'emergency_message' | 'new_customer' | 'quote_request' | 'job_update' | 'system_alert' | 'missed_call' | 'voicemail';
  severity: 'low' | 'medium' | 'high' | 'critical';
  timeWindows: Record<string, any>;
  contactMethods: string[];
  delayMinutes: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookMetrics {
  id: string;
  source: string;
  event: string;
  date: Date;
  hour: number;
  totalReceived: number;
  totalProcessed: number;
  totalFailed: number;
  totalDuplicates: number;
  emergencyCount: number;
  avgProcessingTimeMs: number;
  maxProcessingTimeMs: number;
  minProcessingTimeMs: number;
  createdAt: Date;
  updatedAt: Date;
}

export class WebhookModel {
  constructor(private db: DatabaseService) {}

  async create(webhook: Omit<Webhook, 'id' | 'createdAt' | 'updatedAt'>): Promise<Webhook> {
    try {
      const knex = DatabaseService.getInstance();
      const id = uuidv4();
      const now = new Date();

      // Check for duplicates
      const existing = await knex('webhooks')
        .where({ eventId: webhook.eventId, source: webhook.source })
        .first();

      if (existing) {
        logger.info('Duplicate webhook detected', { 
          eventId: webhook.eventId, 
          source: webhook.source,
          originalId: existing.id 
        });
        
        // Update the existing record as duplicate reference
        await knex('webhooks').where({ id }).update({
          status: 'duplicate',
          isDuplicate: true,
          duplicateOfId: existing.id,
          updatedAt: now
        });

        return { ...webhook, id, isDuplicate: true, duplicateOfId: existing.id, createdAt: now, updatedAt: now };
      }

      const webhookRecord = {
        id,
        ...webhook,
        payload: JSON.stringify(webhook.payload),
        headers: webhook.headers ? JSON.stringify(webhook.headers) : null,
        processingResult: webhook.processingResult ? JSON.stringify(webhook.processingResult) : null,
        createdAt: now,
        updatedAt: now
      };

      await knex('webhooks').insert(webhookRecord);

      logger.info('Created webhook', { 
        id, 
        source: webhook.source, 
        event: webhook.event,
        eventId: webhook.eventId,
        priority: webhook.priority 
      });

      return { ...webhook, id, createdAt: now, updatedAt: now };
    } catch (error) {
      logger.error('Failed to create webhook', { webhook, error });
      throw error;
    }
  }

  async findById(id: string): Promise<Webhook | null> {
    try {
      const knex = DatabaseService.getInstance();
      const row = await knex('webhooks').where({ id }).first();
      return row ? this.mapWebhookRow(row) : null;
    } catch (error) {
      logger.error('Failed to find webhook by ID', { id, error });
      throw error;
    }
  }

  async findPendingForProcessing(limit: number = 50): Promise<Webhook[]> {
    try {
      const knex = DatabaseService.getInstance();
      const rows = await knex('webhooks')
        .where({ status: 'received' })
        .where('isDuplicate', false)
        .where(function(this: any) {
          this.whereNull('nextRetryAt').orWhere('nextRetryAt', '<=', new Date());
        })
        .orderBy([
          { column: 'priority', order: 'desc' }, // emergency first
          { column: 'createdAt', order: 'asc' }  // FIFO within priority
        ])
        .limit(limit);

      return rows.map((row: any) => this.mapWebhookRow(row));
    } catch (error) {
      logger.error('Failed to find pending webhooks', { error });
      throw error;
    }
  }

  async markProcessing(id: string, workerId?: string): Promise<void> {
    try {
      const knex = DatabaseService.getInstance();
      await knex('webhooks').where({ id }).update({
        status: 'processing',
        updatedAt: new Date()
      });

      logger.info('Marked webhook as processing', { id, workerId });
    } catch (error) {
      logger.error('Failed to mark webhook as processing', { id, error });
      throw error;
    }
  }

  async markCompleted(id: string, result?: Record<string, any>, processingDurationMs?: number): Promise<void> {
    try {
      const knex = DatabaseService.getInstance();
      await knex('webhooks').where({ id }).update({
        status: 'completed',
        processedAt: new Date(),
        processingResult: result ? JSON.stringify(result) : null,
        processingDurationMs,
        updatedAt: new Date()
      });

      logger.info('Marked webhook as completed', { id, processingDurationMs });
    } catch (error) {
      logger.error('Failed to mark webhook as completed', { id, error });
      throw error;
    }
  }

  async markFailed(id: string, errorMessage: string, scheduleRetry: boolean = true): Promise<void> {
    try {
      const knex = DatabaseService.getInstance();
      const webhook = await this.findById(id);
      
      if (!webhook) {
        throw new Error('Webhook not found');
      }

      const updates: any = {
        status: 'failed',
        errorMessage,
        retryCount: webhook.retryCount + 1,
        updatedAt: new Date()
      };

      // Schedule retry if under max retries
      if (scheduleRetry && webhook.retryCount < webhook.maxRetries) {
        const retryDelay = Math.pow(2, webhook.retryCount) * 60 * 1000; // Exponential backoff
        updates.nextRetryAt = new Date(Date.now() + retryDelay);
        updates.status = 'received'; // Reset to received for retry
      }

      await knex('webhooks').where({ id }).update(updates);

      logger.warn('Marked webhook as failed', { 
        id, 
        retryCount: updates.retryCount, 
        willRetry: scheduleRetry && webhook.retryCount < webhook.maxRetries 
      });
    } catch (error) {
      logger.error('Failed to mark webhook as failed', { id, error });
      throw error;
    }
  }

  async getMetrics(source?: string, hours: number = 24): Promise<any> {
    try {
      const knex = DatabaseService.getInstance();
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);

      let query = knex('webhooks')
        .where('createdAt', '>=', since);

      if (source) {
        query = query.where('source', source);
      }

      const metrics = await query
        .select([
          'source',
          'status',
          knex.raw('COUNT(*) as count'),
          knex.raw('AVG(processing_duration_ms) as avg_duration'),
          knex.raw('MAX(processing_duration_ms) as max_duration'),
          knex.raw('MIN(processing_duration_ms) as min_duration')
        ])
        .groupBy('source', 'status');

      return metrics;
    } catch (error) {
      logger.error('Failed to get webhook metrics', { error });
      throw error;
    }
  }

  private mapWebhookRow(row: any): Webhook {
    return {
      id: row.id,
      source: row.source,
      event: row.event,
      eventId: row.eventId,
      payload: JSON.parse(row.payload || '{}'),
      headers: row.headers ? JSON.parse(row.headers) : undefined,
      signature: row.signature,
      status: row.status,
      priority: row.priority,
      processedAt: row.processedAt ? new Date(row.processedAt) : undefined,
      processingResult: row.processingResult ? JSON.parse(row.processingResult) : undefined,
      errorMessage: row.errorMessage,
      retryCount: row.retryCount || 0,
      maxRetries: row.maxRetries || 3,
      nextRetryAt: row.nextRetryAt ? new Date(row.nextRetryAt) : undefined,
      isDuplicate: row.isDuplicate || false,
      duplicateOfId: row.duplicateOfId,
      processingDurationMs: row.processingDurationMs,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  }
}

export class WebhookProcessingJobModel {
  constructor(private db: DatabaseService) {}

  async create(job: Omit<WebhookProcessingJob, 'id' | 'createdAt' | 'updatedAt'>): Promise<WebhookProcessingJob> {
    try {
      const knex = DatabaseService.getInstance();
      const id = uuidv4();
      const now = new Date();

      const jobRecord = {
        id,
        ...job,
        jobData: job.jobData ? JSON.stringify(job.jobData) : null,
        result: job.result ? JSON.stringify(job.result) : null,
        createdAt: now,
        updatedAt: now
      };

      await knex('webhook_processing_jobs').insert(jobRecord);

      logger.info('Created webhook processing job', { 
        id, 
        webhookId: job.webhookId,
        jobType: job.jobType,
        priority: job.priority 
      });

      return { ...job, id, createdAt: now, updatedAt: now };
    } catch (error) {
      logger.error('Failed to create webhook processing job', { job, error });
      throw error;
    }
  }

  async findNextJob(jobTypes?: string[]): Promise<WebhookProcessingJob | null> {
    try {
      const knex = DatabaseService.getInstance();
      
      let query = knex('webhook_processing_jobs')
        .where('status', 'pending')
        .where('scheduledAt', '<=', new Date());

      if (jobTypes && jobTypes.length > 0) {
        query = query.whereIn('jobType', jobTypes);
      }

      const row = await query
        .orderBy([
          { column: 'priority', order: 'desc' },
          { column: 'scheduledAt', order: 'asc' }
        ])
        .first();

      return row ? this.mapJobRow(row) : null;
    } catch (error) {
      logger.error('Failed to find next webhook processing job', { error });
      throw error;
    }
  }

  async markStarted(id: string, workerId: string): Promise<void> {
    try {
      const knex = DatabaseService.getInstance();
      await knex('webhook_processing_jobs').where({ id }).update({
        status: 'processing',
        startedAt: new Date(),
        workerId,
        updatedAt: new Date()
      });

      logger.info('Marked job as started', { id, workerId });
    } catch (error) {
      logger.error('Failed to mark job as started', { id, error });
      throw error;
    }
  }

  async markCompleted(id: string, result?: Record<string, any>): Promise<void> {
    try {
      const knex = DatabaseService.getInstance();
      const startTime = await knex('webhook_processing_jobs')
        .where({ id })
        .select('startedAt')
        .first();

      const processingDurationMs = startTime?.startedAt 
        ? Date.now() - new Date(startTime.startedAt).getTime()
        : null;

      await knex('webhook_processing_jobs').where({ id }).update({
        status: 'completed',
        completedAt: new Date(),
        result: result ? JSON.stringify(result) : null,
        processingDurationMs,
        updatedAt: new Date()
      });

      logger.info('Marked job as completed', { id, processingDurationMs });
    } catch (error) {
      logger.error('Failed to mark job as completed', { id, error });
      throw error;
    }
  }

  async markFailed(id: string, errorMessage: string): Promise<void> {
    try {
      const knex = DatabaseService.getInstance();
      const job = await knex('webhook_processing_jobs').where({ id }).first();
      
      if (!job) {
        throw new Error('Job not found');
      }

      const updates: any = {
        status: 'failed',
        errorMessage,
        retryCount: (job.retryCount || 0) + 1,
        updatedAt: new Date()
      };

      // Schedule retry if under max retries
      if (job.retryCount < job.maxRetries) {
        const retryDelay = Math.pow(2, job.retryCount) * 30 * 1000; // Shorter backoff for jobs
        updates.scheduledAt = new Date(Date.now() + retryDelay);
        updates.status = 'pending';
      }

      await knex('webhook_processing_jobs').where({ id }).update(updates);

      logger.warn('Marked job as failed', { id, retryCount: updates.retryCount });
    } catch (error) {
      logger.error('Failed to mark job as failed', { id, error });
      throw error;
    }
  }

  private mapJobRow(row: any): WebhookProcessingJob {
    return {
      id: row.id,
      webhookId: row.webhookId,
      jobType: row.jobType,
      status: row.status,
      priority: row.priority,
      jobData: row.jobData ? JSON.parse(row.jobData) : undefined,
      result: row.result ? JSON.parse(row.result) : undefined,
      errorMessage: row.errorMessage,
      retryCount: row.retryCount || 0,
      maxRetries: row.maxRetries || 3,
      scheduledAt: new Date(row.scheduledAt),
      startedAt: row.startedAt ? new Date(row.startedAt) : undefined,
      completedAt: row.completedAt ? new Date(row.completedAt) : undefined,
      processingDurationMs: row.processingDurationMs,
      workerId: row.workerId,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  }
}

export class EmergencyKeywordModel {
  constructor(private db: DatabaseService) {}

  async findAll(): Promise<EmergencyKeyword[]> {
    try {
      const knex = DatabaseService.getInstance();
      const rows = await knex('emergency_keywords')
        .where('isActive', true)
        .orderBy('severity', 'desc')
        .orderBy('matchCount', 'desc');

      return rows.map((row: any) => this.mapKeywordRow(row));
    } catch (error) {
      logger.error('Failed to find emergency keywords', { error });
      throw error;
    }
  }

  async incrementMatchCount(id: string): Promise<void> {
    try {
      const knex = DatabaseService.getInstance();
      await knex('emergency_keywords').where({ id }).update({
        matchCount: knex.raw('match_count + 1'),
        lastMatchedAt: new Date(),
        updatedAt: new Date()
      });
    } catch (error) {
      logger.error('Failed to increment keyword match count', { id, error });
      throw error;
    }
  }

  private mapKeywordRow(row: any): EmergencyKeyword {
    return {
      id: row.id,
      keyword: row.keyword,
      pattern: row.pattern,
      severity: row.severity,
      category: row.category,
      description: row.description,
      actions: JSON.parse(row.actions || '[]'),
      escalationMinutes: row.escalationMinutes || 15,
      requiresImmediate: row.requiresImmediate || false,
      isActive: row.isActive,
      matchCount: row.matchCount || 0,
      lastMatchedAt: row.lastMatchedAt ? new Date(row.lastMatchedAt) : undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  }
}

export class ServiceTypePatternModel {
  constructor(private db: DatabaseService) {}

  async findAll(): Promise<ServiceTypePattern[]> {
    try {
      const knex = DatabaseService.getInstance();
      const rows = await knex('service_type_patterns')
        .where('isActive', true)
        .orderBy('confidence', 'desc');

      return rows.map((row: any) => this.mapPatternRow(row));
    } catch (error) {
      logger.error('Failed to find service type patterns', { error });
      throw error;
    }
  }

  async incrementMatchCount(id: string): Promise<void> {
    try {
      const knex = DatabaseService.getInstance();
      await knex('service_type_patterns').where({ id }).update({
        matchCount: knex.raw('match_count + 1'),
        lastMatchedAt: new Date(),
        updatedAt: new Date()
      });
    } catch (error) {
      logger.error('Failed to increment pattern match count', { id, error });
      throw error;
    }
  }

  private mapPatternRow(row: any): ServiceTypePattern {
    return {
      id: row.id,
      pattern: row.pattern,
      serviceType: row.serviceType,
      confidence: row.confidence || 80,
      requiredSkills: JSON.parse(row.requiredSkills || '[]'),
      typicalParts: JSON.parse(row.typicalParts || '[]'),
      estimatedDuration: row.estimatedDuration || 60,
      isActive: row.isActive,
      matchCount: row.matchCount || 0,
      lastMatchedAt: row.lastMatchedAt ? new Date(row.lastMatchedAt) : undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  }
}