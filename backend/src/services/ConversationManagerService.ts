import { DatabaseService } from './DatabaseService';
import { logger } from '../utils/logger';
import { ConversationModel, MessageModel, ConversationSyncMetadataModel } from '../models/ConversationModels';
import { Conversation, Message, Customer } from '../../shared/types';

export interface ConversationThreadOptions {
  customerId: string;
  phoneNumber: string;
  platform: 'google_voice' | 'sms' | 'email' | 'web_chat';
  threadId?: string;
  messageContent?: string;
  priority?: 'low' | 'medium' | 'high' | 'emergency';
  metadata?: Record<string, any>;
}

export interface ConversationThreadResult {
  conversation: Conversation;
  isNew: boolean;
  mergedConversations?: string[];
  splitFromConversation?: string;
  reasoning: string;
  confidence: number;
}

export interface ConversationContext {
  conversation: Conversation;
  customer?: Customer;
  recentMessages: Message[];
  relatedJobs: any[];
  relatedQuotes: any[];
  conversationSummary: string;
  keyTopics: string[];
  averageResponseTime: number;
  lastActivity: Date;
  emergencyHistory: boolean;
}

export interface ThreadingDecision {
  decision: 'new_thread' | 'existing_thread' | 'merge_threads' | 'split_thread';
  targetConversationId?: string;
  conversationsToMerge?: string[];
  splitPoint?: {
    messageId: string;
    reason: string;
  };
  confidence: number;
  reasoning: string;
  factors: Array<{
    factor: string;
    weight: number;
    influence: 'positive' | 'negative' | 'neutral';
  }>;
}

export interface ConversationAnalysis {
  conversationId: string;
  messageCount: number;
  duration: {
    firstMessage: Date;
    lastMessage: Date;
    totalMinutes: number;
  };
  participants: Array<{
    role: 'customer' | 'business';
    messageCount: number;
    averageResponseTime: number;
  }>;
  topics: Array<{
    topic: string;
    relevance: number;
    firstMention: Date;
    lastMention: Date;
  }>;
  sentiment: {
    overall: 'positive' | 'neutral' | 'negative' | 'frustrated' | 'urgent';
    trajectory: 'improving' | 'stable' | 'declining';
    keyMoments: Array<{
      messageId: string;
      sentiment: string;
      impact: number;
    }>;
  };
  urgency: {
    currentLevel: 'low' | 'medium' | 'high' | 'emergency';
    escalations: number;
    emergencyKeywords: string[];
    timeToFirstResponse: number;
  };
  resolution: {
    status: 'resolved' | 'in_progress' | 'stalled' | 'escalated';
    confidence: number;
    predictedResolutionTime?: number;
    requiredActions: string[];
  };
}

export class ConversationManagerService {
  private conversationModel: ConversationModel;
  private messageModel: MessageModel;
  private syncMetadataModel: ConversationSyncMetadataModel;

  // Threading configuration
  private readonly CONVERSATION_TIMEOUT_HOURS = 24;
  private readonly MAX_MERGE_TIMESPAN_HOURS = 48;
  private readonly MIN_SPLIT_MESSAGE_GAP_HOURS = 12;
  private readonly THREADING_CONFIDENCE_THRESHOLD = 0.7;

  constructor(private db: DatabaseService) {
    this.conversationModel = new ConversationModel(db);
    this.messageModel = new MessageModel(db);
    this.syncMetadataModel = new ConversationSyncMetadataModel(db);
  }

  /**
   * Find or create conversation thread with intelligent threading
   */
  async findOrCreateConversationThread(options: ConversationThreadOptions): Promise<ConversationThreadResult> {
    try {
      logger.debug('Finding or creating conversation thread', {
        customerId: options.customerId,
        phoneNumber: options.phoneNumber,
        platform: options.platform
      });

      // Step 1: Analyze existing conversations for this customer/phone
      const existingConversations = await this.conversationModel.findByCustomerAndPhone(
        options.customerId,
        options.phoneNumber,
        options.platform
      );

      if (existingConversations.length === 0) {
        // No existing conversations - create new thread
        const newConversation = await this.createNewConversationThread(options);
        return {
          conversation: newConversation,
          isNew: true,
          reasoning: 'No existing conversations found for customer and phone number',
          confidence: 1.0
        };
      }

      // Step 2: Make threading decision
      const threadingDecision = await this.makeThreadingDecision(existingConversations, options);

      // Step 3: Execute threading decision
      return await this.executeThreadingDecision(threadingDecision, existingConversations, options);

    } catch (error) {
      logger.error('Failed to find or create conversation thread', {
        customerId: options.customerId,
        phoneNumber: options.phoneNumber,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Analyze conversation for comprehensive context
   */
  async analyzeConversation(conversationId: string): Promise<ConversationAnalysis> {
    try {
      const conversation = await this.conversationModel.findById(conversationId);
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      const messages = await this.messageModel.findByConversation(conversationId, 1000);

      const analysis: ConversationAnalysis = {
        conversationId,
        messageCount: messages.length,
        duration: this.calculateConversationDuration(messages),
        participants: this.analyzeParticipants(messages),
        topics: await this.extractTopics(messages),
        sentiment: this.analyzeSentimentTrajectory(messages),
        urgency: this.analyzeUrgency(messages, conversation),
        resolution: await this.analyzeResolutionStatus(conversation, messages)
      };

      logger.info('Conversation analysis completed', {
        conversationId,
        messageCount: analysis.messageCount,
        overallSentiment: analysis.sentiment.overall,
        urgencyLevel: analysis.urgency.currentLevel,
        resolutionStatus: analysis.resolution.status
      });

      return analysis;

    } catch (error) {
      logger.error('Failed to analyze conversation', {
        conversationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get comprehensive conversation context
   */
  async getConversationContext(conversationId: string, includeHistory: boolean = true): Promise<ConversationContext> {
    try {
      const conversation = await this.conversationModel.findById(conversationId);
      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Get recent messages
      const recentMessages = await this.messageModel.findByConversation(conversationId, 50);

      // Get customer information
      let customer: Customer | undefined;
      if (conversation.customerId) {
        const knex = await this.db.getKnex();
        customer = await knex('customers').where('id', conversation.customerId).first();
      }

      // Get related jobs and quotes
      const { relatedJobs, relatedQuotes } = await this.getRelatedJobsAndQuotes(conversationId);

      // Generate conversation summary
      const conversationSummary = await this.generateConversationSummary(recentMessages);

      // Extract key topics
      const keyTopics = this.extractKeyTopics(recentMessages);

      // Calculate metrics
      const averageResponseTime = this.calculateAverageResponseTime(recentMessages);
      const lastActivity = recentMessages.length > 0 ? recentMessages[0].sentAt : conversation.createdAt;
      const emergencyHistory = this.hasEmergencyHistory(recentMessages);

      const context: ConversationContext = {
        conversation,
        customer,
        recentMessages,
        relatedJobs,
        relatedQuotes,
        conversationSummary,
        keyTopics,
        averageResponseTime,
        lastActivity,
        emergencyHistory
      };

      logger.debug('Generated conversation context', {
        conversationId,
        messageCount: recentMessages.length,
        topicsCount: keyTopics.length,
        hasCustomer: !!customer,
        emergencyHistory
      });

      return context;

    } catch (error) {
      logger.error('Failed to get conversation context', {
        conversationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Merge multiple conversations into a single thread
   */
  async mergeConversations(
    targetConversationId: string,
    sourceConversationIds: string[],
    reason: string
  ): Promise<{
    success: boolean;
    mergedMessageCount: number;
    errors: string[];
  }> {
    const knex = await this.db.getKnex();
    const errors: string[] = [];
    let mergedMessageCount = 0;

    try {
      await knex.transaction(async (trx) => {
        // Move all messages from source conversations to target
        for (const sourceId of sourceConversationIds) {
          try {
            const result = await trx('messages')
              .where('conversationId', sourceId)
              .update({ conversationId: targetConversationId });
            
            mergedMessageCount += result;

            // Move AI responses
            await trx('ai_responses')
              .where('conversationId', sourceId)
              .update({ conversationId: targetConversationId });

            // Update sync metadata
            await trx('conversation_sync_metadata')
              .where('conversationId', sourceId)
              .update({ conversationId: targetConversationId });

            // Archive source conversation
            await trx('conversations')
              .where('id', sourceId)
              .update({
                status: 'archived',
                summary: `Merged into conversation ${targetConversationId}: ${reason}`,
                updatedAt: new Date()
              });

          } catch (error) {
            errors.push(`Failed to merge conversation ${sourceId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }

        // Update target conversation timestamps
        const latestMessage = await trx('messages')
          .where('conversationId', targetConversationId)
          .orderBy('sentAt', 'desc')
          .first();

        if (latestMessage) {
          await trx('conversations')
            .where('id', targetConversationId)
            .update({
              lastMessageAt: latestMessage.sentAt,
              updatedAt: new Date()
            });
        }
      });

      logger.info('Conversations merged successfully', {
        targetConversationId,
        sourceConversationIds,
        mergedMessageCount,
        reason
      });

      return {
        success: errors.length === 0,
        mergedMessageCount,
        errors
      };

    } catch (error) {
      logger.error('Failed to merge conversations', {
        targetConversationId,
        sourceConversationIds,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        mergedMessageCount: 0,
        errors: [`Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  /**
   * Split a conversation at a specific point
   */
  async splitConversation(
    conversationId: string,
    splitPointMessageId: string,
    reason: string
  ): Promise<{
    success: boolean;
    newConversationId?: string;
    movedMessageCount: number;
    errors: string[];
  }> {
    const knex = await this.db.getKnex();
    const errors: string[] = [];
    let movedMessageCount = 0;

    try {
      const originalConversation = await this.conversationModel.findById(conversationId);
      if (!originalConversation) {
        throw new Error('Original conversation not found');
      }

      const splitMessage = await this.messageModel.findById(splitPointMessageId);
      if (!splitMessage || splitMessage.conversationId !== conversationId) {
        throw new Error('Split point message not found in conversation');
      }

      let newConversationId: string;

      await knex.transaction(async (trx) => {
        // Create new conversation
        const newConversation = await this.conversationModel.create({
          customerId: originalConversation.customerId,
          phoneNumber: originalConversation.phoneNumber,
          platform: originalConversation.platform,
          status: 'active',
          priority: originalConversation.priority,
          lastMessageAt: splitMessage.sentAt,
          channel: originalConversation.channel,
          isEmergency: originalConversation.isEmergency,
          originalPhoneNumber: originalConversation.originalPhoneNumber,
          followUpRequired: false,
          summary: `Split from conversation ${conversationId}: ${reason}`
        });

        newConversationId = newConversation.id;

        // Move messages from split point onwards to new conversation
        const messagesToMove = await trx('messages')
          .where('conversationId', conversationId)
          .where('sentAt', '>=', splitMessage.sentAt)
          .orderBy('sentAt', 'asc');

        for (const message of messagesToMove) {
          await trx('messages')
            .where('id', message.id)
            .update({ conversationId: newConversationId });
          
          movedMessageCount++;
        }

        // Move related AI responses
        for (const message of messagesToMove) {
          await trx('ai_responses')
            .where('messageId', message.id)
            .update({ conversationId: newConversationId });
        }

        // Update original conversation's last message time
        const remainingMessages = await trx('messages')
          .where('conversationId', conversationId)
          .orderBy('sentAt', 'desc')
          .first();

        if (remainingMessages) {
          await trx('conversations')
            .where('id', conversationId)
            .update({
              lastMessageAt: remainingMessages.sentAt,
              updatedAt: new Date()
            });
        }

        // Create sync metadata for the split
        await this.syncMetadataModel.create({
          conversationId: newConversationId,
          syncType: 'manual',
          syncSessionId: `split_${Date.now()}`,
          messagesImported: movedMessageCount,
          duplicatesSkipped: 0,
          errorCount: 0,
          syncSource: 'google_voice',
          syncConfig: {
            splitFrom: conversationId,
            splitReason: reason,
            splitAt: splitMessage.sentAt
          }
        });
      });

      logger.info('Conversation split successfully', {
        originalConversationId: conversationId,
        newConversationId,
        movedMessageCount,
        reason
      });

      return {
        success: true,
        newConversationId,
        movedMessageCount,
        errors
      };

    } catch (error) {
      logger.error('Failed to split conversation', {
        conversationId,
        splitPointMessageId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        movedMessageCount: 0,
        errors: [`Split failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  // Private helper methods

  /**
   * Make intelligent threading decision
   */
  private async makeThreadingDecision(
    existingConversations: Conversation[],
    options: ConversationThreadOptions
  ): Promise<ThreadingDecision> {
    const factors: Array<{
      factor: string;
      weight: number;
      influence: 'positive' | 'negative' | 'neutral';
    }> = [];

    // Factor 1: Time since last activity
    const activeConversations = existingConversations.filter(c => c.status === 'active');
    const recentConversations = existingConversations.filter(c => {
      const hoursSinceLastMessage = (Date.now() - new Date(c.lastMessageAt).getTime()) / (1000 * 60 * 60);
      return hoursSinceLastMessage < this.CONVERSATION_TIMEOUT_HOURS;
    });

    if (recentConversations.length > 0) {
      factors.push({
        factor: 'recent_activity',
        weight: 0.4,
        influence: 'positive'
      });
    }

    // Factor 2: Message content similarity
    if (options.messageContent) {
      const contentSimilarity = await this.analyzeContentSimilarity(
        existingConversations,
        options.messageContent
      );
      
      if (contentSimilarity.maxSimilarity > 0.7) {
        factors.push({
          factor: 'content_similarity',
          weight: 0.3,
          influence: 'positive'
        });
      }
    }

    // Factor 3: Platform consistency
    const samePlatformConversations = existingConversations.filter(c => c.platform === options.platform);
    if (samePlatformConversations.length > 0) {
      factors.push({
        factor: 'platform_consistency',
        weight: 0.1,
        influence: 'positive'
      });
    }

    // Factor 4: Emergency vs non-emergency context
    const isEmergency = options.priority === 'emergency' || 
      (options.messageContent && this.containsEmergencyKeywords(options.messageContent));

    if (isEmergency) {
      factors.push({
        factor: 'emergency_context',
        weight: 0.5,
        influence: 'negative' // Create separate thread for emergencies
      });
    }

    // Factor 5: Multiple active conversations (suggests need for merging)
    if (activeConversations.length > 1) {
      factors.push({
        factor: 'multiple_active',
        weight: 0.3,
        influence: 'positive' // Favor merging
      });
    }

    // Calculate confidence and make decision
    const positiveWeight = factors
      .filter(f => f.influence === 'positive')
      .reduce((sum, f) => sum + f.weight, 0);
    
    const negativeWeight = factors
      .filter(f => f.influence === 'negative')
      .reduce((sum, f) => sum + f.weight, 0);

    const confidence = Math.abs(positiveWeight - negativeWeight);

    let decision: ThreadingDecision['decision'];
    let targetConversationId: string | undefined;
    let conversationsToMerge: string[] | undefined;
    let reasoning: string;

    if (confidence > this.THREADING_CONFIDENCE_THRESHOLD) {
      if (positiveWeight > negativeWeight) {
        if (recentConversations.length === 1) {
          decision = 'existing_thread';
          targetConversationId = recentConversations[0].id;
          reasoning = 'Continue existing recent conversation';
        } else if (activeConversations.length > 1) {
          decision = 'merge_threads';
          conversationsToMerge = activeConversations.map(c => c.id).slice(1);
          targetConversationId = activeConversations[0].id;
          reasoning = 'Merge multiple active conversations';
        } else {
          decision = 'existing_thread';
          targetConversationId = existingConversations[0].id;
          reasoning = 'Use most recent conversation';
        }
      } else {
        decision = 'new_thread';
        reasoning = 'Create new thread due to context change';
      }
    } else {
      // Low confidence - default to new thread
      decision = 'new_thread';
      reasoning = 'Low confidence in threading decision - create new thread';
    }

    return {
      decision,
      targetConversationId,
      conversationsToMerge,
      confidence,
      reasoning,
      factors
    };
  }

  /**
   * Execute threading decision
   */
  private async executeThreadingDecision(
    decision: ThreadingDecision,
    existingConversations: Conversation[],
    options: ConversationThreadOptions
  ): Promise<ConversationThreadResult> {
    switch (decision.decision) {
      case 'new_thread': {
        const newConversation = await this.createNewConversationThread(options);
        return {
          conversation: newConversation,
          isNew: true,
          reasoning: decision.reasoning,
          confidence: decision.confidence
        };
      }

      case 'existing_thread': {
        if (!decision.targetConversationId) {
          throw new Error('Target conversation ID required for existing thread decision');
        }

        const conversation = await this.conversationModel.findById(decision.targetConversationId);
        if (!conversation) {
          throw new Error('Target conversation not found');
        }

        // Update conversation activity
        await this.conversationModel.update(decision.targetConversationId, {
          status: 'active',
          lastMessageAt: new Date()
        });

        return {
          conversation,
          isNew: false,
          reasoning: decision.reasoning,
          confidence: decision.confidence
        };
      }

      case 'merge_threads': {
        if (!decision.targetConversationId || !decision.conversationsToMerge) {
          throw new Error('Target conversation ID and conversations to merge required');
        }

        const mergeResult = await this.mergeConversations(
          decision.targetConversationId,
          decision.conversationsToMerge,
          decision.reasoning
        );

        if (!mergeResult.success) {
          throw new Error(`Merge failed: ${mergeResult.errors.join(', ')}`);
        }

        const conversation = await this.conversationModel.findById(decision.targetConversationId);
        if (!conversation) {
          throw new Error('Target conversation not found after merge');
        }

        return {
          conversation,
          isNew: false,
          mergedConversations: decision.conversationsToMerge,
          reasoning: decision.reasoning,
          confidence: decision.confidence
        };
      }

      default:
        throw new Error(`Unsupported threading decision: ${decision.decision}`);
    }
  }

  /**
   * Create new conversation thread
   */
  private async createNewConversationThread(options: ConversationThreadOptions): Promise<Conversation> {
    const priority = options.priority || this.determinePriorityFromMessage(options.messageContent);
    const isEmergency = priority === 'emergency';

    return await this.conversationModel.create({
      customerId: options.customerId,
      phoneNumber: options.phoneNumber,
      platform: options.platform,
      status: 'active',
      priority,
      lastMessageAt: new Date(),
      googleThreadId: options.threadId,
      channel: options.platform === 'google_voice' ? 'sms' : options.platform,
      isEmergency,
      originalPhoneNumber: options.phoneNumber,
      followUpRequired: false
    });
  }

  /**
   * Analyze content similarity between message and existing conversations
   */
  private async analyzeContentSimilarity(
    conversations: Conversation[],
    messageContent: string
  ): Promise<{ maxSimilarity: number; mostSimilarConversationId?: string }> {
    // This would implement more sophisticated similarity analysis
    // For now, return basic keyword matching
    const keywords = this.extractKeywords(messageContent.toLowerCase());
    let maxSimilarity = 0;
    let mostSimilarConversationId: string | undefined;

    for (const conversation of conversations) {
      const recentMessages = await this.messageModel.findByConversation(conversation.id, 10);
      const conversationKeywords = recentMessages
        .map(m => this.extractKeywords(m.content.toLowerCase()))
        .flat();

      const similarity = this.calculateKeywordSimilarity(keywords, conversationKeywords);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        mostSimilarConversationId = conversation.id;
      }
    }

    return { maxSimilarity, mostSimilarConversationId };
  }

  /**
   * Calculate conversation duration metrics
   */
  private calculateConversationDuration(messages: Message[]): {
    firstMessage: Date;
    lastMessage: Date;
    totalMinutes: number;
  } {
    if (messages.length === 0) {
      const now = new Date();
      return {
        firstMessage: now,
        lastMessage: now,
        totalMinutes: 0
      };
    }

    const sortedMessages = messages.sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
    const firstMessage = new Date(sortedMessages[0].sentAt);
    const lastMessage = new Date(sortedMessages[sortedMessages.length - 1].sentAt);
    const totalMinutes = (lastMessage.getTime() - firstMessage.getTime()) / (1000 * 60);

    return {
      firstMessage,
      lastMessage,
      totalMinutes
    };
  }

  /**
   * Analyze conversation participants
   */
  private analyzeParticipants(messages: Message[]): Array<{
    role: 'customer' | 'business';
    messageCount: number;
    averageResponseTime: number;
  }> {
    const customerMessages = messages.filter(m => m.direction === 'inbound');
    const businessMessages = messages.filter(m => m.direction === 'outbound');

    return [
      {
        role: 'customer',
        messageCount: customerMessages.length,
        averageResponseTime: this.calculateAverageResponseTime(customerMessages)
      },
      {
        role: 'business',
        messageCount: businessMessages.length,
        averageResponseTime: this.calculateAverageResponseTime(businessMessages)
      }
    ];
  }

  /**
   * Extract conversation topics
   */
  private async extractTopics(messages: Message[]): Promise<Array<{
    topic: string;
    relevance: number;
    firstMention: Date;
    lastMention: Date;
  }>> {
    const topicKeywords = [
      'drain', 'toilet', 'faucet', 'pipe', 'water heater', 'leak', 'clog',
      'emergency', 'repair', 'install', 'maintenance', 'quote', 'estimate'
    ];

    const topics: Array<{
      topic: string;
      relevance: number;
      firstMention: Date;
      lastMention: Date;
    }> = [];

    for (const keyword of topicKeywords) {
      const relatedMessages = messages.filter(m => 
        m.content.toLowerCase().includes(keyword)
      );

      if (relatedMessages.length > 0) {
        const sortedMessages = relatedMessages.sort((a, b) => 
          new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime()
        );

        topics.push({
          topic: keyword,
          relevance: relatedMessages.length / messages.length,
          firstMention: new Date(sortedMessages[0].sentAt),
          lastMention: new Date(sortedMessages[sortedMessages.length - 1].sentAt)
        });
      }
    }

    return topics.sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * Analyze sentiment trajectory
   */
  private analyzeSentimentTrajectory(messages: Message[]): {
    overall: 'positive' | 'neutral' | 'negative' | 'frustrated' | 'urgent';
    trajectory: 'improving' | 'stable' | 'declining';
    keyMoments: Array<{
      messageId: string;
      sentiment: string;
      impact: number;
    }>;
  } {
    // Simplified sentiment analysis - would integrate with actual sentiment analysis
    const sentiments = messages.map(m => this.analyzeSingleMessageSentiment(m));
    
    const overallSentiment = this.calculateOverallSentiment(sentiments);
    const trajectory = this.calculateSentimentTrajectory(sentiments);
    const keyMoments = this.identifyKeyMoments(messages, sentiments);

    return {
      overall: overallSentiment,
      trajectory,
      keyMoments
    };
  }

  /**
   * Analyze urgency indicators
   */
  private analyzeUrgency(messages: Message[], conversation: Conversation): {
    currentLevel: 'low' | 'medium' | 'high' | 'emergency';
    escalations: number;
    emergencyKeywords: string[];
    timeToFirstResponse: number;
  } {
    const emergencyKeywords = this.extractEmergencyKeywords(messages);
    const escalations = this.countUrgencyEscalations(messages);
    const timeToFirstResponse = this.calculateTimeToFirstResponse(messages);

    let currentLevel: 'low' | 'medium' | 'high' | 'emergency' = conversation.priority;

    // Override with message-based urgency if higher
    if (emergencyKeywords.length > 0) {
      currentLevel = 'emergency';
    } else if (escalations > 2) {
      currentLevel = 'high';
    }

    return {
      currentLevel,
      escalations,
      emergencyKeywords,
      timeToFirstResponse
    };
  }

  /**
   * Analyze resolution status
   */
  private async analyzeResolutionStatus(conversation: Conversation, messages: Message[]): Promise<{
    status: 'resolved' | 'in_progress' | 'stalled' | 'escalated';
    confidence: number;
    predictedResolutionTime?: number;
    requiredActions: string[];
  }> {
    const status = conversation.status === 'resolved' ? 'resolved' : 'in_progress';
    const recentMessages = messages.slice(0, 5);
    const requiredActions: string[] = [];

    // Check for stalled conversation
    const hoursSinceLastMessage = (Date.now() - new Date(conversation.lastMessageAt).getTime()) / (1000 * 60 * 60);
    let actualStatus = status;
    
    if (status === 'in_progress' && hoursSinceLastMessage > 48) {
      actualStatus = 'stalled';
      requiredActions.push('Follow up with customer');
    }

    // Check for escalation indicators
    const escalationKeywords = ['manager', 'supervisor', 'complaint', 'unacceptable'];
    const hasEscalationKeywords = recentMessages.some(m => 
      escalationKeywords.some(keyword => m.content.toLowerCase().includes(keyword))
    );

    if (hasEscalationKeywords) {
      actualStatus = 'escalated';
      requiredActions.push('Escalate to manager');
    }

    return {
      status: actualStatus,
      confidence: 0.8,
      requiredActions
    };
  }

  // Utility methods for conversation analysis

  private determinePriorityFromMessage(content?: string): 'low' | 'medium' | 'high' | 'emergency' {
    if (!content) return 'medium';

    const lowerContent = content.toLowerCase();
    const emergencyKeywords = ['emergency', 'urgent', 'flooding', 'burst pipe', 'no water'];
    const highPriorityKeywords = ['asap', 'today', 'broken', 'not working'];

    if (emergencyKeywords.some(keyword => lowerContent.includes(keyword))) {
      return 'emergency';
    }
    if (highPriorityKeywords.some(keyword => lowerContent.includes(keyword))) {
      return 'high';
    }
    return 'medium';
  }

  private containsEmergencyKeywords(content: string): boolean {
    const emergencyKeywords = ['emergency', 'urgent', 'flooding', 'burst pipe', 'gas leak'];
    return emergencyKeywords.some(keyword => content.toLowerCase().includes(keyword));
  }

  private extractKeywords(content: string): string[] {
    // Simple keyword extraction - would use more sophisticated NLP
    return content
      .split(/\s+/)
      .filter(word => word.length > 3)
      .map(word => word.toLowerCase())
      .filter(word => !['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'who', 'boy', 'did', 'she', 'use', 'way', 'who', 'oil', 'sit', 'set'].includes(word));
  }

  private calculateKeywordSimilarity(keywords1: string[], keywords2: string[]): number {
    if (keywords1.length === 0 && keywords2.length === 0) return 1;
    if (keywords1.length === 0 || keywords2.length === 0) return 0;

    const intersection = keywords1.filter(k => keywords2.includes(k));
    const union = [...new Set([...keywords1, ...keywords2])];
    
    return intersection.length / union.length;
  }

  private async getRelatedJobsAndQuotes(conversationId: string): Promise<{
    relatedJobs: any[];
    relatedQuotes: any[];
  }> {
    try {
      const knex = await this.db.getKnex();
      
      const relatedJobs = await knex('jobs')
        .where('conversationId', conversationId)
        .orderBy('createdAt', 'desc');

      const relatedQuotes = await knex('quotes')
        .join('jobs', 'quotes.jobId', 'jobs.id')
        .where('jobs.conversationId', conversationId)
        .select('quotes.*')
        .orderBy('quotes.createdAt', 'desc');

      return { relatedJobs, relatedQuotes };
    } catch (error) {
      logger.error('Failed to get related jobs and quotes', { conversationId, error });
      return { relatedJobs: [], relatedQuotes: [] };
    }
  }

  private async generateConversationSummary(messages: Message[]): Promise<string> {
    if (messages.length === 0) return 'No messages in conversation';

    // Simple summary generation - would integrate with AI summarization
    const recentMessages = messages.slice(0, 5);
    const topics = this.extractKeyTopics(messages);
    const mainTopic = topics[0] || 'general inquiry';

    return `Conversation about ${mainTopic} with ${messages.length} messages. Last activity: ${recentMessages[0]?.sentAt || 'unknown'}.`;
  }

  private extractKeyTopics(messages: Message[]): string[] {
    const allContent = messages.map(m => m.content).join(' ').toLowerCase();
    const serviceTypes = ['drain', 'toilet', 'faucet', 'pipe', 'water heater', 'leak', 'repair'];
    
    return serviceTypes.filter(service => allContent.includes(service));
  }

  private calculateAverageResponseTime(messages: Message[]): number {
    if (messages.length < 2) return 0;

    const sortedMessages = messages.sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
    let totalResponseTime = 0;
    let responseCount = 0;

    for (let i = 1; i < sortedMessages.length; i++) {
      const currentMessage = sortedMessages[i];
      const previousMessage = sortedMessages[i - 1];
      
      if (currentMessage.direction !== previousMessage.direction) {
        const responseTime = new Date(currentMessage.sentAt).getTime() - new Date(previousMessage.sentAt).getTime();
        totalResponseTime += responseTime / (1000 * 60); // Convert to minutes
        responseCount++;
      }
    }

    return responseCount > 0 ? totalResponseTime / responseCount : 0;
  }

  private hasEmergencyHistory(messages: Message[]): boolean {
    return messages.some(m => m.containsEmergencyKeywords);
  }

  private analyzeSingleMessageSentiment(message: Message): 'positive' | 'neutral' | 'negative' | 'frustrated' | 'urgent' {
    // Simplified sentiment analysis
    const content = message.content.toLowerCase();
    
    if (['frustrated', 'annoyed', 'angry', 'terrible', 'awful'].some(word => content.includes(word))) {
      return 'frustrated';
    }
    if (['urgent', 'emergency', 'asap', 'immediate'].some(word => content.includes(word))) {
      return 'urgent';
    }
    if (['thank', 'great', 'excellent', 'good', 'happy'].some(word => content.includes(word))) {
      return 'positive';
    }
    if (['bad', 'terrible', 'worst', 'hate', 'awful'].some(word => content.includes(word))) {
      return 'negative';
    }
    
    return 'neutral';
  }

  private calculateOverallSentiment(sentiments: string[]): 'positive' | 'neutral' | 'negative' | 'frustrated' | 'urgent' {
    const counts = sentiments.reduce((acc, sentiment) => {
      acc[sentiment] = (acc[sentiment] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const maxCount = Math.max(...Object.values(counts));
    const dominantSentiment = Object.keys(counts).find(key => counts[key] === maxCount);
    
    return dominantSentiment as 'positive' | 'neutral' | 'negative' | 'frustrated' | 'urgent';
  }

  private calculateSentimentTrajectory(sentiments: string[]): 'improving' | 'stable' | 'declining' {
    if (sentiments.length < 3) return 'stable';

    const recent = sentiments.slice(0, Math.ceil(sentiments.length / 3));
    const older = sentiments.slice(-Math.ceil(sentiments.length / 3));

    const recentScore = this.calculateSentimentScore(recent);
    const olderScore = this.calculateSentimentScore(older);

    if (recentScore > olderScore + 0.1) return 'improving';
    if (recentScore < olderScore - 0.1) return 'declining';
    return 'stable';
  }

  private calculateSentimentScore(sentiments: string[]): number {
    const scores = { positive: 1, neutral: 0, negative: -1, frustrated: -2, urgent: 0.5 };
    const total = sentiments.reduce((sum, sentiment) => sum + (scores[sentiment as keyof typeof scores] || 0), 0);
    return sentiments.length > 0 ? total / sentiments.length : 0;
  }

  private identifyKeyMoments(messages: Message[], sentiments: string[]): Array<{
    messageId: string;
    sentiment: string;
    impact: number;
  }> {
    const keyMoments: Array<{
      messageId: string;
      sentiment: string;
      impact: number;
    }> = [];

    for (let i = 0; i < messages.length && i < sentiments.length; i++) {
      const sentiment = sentiments[i];
      if (['frustrated', 'urgent'].includes(sentiment)) {
        keyMoments.push({
          messageId: messages[i].id,
          sentiment,
          impact: sentiment === 'frustrated' ? 0.8 : 0.6
        });
      }
    }

    return keyMoments.sort((a, b) => b.impact - a.impact).slice(0, 5);
  }

  private extractEmergencyKeywords(messages: Message[]): string[] {
    const emergencyKeywords = ['emergency', 'urgent', 'flooding', 'burst pipe', 'gas leak', 'no water'];
    const found: string[] = [];

    for (const message of messages) {
      const content = message.content.toLowerCase();
      for (const keyword of emergencyKeywords) {
        if (content.includes(keyword) && !found.includes(keyword)) {
          found.push(keyword);
        }
      }
    }

    return found;
  }

  private countUrgencyEscalations(messages: Message[]): number {
    let escalations = 0;
    let previousUrgency = 'low';

    for (const message of messages) {
      const currentUrgency = this.assessMessageUrgency(message.content);
      if (this.isUrgencyEscalation(previousUrgency, currentUrgency)) {
        escalations++;
      }
      previousUrgency = currentUrgency;
    }

    return escalations;
  }

  private assessMessageUrgency(content: string): string {
    const lowerContent = content.toLowerCase();
    if (['emergency', 'urgent', 'asap'].some(word => lowerContent.includes(word))) return 'high';
    if (['soon', 'quickly', 'fast'].some(word => lowerContent.includes(word))) return 'medium';
    return 'low';
  }

  private isUrgencyEscalation(previous: string, current: string): boolean {
    const urgencyLevels = { low: 0, medium: 1, high: 2 };
    return (urgencyLevels[current as keyof typeof urgencyLevels] || 0) > 
           (urgencyLevels[previous as keyof typeof urgencyLevels] || 0);
  }

  private calculateTimeToFirstResponse(messages: Message[]): number {
    if (messages.length < 2) return 0;

    const sortedMessages = messages.sort((a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
    const firstInbound = sortedMessages.find(m => m.direction === 'inbound');
    const firstOutbound = sortedMessages.find(m => m.direction === 'outbound' && 
      new Date(m.sentAt).getTime() > new Date(firstInbound?.sentAt || 0).getTime()
    );

    if (!firstInbound || !firstOutbound) return 0;

    return (new Date(firstOutbound.sentAt).getTime() - new Date(firstInbound.sentAt).getTime()) / (1000 * 60);
  }
}

export default ConversationManagerService;