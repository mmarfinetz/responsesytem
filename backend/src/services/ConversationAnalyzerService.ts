import { ClaudeAIService } from './ClaudeAIService';
import { DatabaseService } from './DatabaseService';
import { 
  ConversationAnalysis, 
  PlumbingIntent, 
  EmergencyType, 
  UrgencyLevel, 
  CustomerSentiment,
  ClaudeAPIRequest
} from '../models/AIModels';
import { 
  CONVERSATION_ANALYSIS_SYSTEM_PROMPT,
  generateConversationAnalysisPrompt,
  ConversationAnalysisPromptContext,
  EMERGENCY_KEYWORDS,
  URGENT_KEYWORDS,
  FRUSTRATION_INDICATORS
} from '../ai/prompts/conversationAnalysis';
import { Conversation, Message, Customer } from '../../../shared/types';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface ConversationAnalyzerConfig {
  maxContextMessages: number;
  emergencyDetectionThreshold: number;
  urgencyDetectionThreshold: number;
  sentimentAnalysisThreshold: number;
  autoUpdateConversation: boolean;
  storeAnalysisHistory: boolean;
}

export interface AnalysisContext {
  businessInfo: {
    name: string;
    phone: string;
    serviceArea: string;
    businessHours: string;
    emergencyAvailable: boolean;
  };
  customerHistory?: {
    previousJobs?: string[];
    lastServiceDate?: string;
    customerType?: string;
    preferredServices?: string[];
  };
  currentContext?: {
    timeOfDay: string;
    dayOfWeek: string;
    isBusinessHours: boolean;
    weatherConditions?: string;
  };
}

export class ConversationAnalyzerService {
  private claudeService: ClaudeAIService;
  private databaseService: DatabaseService;
  private config: ConversationAnalyzerConfig;
  private analysisCache: Map<string, ConversationAnalysis>;

  constructor(
    claudeService: ClaudeAIService,
    databaseService: DatabaseService,
    config: ConversationAnalyzerConfig
  ) {
    this.claudeService = claudeService;
    this.databaseService = databaseService;
    this.config = config;
    this.analysisCache = new Map();
    
    logger.info('ConversationAnalyzerService initialized', {
      maxContextMessages: config.maxContextMessages,
      autoUpdateConversation: config.autoUpdateConversation
    });
  }

  /**
   * Analyze a complete conversation for comprehensive insights
   */
  async analyzeConversation(
    conversationId: string,
    context: AnalysisContext,
    options: {
      forceReanalysis?: boolean;
      analysisType?: 'initial' | 'update' | 'summary';
      priority?: 'high' | 'normal' | 'low';
    } = {}
  ): Promise<ConversationAnalysis> {
    const { forceReanalysis = false, analysisType = 'initial', priority = 'normal' } = options;
    
    const startTime = Date.now();
    
    try {
      // Check cache first
      const cacheKey = `${conversationId}_${analysisType}`;
      if (!forceReanalysis && this.analysisCache.has(cacheKey)) {
        const cached = this.analysisCache.get(cacheKey)!;
        logger.debug('Using cached conversation analysis', {
          conversationId,
          analysisType,
          cacheAge: Date.now() - cached.createdAt.getTime()
        });
        return cached;
      }
      
      // Get conversation data
      const conversation = await this.getConversationData(conversationId);
      if (!conversation.messages || conversation.messages.length === 0) {
        throw new Error('No messages found for conversation analysis');
      }
      
      // Get customer information if available
      let customerInfo;
      if (conversation.customerId) {
        customerInfo = await this.getCustomerInfo(conversation.customerId);
      }
      
      // Prepare context for analysis
      const promptContext = this.prepareAnalysisContext(
        conversation,
        customerInfo,
        context
      );
      
      // Generate analysis prompt
      const prompt = generateConversationAnalysisPrompt(promptContext);
      
      // Send to Claude API
      const request: ClaudeAPIRequest = {
        model: 'claude-3-sonnet-20240229',
        max_tokens: 2048,
        temperature: 0.3,
        system: CONVERSATION_ANALYSIS_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      };
      
      const apiResponse = await this.claudeService.sendRequest(request, {
        requestId: `analysis_${conversationId}`,
        useCache: true,
        priority
      });
      
      // Parse response
      const analysisResult = this.parseAnalysisResponse(apiResponse.content[0].text);
      
      // Create analysis object
      const analysis: ConversationAnalysis = {
        id: uuidv4(),
        conversationId,
        analysisType,
        primaryIntent: analysisResult.primaryIntent || 'general_question',
        secondaryIntents: analysisResult.secondaryIntents || [],
        intentConfidence: analysisResult.intentConfidence || 0.5,
        isEmergency: analysisResult.isEmergency || false,
        emergencyType: analysisResult.emergencyType || 'none',
        emergencyConfidence: analysisResult.emergencyConfidence || 0.5,
        urgencyLevel: analysisResult.urgencyLevel || 'unknown',
        urgencyReasons: analysisResult.urgencyReasons || [],
        customerSentiment: analysisResult.customerSentiment || 'unknown',
        sentimentConfidence: analysisResult.sentimentConfidence || 0.5,
        frustrationIndicators: analysisResult.frustrationIndicators || [],
        serviceType: analysisResult.serviceType,
        serviceTypeConfidence: analysisResult.serviceTypeConfidence,
        extractedInfo: analysisResult.extractedInfo || {},
        conversationStage: analysisResult.conversationStage || 'initial_contact',
        nextRecommendedAction: analysisResult.nextRecommendedAction || '',
        suggestedFollowUp: analysisResult.suggestedFollowUp,
        shortSummary: analysisResult.shortSummary || '',
        keyPoints: analysisResult.keyPoints || [],
        actionItems: analysisResult.actionItems || [],
        tokensUsed: apiResponse.usage.input_tokens + apiResponse.usage.output_tokens,
        processingTimeMs: Date.now() - startTime,
        modelVersion: apiResponse.model,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Apply business logic validation
      this.validateAndEnhanceAnalysis(analysis, conversation);
      
      // Cache the analysis
      this.analysisCache.set(cacheKey, analysis);
      
      // Store in database if configured
      if (this.config.storeAnalysisHistory) {
        await this.storeAnalysis(analysis);
      }
      
      // Update conversation if configured
      if (this.config.autoUpdateConversation) {
        await this.updateConversationFromAnalysis(conversationId, analysis);
      }
      
      logger.info('Conversation analysis completed', {
        conversationId,
        analysisType,
        primaryIntent: analysis.primaryIntent,
        isEmergency: analysis.isEmergency,
        urgencyLevel: analysis.urgencyLevel,
        customerSentiment: analysis.customerSentiment,
        processingTime: analysis.processingTimeMs,
        tokensUsed: analysis.tokensUsed
      });
      
      return analysis;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Conversation analysis failed', {
        conversationId,
        analysisType,
        error: (error as Error).message,
        duration
      });
      throw error;
    }
  }

  /**
   * Analyze a single message for quick intent detection
   */
  async analyzeMessage(
    messageId: string,
    conversationId: string,
    context: AnalysisContext,
    options: {
      includeHistory?: boolean;
      priority?: 'high' | 'normal' | 'low';
    } = {}
  ): Promise<Partial<ConversationAnalysis>> {
    const { includeHistory = true, priority = 'normal' } = options;
    
    try {
      // Get message and limited conversation context
      const message = await this.getMessage(messageId);
      if (!message) {
        throw new Error('Message not found');
      }
      
      let conversationContext = [];
      if (includeHistory) {
        const conversation = await this.getConversationData(conversationId, 5); // Limited context
        conversationContext = conversation.messages || [];
      } else {
        conversationContext = [message];
      }
      
      // Quick analysis for emergency detection
      const quickAnalysis = this.performQuickAnalysis(message.content);
      
      // If emergency detected, do full analysis
      if (quickAnalysis.isEmergency) {
        return await this.analyzeConversation(conversationId, context, { 
          analysisType: 'initial',
          priority: 'high'
        });
      }
      
      // Otherwise return quick analysis
      return {
        conversationId,
        primaryIntent: quickAnalysis.intent,
        isEmergency: quickAnalysis.isEmergency,
        urgencyLevel: quickAnalysis.urgencyLevel,
        customerSentiment: quickAnalysis.sentiment,
        shortSummary: message.content.substring(0, 100) + '...',
        keyPoints: [message.content],
        processingTimeMs: 0,
        tokensUsed: 0,
        modelVersion: 'quick_analysis',
        createdAt: new Date(),
        updatedAt: new Date()
      } as Partial<ConversationAnalysis>;
      
    } catch (error) {
      logger.error('Message analysis failed', {
        messageId,
        conversationId,
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * Get conversation trend analysis
   */
  async getConversationTrends(
    conversationId: string,
    timeRange: {
      startDate: Date;
      endDate: Date;
    }
  ): Promise<{
    totalAnalyses: number;
    intentDistribution: Record<PlumbingIntent, number>;
    emergencyCount: number;
    urgencyTrends: Record<UrgencyLevel, number>;
    sentimentTrends: Record<CustomerSentiment, number>;
    averageProcessingTime: number;
    averageTokensUsed: number;
  }> {
    try {
      // This would query the database for stored analyses
      // For now, return empty structure
      return {
        totalAnalyses: 0,
        intentDistribution: {} as Record<PlumbingIntent, number>,
        emergencyCount: 0,
        urgencyTrends: {} as Record<UrgencyLevel, number>,
        sentimentTrends: {} as Record<CustomerSentiment, number>,
        averageProcessingTime: 0,
        averageTokensUsed: 0
      };
    } catch (error) {
      logger.error('Failed to get conversation trends', {
        conversationId,
        timeRange,
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * Perform quick analysis without Claude API for emergency detection
   */
  private performQuickAnalysis(messageContent: string): {
    intent: PlumbingIntent;
    isEmergency: boolean;
    urgencyLevel: UrgencyLevel;
    sentiment: CustomerSentiment;
  } {
    const lowerContent = messageContent.toLowerCase();
    
    // Check for emergency keywords
    const emergencyMatches = EMERGENCY_KEYWORDS.filter(keyword => 
      lowerContent.includes(keyword.toLowerCase())
    );
    
    // Check for urgent keywords
    const urgentMatches = URGENT_KEYWORDS.filter(keyword =>
      lowerContent.includes(keyword.toLowerCase())
    );
    
    // Check for frustration indicators
    const frustrationMatches = FRUSTRATION_INDICATORS.filter(keyword =>
      lowerContent.includes(keyword.toLowerCase())
    );
    
    // Determine emergency status
    const isEmergency = emergencyMatches.length > 0;
    
    // Determine intent
    let intent: PlumbingIntent = 'general_question';
    if (isEmergency) {
      intent = 'emergency_service';
    } else if (lowerContent.includes('quote') || lowerContent.includes('price') || lowerContent.includes('cost')) {
      intent = 'quote_request';
    } else if (lowerContent.includes('schedule') || lowerContent.includes('appointment')) {
      intent = 'scheduling';
    } else if (frustrationMatches.length > 0) {
      intent = 'complaint';
    } else if (lowerContent.includes('follow') || lowerContent.includes('checking')) {
      intent = 'follow_up';
    } else {
      intent = 'routine_inquiry';
    }
    
    // Determine urgency
    let urgencyLevel: UrgencyLevel = 'flexible';
    if (isEmergency) {
      urgencyLevel = 'immediate';
    } else if (urgentMatches.length > 0) {
      urgencyLevel = 'same_day';
    } else if (lowerContent.includes('today') || lowerContent.includes('asap')) {
      urgencyLevel = 'same_day';
    } else if (lowerContent.includes('week')) {
      urgencyLevel = 'within_week';
    }
    
    // Determine sentiment
    let sentiment: CustomerSentiment = 'neutral';
    if (frustrationMatches.length > 0) {
      sentiment = 'frustrated';
    } else if (lowerContent.includes('worried') || lowerContent.includes('concerned')) {
      sentiment = 'worried';
    } else if (lowerContent.includes('thank') || lowerContent.includes('appreciate')) {
      sentiment = 'positive';
    } else if (lowerContent.includes('angry') || lowerContent.includes('mad')) {
      sentiment = 'angry';
    }
    
    return {
      intent,
      isEmergency,
      urgencyLevel,
      sentiment
    };
  }

  /**
   * Parse Claude's analysis response
   */
  private parseAnalysisResponse(responseText: string): Partial<ConversationAnalysis> {
    try {
      // Extract JSON from response
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in analysis response');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        primaryIntent: parsed.primaryIntent,
        secondaryIntents: parsed.secondaryIntents || [],
        intentConfidence: parsed.intentConfidence || 0.5,
        
        isEmergency: parsed.isEmergency || false,
        emergencyType: parsed.emergencyType || 'none',
        emergencyConfidence: parsed.emergencyConfidence || 0.5,
        
        urgencyLevel: parsed.urgencyLevel || 'unknown',
        urgencyReasons: parsed.urgencyReasons || [],
        
        customerSentiment: parsed.customerSentiment || 'unknown',
        sentimentConfidence: parsed.sentimentConfidence || 0.5,
        frustrationIndicators: parsed.frustrationIndicators || [],
        
        serviceType: parsed.serviceType,
        serviceTypeConfidence: parsed.serviceTypeConfidence,
        
        extractedInfo: parsed.extractedInfo || {},
        conversationStage: parsed.conversationStage || 'initial_contact',
        nextRecommendedAction: parsed.nextRecommendedAction || '',
        suggestedFollowUp: parsed.suggestedFollowUp,
        
        shortSummary: parsed.shortSummary || '',
        keyPoints: parsed.keyPoints || [],
        actionItems: parsed.actionItems || []
      };
    } catch (error) {
      logger.error('Failed to parse analysis response', {
        error: (error as Error).message,
        responseText: responseText.substring(0, 500)
      });
      
      // Return default analysis
      return {
        primaryIntent: 'general_question',
        secondaryIntents: [],
        intentConfidence: 0.1,
        isEmergency: false,
        emergencyType: 'none',
        emergencyConfidence: 0.9,
        urgencyLevel: 'unknown',
        urgencyReasons: [],
        customerSentiment: 'unknown',
        sentimentConfidence: 0.1,
        frustrationIndicators: [],
        extractedInfo: {},
        conversationStage: 'initial_contact',
        nextRecommendedAction: 'Review message and respond appropriately',
        shortSummary: 'Analysis failed - manual review required',
        keyPoints: [],
        actionItems: ['Review conversation manually']
      };
    }
  }

  /**
   * Validate and enhance analysis with business logic
   */
  private validateAndEnhanceAnalysis(
    analysis: ConversationAnalysis,
    conversation: { messages: Message[]; platform: string }
  ): void {
    // Enhance emergency detection
    if (analysis.isEmergency && analysis.emergencyConfidence < 0.8) {
      const latestMessage = conversation.messages[conversation.messages.length - 1];
      const quickCheck = this.performQuickAnalysis(latestMessage.content);
      if (quickCheck.isEmergency) {
        analysis.emergencyConfidence = Math.max(analysis.emergencyConfidence, 0.8);
      }
    }
    
    // Validate urgency level
    if (analysis.isEmergency && analysis.urgencyLevel !== 'immediate') {
      analysis.urgencyLevel = 'immediate';
      analysis.urgencyReasons.push('Emergency situation detected');
    }
    
    // Enhance sentiment analysis
    if (analysis.frustrationIndicators.length > 2 && analysis.customerSentiment === 'neutral') {
      analysis.customerSentiment = 'frustrated';
      analysis.sentimentConfidence = Math.max(analysis.sentimentConfidence, 0.7);
    }
    
    // Add platform-specific insights
    if (conversation.platform === 'google_voice') {
      analysis.extractedInfo.contactPreference = 'call';
    }
  }

  /**
   * Prepare context for analysis prompt
   */
  private prepareAnalysisContext(
    conversation: { messages: Message[]; customerId?: string },
    customerInfo: Customer | null | undefined,
    context: AnalysisContext
  ): ConversationAnalysisPromptContext {
    // Limit messages for context
    const limitedMessages = conversation.messages
      .slice(-this.config.maxContextMessages)
      .map(msg => ({
        role: msg.direction === 'inbound' ? 'customer' as const : 'business' as const,
        message: msg.content,
        timestamp: msg.sentAt.toISOString()
      }));
    
    // Prepare customer history
    let customerHistory;
    if (customerInfo) {
      customerHistory = {
        customerType: customerInfo.customerType,
        lastServiceDate: customerInfo.lastServiceDate?.toISOString(),
        // Add more customer context as available
      };
    }
    
    return {
      businessInfo: context.businessInfo,
      conversation: limitedMessages,
      customerHistory,
      currentContext: context.currentContext
    };
  }

  /**
   * Get conversation data with messages
   */
  private async getConversationData(
    conversationId: string,
    messageLimit?: number
  ): Promise<{ messages: Message[]; customerId?: string; platform: string }> {
    // This would query the database
    // For now, return mock data structure
    return {
      messages: [],
      customerId: undefined,
      platform: 'google_voice'
    };
  }

  /**
   * Get customer information
   */
  private async getCustomerInfo(customerId: string): Promise<Customer | null> {
    // This would query the database
    return null;
  }

  /**
   * Get single message
   */
  private async getMessage(messageId: string): Promise<Message | null> {
    // This would query the database
    return null;
  }

  /**
   * Store analysis in database
   */
  private async storeAnalysis(analysis: ConversationAnalysis): Promise<void> {
    try {
      // Store in database
      const db = DatabaseService.getInstance();
      await db.raw(
        `INSERT INTO conversation_analyses (
          id, conversation_id, analysis_type, primary_intent, secondary_intents,
          intent_confidence, is_emergency, emergency_type, emergency_confidence,
          urgency_level, urgency_reasons, customer_sentiment, sentiment_confidence,
          frustration_indicators, service_type, service_type_confidence,
          extracted_info, conversation_stage, next_recommended_action,
          suggested_follow_up, short_summary, key_points, action_items,
          tokens_used, processing_time_ms, model_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          analysis.id,
          analysis.conversationId,
          analysis.analysisType,
          analysis.primaryIntent,
          JSON.stringify(analysis.secondaryIntents),
          analysis.intentConfidence,
          analysis.isEmergency,
          analysis.emergencyType,
          analysis.emergencyConfidence,
          analysis.urgencyLevel,
          JSON.stringify(analysis.urgencyReasons),
          analysis.customerSentiment,
          analysis.sentimentConfidence,
          JSON.stringify(analysis.frustrationIndicators),
          analysis.serviceType,
          analysis.serviceTypeConfidence,
          JSON.stringify(analysis.extractedInfo),
          analysis.conversationStage,
          analysis.nextRecommendedAction,
          analysis.suggestedFollowUp,
          analysis.shortSummary,
          JSON.stringify(analysis.keyPoints),
          JSON.stringify(analysis.actionItems),
          analysis.tokensUsed,
          analysis.processingTimeMs,
          analysis.modelVersion,
          analysis.createdAt.toISOString(),
          analysis.updatedAt.toISOString()
        ]
      );
    } catch (error) {
      logger.error('Failed to store conversation analysis', {
        analysisId: analysis.id,
        conversationId: analysis.conversationId,
        error: (error as Error).message
      });
      // Don't throw - analysis still succeeded
    }
  }

  /**
   * Update conversation based on analysis
   */
  private async updateConversationFromAnalysis(
    conversationId: string,
    analysis: ConversationAnalysis
  ): Promise<void> {
    try {
      const priority = analysis.isEmergency ? 'emergency' : 
                     analysis.urgencyLevel === 'immediate' ? 'high' :
                     analysis.urgencyLevel === 'same_day' ? 'medium' : 'low';
      
      const db = DatabaseService.getInstance();
      await db.raw(
        `UPDATE conversations SET 
          priority = ?, 
          is_emergency = ?, 
          summary = ?,
          updated_at = ?
        WHERE id = ?`,
        [
          priority,
          analysis.isEmergency,
          analysis.shortSummary,
          new Date().toISOString(),
          conversationId
        ]
      );
    } catch (error) {
      logger.error('Failed to update conversation from analysis', {
        conversationId,
        error: (error as Error).message
      });
      // Don't throw - analysis still succeeded
    }
  }

  /**
   * Clear analysis cache
   */
  clearCache(): void {
    this.analysisCache.clear();
    logger.info('Conversation analysis cache cleared');
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      cacheSize: this.analysisCache.size,
      config: { ...this.config }
    };
  }
}

// Default configuration
export const DEFAULT_ANALYZER_CONFIG: ConversationAnalyzerConfig = {
  maxContextMessages: 10,
  emergencyDetectionThreshold: 0.8,
  urgencyDetectionThreshold: 0.7,
  sentimentAnalysisThreshold: 0.6,
  autoUpdateConversation: true,
  storeAnalysisHistory: true
};