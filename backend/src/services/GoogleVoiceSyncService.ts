import { GoogleVoiceApiClient, GoogleVoiceMessage, MessageListOptions } from './GoogleVoiceApiClient';
import { GoogleVoiceAuthService } from './GoogleVoiceAuthService';
import { DatabaseService } from './DatabaseService';
import {
  GoogleOAuthTokenModel,
  GoogleVoiceSyncStatusModel,
  GoogleVoiceMessageMappingModel,
  GoogleVoicePhoneMappingModel,
  GoogleVoiceSyncStatus
} from '../models/GoogleVoiceModels';
import { googleVoiceConfig } from '../config/googleVoice';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface SyncOptions {
  syncType: 'initial' | 'incremental' | 'manual';
  startDate?: Date;
  endDate?: Date;
  phoneNumber?: string;
  batchSize?: number;
  maxMessages?: number;
  skipDuplicates?: boolean;
}

export interface SyncProgress {
  syncId: string;
  tokenId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: {
    messagesProcessed: number;
    messagesTotal: number;
    conversationsCreated: number;
    conversationsUpdated: number;
    customersCreated: number;
    customersMatched: number;
    duplicatesSkipped: number;
    errorsEncountered: number;
  };
  currentBatch?: {
    batchNumber: number;
    batchSize: number;
    startTime: Date;
  };
  performance: {
    startTime: Date;
    lastUpdateTime: Date;
    messagesPerSecond: number;
    estimatedTimeRemaining?: number;
  };
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  existingMessageId?: string;
  confidence: number;
}

export class GoogleVoiceSyncService {
  private db: DatabaseService;
  private authService: GoogleVoiceAuthService;
  private apiClient: GoogleVoiceApiClient;
  private tokenModel: GoogleOAuthTokenModel;
  private syncModel: GoogleVoiceSyncStatusModel;
  private mappingModel: GoogleVoiceMessageMappingModel;
  private phoneModel: GoogleVoicePhoneMappingModel;
  private activeSyncs: Map<string, SyncProgress> = new Map();

  constructor(
    db: DatabaseService,
    authService: GoogleVoiceAuthService,
    apiClient: GoogleVoiceApiClient
  ) {
    this.db = db;
    this.authService = authService;
    this.apiClient = apiClient;
    this.tokenModel = new GoogleOAuthTokenModel(db);
    this.syncModel = new GoogleVoiceSyncStatusModel(db);
    this.mappingModel = new GoogleVoiceMessageMappingModel(db);
    this.phoneModel = new GoogleVoicePhoneMappingModel(db);
  }

  /**
   * Start message synchronization
   */
  async startSync(tokenId: string, options: SyncOptions): Promise<string> {
    try {
      // Validate token
      const token = await this.tokenModel.findById(tokenId);
      if (!token || !token.isActive) {
        throw new Error('Invalid or inactive token');
      }

      // Check if sync is already running for this token
      const existingSync = Array.from(this.activeSyncs.values())
        .find(sync => sync.tokenId === tokenId && sync.status === 'running');
      
      if (existingSync) {
        throw new Error(`Sync already running for token: ${existingSync.syncId}`);
      }

      // Create sync status record
      const syncStatus = await this.syncModel.create({
        tokenId,
        syncType: options.syncType,
        status: 'pending',
        messagesProcessed: 0,
        messagesTotal: 0,
        conversationsCreated: 0,
        conversationsUpdated: 0,
        customersCreated: 0,
        customersMatched: 0,
        metadata: {
          options,
          startTime: new Date()
        }
      });

      // Initialize sync progress
      const syncProgress: SyncProgress = {
        syncId: syncStatus.id,
        tokenId,
        status: 'pending',
        progress: {
          messagesProcessed: 0,
          messagesTotal: 0,
          conversationsCreated: 0,
          conversationsUpdated: 0,
          customersCreated: 0,
          customersMatched: 0,
          duplicatesSkipped: 0,
          errorsEncountered: 0
        },
        performance: {
          startTime: new Date(),
          lastUpdateTime: new Date(),
          messagesPerSecond: 0
        }
      };

      this.activeSyncs.set(syncStatus.id, syncProgress);

      // Start sync process asynchronously
      this.executeSyncProcess(syncStatus.id, options).catch(error => {
        logger.error('Sync process failed', {
          syncId: syncStatus.id,
          tokenId,
          error: error.message
        });
      });

      logger.info('Sync started', {
        syncId: syncStatus.id,
        tokenId,
        syncType: options.syncType
      });

      return syncStatus.id;

    } catch (error) {
      logger.error('Failed to start sync', {
        tokenId,
        options,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get sync progress
   */
  getSyncProgress(syncId: string): SyncProgress | null {
    return this.activeSyncs.get(syncId) || null;
  }

  /**
   * Cancel running sync
   */
  async cancelSync(syncId: string): Promise<void> {
    const syncProgress = this.activeSyncs.get(syncId);
    if (!syncProgress) {
      throw new Error('Sync not found');
    }

    if (syncProgress.status !== 'running') {
      throw new Error('Sync is not running');
    }

    syncProgress.status = 'cancelled';
    await this.syncModel.update(syncId, { status: 'cancelled' });

    logger.info('Sync cancelled', { syncId });
  }

  /**
   * Execute the sync process
   */
  private async executeSyncProcess(syncId: string, options: SyncOptions): Promise<void> {
    const syncProgress = this.activeSyncs.get(syncId);
    if (!syncProgress) {
      throw new Error('Sync progress not found');
    }

    try {
      // Update status to running
      syncProgress.status = 'running';
      await this.syncModel.update(syncId, { 
        status: 'running', 
        startedAt: new Date() 
      });

      logger.info('Starting sync process', { syncId, options });

      // Determine sync parameters
      const syncParams = await this.determineSyncParameters(syncProgress.tokenId, options);
      syncProgress.progress.messagesTotal = syncParams.estimatedTotal;

      // Execute sync in batches
      await this.syncMessagesBatched(syncProgress, syncParams);

      // Mark as completed
      syncProgress.status = 'completed';
      await this.syncModel.markCompleted(syncId, {
        messagesProcessed: syncProgress.progress.messagesProcessed,
        conversationsCreated: syncProgress.progress.conversationsCreated,
        conversationsUpdated: syncProgress.progress.conversationsUpdated,
        customersCreated: syncProgress.progress.customersCreated,
        customersMatched: syncProgress.progress.customersMatched,
        lastSyncToken: syncParams.lastSyncToken,
        lastMessageDate: syncParams.lastMessageDate
      });

      logger.info('Sync completed successfully', {
        syncId,
        messagesProcessed: syncProgress.progress.messagesProcessed,
        duration: Date.now() - syncProgress.performance.startTime.getTime()
      });

    } catch (error) {
      // Mark as failed
      syncProgress.status = 'failed';
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      await this.syncModel.markFailed(syncId, errorMessage);

      logger.error('Sync process failed', {
        syncId,
        error: errorMessage,
        messagesProcessed: syncProgress.progress.messagesProcessed
      });

      throw error;
    } finally {
      // Clean up after some time
      setTimeout(() => {
        this.activeSyncs.delete(syncId);
      }, 5 * 60 * 1000); // 5 minutes
    }
  }

  /**
   * Determine sync parameters based on sync type and options
   */
  private async determineSyncParameters(tokenId: string, options: SyncOptions): Promise<{
    startDate?: Date;
    endDate?: Date;
    lastSyncToken?: string;
    lastMessageDate?: Date;
    estimatedTotal: number;
    batchSize: number;
  }> {
    const config = googleVoiceConfig.getSyncConfig();
    const batchSize = options.batchSize || config.defaultBatchSize;

    if (options.syncType === 'initial') {
      // Initial sync: get all messages within date range or max history
      const startDate = options.startDate || new Date(Date.now() - (config.maxHistoryDays * 24 * 60 * 60 * 1000));
      const endDate = options.endDate || new Date();
      
      return {
        startDate,
        endDate,
        estimatedTotal: options.maxMessages || 1000, // Rough estimate
        batchSize
      };
    } else if (options.syncType === 'incremental') {
      // Incremental sync: get messages since last sync
      const lastSync = await this.getLastSuccessfulSync(tokenId);
      const startDate = lastSync?.lastMessageDate || new Date(Date.now() - (24 * 60 * 60 * 1000)); // Last 24h if no previous sync
      const endDate = new Date();
      
      return {
        startDate,
        endDate,
        lastSyncToken: lastSync?.lastSyncToken,
        estimatedTotal: 100, // Usually smaller for incremental
        batchSize
      };
    } else {
      // Manual sync: use provided parameters
      return {
        startDate: options.startDate,
        endDate: options.endDate,
        estimatedTotal: options.maxMessages || 500,
        batchSize
      };
    }
  }

  /**
   * Sync messages in batches
   */
  private async syncMessagesBatched(
    syncProgress: SyncProgress, 
    params: { startDate?: Date; endDate?: Date; batchSize: number; lastSyncToken?: string }
  ): Promise<void> {
    let pageToken: string | undefined = params.lastSyncToken;
    let batchNumber = 1;
    let totalProcessed = 0;

    while (syncProgress.status === 'running') {
      const batchStartTime = new Date();
      syncProgress.currentBatch = {
        batchNumber,
        batchSize: params.batchSize,
        startTime: batchStartTime
      };

      logger.debug('Processing batch', {
        syncId: syncProgress.syncId,
        batchNumber,
        pageToken: pageToken?.substring(0, 20)
      });

      try {
        // Fetch messages batch
        const messageOptions: MessageListOptions = {
          limit: params.batchSize,
          pageToken,
          startTime: params.startDate,
          endTime: params.endDate
        };

        const result = await this.apiClient.getMessages(syncProgress.tokenId, messageOptions);
        
        if (result.messages.length === 0) {
          logger.info('No more messages to sync', { syncId: syncProgress.syncId });
          break;
        }

        // Process messages in this batch
        const batchResults = await this.processBatch(syncProgress.tokenId, result.messages, syncProgress);
        
        // Update progress
        totalProcessed += result.messages.length;
        syncProgress.progress.messagesProcessed = totalProcessed;
        syncProgress.progress.conversationsCreated += batchResults.conversationsCreated;
        syncProgress.progress.conversationsUpdated += batchResults.conversationsUpdated;
        syncProgress.progress.customersCreated += batchResults.customersCreated;
        syncProgress.progress.customersMatched += batchResults.customersMatched;
        syncProgress.progress.duplicatesSkipped += batchResults.duplicatesSkipped;
        syncProgress.progress.errorsEncountered += batchResults.errorsEncountered;

        // Update performance metrics
        const now = new Date();
        const batchDuration = now.getTime() - batchStartTime.getTime();
        const totalDuration = now.getTime() - syncProgress.performance.startTime.getTime();
        
        syncProgress.performance.lastUpdateTime = now;
        syncProgress.performance.messagesPerSecond = (totalProcessed / totalDuration) * 1000;
        
        if (syncProgress.progress.messagesTotal > 0) {
          const remaining = syncProgress.progress.messagesTotal - totalProcessed;
          syncProgress.performance.estimatedTimeRemaining = 
            (remaining / syncProgress.performance.messagesPerSecond) * 1000;
        }

        // Update database every batch
        await this.syncModel.update(syncProgress.syncId, {
          messagesProcessed: totalProcessed,
          conversationsCreated: syncProgress.progress.conversationsCreated,
          conversationsUpdated: syncProgress.progress.conversationsUpdated,
          customersCreated: syncProgress.progress.customersCreated,
          customersMatched: syncProgress.progress.customersMatched
        });

        logger.info('Batch processed', {
          syncId: syncProgress.syncId,
          batchNumber,
          messagesInBatch: result.messages.length,
          totalProcessed,
          duration: batchDuration,
          avgPerSecond: (result.messages.length / batchDuration) * 1000
        });

        // Prepare for next batch
        pageToken = result.nextPageToken;
        batchNumber++;

        // Break if no more pages
        if (!pageToken) {
          logger.info('Reached end of messages', { syncId: syncProgress.syncId });
          break;
        }

        // Rate limiting: small delay between batches
        await this.delay(100);

      } catch (error) {
        syncProgress.progress.errorsEncountered++;
        logger.error('Batch processing error', {
          syncId: syncProgress.syncId,
          batchNumber,
          error: error instanceof Error ? error.message : 'Unknown error'
        });

        // Decide whether to continue or fail the sync
        if (syncProgress.progress.errorsEncountered >= 5) {
          throw new Error('Too many batch errors - aborting sync');
        }

        // Continue with next batch on recoverable errors
        if (pageToken) {
          continue;
        } else {
          break;
        }
      }
    }
  }

  /**
   * Process a batch of messages
   */
  private async processBatch(
    tokenId: string, 
    messages: GoogleVoiceMessage[], 
    syncProgress: SyncProgress
  ): Promise<{
    conversationsCreated: number;
    conversationsUpdated: number;
    customersCreated: number;
    customersMatched: number;
    duplicatesSkipped: number;
    errorsEncountered: number;
  }> {
    const results = {
      conversationsCreated: 0,
      conversationsUpdated: 0,
      customersCreated: 0,
      customersMatched: 0,
      duplicatesSkipped: 0,
      errorsEncountered: 0
    };

    for (const message of messages) {
      try {
        // Check for duplicates
        const duplicateCheck = await this.checkForDuplicates(message, tokenId);
        if (duplicateCheck.isDuplicate) {
          results.duplicatesSkipped++;
          logger.debug('Skipping duplicate message', {
            googleMessageId: message.id,
            existingMessageId: duplicateCheck.existingMessageId,
            confidence: duplicateCheck.confidence
          });
          continue;
        }

        // Process the message
        const messageResult = await this.processMessage(message, tokenId);
        
        if (messageResult.conversationCreated) results.conversationsCreated++;
        if (messageResult.conversationUpdated) results.conversationsUpdated++;
        if (messageResult.customerCreated) results.customersCreated++;
        if (messageResult.customerMatched) results.customersMatched++;

      } catch (error) {
        results.errorsEncountered++;
        logger.error('Error processing message', {
          googleMessageId: message.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }

  /**
   * Check for duplicate messages
   */
  private async checkForDuplicates(
    message: GoogleVoiceMessage, 
    tokenId: string
  ): Promise<DuplicateCheckResult> {
    try {
      // Check by Google message ID (exact match)
      const existingMapping = await this.mappingModel.findByGoogleMessageId(message.id, tokenId);
      if (existingMapping) {
        return {
          isDuplicate: true,
          existingMessageId: existingMapping.messageId,
          confidence: 1.0
        };
      }

      // Check by content and timestamp (fuzzy match for edge cases)
      const knex = await this.db.getKnex();
      const duplicateWindow = googleVoiceConfig.getSyncConfig().duplicateDetectionWindowHours;
      const windowStart = new Date(new Date(message.timestamp).getTime() - (duplicateWindow * 60 * 60 * 1000));
      const windowEnd = new Date(new Date(message.timestamp).getTime() + (duplicateWindow * 60 * 60 * 1000));

      const possibleDuplicates = await knex('messages')
        .join('conversations', 'messages.conversationId', 'conversations.id')
        .where('conversations.phoneNumber', this.normalizePhoneNumber(message.phoneNumber))
        .where('messages.content', message.text)
        .where('messages.direction', message.direction)
        .whereBetween('messages.sentAt', [windowStart, windowEnd])
        .limit(1);

      if (possibleDuplicates.length > 0) {
        return {
          isDuplicate: true,
          existingMessageId: possibleDuplicates[0].id,
          confidence: 0.9
        };
      }

      return { isDuplicate: false, confidence: 0 };

    } catch (error) {
      logger.error('Error checking for duplicates', {
        googleMessageId: message.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Return false on error to avoid skipping valid messages
      return { isDuplicate: false, confidence: 0 };
    }
  }

  /**
   * Process a single message
   */
  private async processMessage(
    message: GoogleVoiceMessage, 
    tokenId: string
  ): Promise<{
    conversationCreated: boolean;
    conversationUpdated: boolean;
    customerCreated: boolean;
    customerMatched: boolean;
  }> {
    const knex = await this.db.getKnex();
    const normalizedPhone = this.normalizePhoneNumber(message.phoneNumber);
    
    let conversationCreated = false;
    let conversationUpdated = false;
    let customerCreated = false;
    let customerMatched = false;

    // Find or create customer
    let customer = await knex('customers')
      .where('phone', normalizedPhone)
      .orWhere('phone', message.phoneNumber)
      .first();

    if (!customer) {
      // Create new customer
      const customerId = uuidv4();
      customer = {
        id: customerId,
        firstName: 'Unknown',
        lastName: 'Customer',
        phone: normalizedPhone,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await knex('customers').insert(customer);
      customerCreated = true;
      
      logger.info('Created new customer from Google Voice message', {
        customerId,
        phone: normalizedPhone,
        googleMessageId: message.id
      });
    } else {
      customerMatched = true;
    }

    // Find or create conversation
    let conversation = await knex('conversations')
      .where('customerId', customer.id)
      .where('phoneNumber', normalizedPhone)
      .where('status', 'active')
      .first();

    if (!conversation) {
      // Create new conversation
      const conversationId = uuidv4();
      conversation = {
        id: conversationId,
        customerId: customer.id,
        phoneNumber: normalizedPhone,
        platform: 'google_voice',
        status: 'active',
        priority: message.text.toLowerCase().includes('emergency') ? 'emergency' : 'medium',
        lastMessageAt: new Date(message.timestamp),
        googleThreadId: message.threadId,
        channel: 'sms',
        isEmergency: message.text.toLowerCase().includes('emergency'),
        originalPhoneNumber: message.phoneNumber,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await knex('conversations').insert(conversation);
      conversationCreated = true;
      
      logger.info('Created new conversation from Google Voice message', {
        conversationId,
        customerId: customer.id,
        googleThreadId: message.threadId
      });
    } else {
      // Update existing conversation
      await knex('conversations')
        .where('id', conversation.id)
        .update({
          lastMessageAt: new Date(message.timestamp),
          updatedAt: new Date()
        });
      conversationUpdated = true;
    }

    // Create message record
    const messageId = uuidv4();
    const messageRecord = {
      id: messageId,
      conversationId: conversation.id,
      direction: message.direction,
      content: message.text,
      messageType: message.type === 'mms' ? 'image' : 'text',
      platform: 'google_voice',
      status: 'delivered',
      sentAt: new Date(message.timestamp),
      originalContent: message.text,
      attachments: message.attachments ? JSON.stringify(message.attachments) : null,
      containsEmergencyKeywords: message.text.toLowerCase().includes('emergency'),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await knex('messages').insert(messageRecord);

    // Create Google Voice mapping
    await this.mappingModel.create({
      messageId,
      googleMessageId: message.id,
      googleThreadId: message.threadId,
      tokenId,
      googleMessageDate: new Date(message.timestamp),
      googleMetadata: {
        originalMessage: message,
        syncedAt: new Date()
      }
    });

    // Update or create phone mapping
    let phoneMapping = await this.phoneModel.findByPhoneNumber(normalizedPhone, tokenId);
    if (phoneMapping) {
      await this.phoneModel.updateMessageCount(phoneMapping.id);
    } else {
      await this.phoneModel.create({
        tokenId,
        googleVoiceNumber: 'unknown', // TODO: Get from API
        customerPhoneNumber: message.phoneNumber,
        normalizedPhoneNumber: normalizedPhone,
        customerId: customer.id,
        isActive: true,
        firstContactAt: new Date(message.timestamp),
        lastContactAt: new Date(message.timestamp),
        messageCount: 1
      });
    }

    return { conversationCreated, conversationUpdated, customerCreated, customerMatched };
  }

  /**
   * Get last successful sync for incremental syncing
   */
  private async getLastSuccessfulSync(tokenId: string): Promise<GoogleVoiceSyncStatus | null> {
    const syncs = await this.syncModel.findByTokenId(tokenId, 1);
    return syncs.find(sync => sync.status === 'completed') || null;
  }

  /**
   * Normalize phone number to E164 format
   */
  private normalizePhoneNumber(phoneNumber: string): string {
    // Remove all non-digit characters
    const digits = phoneNumber.replace(/\D/g, '');
    
    // Add country code if missing (assume US)
    if (digits.length === 10) {
      return `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    }
    
    return `+${digits}`;
  }

  /**
   * Utility function for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default GoogleVoiceSyncService;