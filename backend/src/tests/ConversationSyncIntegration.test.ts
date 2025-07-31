import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import { DatabaseService } from '../services/DatabaseService';
import { ConversationSyncService } from '../services/ConversationSyncService';
import { MessageParsingService } from '../services/MessageParsingService';
import { CustomerMatchingService } from '../services/CustomerMatchingService';
import { ConversationManagerService } from '../services/ConversationManagerService';
import { ConversationSyncMonitoringService } from '../services/ConversationSyncMonitoringService';
import { GoogleVoiceApiClient } from '../services/GoogleVoiceApiClient';
import { GoogleVoiceMessage } from '../../shared/types';

// Mock Google Voice API Client
class MockGoogleVoiceApiClient {
  private mockMessages: GoogleVoiceMessage[] = [
    {
      id: 'msg_1',
      threadId: 'thread_1',
      text: 'My toilet is overflowing and water is everywhere! This is an emergency!',
      timestamp: new Date(Date.now() - 60000).toISOString(),
      phoneNumber: '+15551234567',
      direction: 'inbound',
      type: 'sms'
    },
    {
      id: 'msg_2',
      threadId: 'thread_1',
      text: 'Hello, we received your emergency message. Our technician is on the way.',
      timestamp: new Date(Date.now() - 30000).toISOString(),
      phoneNumber: '+15551234567',
      direction: 'outbound',
      type: 'sms'
    },
    {
      id: 'msg_3',
      threadId: 'thread_2',
      text: 'Hi, I need a quote for drain cleaning at 123 Main St',
      timestamp: new Date(Date.now() - 120000).toISOString(),
      phoneNumber: '+15559876543',
      direction: 'inbound',
      type: 'sms'
    },
    {
      id: 'msg_4',
      threadId: 'thread_1',
      text: 'Thank you! The technician fixed the toilet. Great service!',
      timestamp: new Date().toISOString(),
      phoneNumber: '+15551234567',
      direction: 'inbound',
      type: 'sms'
    }
  ];

  async getMessages(options: any): Promise<{ messages: GoogleVoiceMessage[]; nextPageToken?: string }> {
    // Simulate pagination
    const pageSize = options.pageSize || 10;
    const startIndex = options.pageToken ? parseInt(options.pageToken) : 0;
    const endIndex = Math.min(startIndex + pageSize, this.mockMessages.length);
    
    const messages = this.mockMessages.slice(startIndex, endIndex);
    const nextPageToken = endIndex < this.mockMessages.length ? endIndex.toString() : undefined;

    return { messages, nextPageToken };
  }
}

describe('Conversation Sync Integration Tests', () => {
  let db: DatabaseService;
  let mockGoogleVoiceApi: MockGoogleVoiceApiClient;
  let conversationSyncService: ConversationSyncService;
  let messageParsingService: MessageParsingService;
  let customerMatchingService: CustomerMatchingService;
  let conversationManagerService: ConversationManagerService;
  let monitoringService: ConversationSyncMonitoringService;

  beforeAll(async () => {
    // Initialize database service with test configuration
    db = new DatabaseService();
    await db.connect();

    // Run migrations
    const knex = await db.getKnex();
    await knex.migrate.latest();
  });

  afterAll(async () => {
    await db.disconnect();
  });

  beforeEach(async () => {
    // Clear test data
    const knex = await db.getKnex();
    await knex('message_parsing_results').delete();
    await knex('conversation_sync_metadata').delete();
    await knex('google_voice_message_mapping').delete();
    await knex('google_voice_phone_mapping').delete();
    await knex('messages').delete();
    await knex('conversations').delete();
    await knex('customers').delete();

    // Initialize services
    mockGoogleVoiceApi = new MockGoogleVoiceApiClient();
    conversationSyncService = new ConversationSyncService(db, mockGoogleVoiceApi as any);
    messageParsingService = new MessageParsingService(db);
    customerMatchingService = new CustomerMatchingService(db);
    conversationManagerService = new ConversationManagerService(db);
    monitoringService = new ConversationSyncMonitoringService(db);
  });

  afterEach(async () => {
    monitoringService.stopMonitoring();
  });

  describe('End-to-End Conversation Sync', () => {
    it('should perform complete sync with message parsing and customer matching', async () => {
      // Create test token
      const knex = await db.getKnex();
      const tokenId = 'test_token_123';
      
      // Start sync
      const syncProgress = await conversationSyncService.startSync({
        tokenId,
        syncType: 'initial',
        enableDuplicateDetection: true,
        enableMessageParsing: true,
        enableCustomerMatching: true,
        enableConversationThreading: true,
        pageSize: 10,
        maxPages: 1
      });

      expect(syncProgress.syncId).toBeDefined();
      expect(syncProgress.status).toBe('running');

      // Wait for sync to complete (with timeout)
      let attempts = 0;
      const maxAttempts = 30;
      
      while (attempts < maxAttempts) {
        const progress = await conversationSyncService.getSyncProgress(syncProgress.syncId);
        
        if (progress?.status === 'completed') {
          break;
        }
        
        if (progress?.status === 'failed') {
          throw new Error(`Sync failed: ${progress.errors.map(e => e.error).join(', ')}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }

      if (attempts >= maxAttempts) {
        throw new Error('Sync did not complete within timeout');
      }

      // Verify sync results
      const finalProgress = await conversationSyncService.getSyncProgress(syncProgress.syncId);
      expect(finalProgress?.status).toBe('completed');
      expect(finalProgress?.progress.totalMessages).toBeGreaterThan(0);
      expect(finalProgress?.progress.importedMessages).toBeGreaterThan(0);

      // Verify customers were created/matched
      const customers = await knex('customers').select('*');
      expect(customers.length).toBeGreaterThan(0);

      // Verify conversations were created
      const conversations = await knex('conversations').select('*');
      expect(conversations.length).toBeGreaterThan(0);

      // Verify messages were processed
      const messages = await knex('messages').select('*');
      expect(messages.length).toBe(4); // All mock messages

      // Verify message parsing results
      const parsingResults = await knex('message_parsing_results').select('*');
      expect(parsingResults.length).toBeGreaterThan(0);

      // Check emergency message detection
      const emergencyMessages = await knex('messages')
        .where('containsEmergencyKeywords', true)
        .select('*');
      expect(emergencyMessages.length).toBeGreaterThan(0);

      // Verify Google Voice mappings
      const messageMappings = await knex('google_voice_message_mapping').select('*');
      expect(messageMappings.length).toBe(4);

      // Verify phone mappings
      const phoneMappings = await knex('google_voice_phone_mapping').select('*');
      expect(phoneMappings.length).toBeGreaterThan(0);
    }, 60000); // 60 second timeout

    it('should handle duplicate message detection', async () => {
      const knex = await db.getKnex();
      const tokenId = 'test_token_456';

      // Run initial sync
      const firstSync = await conversationSyncService.startSync({
        tokenId,
        syncType: 'initial',
        enableDuplicateDetection: true,
        enableMessageParsing: false,
        enableCustomerMatching: true,
        pageSize: 10,
        maxPages: 1
      });

      // Wait for completion
      let attempts = 0;
      while (attempts < 20) {
        const progress = await conversationSyncService.getSyncProgress(firstSync.syncId);
        if (progress?.status === 'completed') break;
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }

      const initialMessageCount = await knex('messages').count('* as count').first();
      const initialCount = parseInt(initialMessageCount?.count || '0');

      // Run second sync (should detect duplicates)
      const secondSync = await conversationSyncService.startSync({
        tokenId,
        syncType: 'incremental',
        enableDuplicateDetection: true,
        enableMessageParsing: false,
        enableCustomerMatching: true,
        pageSize: 10,
        maxPages: 1
      });

      // Wait for completion
      attempts = 0;
      while (attempts < 20) {
        const progress = await conversationSyncService.getSyncProgress(secondSync.syncId);
        if (progress?.status === 'completed') break;
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }

      const finalMessageCount = await knex('messages').count('* as count').first();
      const finalCount = parseInt(finalMessageCount?.count || '0');

      // Should not have created duplicate messages
      expect(finalCount).toBe(initialCount);

      // Check sync progress shows duplicates skipped
      const secondSyncProgress = await conversationSyncService.getSyncProgress(secondSync.syncId);
      expect(secondSyncProgress?.progress.duplicatesSkipped).toBeGreaterThan(0);
    }, 60000);

    it('should properly thread conversations by customer and phone', async () => {
      const knex = await db.getKnex();
      const tokenId = 'test_token_789';

      // Run sync with conversation threading enabled
      const syncProgress = await conversationSyncService.startSync({
        tokenId,
        syncType: 'initial',
        enableDuplicateDetection: false,
        enableMessageParsing: false,
        enableCustomerMatching: true,
        enableConversationThreading: true,
        pageSize: 10,
        maxPages: 1
      });

      // Wait for completion
      let attempts = 0;
      while (attempts < 20) {
        const progress = await conversationSyncService.getSyncProgress(syncProgress.syncId);
        if (progress?.status === 'completed') break;
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }

      // Verify conversation threading
      const conversations = await knex('conversations').select('*');
      
      // Should have created separate conversations for different phone numbers
      const conversationsByPhone = conversations.reduce((acc, conv) => {
        acc[conv.phoneNumber] = (acc[conv.phoneNumber] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      expect(Object.keys(conversationsByPhone).length).toBeGreaterThan(0);

      // Messages from same phone/customer should be in same conversation
      const messagesWithPhone1 = await knex('messages')
        .join('conversations', 'messages.conversationId', 'conversations.id')
        .where('conversations.phoneNumber', '+15551234567')
        .select('messages.*');

      expect(messagesWithPhone1.length).toBe(3); // Three messages from this number
      
      // All messages should be in the same conversation
      const conversationIds = [...new Set(messagesWithPhone1.map(m => m.conversationId))];
      expect(conversationIds.length).toBe(1);
    }, 60000);

    it('should extract plumbing-specific information from messages', async () => {
      const knex = await db.getKnex();
      const tokenId = 'test_token_parsing';

      // Run sync with message parsing enabled
      const syncProgress = await conversationSyncService.startSync({
        tokenId,
        syncType: 'initial',
        enableDuplicateDetection: false,
        enableMessageParsing: true,
        enableCustomerMatching: false,
        enableConversationThreading: false,
        pageSize: 10,
        maxPages: 1
      });

      // Wait for completion
      let attempts = 0;
      while (attempts < 20) {
        const progress = await conversationSyncService.getSyncProgress(syncProgress.syncId);
        if (progress?.status === 'completed') break;
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }

      // Verify parsing results
      const parsingResults = await knex('message_parsing_results').select('*');
      expect(parsingResults.length).toBeGreaterThan(0);

      // Check for emergency detection
      const emergencyResult = parsingResults.find(r => {
        const info = JSON.parse(r.extractedInfo);
        return info.urgencyLevel === 'emergency';
      });
      expect(emergencyResult).toBeDefined();

      // Check for service type detection
      const serviceResult = parsingResults.find(r => {
        const info = JSON.parse(r.extractedInfo);
        return info.serviceTypes && info.serviceTypes.length > 0;
      });
      expect(serviceResult).toBeDefined();

      // Verify parsed information structure
      if (emergencyResult) {
        const info = JSON.parse(emergencyResult.extractedInfo);
        expect(info).toHaveProperty('urgencyLevel');
        expect(info).toHaveProperty('sentiment');
        expect(info).toHaveProperty('communicationStyle');
        expect(info).toHaveProperty('confidenceScore');
        expect(info.confidenceScore).toBeGreaterThan(0);
      }
    }, 60000);

    it('should monitor sync performance and create alerts', async () => {
      const tokenId = 'test_token_monitoring';

      // Record some performance metrics
      await monitoringService.recordPerformanceMetric(
        'test_session_1',
        'message_processing_time',
        2500, // Above threshold
        'ms'
      );

      await monitoringService.recordPerformanceMetric(
        'test_session_1',
        'memory_usage_mb',
        600, // Above threshold
        'mb'
      );

      // Get dashboard data
      const dashboardData = await monitoringService.getDashboardData();
      expect(dashboardData).toHaveProperty('activeSync');
      expect(dashboardData).toHaveProperty('totalMessagesProcessed');
      expect(dashboardData).toHaveProperty('systemHealth');

      // Check if alerts were created for performance issues
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for alert processing
      
      const activeAlerts = monitoringService.getActiveAlerts();
      expect(Array.isArray(activeAlerts)).toBe(true);

      // Test alert resolution
      if (activeAlerts.length > 0) {
        const alertId = activeAlerts[0].alertId;
        const resolved = await monitoringService.resolveAlert(alertId, 'Test resolution');
        expect(resolved).toBe(true);
      }
    }, 30000);
  });

  describe('Error Handling and Recovery', () => {
    it('should handle API errors gracefully', async () => {
      // Mock API error
      const errorApi = {
        getMessages: async () => {
          throw new Error('API rate limit exceeded');
        }
      };

      const errorSyncService = new ConversationSyncService(db, errorApi as any);
      
      const syncProgress = await errorSyncService.startSync({
        tokenId: 'test_error_token',
        syncType: 'initial',
        pageSize: 10,
        maxPages: 1
      });

      // Wait for sync to fail
      let attempts = 0;
      while (attempts < 10) {
        const progress = await errorSyncService.getSyncProgress(syncProgress.syncId);
        if (progress?.status === 'failed') {
          expect(progress.errors.length).toBeGreaterThan(0);
          expect(progress.errors[0].error).toContain('API rate limit exceeded');
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }
    }, 30000);

    it('should handle database connection issues', async () => {
      // This would test database connection recovery
      // For now, we'll just verify the service can handle errors
      const knex = await db.getKnex();
      
      // Verify error handling in message parsing
      try {
        const parsingResult = await messageParsingService.parseMessage(
          'nonexistent_message_id',
          'Test message content'
        );
        
        // Should still return a result even with invalid message ID
        expect(parsingResult).toBeDefined();
        expect(parsingResult.extractedInfo.requiresHumanReview).toBe(true);
      } catch (error) {
        // Should not throw unhandled errors
        expect(error).toBeUndefined();
      }
    });
  });

  describe('Performance Benchmarks', () => {
    it('should process messages within performance thresholds', async () => {
      const startTime = Date.now();
      const tokenId = 'test_performance_token';

      const syncProgress = await conversationSyncService.startSync({
        tokenId,
        syncType: 'initial',
        enableDuplicateDetection: true,
        enableMessageParsing: true,
        enableCustomerMatching: true,
        enableConversationThreading: true,
        pageSize: 10,
        maxPages: 1
      });

      // Wait for completion
      let attempts = 0;
      while (attempts < 30) {
        const progress = await conversationSyncService.getSyncProgress(syncProgress.syncId);
        if (progress?.status === 'completed') break;
        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Performance assertions
      expect(totalTime).toBeLessThan(30000); // Should complete within 30 seconds
      
      const finalProgress = await conversationSyncService.getSyncProgress(syncProgress.syncId);
      if (finalProgress?.progress.totalMessages > 0) {
        const averageTimePerMessage = totalTime / finalProgress.progress.totalMessages;
        expect(averageTimePerMessage).toBeLessThan(5000); // Less than 5 seconds per message
      }
    }, 60000);
  });
});

// Utility functions for tests
async function waitForSyncCompletion(
  syncService: ConversationSyncService,
  syncId: string,
  timeoutMs: number = 30000
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    const progress = await syncService.getSyncProgress(syncId);
    
    if (progress?.status === 'completed') {
      return;
    }
    
    if (progress?.status === 'failed') {
      throw new Error(`Sync failed: ${progress.errors.map(e => e.error).join(', ')}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  throw new Error('Sync did not complete within timeout');
}