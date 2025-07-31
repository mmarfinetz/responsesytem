import { ClaudeAIService } from './ClaudeAIService';
import { DatabaseService } from './DatabaseService';
import { 
  IntentClassification, 
  PlumbingIntent,
  ClaudeAPIRequest
} from '../models/AIModels';
import { 
  INTENT_CLASSIFICATION_SYSTEM_PROMPT,
  generateIntentClassificationPrompt,
  IntentClassificationContext,
  INTENT_KEYWORDS_MAP,
  findMatchingIntents
} from '../ai/prompts/intentClassification';
import { Message, Customer } from '../../../shared/types';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface IntentClassifierConfig {
  useKeywordPrefiltering: boolean;
  minConfidenceThreshold: number;
  enableBatchProcessing: boolean;
  maxBatchSize: number;
  cacheExpiryMinutes: number;
  fallbackToKeywords: boolean;
  enableLearning: boolean;
}

export interface ClassificationResult {
  intent: PlumbingIntent;
  confidence: number;
  reasoning: string;
  alternatives: Array<{
    intent: PlumbingIntent;
    confidence: number;
    reasoning: string;
  }>;
  isEmergency: boolean;
  emergencyConfidence: number;
  contextFactors: {
    timeInfluence: string;
    historyInfluence: string;
    customerInfluence: string;
    urgencyIndicators: string[];
    emotionalIndicators: string[];
    keyPhrases: string[];
  };
  processingMethod: 'claude_ai' | 'keyword_matching' | 'hybrid';
}

export class IntentClassificationService {
  private claudeService: ClaudeAIService;
  private databaseService: DatabaseService;
  private config: IntentClassifierConfig;
  private classificationCache: Map<string, IntentClassification>;
  private keywordStats: Map<PlumbingIntent, { count: number; accuracy: number }>;

  constructor(
    claudeService: ClaudeAIService,
    databaseService: DatabaseService,
    config: IntentClassifierConfig
  ) {
    this.claudeService = claudeService;
    this.databaseService = databaseService;
    this.config = config;
    this.classificationCache = new Map();
    this.keywordStats = new Map();
    
    // Initialize keyword stats
    Object.keys(INTENT_KEYWORDS_MAP).forEach(intent => {
      this.keywordStats.set(intent as PlumbingIntent, { count: 0, accuracy: 0.5 });
    });
    
    logger.info('IntentClassificationService initialized', {
      useKeywordPrefiltering: config.useKeywordPrefiltering,
      enableBatchProcessing: config.enableBatchProcessing,
      minConfidenceThreshold: config.minConfidenceThreshold
    });
  }

  /**
   * Classify intent for a single message
   */
  async classifyIntent(
    messageId: string,
    conversationId: string,
    context: Partial<IntentClassificationContext> = {},
    options: {
      useCache?: boolean;
      priority?: 'high' | 'normal' | 'low';
      fallbackToKeywords?: boolean;
    } = {}
  ): Promise<IntentClassification> {
    const { useCache = true, priority = 'normal', fallbackToKeywords = this.config.fallbackToKeywords } = options;
    
    const startTime = Date.now();
    
    try {
      // Check cache first
      const cacheKey = `${messageId}_${JSON.stringify(context)}`;
      if (useCache && this.classificationCache.has(cacheKey)) {
        const cached = this.classificationCache.get(cacheKey)!;
        logger.debug('Using cached intent classification', {
          messageId,
          intent: cached.primaryIntent,
          confidence: cached.primaryConfidence
        });
        return cached;
      }
      
      // Get message content
      const message = await this.getMessage(messageId);
      if (!message) {
        throw new Error('Message not found');
      }
      
      // Prepare full context
      const fullContext = await this.prepareClassificationContext(
        message.content,
        conversationId,
        context
      );
      
      let classificationResult: ClassificationResult;
      
      // Try keyword pre-filtering if enabled
      if (this.config.useKeywordPrefiltering) {
        const keywordResult = this.performKeywordClassification(message.content);
        
        // If high confidence keyword match found, might skip Claude
        if (keywordResult.confidence > 0.8 && !keywordResult.isEmergency) {
          classificationResult = keywordResult;
          classificationResult.processingMethod = 'keyword_matching';
        } else {
          // Use Claude with keyword context
          classificationResult = await this.performClaudeClassification(
            fullContext,
            priority,
            keywordResult
          );
          classificationResult.processingMethod = 'hybrid';
        }
      } else {
        // Direct Claude classification
        classificationResult = await this.performClaudeClassification(
          fullContext,
          priority
        );
        classificationResult.processingMethod = 'claude_ai';
      }
      
      // Create classification object
      const classification: IntentClassification = {
        id: uuidv4(),
        messageId,
        conversationId,
        primaryIntent: classificationResult.intent,
        primaryConfidence: classificationResult.confidence,
        intents: [
          {
            intent: classificationResult.intent,
            confidence: classificationResult.confidence,
            reasoning: classificationResult.reasoning
          },
          ...classificationResult.alternatives
        ],
        contextFactors: {
          timeOfDay: this.determineTimeOfDay(),
          messageLength: this.determineMessageLength(message.content),
          hasQuestionWords: this.hasQuestionWords(message.content),
          hasUrgentKeywords: this.hasUrgentKeywords(message.content),
          previousIntentInfluence: !!context.contextualInfo?.previousIntent
        },
        tokensUsed: classificationResult.processingMethod === 'claude_ai' ? 500 : 0, // Estimate
        processingTimeMs: Date.now() - startTime,
        modelVersion: classificationResult.processingMethod,
        createdAt: new Date()
      };
      
      // Validate classification
      this.validateClassification(classification, message.content);
      
      // Cache the result
      if (useCache) {
        this.classificationCache.set(cacheKey, classification);
        
        // Clean up cache periodically
        if (this.classificationCache.size > 1000) {
          this.cleanupCache();
        }
      }
      
      // Store in database if learning is enabled
      if (this.config.enableLearning) {
        await this.storeClassification(classification);
      }
      
      // Update keyword stats
      this.updateKeywordStats(classification.primaryIntent, message.content);
      
      logger.info('Intent classification completed', {
        messageId,
        conversationId,
        primaryIntent: classification.primaryIntent,
        confidence: classification.primaryConfidence,
        processingMethod: classificationResult.processingMethod,
        processingTime: classification.processingTimeMs
      });
      
      return classification;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Intent classification failed', {
        messageId,
        conversationId,
        error: (error as Error).message,
        duration
      });
      
      // Try fallback if enabled
      if (fallbackToKeywords) {
        return this.performFallbackClassification(messageId, conversationId);
      }
      
      throw error;
    }
  }

  /**
   * Classify multiple messages in batch
   */
  async classifyBatch(
    requests: Array<{
      messageId: string;
      conversationId: string;
      context?: Partial<IntentClassificationContext>;
    }>,
    options: {
      priority?: 'high' | 'normal' | 'low';
      maxConcurrency?: number;
    } = {}
  ): Promise<IntentClassification[]> {
    const { priority = 'normal', maxConcurrency = 5 } = options;
    
    if (!this.config.enableBatchProcessing) {
      throw new Error('Batch processing is disabled');
    }
    
    if (requests.length > this.config.maxBatchSize) {
      throw new Error(`Batch size ${requests.length} exceeds maximum ${this.config.maxBatchSize}`);
    }
    
    logger.info('Starting batch intent classification', {
      batchSize: requests.length,
      priority,
      maxConcurrency
    });
    
    // Process in chunks to respect concurrency limits
    const results: IntentClassification[] = [];
    for (let i = 0; i < requests.length; i += maxConcurrency) {
      const chunk = requests.slice(i, i + maxConcurrency);
      
      const chunkPromises = chunk.map(request => 
        this.classifyIntent(
          request.messageId,
          request.conversationId,
          request.context || {},
          { priority }
        )
      );
      
      const chunkResults = await Promise.allSettled(chunkPromises);
      
      chunkResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          logger.error('Batch classification item failed', {
            messageId: chunk[index].messageId,
            error: result.reason
          });
        }
      });
    }
    
    logger.info('Batch intent classification completed', {
      requested: requests.length,
      successful: results.length,
      failed: requests.length - results.length
    });
    
    return results;
  }

  /**
   * Get intent prediction without storing result
   */
  async predictIntent(
    messageContent: string,
    context: Partial<IntentClassificationContext> = {}
  ): Promise<{
    intent: PlumbingIntent;
    confidence: number;
    alternatives: Array<{ intent: PlumbingIntent; confidence: number }>;
  }> {
    try {
      // Use keyword matching for quick prediction
      const keywordResult = this.performKeywordClassification(messageContent);
      
      return {
        intent: keywordResult.intent,
        confidence: keywordResult.confidence,
        alternatives: keywordResult.alternatives.map(alt => ({
          intent: alt.intent,
          confidence: alt.confidence
        }))
      };
    } catch (error) {
      logger.error('Intent prediction failed', {
        error: (error as Error).message,
        messageContent: messageContent.substring(0, 100)
      });
      
      return {
        intent: 'general_question',
        confidence: 0.1,
        alternatives: []
      };
    }
  }

  /**
   * Perform keyword-based classification
   */
  private performKeywordClassification(messageContent: string): ClassificationResult {
    const matchingIntents = findMatchingIntents(messageContent);
    
    if (matchingIntents.length === 0) {
      return {
        intent: 'general_question',
        confidence: 0.3,
        reasoning: 'No specific keywords matched',
        alternatives: [],
        isEmergency: false,
        emergencyConfidence: 0.9,
        contextFactors: {
          timeInfluence: 'No time indicators found',
          historyInfluence: 'No history context',
          customerInfluence: 'No customer context',
          urgencyIndicators: [],
          emotionalIndicators: [],
          keyPhrases: []
        },
        processingMethod: 'keyword_matching'
      };
    }
    
    const primaryMatch = matchingIntents[0];
    const confidence = Math.min(0.9, 0.5 + (primaryMatch.keywordMatches.length * 0.1));
    
    // Check for emergency
    const emergencyKeywords = ['emergency', 'urgent', 'flooding', 'burst', 'gas leak'];
    const isEmergency = emergencyKeywords.some(keyword => 
      messageContent.toLowerCase().includes(keyword)
    );
    
    return {
      intent: primaryMatch.intent,
      confidence,
      reasoning: `Matched keywords: ${primaryMatch.keywordMatches.join(', ')}`,
      alternatives: matchingIntents.slice(1, 4).map(match => ({
        intent: match.intent,
        confidence: Math.min(0.8, 0.3 + (match.keywordMatches.length * 0.1)),
        reasoning: `Keywords: ${match.keywordMatches.join(', ')}`
      })),
      isEmergency,
      emergencyConfidence: isEmergency ? 0.8 : 0.9,
      contextFactors: {
        timeInfluence: 'Keyword-based classification',
        historyInfluence: 'Not considered',
        customerInfluence: 'Not considered',
        urgencyIndicators: primaryMatch.keywordMatches.filter(kw => 
          ['urgent', 'asap', 'emergency', 'immediate'].includes(kw.toLowerCase())
        ),
        emotionalIndicators: primaryMatch.keywordMatches.filter(kw =>
          ['problem', 'issue', 'terrible', 'awful', 'frustrated'].includes(kw.toLowerCase())
        ),
        keyPhrases: primaryMatch.keywordMatches
      },
      processingMethod: 'keyword_matching'
    };
  }

  /**
   * Perform Claude AI classification
   */
  private async performClaudeClassification(
    context: IntentClassificationContext,
    priority: 'high' | 'normal' | 'low',
    keywordHint?: ClassificationResult
  ): Promise<ClassificationResult> {
    const prompt = generateIntentClassificationPrompt(context);
    
    // Add keyword hint if available
    const enhancedPrompt = keywordHint ? 
      `${prompt}\n\nKEYWORD ANALYSIS SUGGESTS: ${keywordHint.intent} (confidence: ${keywordHint.confidence})` :
      prompt;
    
    const request: ClaudeAPIRequest = {
      model: 'claude-3-sonnet-20240229',
      max_tokens: 1024,
      temperature: 0.2,
      system: INTENT_CLASSIFICATION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: enhancedPrompt
        }
      ]
    };
    
    const apiResponse = await this.claudeService.sendRequest(request, {
      requestId: `intent_${Date.now()}`,
      useCache: true,
      priority
    });
    
    return this.parseClaudeResponse(apiResponse.content[0].text);
  }

  /**
   * Parse Claude's classification response
   */
  private parseClaudeResponse(responseText: string): ClassificationResult {
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in classification response');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        intent: parsed.primaryIntent,
        confidence: parsed.primaryConfidence || 0.5,
        reasoning: parsed.primaryReasoning || 'No reasoning provided',
        alternatives: (parsed.allIntents || []).slice(1, 4).map((item: any) => ({
          intent: item.intent,
          confidence: item.confidence || 0.3,
          reasoning: item.reasoning || 'No reasoning provided'
        })),
        isEmergency: parsed.emergencyAssessment?.isEmergency || false,
        emergencyConfidence: parsed.emergencyAssessment?.emergencyConfidence || 0.5,
        contextFactors: parsed.contextFactors || {
          timeInfluence: 'Unknown',
          historyInfluence: 'Unknown',
          customerInfluence: 'Unknown',
          urgencyIndicators: [],
          emotionalIndicators: [],
          keyPhrases: []
        },
        processingMethod: 'claude_ai'
      };
    } catch (error) {
      logger.error('Failed to parse Claude classification response', {
        error: (error as Error).message,
        responseText: responseText.substring(0, 500)
      });
      
      // Return fallback classification
      return {
        intent: 'general_question',
        confidence: 0.1,
        reasoning: 'Failed to parse AI response',
        alternatives: [],
        isEmergency: false,
        emergencyConfidence: 0.5,
        contextFactors: {
          timeInfluence: 'Parse error',
          historyInfluence: 'Parse error',
          customerInfluence: 'Parse error',
          urgencyIndicators: [],
          emotionalIndicators: [],
          keyPhrases: []
        },
        processingMethod: 'claude_ai'
      };
    }
  }

  /**
   * Prepare full context for classification
   */
  private async prepareClassificationContext(
    message: string,
    conversationId: string,
    context: Partial<IntentClassificationContext>
  ): Promise<IntentClassificationContext> {
    // Get conversation history if not provided
    let conversationHistory = context.conversationHistory;
    if (!conversationHistory) {
      // This would query recent messages from the database
      conversationHistory = [];
    }
    
    // Get customer info if not provided
    let customerInfo = context.customerInfo;
    if (!customerInfo) {
      // This would query customer data from the database
      customerInfo = {};
    }
    
    // Get contextual info
    const contextualInfo = context.contextualInfo || {
      timeOfDay: new Date().toLocaleTimeString(),
      isBusinessHours: this.isBusinessHours(),
      dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' })
    };
    
    return {
      message,
      conversationHistory,
      customerInfo,
      contextualInfo
    };
  }

  /**
   * Validate classification result
   */
  private validateClassification(
    classification: IntentClassification,
    messageContent: string
  ): void {
    // Validate confidence scores
    if (classification.primaryConfidence < 0 || classification.primaryConfidence > 1) {
      classification.primaryConfidence = Math.max(0, Math.min(1, classification.primaryConfidence));
    }
    
    // Ensure minimum confidence threshold
    if (classification.primaryConfidence < this.config.minConfidenceThreshold) {
      logger.warn('Classification confidence below threshold', {
        messageId: classification.messageId,
        intent: classification.primaryIntent,
        confidence: classification.primaryConfidence,
        threshold: this.config.minConfidenceThreshold
      });
    }
    
    // Validate intent is in allowed list
    const validIntents = Object.keys(INTENT_KEYWORDS_MAP) as PlumbingIntent[];
    if (!validIntents.includes(classification.primaryIntent)) {
      logger.warn('Invalid intent detected, defaulting to general_question', {
        messageId: classification.messageId,
        invalidIntent: classification.primaryIntent
      });
      classification.primaryIntent = 'general_question';
      classification.primaryConfidence = 0.1;
    }
  }

  /**
   * Perform fallback classification when AI fails
   */
  private async performFallbackClassification(
    messageId: string,
    conversationId: string
  ): Promise<IntentClassification> {
    logger.info('Performing fallback classification', { messageId });
    
    try {
      const message = await this.getMessage(messageId);
      if (!message) {
        throw new Error('Message not found for fallback');
      }
      
      const keywordResult = this.performKeywordClassification(message.content);
      
      return {
        id: uuidv4(),
        messageId,
        conversationId,
        primaryIntent: keywordResult.intent,
        primaryConfidence: keywordResult.confidence * 0.8, // Reduce confidence for fallback
        intents: [
          {
            intent: keywordResult.intent,
            confidence: keywordResult.confidence * 0.8,
            reasoning: `Fallback classification: ${keywordResult.reasoning}`
          }
        ],
        contextFactors: {
          timeOfDay: this.determineTimeOfDay(),
          messageLength: this.determineMessageLength(message.content),
          hasQuestionWords: this.hasQuestionWords(message.content),
          hasUrgentKeywords: this.hasUrgentKeywords(message.content),
          previousIntentInfluence: false
        },
        tokensUsed: 0,
        processingTimeMs: 50,
        modelVersion: 'fallback_keyword_matching',
        createdAt: new Date()
      };
    } catch (error) {
      logger.error('Fallback classification failed', {
        messageId,
        error: (error as Error).message
      });
      
      // Return absolute fallback
      return {
        id: uuidv4(),
        messageId,
        conversationId,
        primaryIntent: 'general_question',
        primaryConfidence: 0.1,
        intents: [
          {
            intent: 'general_question',
            confidence: 0.1,
            reasoning: 'Complete fallback - classification system unavailable'
          }
        ],
        contextFactors: {
          timeOfDay: 'emergency_hours' as const,
          messageLength: 'short' as const,
          hasQuestionWords: false,
          hasUrgentKeywords: false,
          previousIntentInfluence: false
        },
        tokensUsed: 0,
        processingTimeMs: 10,
        modelVersion: 'emergency_fallback',
        createdAt: new Date()
      };
    }
  }

  // Helper methods
  private determineTimeOfDay(): IntentClassification['contextFactors']['timeOfDay'] {
    const hour = new Date().getHours();
    if (hour >= 9 && hour < 17) return 'business_hours';
    if (hour >= 17 && hour < 22) return 'after_hours';
    return 'emergency_hours';
  }

  private determineMessageLength(message: string): IntentClassification['contextFactors']['messageLength'] {
    if (message.length < 50) return 'short';
    if (message.length < 200) return 'medium';
    return 'long';
  }

  private hasQuestionWords(message: string): boolean {
    const questionWords = ['what', 'when', 'where', 'who', 'why', 'how', '?'];
    return questionWords.some(word => message.toLowerCase().includes(word));
  }

  private hasUrgentKeywords(message: string): boolean {
    const urgentWords = ['urgent', 'asap', 'emergency', 'immediate', 'now', 'help'];
    return urgentWords.some(word => message.toLowerCase().includes(word));
  }

  private isBusinessHours(): boolean {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0 = Sunday, 6 = Saturday
    
    // Assume business hours are 8 AM - 6 PM, Monday - Friday
    return day >= 1 && day <= 5 && hour >= 8 && hour < 18;
  }

  private async getMessage(messageId: string): Promise<Message | null> {
    // This would query the database
    return null;
  }

  private async storeClassification(classification: IntentClassification): Promise<void> {
    try {
      await DatabaseService.executeQuery(
        `INSERT INTO intent_classifications (
          id, message_id, conversation_id, primary_intent, primary_confidence,
          intents, context_factors, tokens_used, processing_time_ms,
          model_version, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          classification.id,
          classification.messageId,
          classification.conversationId,
          classification.primaryIntent,
          classification.primaryConfidence,
          JSON.stringify(classification.intents),
          JSON.stringify(classification.contextFactors),
          classification.tokensUsed,
          classification.processingTimeMs,
          classification.modelVersion,
          classification.createdAt.toISOString()
        ]
      );
    } catch (error) {
      logger.error('Failed to store intent classification', {
        classificationId: classification.id,
        error: (error as Error).message
      });
    }
  }

  private updateKeywordStats(intent: PlumbingIntent, messageContent: string): void {
    const stats = this.keywordStats.get(intent);
    if (stats) {
      stats.count++;
      // Update accuracy based on keyword presence (simplified)
      const keywords = INTENT_KEYWORDS_MAP[intent] || [];
      const hasKeywords = keywords.some(keyword => 
        messageContent.toLowerCase().includes(keyword.toLowerCase())
      );
      stats.accuracy = hasKeywords ? Math.min(1, stats.accuracy + 0.01) : Math.max(0, stats.accuracy - 0.01);
      this.keywordStats.set(intent, stats);
    }
  }

  private cleanupCache(): void {
    const cutoff = Date.now() - (this.config.cacheExpiryMinutes * 60 * 1000);
    let removedCount = 0;
    
    for (const [key, classification] of Array.from(this.classificationCache.entries())) {
      if (classification.createdAt.getTime() < cutoff) {
        this.classificationCache.delete(key);
        removedCount++;
      }
    }
    
    logger.debug('Intent classification cache cleaned', {
      removedCount,
      remainingCount: this.classificationCache.size
    });
  }

  // Public utility methods
  clearCache(): void {
    this.classificationCache.clear();
    logger.info('Intent classification cache cleared');
  }

  getStats() {
    return {
      cacheSize: this.classificationCache.size,
      keywordStats: Object.fromEntries(this.keywordStats),
      config: { ...this.config }
    };
  }
}

// Default configuration
export const DEFAULT_INTENT_CONFIG: IntentClassifierConfig = {
  useKeywordPrefiltering: true,
  minConfidenceThreshold: 0.5,
  enableBatchProcessing: true,
  maxBatchSize: 50,
  cacheExpiryMinutes: 30,
  fallbackToKeywords: true,
  enableLearning: true
};