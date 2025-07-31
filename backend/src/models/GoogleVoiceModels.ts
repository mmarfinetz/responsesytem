import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '../services/DatabaseService';
import { logger } from '../utils/logger';

export interface GoogleOAuthToken {
  id: string;
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  expiresAt: Date;
  scopes: string[];
  tokenType: string;
  isActive: boolean;
  lastRefreshedAt?: Date;
  refreshCount: number;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface GoogleVoiceSyncStatus {
  id: string;
  tokenId: string;
  syncType: 'initial' | 'incremental' | 'manual';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startedAt?: Date;
  completedAt?: Date;
  messagesProcessed: number;
  messagesTotal: number;
  conversationsCreated: number;
  conversationsUpdated: number;
  customersCreated: number;
  customersMatched: number;
  lastSyncToken?: string;
  lastMessageDate?: Date;
  errorMessage?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface GoogleVoiceMessageMapping {
  id: string;
  messageId: string;
  googleMessageId: string;
  googleThreadId?: string;
  tokenId: string;
  googleMessageDate: Date;
  googleMetadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface GoogleVoicePhoneMapping {
  id: string;
  tokenId: string;
  googleVoiceNumber: string;
  customerPhoneNumber: string;
  normalizedPhoneNumber: string;
  customerId?: string;
  isActive: boolean;
  firstContactAt: Date;
  lastContactAt: Date;
  messageCount: number;
  contactInfo?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface GoogleApiRateLimit {
  id: string;
  tokenId: string;
  endpoint: string;
  requestCount: number;
  windowStart: Date;
  windowEnd: Date;
  quotaLimit: number;
  quotaRemaining: number;
  quotaResetAt?: Date;
  isThrottled: boolean;
  throttledUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export class GoogleOAuthTokenModel {
  constructor(private db: DatabaseService) {}

  async create(token: Omit<GoogleOAuthToken, 'id' | 'createdAt' | 'updatedAt'>): Promise<GoogleOAuthToken> {
    try {
      const knex = DatabaseService.getInstance();
      const id = uuidv4();
      const now = new Date();

      const tokenRecord = {
        id,
        ...token,
        scopes: JSON.stringify(token.scopes),
        createdAt: now,
        updatedAt: now
      };

      await knex('google_oauth_tokens').insert(tokenRecord);

      logger.info('Created Google OAuth token', { id, userId: token.userId, email: token.email });

      return { ...token, id, createdAt: now, updatedAt: now };
    } catch (error) {
      logger.error('Failed to create Google OAuth token', {
        userId: token.userId,
        email: token.email,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async findById(id: string): Promise<GoogleOAuthToken | null> {
    try {
      const knex = DatabaseService.getInstance();
      const row = await knex('google_oauth_tokens').where({ id }).first();

      return row ? this.mapRow(row) : null;
    } catch (error) {
      logger.error('Failed to find Google OAuth token by ID', { id, error });
      throw error;
    }
  }

  async findByUserId(userId: string): Promise<GoogleOAuthToken[]> {
    try {
      const knex = DatabaseService.getInstance();
      const rows = await knex('google_oauth_tokens')
        .where({ userId, isActive: true })
        .orderBy('createdAt', 'desc');

      return rows.map((row: any) => this.mapRow(row));
    } catch (error) {
      logger.error('Failed to find Google OAuth tokens by user ID', { userId, error });
      throw error;
    }
  }

  async findByUserAndEmail(userId: string, email: string): Promise<GoogleOAuthToken | null> {
    try {
      const knex = DatabaseService.getInstance();
      const row = await knex('google_oauth_tokens')
        .where({ userId, email, isActive: true })
        .first();

      return row ? this.mapRow(row) : null;
    } catch (error) {
      logger.error('Failed to find Google OAuth token by user and email', { userId, email, error });
      throw error;
    }
  }

  async update(id: string, updates: Partial<Omit<GoogleOAuthToken, 'id' | 'createdAt'>>): Promise<GoogleOAuthToken> {
    try {
      const knex = DatabaseService.getInstance();
      
      const updateData = {
        ...updates,
        ...(updates.scopes && { scopes: JSON.stringify(updates.scopes) }),
        updatedAt: new Date()
      };

      await knex('google_oauth_tokens').where({ id }).update(updateData);

      const updated = await this.findById(id);
      if (!updated) {
        throw new Error('Token not found after update');
      }

      logger.info('Updated Google OAuth token', { id });
      return updated;
    } catch (error) {
      logger.error('Failed to update Google OAuth token', { id, error });
      throw error;
    }
  }

  async deactivate(id: string): Promise<void> {
    try {
      await this.update(id, { isActive: false });
      logger.info('Deactivated Google OAuth token', { id });
    } catch (error) {
      logger.error('Failed to deactivate Google OAuth token', { id, error });
      throw error;
    }
  }

  async findExpiring(bufferMinutes: number = 5): Promise<GoogleOAuthToken[]> {
    try {
      const knex = DatabaseService.getInstance();
      const expiryThreshold = new Date(Date.now() + bufferMinutes * 60 * 1000);

      const rows = await knex('google_oauth_tokens')
        .where({ isActive: true })
        .where('expiresAt', '<=', expiryThreshold);

      return rows.map((row: any) => this.mapRow(row));
    } catch (error) {
      logger.error('Failed to find expiring tokens', { bufferMinutes, error });
      throw error;
    }
  }

  private mapRow(row: any): GoogleOAuthToken {
    return {
      id: row.id,
      userId: row.userId,
      email: row.email,
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      idToken: row.idToken,
      expiresAt: new Date(row.expiresAt),
      scopes: JSON.parse(row.scopes || '[]'),
      tokenType: row.tokenType,
      isActive: row.isActive,
      lastRefreshedAt: row.lastRefreshedAt ? new Date(row.lastRefreshedAt) : undefined,
      refreshCount: row.refreshCount || 0,
      errorMessage: row.errorMessage,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  }
}

export class GoogleVoiceSyncStatusModel {
  constructor(private db: DatabaseService) {}

  async create(sync: Omit<GoogleVoiceSyncStatus, 'id' | 'createdAt' | 'updatedAt'>): Promise<GoogleVoiceSyncStatus> {
    try {
      const knex = DatabaseService.getInstance();
      const id = uuidv4();
      const now = new Date();

      const syncRecord = {
        id,
        ...sync,
        metadata: sync.metadata ? JSON.stringify(sync.metadata) : null,
        createdAt: now,
        updatedAt: now
      };

      await knex('google_voice_sync_status').insert(syncRecord);

      logger.info('Created Google Voice sync status', { id, tokenId: sync.tokenId, syncType: sync.syncType });

      return { ...sync, id, createdAt: now, updatedAt: now };
    } catch (error) {
      logger.error('Failed to create Google Voice sync status', { sync, error });
      throw error;
    }
  }

  async findById(id: string): Promise<GoogleVoiceSyncStatus | null> {
    try {
      const knex = DatabaseService.getInstance();
      const row = await knex('google_voice_sync_status').where({ id }).first();

      return row ? this.mapRow(row) : null;
    } catch (error) {
      logger.error('Failed to find sync status by ID', { id, error });
      throw error;
    }
  }

  async findByTokenId(tokenId: string, limit: number = 50): Promise<GoogleVoiceSyncStatus[]> {
    try {
      const knex = DatabaseService.getInstance();
      const rows = await knex('google_voice_sync_status')
        .where({ tokenId })
        .orderBy('createdAt', 'desc')
        .limit(limit);

      return rows.map((row: any) => this.mapRow(row));
    } catch (error) {
      logger.error('Failed to find sync statuses by token ID', { tokenId, error });
      throw error;
    }
  }

  async findRunning(): Promise<GoogleVoiceSyncStatus[]> {
    try {
      const knex = DatabaseService.getInstance();
      const rows = await knex('google_voice_sync_status')
        .where({ status: 'running' })
        .orderBy('startedAt', 'asc');

      return rows.map((row: any) => this.mapRow(row));
    } catch (error) {
      logger.error('Failed to find running sync statuses', { error });
      throw error;
    }
  }

  async update(id: string, updates: Partial<Omit<GoogleVoiceSyncStatus, 'id' | 'createdAt'>>): Promise<GoogleVoiceSyncStatus> {
    try {
      const knex = DatabaseService.getInstance();
      
      const updateData = {
        ...updates,
        ...(updates.metadata && { metadata: JSON.stringify(updates.metadata) }),
        updatedAt: new Date()
      };

      await knex('google_voice_sync_status').where({ id }).update(updateData);

      const updated = await this.findById(id);
      if (!updated) {
        throw new Error('Sync status not found after update');
      }

      return updated;
    } catch (error) {
      logger.error('Failed to update sync status', { id, error });
      throw error;
    }
  }

  async markCompleted(id: string, results: {
    messagesProcessed: number;
    conversationsCreated: number;
    conversationsUpdated: number;
    customersCreated: number;
    customersMatched: number;
    lastSyncToken?: string;
    lastMessageDate?: Date;
  }): Promise<GoogleVoiceSyncStatus> {
    return this.update(id, {
      status: 'completed',
      completedAt: new Date(),
      ...results
    });
  }

  async markFailed(id: string, errorMessage: string): Promise<GoogleVoiceSyncStatus> {
    return this.update(id, {
      status: 'failed',
      completedAt: new Date(),
      errorMessage
    });
  }

  private mapRow(row: any): GoogleVoiceSyncStatus {
    return {
      id: row.id,
      tokenId: row.tokenId,
      syncType: row.syncType,
      status: row.status,
      startedAt: row.startedAt ? new Date(row.startedAt) : undefined,
      completedAt: row.completedAt ? new Date(row.completedAt) : undefined,
      messagesProcessed: row.messagesProcessed || 0,
      messagesTotal: row.messagesTotal || 0,
      conversationsCreated: row.conversationsCreated || 0,
      conversationsUpdated: row.conversationsUpdated || 0,
      customersCreated: row.customersCreated || 0,
      customersMatched: row.customersMatched || 0,
      lastSyncToken: row.lastSyncToken,
      lastMessageDate: row.lastMessageDate ? new Date(row.lastMessageDate) : undefined,
      errorMessage: row.errorMessage,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  }
}

export class GoogleVoiceMessageMappingModel {
  constructor(private db: DatabaseService) {}

  async create(mapping: Omit<GoogleVoiceMessageMapping, 'id' | 'createdAt' | 'updatedAt'>): Promise<GoogleVoiceMessageMapping> {
    try {
      const knex = DatabaseService.getInstance();
      const id = uuidv4();
      const now = new Date();

      const mappingRecord = {
        id,
        ...mapping,
        googleMetadata: mapping.googleMetadata ? JSON.stringify(mapping.googleMetadata) : null,
        createdAt: now,
        updatedAt: now
      };

      await knex('google_voice_message_mapping').insert(mappingRecord);

      return { ...mapping, id, createdAt: now, updatedAt: now };
    } catch (error) {
      logger.error('Failed to create Google Voice message mapping', { mapping, error });
      throw error;
    }
  }

  async findByMessageId(messageId: string): Promise<GoogleVoiceMessageMapping | null> {
    try {
      const knex = DatabaseService.getInstance();
      const row = await knex('google_voice_message_mapping').where({ messageId }).first();

      return row ? this.mapRow(row) : null;
    } catch (error) {
      logger.error('Failed to find message mapping by message ID', { messageId, error });
      throw error;
    }
  }

  async findByGoogleMessageId(googleMessageId: string, tokenId: string): Promise<GoogleVoiceMessageMapping | null> {
    try {
      const knex = DatabaseService.getInstance();
      const row = await knex('google_voice_message_mapping')
        .where({ googleMessageId, tokenId })
        .first();

      return row ? this.mapRow(row) : null;
    } catch (error) {
      logger.error('Failed to find message mapping by Google message ID', { googleMessageId, tokenId, error });
      throw error;
    }
  }

  async findByThreadId(googleThreadId: string, tokenId: string): Promise<GoogleVoiceMessageMapping[]> {
    try {
      const knex = DatabaseService.getInstance();
      const rows = await knex('google_voice_message_mapping')
        .where({ googleThreadId, tokenId })
        .orderBy('googleMessageDate', 'asc');

      return rows.map((row: any) => this.mapRow(row));
    } catch (error) {
      logger.error('Failed to find message mappings by thread ID', { googleThreadId, tokenId, error });
      throw error;
    }
  }

  private mapRow(row: any): GoogleVoiceMessageMapping {
    return {
      id: row.id,
      messageId: row.messageId,
      googleMessageId: row.googleMessageId,
      googleThreadId: row.googleThreadId,
      tokenId: row.tokenId,
      googleMessageDate: new Date(row.googleMessageDate),
      googleMetadata: row.googleMetadata ? JSON.parse(row.googleMetadata) : undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  }
}

export class GoogleVoicePhoneMappingModel {
  constructor(private db: DatabaseService) {}

  async create(mapping: Omit<GoogleVoicePhoneMapping, 'id' | 'createdAt' | 'updatedAt'>): Promise<GoogleVoicePhoneMapping> {
    try {
      const knex = DatabaseService.getInstance();
      const id = uuidv4();
      const now = new Date();

      const mappingRecord = {
        id,
        ...mapping,
        contactInfo: mapping.contactInfo ? JSON.stringify(mapping.contactInfo) : null,
        createdAt: now,
        updatedAt: now
      };

      await knex('google_voice_phone_mapping').insert(mappingRecord);

      logger.info('Created Google Voice phone mapping', { 
        id, 
        tokenId: mapping.tokenId, 
        phoneNumber: mapping.customerPhoneNumber 
      });

      return { ...mapping, id, createdAt: now, updatedAt: now };
    } catch (error) {
      logger.error('Failed to create Google Voice phone mapping', { mapping, error });
      throw error;
    }
  }

  async findByPhoneNumber(normalizedPhoneNumber: string, tokenId: string): Promise<GoogleVoicePhoneMapping | null> {
    try {
      const knex = DatabaseService.getInstance();
      const row = await knex('google_voice_phone_mapping')
        .where({ normalizedPhoneNumber, tokenId, isActive: true })
        .first();

      return row ? this.mapRow(row) : null;
    } catch (error) {
      logger.error('Failed to find phone mapping by phone number', { normalizedPhoneNumber, tokenId, error });
      throw error;
    }
  }

  async findByCustomerId(customerId: string): Promise<GoogleVoicePhoneMapping[]> {
    try {
      const knex = DatabaseService.getInstance();
      const rows = await knex('google_voice_phone_mapping')
        .where({ customerId, isActive: true })
        .orderBy('lastContactAt', 'desc');

      return rows.map((row: any) => this.mapRow(row));
    } catch (error) {
      logger.error('Failed to find phone mappings by customer ID', { customerId, error });
      throw error;
    }
  }

  async updateMessageCount(id: string, increment: number = 1): Promise<void> {
    try {
      const knex = DatabaseService.getInstance();
      await knex('google_voice_phone_mapping')
        .where({ id })
        .update({
          messageCount: knex.raw('message_count + ?', [increment]),
          lastContactAt: new Date(),
          updatedAt: new Date()
        });
    } catch (error) {
      logger.error('Failed to update message count', { id, increment, error });
      throw error;
    }
  }

  async linkToCustomer(id: string, customerId: string): Promise<void> {
    try {
      const knex = DatabaseService.getInstance();
      await knex('google_voice_phone_mapping')
        .where({ id })
        .update({
          customerId,
          updatedAt: new Date()
        });

      logger.info('Linked phone mapping to customer', { id, customerId });
    } catch (error) {
      logger.error('Failed to link phone mapping to customer', { id, customerId, error });
      throw error;
    }
  }

  private mapRow(row: any): GoogleVoicePhoneMapping {
    return {
      id: row.id,
      tokenId: row.tokenId,
      googleVoiceNumber: row.googleVoiceNumber,
      customerPhoneNumber: row.customerPhoneNumber,
      normalizedPhoneNumber: row.normalizedPhoneNumber,
      customerId: row.customerId,
      isActive: row.isActive,
      firstContactAt: new Date(row.firstContactAt),
      lastContactAt: new Date(row.lastContactAt),
      messageCount: row.messageCount || 0,
      contactInfo: row.contactInfo ? JSON.parse(row.contactInfo) : undefined,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt)
    };
  }
}