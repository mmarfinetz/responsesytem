import { DatabaseService } from './DatabaseService';
import { GoogleVoiceApiClient } from './GoogleVoiceApiClient';
import { CustomerMatchingService } from './CustomerMatchingService';
import { MessageParsingService } from './MessageParsingService';
import { ConversationManagerService } from './ConversationManagerService';
import { logger } from '../utils/logger';
import { 
  ConversationModel, 
  MessageModel, 
  ConversationSyncMetadataModel,
  MessageParsingResultModel
} from '../models/ConversationModels';
import { 
  GoogleVoiceSyncStatusModel, 
  GoogleVoiceMessageMappingModel,
  GoogleVoicePhoneMappingModel 
} from '../models/GoogleVoiceModels';
import { GoogleVoiceMessage, Conversation, Message } from '../../shared/types';

export interface SyncOptions {
  tokenId: string;
  syncType: 'initial' | 'incremental' | 'manual';
  pageSize?: number;
  maxPages?: number;
  startDate?: Date;
  endDate?: Date;
  phoneNumberFilter?: string;
  onlyUnread?: boolean;
  enableDuplicateDetection?: boolean;
  enableMessageParsing?: boolean;
  enableCustomerMatching?: boolean;
  enableConversationThreading?: boolean;
  parallelProcessing?: boolean;
  batchSize?: number;
}

export interface SyncProgress {
  syncId: string;
  syncSessionId: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: Date;
  endTime?: Date;
  progress: {
    totalMessages: number;
    processedMessages: number;
    importedMessages: number;
    duplicatesSkipped: number;
    errorsEncountered: number;
    conversationsCreated: number;
    conversationsUpdated: number;
    customersCreated: number;
    customersMatched: number;
  };
  currentOperation: string;
  estimatedTimeRemaining?: number;
  errors: Array<{
    timestamp: Date;
    error: string;
    context: any;
    severity: 'warning' | 'error' | 'critical';
  }>;
}

export interface SyncResult {
  syncId: string;
  syncSessionId: string;
  success: boolean;
  summary: {
    totalMessages: number;
    importedMessages: number;
    duplicatesSkipped: number;
    conversationsCreated: number;
    conversationsUpdated: number;
    customersCreated: number;
    customersMatched: number;
    processingTimeMs: number;
    averageMessageProcessingTime: number;
  };
  errors: Array<{
    error: string;
    context: any;
    count: number;
  }>;
  warnings: string[];
  recommendations: string[];
}

export class ConversationSyncService {
  private conversationModel: ConversationModel;
  private messageModel: MessageModel;
  private syncMetadataModel: ConversationSyncMetadataModel;
  private parsingResultModel: MessageParsingResultModel;
  private syncStatusModel: GoogleVoiceSyncStatusModel;
  private messageMappingModel: GoogleVoiceMessageMappingModel;
  private phoneMappingModel: GoogleVoicePhoneMappingModel;
  private customerMatchingService: CustomerMatchingService;
  private messageParsingService: MessageParsingService;
  private conversationManagerService: ConversationManagerService;

  constructor(
    private db: DatabaseService,
    private googleVoiceApi: GoogleVoiceApiClient
  ) {
    this.conversationModel = new ConversationModel(db);
    this.messageModel = new MessageModel(db);
    this.syncMetadataModel = new ConversationSyncMetadataModel(db);
    this.parsingResultModel = new MessageParsingResultModel(db);
    this.syncStatusModel = new GoogleVoiceSyncStatusModel(db);
    this.messageMappingModel = new GoogleVoiceMessageMappingModel(db);
    this.phoneMappingModel = new GoogleVoicePhoneMappingModel(db);
    this.customerMatchingService = new CustomerMatchingService(db);
    this.messageParsingService = new MessageParsingService(db);
    this.conversationManagerService = new ConversationManagerService(db);
  }

  /**
   * Starts a comprehensive sync operation with Google Voice
   */
  async startSync(options: SyncOptions): Promise<SyncProgress> {
    const startTime = new Date();
    const syncSessionId = this.generateSyncSessionId();
    
    try {
      // Create sync status record
      const syncStatus = await this.syncStatusModel.create({
        tokenId: options.tokenId,
        syncType: options.syncType,
        status: 'running',
        startedAt: startTime,
        messagesProcessed: 0,
        messagesTotal: 0,
        conversationsCreated: 0,
        conversationsUpdated: 0,
        customersCreated: 0,
        customersMatched: 0,
        metadata: {
          syncSessionId,
          options: this.sanitizeOptions(options)
        }
      });

      logger.info('Starting conversation sync', {
        syncId: syncStatus.id,
        syncSessionId,
        tokenId: options.tokenId,
        syncType: options.syncType
      });

      // Initialize progress tracking
      const progress: SyncProgress = {
        syncId: syncStatus.id,
        syncSessionId,
        status: 'running',
        startTime,
        progress: {
          totalMessages: 0,
          processedMessages: 0,
          importedMessages: 0,
          duplicatesSkipped: 0,
          errorsEncountered: 0,
          conversationsCreated: 0,
          conversationsUpdated: 0,
          customersCreated: 0,
          customersMatched: 0
        },
        currentOperation: 'initializing',
        errors: []
      };

      // Start sync process asynchronously
      this.performSync(options, progress, syncStatus.id).catch(error => {
        logger.error('Sync process failed', {
          syncId: syncStatus.id,
          error: error.message
        });
      });

      return progress;

    } catch (error) {
      logger.error('Failed to start sync', {
        tokenId: options.tokenId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Main sync orchestration method
   */
  private async performSync(
    options: SyncOptions,
    progress: SyncProgress,
    syncId: string
  ): Promise<void> {
    try {
      progress.currentOperation = 'fetching_messages';
      
      // Step 1: Fetch messages from Google Voice
      const messages = await this.fetchGoogleVoiceMessages(options, progress);
      progress.progress.totalMessages = messages.length;
      
      await this.updateSyncStatus(syncId, {
        messagesTotal: messages.length
      });

      // Step 2: Process messages in batches
      const batchSize = options.batchSize || 50;
      const batches = this.chunkArray(messages, batchSize);
      
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        progress.currentOperation = `processing_batch_${i + 1}_of_${batches.length}`;
        
        await this.processBatch(batch, options, progress, syncId);
        
        // Update progress
        progress.progress.processedMessages += batch.length;
        progress.estimatedTimeRemaining = this.calculateEstimatedTime(progress);
        
        // Optional: Add delay between batches to avoid rate limits
        if (i < batches.length - 1) {
          await this.sleep(100);
        }
      }

      // Step 3: Finalize sync
      progress.currentOperation = 'finalizing';
      await this.finalizSync(options, progress, syncId);
      
      progress.status = 'completed';
      progress.endTime = new Date();
      
      logger.info('Sync completed successfully', {
        syncId,
        summary: progress.progress
      });

    } catch (error) {
      progress.status = 'failed';
      progress.endTime = new Date();
      
      const errorEntry = {
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error',
        context: { operation: progress.currentOperation },
        severity: 'critical' as const
      };
      
      progress.errors.push(errorEntry);
      
      await this.syncStatusModel.markFailed(syncId, errorEntry.error);
      
      logger.error('Sync failed', {
        syncId,
        error: errorEntry.error,
        progress: progress.progress
      });
    }
  }

  /**
   * Fetches messages from Google Voice API with pagination
   */
  private async fetchGoogleVoiceMessages(
    options: SyncOptions,
    progress: SyncProgress
  ): Promise<GoogleVoiceMessage[]> {
    const messages: GoogleVoiceMessage[] = [];
    const pageSize = options.pageSize || 100;
    const maxPages = options.maxPages || 50;
    let pageToken: string | undefined;
    let pageCount = 0;

    try {
      do {
        progress.currentOperation = `fetching_page_${pageCount + 1}`;
        
        const response = await this.googleVoiceApi.getMessages({
          pageSize,
          pageToken,
          startDate: options.startDate,
          endDate: options.endDate,
          phoneNumber: options.phoneNumberFilter,
          onlyUnread: options.onlyUnread
        });

        messages.push(...response.messages);
        pageToken = response.nextPageToken;
        pageCount++;

        logger.debug('Fetched message page', {
          page: pageCount,
          messagesInPage: response.messages.length,
          totalMessages: messages.length,
          hasNextPage: !!pageToken
        });

        // Check if we've reached the maximum pages limit
        if (pageCount >= maxPages) {
          logger.warn('Reached maximum pages limit', {
            maxPages,
            totalMessages: messages.length
          });
          break;
        }

      } while (pageToken);

      logger.info('Completed message fetching', {
        totalPages: pageCount,
        totalMessages: messages.length
      });

      return messages;

    } catch (error) {
      logger.error('Failed to fetch Google Voice messages', {
        pageCount,
        totalMessages: messages.length,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Processes a batch of messages
   */
  private async processBatch(
    messages: GoogleVoiceMessage[],
    options: SyncOptions,
    progress: SyncProgress,
    syncId: string
  ): Promise<void> {
    const knex = await this.db.getKnex();
    
    try {
      await knex.transaction(async (trx) => {
        for (const googleMessage of messages) {
          try {
            await this.processMessage(googleMessage, options, progress, syncId, trx);
          } catch (error) {
            const errorEntry = {
              timestamp: new Date(),
              error: error instanceof Error ? error.message : 'Unknown error',
              context: { messageId: googleMessage.id, phoneNumber: googleMessage.phoneNumber },
              severity: 'error' as const
            };
            
            progress.errors.push(errorEntry);
            progress.progress.errorsEncountered++;
            
            logger.error('Failed to process message', {
              messageId: googleMessage.id,
              phoneNumber: googleMessage.phoneNumber,
              error: errorEntry.error
            });
          }
        }
      });
      
      // Update sync status
      await this.updateSyncStatus(syncId, {
        messagesProcessed: progress.progress.processedMessages + messages.length,
        conversationsCreated: progress.progress.conversationsCreated,
        conversationsUpdated: progress.progress.conversationsUpdated,
        customersCreated: progress.progress.customersCreated,
        customersMatched: progress.progress.customersMatched
      });

    } catch (error) {
      logger.error('Batch processing failed', {
        batchSize: messages.length,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Processes a single Google Voice message
   */
  private async processMessage(
    googleMessage: GoogleVoiceMessage,
    options: SyncOptions,
    progress: SyncProgress,
    syncId: string,
    trx: any
  ): Promise<void> {
    try {
      // Step 1: Check for duplicates
      if (options.enableDuplicateDetection) {
        const existingMapping = await this.messageMappingModel.findByGoogleMessageId(
          googleMessage.id,
          options.tokenId
        );
        
        if (existingMapping) {
          progress.progress.duplicatesSkipped++;
          return;
        }
      }

      // Step 2: Normalize phone number
      const normalizedPhone = this.normalizePhoneNumber(googleMessage.phoneNumber);

      // Step 3: Customer matching
      let customer = null;
      if (options.enableCustomerMatching) {
        const matchResult = await this.customerMatchingService.matchCustomer({
          phoneNumber: normalizedPhone,
          fuzzyMatch: true,
          createIfNotFound: true
        });
        
        customer = matchResult.customer;
        
        if (matchResult.matchType === 'created') {
          progress.progress.customersCreated++;
        } else if (matchResult.matchType !== 'none') {
          progress.progress.customersMatched++;
        }
      }

      // Step 4: Find or create conversation
      let conversation: Conversation;
      let isNewConversation = false;
      
      if (options.enableConversationThreading && customer) {
        const threadResult = await this.conversationManagerService.findOrCreateConversationThread({
          customerId: customer.id,
          phoneNumber: normalizedPhone,
          platform: 'google_voice',
          threadId: googleMessage.threadId,
          messageContent: googleMessage.text,
          priority: this.determinePriorityFromMessage(googleMessage.text)
        });
        
        conversation = threadResult.conversation;
        isNewConversation = threadResult.isNew;
        
        if (isNewConversation) {
          progress.progress.conversationsCreated++;
        } else {
          progress.progress.conversationsUpdated++;
        }
      } else {
        // Fallback: find conversation by Google thread ID or create new
        conversation = await this.conversationModel.findByGoogleThreadId(googleMessage.threadId);
        
        if (!conversation) {
          conversation = await this.conversationModel.create({
            customerId: customer?.id,
            phoneNumber: normalizedPhone,
            platform: 'google_voice',
            status: 'active',
            priority: this.determinePriorityFromMessage(googleMessage.text),
            lastMessageAt: new Date(googleMessage.timestamp),
            googleThreadId: googleMessage.threadId,
            channel: 'sms',
            isEmergency: this.detectEmergencyKeywords(googleMessage.text).length > 0,
            originalPhoneNumber: googleMessage.phoneNumber,
            followUpRequired: false
          });
          
          isNewConversation = true;
          progress.progress.conversationsCreated++;
        } else {
          progress.progress.conversationsUpdated++;
        }
      }

      // Step 5: Create message record
      const message = await this.messageModel.create({
        conversationId: conversation.id,
        direction: googleMessage.direction,
        content: googleMessage.text,
        messageType: googleMessage.type === 'sms' ? 'text' : googleMessage.type,
        platform: 'google_voice',
        status: 'delivered',
        metadata: {
          googleMessageId: googleMessage.id,
          googleThreadId: googleMessage.threadId,
          originalPhoneNumber: googleMessage.phoneNumber,
          attachments: googleMessage.attachments
        },
        sentAt: new Date(googleMessage.timestamp),
        originalContent: googleMessage.text,
        attachments: googleMessage.attachments,
        containsEmergencyKeywords: this.detectEmergencyKeywords(googleMessage.text).length > 0,
        requiresHumanReview: false
      });

      // Step 6: Create Google Voice message mapping
      await this.messageMappingModel.create({
        messageId: message.id,
        googleMessageId: googleMessage.id,
        googleThreadId: googleMessage.threadId,
        tokenId: options.tokenId,
        googleMessageDate: new Date(googleMessage.timestamp),
        googleMetadata: {
          originalPhoneNumber: googleMessage.phoneNumber,
          attachments: googleMessage.attachments
        }
      });

      // Step 7: Update phone mapping
      let phoneMapping = await this.phoneMappingModel.findByPhoneNumber(normalizedPhone, options.tokenId);
      
      if (!phoneMapping) {
        phoneMapping = await this.phoneMappingModel.create({
          tokenId: options.tokenId,
          googleVoiceNumber: this.extractGoogleVoiceNumber(googleMessage),
          customerPhoneNumber: googleMessage.phoneNumber,
          normalizedPhoneNumber: normalizedPhone,
          customerId: customer?.id,
          isActive: true,
          firstContactAt: new Date(googleMessage.timestamp),
          lastContactAt: new Date(googleMessage.timestamp),
          messageCount: 1,
          contactInfo: {
            platform: 'google_voice',
            messageType: googleMessage.type
          }
        });
      } else {
        await this.phoneMappingModel.updateMessageCount(phoneMapping.id);
        
        if (customer && !phoneMapping.customerId) {
          await this.phoneMappingModel.linkToCustomer(phoneMapping.id, customer.id);
        }
      }

      // Step 8: Message parsing (if enabled)
      if (options.enableMessageParsing && googleMessage.direction === 'inbound') {
        try {
          const parseResult = await this.messageParsingService.parseMessage(message.id, googleMessage.text);
          
          if (parseResult) {
            await this.messageModel.markProcessed(
              message.id,
              parseResult.extractedInfo,
              parseResult.processingTimeMs / 1000
            );
          }
        } catch (parseError) {
          logger.warn('Message parsing failed', {
            messageId: message.id,
            error: parseError instanceof Error ? parseError.message : 'Unknown error'
          });
        }
      }

      // Step 9: Update conversation last message time
      await this.conversationModel.updateLastMessage(conversation.id, new Date(googleMessage.timestamp));

      // Step 10: Create sync metadata
      await this.syncMetadataModel.create({
        conversationId: conversation.id,
        syncType: options.syncType,
        syncSessionId: progress.syncSessionId,
        messagesImported: 1,
        duplicatesSkipped: 0,
        errorCount: 0,
        lastSyncedMessageId: googleMessage.id,
        lastSyncedTimestamp: new Date(googleMessage.timestamp),
        syncSource: 'google_voice',
        syncConfig: {
          enableDuplicateDetection: options.enableDuplicateDetection,
          enableMessageParsing: options.enableMessageParsing,
          enableCustomerMatching: options.enableCustomerMatching
        }
      });

      progress.progress.importedMessages++;

    } catch (error) {
      logger.error('Failed to process message', {
        messageId: googleMessage.id,
        phoneNumber: googleMessage.phoneNumber,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Finalizes the sync operation
   */
  private async finalizSync(
    options: SyncOptions,
    progress: SyncProgress,
    syncId: string
  ): Promise<void> {
    try {
      const endTime = new Date();
      const processingTimeMs = endTime.getTime() - progress.startTime.getTime();
      
      // Update sync status
      await this.syncStatusModel.markCompleted(syncId, {
        messagesProcessed: progress.progress.processedMessages,
        conversationsCreated: progress.progress.conversationsCreated,
        conversationsUpdated: progress.progress.conversationsUpdated,
        customersCreated: progress.progress.customersCreated,
        customersMatched: progress.progress.customersMatched,
        lastMessageDate: endTime
      });

      // Log final summary
      logger.info('Sync finalization completed', {
        syncId,
        processingTimeMs,
        summary: progress.progress
      });

    } catch (error) {
      logger.error('Failed to finalize sync', {
        syncId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Gets sync progress by sync ID
   */
  async getSyncProgress(syncId: string): Promise<SyncProgress | null> {
    try {
      const syncStatus = await this.syncStatusModel.findById(syncId);
      
      if (!syncStatus) {
        return null;
      }

      // Convert sync status to progress format
      const progress: SyncProgress = {
        syncId: syncStatus.id,
        syncSessionId: syncStatus.metadata?.syncSessionId || '',
        status: syncStatus.status === 'completed' ? 'completed' : 
                syncStatus.status === 'failed' ? 'failed' : 'running',
        startTime: syncStatus.startedAt || syncStatus.createdAt,
        endTime: syncStatus.completedAt,
        progress: {
          totalMessages: syncStatus.messagesTotal,
          processedMessages: syncStatus.messagesProcessed,
          importedMessages: syncStatus.messagesProcessed, // Approximation
          duplicatesSkipped: 0, // Would need additional tracking
          errorsEncountered: 0, // Would need additional tracking
          conversationsCreated: syncStatus.conversationsCreated,
          conversationsUpdated: syncStatus.conversationsUpdated,
          customersCreated: syncStatus.customersCreated,
          customersMatched: syncStatus.customersMatched
        },
        currentOperation: syncStatus.status === 'completed' ? 'completed' : 'processing',
        errors: []
      };

      return progress;

    } catch (error) {
      logger.error('Failed to get sync progress', {
        syncId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Cancels a running sync operation
   */
  async cancelSync(syncId: string): Promise<boolean> {
    try {
      const syncStatus = await this.syncStatusModel.findById(syncId);
      
      if (!syncStatus || syncStatus.status !== 'running') {
        return false;
      }

      await this.syncStatusModel.update(syncId, {
        status: 'cancelled',
        completedAt: new Date(),
        errorMessage: 'Sync cancelled by user'
      });

      logger.info('Sync cancelled', { syncId });
      return true;

    } catch (error) {
      logger.error('Failed to cancel sync', {
        syncId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  // Utility methods

  private generateSyncSessionId(): string {
    return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sanitizeOptions(options: SyncOptions): any {
    const { tokenId, ...safeOptions } = options;
    return safeOptions;
  }

  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  private normalizePhoneNumber(phoneNumber: string): string {
    const digits = phoneNumber.replace(/\D/g, '');
    
    if (digits.length === 10) {
      return `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    }
    
    return `+${digits}`;
  }

  private determinePriorityFromMessage(content: string): 'low' | 'medium' | 'high' | 'emergency' {
    const lowerContent = content.toLowerCase();
    
    const emergencyKeywords = [
      'emergency', 'urgent', 'flooding', 'burst pipe', 'no water',
      'sewage backup', 'gas leak', 'water everywhere'
    ];
    
    const highPriorityKeywords = [
      'asap', 'today', 'right away', 'immediately', 'cannot wait',
      'broken', 'not working', 'stopped working'
    ];

    if (emergencyKeywords.some(keyword => lowerContent.includes(keyword))) {
      return 'emergency';
    }
    
    if (highPriorityKeywords.some(keyword => lowerContent.includes(keyword))) {
      return 'high';
    }
    
    return 'medium';
  }

  private detectEmergencyKeywords(content: string): string[] {
    const emergencyKeywords = [
      'emergency', 'urgent', 'flooding', 'burst pipe', 'no water',
      'sewage backup', 'gas leak', 'water everywhere', 'help asap'
    ];

    const lowerContent = content.toLowerCase();
    return emergencyKeywords.filter(keyword => lowerContent.includes(keyword));
  }

  private extractGoogleVoiceNumber(message: GoogleVoiceMessage): string {
    // This would need to be implemented based on Google Voice API response structure
    return message.phoneNumber; // Placeholder
  }

  private calculateEstimatedTime(progress: SyncProgress): number {
    const { processedMessages, totalMessages } = progress.progress;
    
    if (processedMessages === 0 || totalMessages === 0) {
      return 0;
    }
    
    const elapsedTime = Date.now() - progress.startTime.getTime();
    const averageTimePerMessage = elapsedTime / processedMessages;
    const remainingMessages = totalMessages - processedMessages;
    
    return remainingMessages * averageTimePerMessage;
  }

  private async updateSyncStatus(syncId: string, updates: any): Promise<void> {
    try {
      await this.syncStatusModel.update(syncId, updates);
    } catch (error) {
      logger.error('Failed to update sync status', { syncId, error });
    }
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default ConversationSyncService;