import { DatabaseService } from './DatabaseService';
import { WebhookProcessingJobModel, WebhookProcessingJob } from '../models/WebhookModels';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import * as cron from 'node-cron';

export interface JobProcessor {
  jobType: string;
  processor: (job: WebhookProcessingJob) => Promise<any>;
  concurrency?: number;
  retryDelay?: number;
}

export interface QueueMetrics {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  totalProcessed: number;
  averageProcessingTime: number;
  errorRate: number;
}

export interface QueueWorker {
  id: string;
  status: 'idle' | 'processing' | 'stopped';
  currentJob?: string;
  processedJobs: number;
  startedAt: Date;
  lastActivity: Date;
}

export class QueueService {
  private jobModel: WebhookProcessingJobModel;
  private processors = new Map<string, JobProcessor>();
  private workers = new Map<string, QueueWorker>();
  private isRunning = false;
  private processingInterval?: NodeJS.Timeout;
  private maxConcurrentJobs = 10;
  private pollingIntervalMs = 1000; // 1 second
  private workerTimeoutMs = 5 * 60 * 1000; // 5 minutes
  private deadLetterThreshold = 5; // Max failed attempts before dead letter
  
  // Job type priorities (higher number = higher priority)
  private readonly jobPriorities = {
    'notify_emergency': 100,
    'generate_emergency_response': 95,
    'notify_incoming_call': 90,
    'generate_ai_response': 80,
    'process_voicemail': 70,
    'generate_quote': 60,
    'schedule_follow_up': 50,
    'send_notification': 40,
    'update_customer_record': 30,
    'cleanup_data': 10
  };

  constructor(private db: DatabaseService) {
    this.jobModel = new WebhookProcessingJobModel(db);
    this.setupDefaultProcessors();
    this.setupCleanupTasks();
  }

  /**
   * Register a job processor
   */
  registerProcessor(processor: JobProcessor): void {
    this.processors.set(processor.jobType, processor);
    logger.info('Registered job processor', { 
      jobType: processor.jobType, 
      concurrency: processor.concurrency || 1 
    });
  }

  /**
   * Start the queue processing
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Queue service is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting queue service', { 
      maxConcurrentJobs: this.maxConcurrentJobs,
      pollingInterval: this.pollingIntervalMs 
    });

    // Create initial workers
    for (let i = 0; i < this.maxConcurrentJobs; i++) {
      this.createWorker();
    }

    // Start job processing loop
    this.processingInterval = setInterval(() => {
      this.processJobs().catch(error => {
        logger.error('Error in job processing loop', { error });
      });
    }, this.pollingIntervalMs);

    logger.info('Queue service started successfully');
  }

  /**
   * Stop the queue processing
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping queue service...');
    this.isRunning = false;

    // Clear processing interval
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }

    // Wait for active jobs to complete (with timeout)
    await this.gracefulShutdown();
    
    // Clear workers
    this.workers.clear();

    logger.info('Queue service stopped successfully');
  }

  /**
   * Add a job to the queue
   */
  async addJob(
    jobType: string,
    webhookId: string,
    jobData: any,
    options: {
      priority?: 'low' | 'medium' | 'high' | 'emergency';
      delay?: number; // Delay in milliseconds
      maxRetries?: number;
    } = {}
  ): Promise<WebhookProcessingJob> {
    try {
      const scheduledAt = new Date(Date.now() + (options.delay || 0));
      
      const job = await this.jobModel.create({
        webhookId,
        jobType,
        status: 'pending',
        priority: options.priority || 'medium',
        jobData,
        retryCount: 0,
        maxRetries: options.maxRetries || 3,
        scheduledAt
      });

      logger.info('Added job to queue', {
        jobId: job.id,
        jobType,
        priority: job.priority,
        scheduledAt
      });

      return job;
    } catch (error) {
      logger.error('Failed to add job to queue', { jobType, webhookId, error });
      throw error;
    }
  }

  /**
   * Get queue metrics
   */
  async getMetrics(): Promise<QueueMetrics> {
    try {
      const knex = await DatabaseService.getInstance();
      
      const statusCounts = await knex('webhook_processing_jobs')
        .select('status')
        .count('* as count')
        .groupBy('status');

      const metrics: QueueMetrics = {
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        totalProcessed: 0,
        averageProcessingTime: 0,
        errorRate: 0
      };

      // Calculate status counts
      statusCounts.forEach((row: any) => {
        const count = Number(row.count);
        switch (row.status) {
          case 'pending':
            metrics.pending = count;
            break;
          case 'processing':
            metrics.processing = count;
            break;
          case 'completed':
            metrics.completed = count;
            break;
          case 'failed':
            metrics.failed = count;
            break;
        }
      });

      metrics.totalProcessed = metrics.completed + metrics.failed;

      // Calculate average processing time
      const avgProcessingTime = await knex('webhook_processing_jobs')
        .where('status', 'completed')
        .whereNotNull('processing_duration_ms')
        .avg('processing_duration_ms as avg_time')
        .first();

      metrics.averageProcessingTime = Number(avgProcessingTime?.avg_time || 0);

      // Calculate error rate
      if (metrics.totalProcessed > 0) {
        metrics.errorRate = (metrics.failed / metrics.totalProcessed) * 100;
      }

      return metrics;
    } catch (error) {
      logger.error('Failed to get queue metrics', { error });
      throw error;
    }
  }

  /**
   * Get active workers status
   */
  getWorkers(): QueueWorker[] {
    return Array.from(this.workers.values());
  }

  /**
   * Process jobs from the queue
   */
  private async processJobs(): Promise<void> {
    if (!this.isRunning) return;

    try {
      // Find available workers
      const availableWorkers = Array.from(this.workers.values())
        .filter(worker => worker.status === 'idle');

      if (availableWorkers.length === 0) {
        return; // No available workers
      }

      // Get job types we can process
      const availableJobTypes = Array.from(this.processors.keys());

      // Find jobs to process
      const jobs = await this.findJobsToProcess(availableJobTypes, availableWorkers.length);

      // Assign jobs to workers
      for (let i = 0; i < jobs.length && i < availableWorkers.length; i++) {
        const job = jobs[i];
        const worker = availableWorkers[i];
        
        // Assign job to worker
        this.assignJobToWorker(worker.id, job);
      }
    } catch (error) {
      logger.error('Error processing jobs', { error });
    }
  }

  /**
   * Find jobs ready for processing
   */
  private async findJobsToProcess(jobTypes: string[], limit: number): Promise<WebhookProcessingJob[]> {
    try {
      const knex = await DatabaseService.getInstance();
      
      const jobs = await knex('webhook_processing_jobs')
        .where('status', 'pending')
        .whereIn('job_type', jobTypes)
        .where('scheduled_at', '<=', new Date())
        .orderByRaw(`
          CASE priority 
            WHEN 'emergency' THEN 4 
            WHEN 'high' THEN 3 
            WHEN 'medium' THEN 2 
            ELSE 1 
          END DESC,
          CASE job_type 
            ${Object.entries(this.jobPriorities)
              .map(([type, priority]) => `WHEN '${type}' THEN ${priority}`)
              .join(' ')}
            ELSE 0 
          END DESC,
          scheduled_at ASC
        `)
        .limit(limit);

      return jobs.map((row: any) => this.mapJobRow(row));
    } catch (error) {
      logger.error('Failed to find jobs to process', { error });
      return [];
    }
  }

  /**
   * Assign job to worker
   */
  private async assignJobToWorker(workerId: string, job: WebhookProcessingJob): Promise<void> {
    try {
      const worker = this.workers.get(workerId);
      if (!worker) {
        logger.error('Worker not found', { workerId });
        return;
      }

      // Update worker status
      worker.status = 'processing';
      worker.currentJob = job.id;
      worker.lastActivity = new Date();

      // Mark job as started
      await this.jobModel.markStarted(job.id, workerId);

      // Process job in background
      this.processJobInBackground(worker, job);

      logger.debug('Assigned job to worker', {
        workerId,
        jobId: job.id,
        jobType: job.jobType
      });
    } catch (error) {
      logger.error('Failed to assign job to worker', { workerId, jobId: job.id, error });
    }
  }

  /**
   * Process job in background
   */
  private async processJobInBackground(worker: QueueWorker, job: WebhookProcessingJob): Promise<void> {
    try {
      const processor = this.processors.get(job.jobType);
      if (!processor) {
        throw new Error(`No processor found for job type: ${job.jobType}`);
      }

      // Set timeout for job processing
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Job processing timeout')), this.workerTimeoutMs);
      });

      // Process the job
      const processingPromise = processor.processor(job);
      const result = await Promise.race([processingPromise, timeoutPromise]);

      // Mark job as completed
      await this.jobModel.markCompleted(job.id, result);

      // Update worker stats
      worker.processedJobs++;
      worker.status = 'idle';
      worker.currentJob = undefined;
      worker.lastActivity = new Date();

      logger.info('Job completed successfully', {
        jobId: job.id,
        jobType: job.jobType,
        workerId: worker.id,
        processedJobs: worker.processedJobs
      });
    } catch (error) {
      logger.error('Job processing failed', {
        jobId: job.id,
        jobType: job.jobType,
        workerId: worker.id,
        error: (error as Error).message
      });

      try {
        // Mark job as failed
        await this.jobModel.markFailed(job.id, (error as Error).message);

        // Check if job should go to dead letter queue
        if (job.retryCount >= this.deadLetterThreshold) {
          await this.moveToDeadLetterQueue(job, (error as Error).message);
        }
      } catch (updateError) {
        logger.error('Failed to update failed job', { jobId: job.id, error: updateError });
      }

      // Reset worker status
      worker.status = 'idle';
      worker.currentJob = undefined;
      worker.lastActivity = new Date();
    }
  }

  /**
   * Create a new worker
   */
  private createWorker(): void {
    const workerId = uuidv4();
    const worker: QueueWorker = {
      id: workerId,
      status: 'idle',
      processedJobs: 0,
      startedAt: new Date(),
      lastActivity: new Date()
    };

    this.workers.set(workerId, worker);
    logger.debug('Created worker', { workerId });
  }

  /**
   * Move job to dead letter queue
   */
  private async moveToDeadLetterQueue(job: WebhookProcessingJob, errorMessage: string): Promise<void> {
    try {
      const knex = await DatabaseService.getInstance();
      await knex('webhook_dead_letter_queue').insert({
        id: uuidv4(),
        original_job_id: job.id,
        webhook_id: job.webhookId,
        job_type: job.jobType,
        job_data: JSON.stringify(job.jobData),
        error_message: errorMessage,
        retry_count: job.retryCount,
        created_at: new Date()
      });

      logger.warn('Moved job to dead letter queue', {
        jobId: job.id,
        jobType: job.jobType,
        retryCount: job.retryCount
      });
    } catch (error) {
      logger.error('Failed to move job to dead letter queue', { jobId: job.id, error });
    }
  }

  /**
   * Graceful shutdown - wait for active jobs
   */
  private async gracefulShutdown(): Promise<void> {
    const shutdownTimeout = 30000; // 30 seconds
    const checkInterval = 1000; // 1 second
    let elapsed = 0;

    while (elapsed < shutdownTimeout) {
      const activeWorkers = Array.from(this.workers.values())
        .filter(worker => worker.status === 'processing');

      if (activeWorkers.length === 0) {
        logger.info('All workers idle, shutdown complete');
        return;
      }

      logger.info(`Waiting for ${activeWorkers.length} active workers to complete...`);
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      elapsed += checkInterval;
    }

    logger.warn('Shutdown timeout reached, some jobs may have been interrupted');
  }

  /**
   * Setup default job processors
   */
  private setupDefaultProcessors(): void {
    // Default processors for common job types
    this.registerProcessor({
      jobType: 'generate_ai_response',
      processor: this.processAIResponseGeneration.bind(this),
      concurrency: 3
    });

    this.registerProcessor({
      jobType: 'send_notification',
      processor: this.processSendNotification.bind(this),
      concurrency: 5
    });

    this.registerProcessor({
      jobType: 'generate_quote',
      processor: this.processGenerateQuote.bind(this),
      concurrency: 2
    });

    this.registerProcessor({
      jobType: 'schedule_follow_up',
      processor: this.processScheduleFollowUp.bind(this),
      concurrency: 2
    });
  }

  /**
   * Setup cleanup tasks
   */
  private setupCleanupTasks(): void {
    // Clean up completed jobs older than 7 days (runs daily at 2 AM)
    cron.schedule('0 2 * * *', async () => {
      try {
        await this.cleanupCompletedJobs(7);
      } catch (error) {
        logger.error('Failed to cleanup completed jobs', { error });
      }
    });

    // Clean up failed jobs older than 30 days (runs weekly)
    cron.schedule('0 3 * * 0', async () => {
      try {
        await this.cleanupFailedJobs(30);
      } catch (error) {
        logger.error('Failed to cleanup failed jobs', { error });
      }
    });
  }

  /**
   * Clean up completed jobs older than specified days
   */
  private async cleanupCompletedJobs(days: number): Promise<void> {
    try {
      const knex = await DatabaseService.getInstance();
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const deleted = await knex('webhook_processing_jobs')
        .where('status', 'completed')
        .where('completed_at', '<', cutoffDate)
        .del();

      logger.info('Cleaned up completed jobs', { deleted, days });
    } catch (error) {
      logger.error('Failed to cleanup completed jobs', { days, error });
      throw error;
    }
  }

  /**
   * Clean up failed jobs older than specified days
   */
  private async cleanupFailedJobs(days: number): Promise<void> {
    try {
      const knex = await DatabaseService.getInstance();
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const deleted = await knex('webhook_processing_jobs')
        .where('status', 'failed')
        .where('updated_at', '<', cutoffDate)
        .del();

      logger.info('Cleaned up failed jobs', { deleted, days });
    } catch (error) {
      logger.error('Failed to cleanup failed jobs', { days, error });
      throw error;
    }
  }

  // Default job processors
  private async processAIResponseGeneration(job: WebhookProcessingJob): Promise<any> {
    // Implementation would integrate with AI service
    logger.info('Processing AI response generation', { jobId: job.id });
    return { message: 'AI response generated' };
  }

  private async processSendNotification(job: WebhookProcessingJob): Promise<any> {
    // Implementation would integrate with notification service
    logger.info('Processing send notification', { jobId: job.id });
    return { notificationSent: true };
  }

  private async processGenerateQuote(job: WebhookProcessingJob): Promise<any> {
    // Implementation would integrate with quote generation service
    logger.info('Processing generate quote', { jobId: job.id });
    return { quoteGenerated: true };
  }

  private async processScheduleFollowUp(job: WebhookProcessingJob): Promise<any> {
    // Implementation would schedule follow-up tasks
    logger.info('Processing schedule follow-up', { jobId: job.id });
    return { followUpScheduled: true };
  }

  private mapJobRow(row: any): WebhookProcessingJob {
    return {
      id: row.id,
      webhookId: row.webhook_id,
      jobType: row.job_type,
      status: row.status,
      priority: row.priority,
      jobData: row.job_data ? JSON.parse(row.job_data) : undefined,
      result: row.result ? JSON.parse(row.result) : undefined,
      errorMessage: row.error_message,
      retryCount: row.retry_count || 0,
      maxRetries: row.max_retries || 3,
      scheduledAt: new Date(row.scheduled_at),
      startedAt: row.started_at ? new Date(row.started_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      processingDurationMs: row.processing_duration_ms,
      workerId: row.worker_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}