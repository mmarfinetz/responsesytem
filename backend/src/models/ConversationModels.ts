import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../services/DatabaseService';
import { logger } from '../utils/logger';
import { Conversation, Message } from '../../shared/types';

// Extended interfaces for conversation sync tracking
export interface ConversationSyncMetadata {
  id: string;
  conversationId: string;
  syncType: 'initial' | 'incremental' | 'manual';
  syncSessionId: string;
  messagesImported: number;
  duplicatesSkipped: number;
  errorCount: number;
  lastSyncedMessageId?: string;
  lastSyncedTimestamp?: Date;
  syncSource: 'google_voice' | 'twilio' | 'manual';
  syncConfig?: Record<string, any>;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageParsingResult {
  id: string;
  messageId: string;
  parsingVersion: string;
  parsingTimestamp: Date;
  extractedInfo: {
    // Contact information
    customerName?: string;
    alternatePhoneNumbers?: string[];
    emailAddresses?: string[];
    
    // Address/location information
    addresses?: Array<{
      fullAddress: string;
      confidence: number;
      type: 'service' | 'billing' | 'mailing';
    }>;
    
    // Service type information
    serviceTypes?: Array<{
      type: string;
      confidence: number;
      keywords: string[];
    }>;
    
    // Urgency assessment
    urgencyLevel: 'low' | 'medium' | 'high' | 'emergency';
    emergencyKeywords?: string[];
    urgencyIndicators?: Array<{
      keyword: string;
      context: string;
      confidence: number;
    }>;
    
    // Time/scheduling information
    schedulingRequests?: Array<{
      type: 'specific' | 'range' | 'asap' | 'flexible';
      dateTime?: Date;
      timeRange?: { start: string; end: string };
      dayOfWeek?: string;
      notes?: string;
    }>;
    
    // Problem description
    problemDescription?: string;
    problemKeywords?: string[];
    symptoms?: string[];
    
    // Customer sentiment and communication style
    sentiment: 'positive' | 'neutral' | 'negative' | 'frustrated' | 'urgent';
    communicationStyle: 'formal' | 'casual' | 'brief' | 'detailed';
    
    // Business classification
    isBusinessCustomer: boolean;
    isPropertyManager: boolean;
    isEmergencyContact: boolean;
    
    // Follow-up indicators
    isFollowUp: boolean;
    referencesJobId?: string;
    referencesQuoteId?: string;
    
    // Quality indicators
    messageQuality: 'clear' | 'unclear' | 'incomplete' | 'garbled';
    requiresHumanReview: boolean;
    confidenceScore: number;
  };
  parsingErrors?: Array<{
    error: string;
    field: string;
    context: string;
  }>;
  processingTimeMs: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationThreadingResult {
  id: string;
  customerId: string;
  threadingSessionId: string;
  conversationsAnalyzed: number;
  conversationsMerged: number;
  conversationsSplit: number;
  threadingDecisions: Array<{
    decision: 'merge' | 'split' | 'keep_separate' | 'new_thread';
    conversationIds: string[];
    reasoning: string;
    confidence: number;
  }>;
  processingTimeMs: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageAttachment {
  id: string;
  messageId: string;
  originalUrl?: string;
  localPath?: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: 'pending' | 'downloaded' | 'processed' | 'failed';
  isImage: boolean;
  isAudio: boolean;
  isTranscribed: boolean;
  transcription?: string;
  imageAnalysis?: Record<string, any>;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationAnalytics {
  id: string;
  conversationId: string;
  analysisDate: Date;
  metrics: {
    totalMessages: number;
    customerMessages: number;
    businessMessages: number;
    averageResponseTimeMinutes: number;
    conversationDurationMinutes: number;
    customerSatisfactionScore?: number;
    resolutionStatus: 'resolved' | 'pending' | 'escalated' | 'abandoned';
    emergencyEscalations: number;
    jobsCreated: number;
    quotesGenerated: number;
    revenueGenerated?: number;
  };
  keywordAnalysis: {
    mostFrequentKeywords: Array<{ keyword: string; count: number }>;
    serviceTypeKeywords: Array<{ serviceType: string; count: number }>;
    urgencyKeywords: Array<{ keyword: string; count: number }>;
  };
  communicationPatterns: {
    busyHours: number[];
    preferredDays: string[];
    responsePatterns: 'immediate' | 'delayed' | 'business_hours_only' | 'mixed';
  };
  createdAt: Date;
  updatedAt: Date;
}

export class ConversationModel {
  constructor(private db: DatabaseService) {}

  async create(conversation: Omit<Conversation, 'id' | 'createdAt' | 'updatedAt'>): Promise<Conversation> {
    try {
      const knex = await this.db.getKnex();
      const id = uuidv4();
      const now = new Date();

      const conversationRecord = {
        id,
        ...conversation,
        createdAt: now,
        updatedAt: now
      };

      await knex('conversations').insert(conversationRecord);

      logger.info('Created conversation', { 
        id, 
        customerId: conversation.customerId, 
        platform: conversation.platform,
        priority: conversation.priority 
      });

      return { ...conversation, id, createdAt: now, updatedAt: now };
    } catch (error) {
      logger.error('Failed to create conversation', { conversation, error });
      throw error;
    }
  }

  async findById(id: string): Promise<Conversation | null> {
    try {
      const knex = await this.db.getKnex();
      const conversation = await knex('conversations').where({ id }).first();
      return conversation || null;
    } catch (error) {
      logger.error('Failed to find conversation by ID', { id, error });
      throw error;
    }
  }

  async findByCustomerAndPhone(
    customerId: string, 
    phoneNumber: string,
    platform?: string
  ): Promise<Conversation[]> {
    try {
      const knex = await this.db.getKnex();
      let query = knex('conversations')
        .where({ customerId, phoneNumber })
        .orderBy('lastMessageAt', 'desc');

      if (platform) {
        query = query.where({ platform });
      }

      return await query;
    } catch (error) {
      logger.error('Failed to find conversations by customer and phone', { 
        customerId, 
        phoneNumber, 
        platform, 
        error 
      });
      throw error;
    }
  }

  async findActiveByCustomer(customerId: string): Promise<Conversation[]> {
    try {
      const knex = await this.db.getKnex();
      return await knex('conversations')
        .where({ customerId, status: 'active' })
        .orderBy('lastMessageAt', 'desc');
    } catch (error) {
      logger.error('Failed to find active conversations by customer', { customerId, error });
      throw error;
    }
  }

  async update(id: string, updates: Partial<Omit<Conversation, 'id' | 'createdAt'>>): Promise<Conversation> {
    try {
      const knex = await this.db.getKnex();
      
      await knex('conversations')
        .where({ id })
        .update({
          ...updates,
          updatedAt: new Date()
        });

      const updated = await this.findById(id);
      if (!updated) {
        throw new Error('Conversation not found after update');
      }

      logger.info('Updated conversation', { id, updates: Object.keys(updates) });
      return updated;
    } catch (error) {
      logger.error('Failed to update conversation', { id, error });
      throw error;
    }
  }

  async markResolved(id: string, summary?: string): Promise<Conversation> {
    return this.update(id, {
      status: 'resolved',
      resolvedAt: new Date(),
      summary
    });
  }

  async updateLastMessage(id: string, messageTimestamp: Date): Promise<void> {
    try {
      const knex = await this.db.getKnex();
      await knex('conversations')
        .where({ id })
        .update({
          lastMessageAt: messageTimestamp,
          updatedAt: new Date()
        });
    } catch (error) {
      logger.error('Failed to update conversation last message time', { id, error });
      throw error;
    }
  }

  async findByGoogleThreadId(googleThreadId: string): Promise<Conversation | null> {
    try {
      const knex = await this.db.getKnex();
      const conversation = await knex('conversations')
        .where({ googleThreadId })
        .first();
      return conversation || null;
    } catch (error) {
      logger.error('Failed to find conversation by Google thread ID', { googleThreadId, error });
      throw error;
    }
  }

  async findPendingMerge(customerId: string, phoneNumber: string, timeWindowHours: number = 24): Promise<Conversation[]> {
    try {
      const knex = await this.db.getKnex();
      const timeWindow = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);
      
      return await knex('conversations')
        .where({ customerId, phoneNumber })
        .where('createdAt', '>', timeWindow)
        .whereIn('status', ['active', 'resolved'])
        .orderBy('lastMessageAt', 'desc');
    } catch (error) {
      logger.error('Failed to find conversations pending merge', { 
        customerId, 
        phoneNumber, 
        timeWindowHours, 
        error 
      });
      throw error;
    }
  }
}

export class MessageModel {
  constructor(private db: DatabaseService) {}

  async create(message: Omit<Message, 'id' | 'createdAt' | 'updatedAt'>): Promise<Message> {
    try {
      const knex = await this.db.getKnex();
      const id = uuidv4();
      const now = new Date();

      const messageRecord = {
        id,
        ...message,
        metadata: message.metadata ? JSON.stringify(message.metadata) : null,
        attachments: message.attachments ? JSON.stringify(message.attachments) : null,
        extractedInfo: message.extractedInfo ? JSON.stringify(message.extractedInfo) : null,
        createdAt: now,
        updatedAt: now
      };

      await knex('messages').insert(messageRecord);

      logger.info('Created message', { 
        id, 
        conversationId: message.conversationId, 
        direction: message.direction,
        messageType: message.messageType,
        platform: message.platform
      });

      return { ...message, id, createdAt: now, updatedAt: now };
    } catch (error) {
      logger.error('Failed to create message', { message, error });
      throw error;
    }
  }

  async findById(id: string): Promise<Message | null> {
    try {
      const knex = await this.db.getKnex();
      const row = await knex('messages').where({ id }).first();
      return row ? this.mapRow(row) : null;
    } catch (error) {
      logger.error('Failed to find message by ID', { id, error });
      throw error;
    }
  }

  async findByConversation(
    conversationId: string, 
    limit: number = 50,
    offset: number = 0
  ): Promise<Message[]> {
    try {
      const knex = await this.db.getKnex();
      const rows = await knex('messages')
        .where({ conversationId })
        .orderBy('sentAt', 'desc')
        .limit(limit)
        .offset(offset);

      return rows.map(row => this.mapRow(row));
    } catch (error) {
      logger.error('Failed to find messages by conversation', { conversationId, error });
      throw error;
    }
  }

  async findPendingProcessing(): Promise<Message[]> {
    try {
      const knex = await this.db.getKnex();
      const rows = await knex('messages')
        .where({ requiresHumanReview: false })
        .whereNull('extractedInfo')
        .where('messageType', 'text')
        .where('direction', 'inbound')
        .orderBy('sentAt', 'asc')
        .limit(100);

      return rows.map(row => this.mapRow(row));
    } catch (error) {
      logger.error('Failed to find messages pending processing', { error });
      throw error;
    }
  }

  async update(id: string, updates: Partial<Omit<Message, 'id' | 'createdAt'>>): Promise<Message> {
    try {
      const knex = await this.db.getKnex();
      
      const updateData = {
        ...updates,
        ...(updates.metadata && { metadata: JSON.stringify(updates.metadata) }),
        ...(updates.attachments && { attachments: JSON.stringify(updates.attachments) }),
        ...(updates.extractedInfo && { extractedInfo: JSON.stringify(updates.extractedInfo) }),
        updatedAt: new Date()
      };

      await knex('messages').where({ id }).update(updateData);

      const updated = await this.findById(id);
      if (!updated) {
        throw new Error('Message not found after update');
      }

      return updated;
    } catch (error) {
      logger.error('Failed to update message', { id, error });
      throw error;
    }
  }

  async markProcessed(id: string, extractedInfo: Record<string, any>, processingTimeSeconds: number): Promise<Message> {
    return this.update(id, {
      extractedInfo,
      processingTimeSeconds,
      status: 'delivered'
    });
  }

  async findEmergencyMessages(since: Date): Promise<Message[]> {
    try {
      const knex = await this.db.getKnex();
      const rows = await knex('messages')
        .where('containsEmergencyKeywords', true)
        .where('sentAt', '>', since)
        .where('direction', 'inbound')
        .orderBy('sentAt', 'desc');

      return rows.map(row => this.mapRow(row));
    } catch (error) {
      logger.error('Failed to find emergency messages', { since, error });
      throw error;
    }
  }

  async findByPhoneNumberAndDateRange(
    phoneNumber: string, 
    startDate: Date, 
    endDate: Date
  ): Promise<Message[]> {
    try {
      const knex = await this.db.getKnex();
      const rows = await knex('messages')
        .join('conversations', 'messages.conversationId', 'conversations.id')
        .where('conversations.phoneNumber', phoneNumber)
        .whereBetween('messages.sentAt', [startDate, endDate])
        .select('messages.*')
        .orderBy('messages.sentAt', 'asc');

      return rows.map(row => this.mapRow(row));
    } catch (error) {
      logger.error('Failed to find messages by phone number and date range', { 
        phoneNumber, 
        startDate, 
        endDate, 
        error 
      });
      throw error;
    }
  }

  private mapRow(row: any): Message {
    return {
      id: row.id,
      conversationId: row.conversationId,
      direction: row.direction,
      content: row.content,
      messageType: row.messageType,
      platform: row.platform,
      status: row.status,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      sentAt: new Date(row.sentAt),
      originalContent: row.originalContent,
      attachments: row.attachments ? JSON.parse(row.attachments) : undefined,
      containsEmergencyKeywords: row.containsEmergencyKeywords,
      extractedInfo: row.extractedInfo ? JSON.parse(row.extractedInfo) : undefined,
      sentimentScore: row.sentimentScore,
      requiresHumanReview: row.requiresHumanReview,
      processedBy: row.processedBy,
      processingTimeSeconds: row.processingTimeSeconds,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  }
}

export class ConversationSyncMetadataModel {
  constructor(private db: DatabaseService) {}

  async create(metadata: Omit<ConversationSyncMetadata, 'id' | 'createdAt' | 'updatedAt'>): Promise<ConversationSyncMetadata> {
    try {
      const knex = await this.db.getKnex();
      const id = uuidv4();
      const now = new Date();

      const record = {
        id,
        ...metadata,
        syncConfig: metadata.syncConfig ? JSON.stringify(metadata.syncConfig) : null,
        createdAt: now,
        updatedAt: now
      };

      await knex('conversation_sync_metadata').insert(record);

      logger.info('Created conversation sync metadata', { 
        id, 
        conversationId: metadata.conversationId, 
        syncType: metadata.syncType 
      });

      return { ...metadata, id, createdAt: now, updatedAt: now };
    } catch (error) {
      logger.error('Failed to create conversation sync metadata', { metadata, error });
      throw error;
    }
  }

  async findByConversation(conversationId: string): Promise<ConversationSyncMetadata[]> {
    try {
      const knex = await this.db.getKnex();
      const rows = await knex('conversation_sync_metadata')
        .where({ conversationId })
        .orderBy('createdAt', 'desc');

      return rows.map(row => this.mapRow(row));
    } catch (error) {
      logger.error('Failed to find sync metadata by conversation', { conversationId, error });
      throw error;
    }
  }

  async findBySyncSession(syncSessionId: string): Promise<ConversationSyncMetadata[]> {
    try {
      const knex = await this.db.getKnex();
      const rows = await knex('conversation_sync_metadata')
        .where({ syncSessionId })
        .orderBy('createdAt', 'asc');

      return rows.map(row => this.mapRow(row));
    } catch (error) {
      logger.error('Failed to find sync metadata by session', { syncSessionId, error });
      throw error;
    }
  }

  private mapRow(row: any): ConversationSyncMetadata {
    return {
      id: row.id,
      conversationId: row.conversationId,
      syncType: row.syncType,
      syncSessionId: row.syncSessionId,
      messagesImported: row.messagesImported || 0,
      duplicatesSkipped: row.duplicatesSkipped || 0,
      errorCount: row.errorCount || 0,
      lastSyncedMessageId: row.lastSyncedMessageId,
      lastSyncedTimestamp: row.lastSyncedTimestamp ? new Date(row.lastSyncedTimestamp) : undefined,
      syncSource: row.syncSource,
      syncConfig: row.syncConfig ? JSON.parse(row.syncConfig) : undefined,
      completedAt: row.completedAt ? new Date(row.completedAt) : undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  }
}

export class MessageParsingResultModel {
  constructor(private db: DatabaseService) {}

  async create(result: Omit<MessageParsingResult, 'id' | 'createdAt' | 'updatedAt'>): Promise<MessageParsingResult> {
    try {
      const knex = await this.db.getKnex();
      const id = uuidv4();
      const now = new Date();

      const record = {
        id,
        ...result,
        extractedInfo: JSON.stringify(result.extractedInfo),
        parsingErrors: result.parsingErrors ? JSON.stringify(result.parsingErrors) : null,
        createdAt: now,
        updatedAt: now
      };

      await knex('message_parsing_results').insert(record);

      logger.info('Created message parsing result', { 
        id, 
        messageId: result.messageId, 
        parsingVersion: result.parsingVersion,
        confidenceScore: result.extractedInfo.confidenceScore
      });

      return { ...result, id, createdAt: now, updatedAt: now };
    } catch (error) {
      logger.error('Failed to create message parsing result', { result, error });
      throw error;
    }
  }

  async findByMessage(messageId: string): Promise<MessageParsingResult | null> {
    try {
      const knex = await this.db.getKnex();
      const row = await knex('message_parsing_results')
        .where({ messageId })
        .orderBy('parsingTimestamp', 'desc')
        .first();

      return row ? this.mapRow(row) : null;
    } catch (error) {
      logger.error('Failed to find parsing result by message', { messageId, error });
      throw error;
    }
  }

  private mapRow(row: any): MessageParsingResult {
    return {
      id: row.id,
      messageId: row.messageId,
      parsingVersion: row.parsingVersion,
      parsingTimestamp: new Date(row.parsingTimestamp),
      extractedInfo: JSON.parse(row.extractedInfo),
      parsingErrors: row.parsingErrors ? JSON.parse(row.parsingErrors) : undefined,
      processingTimeMs: row.processingTimeMs || 0,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  }
}

export default {
  ConversationModel,
  MessageModel,
  ConversationSyncMetadataModel,
  MessageParsingResultModel
};