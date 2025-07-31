import { ClaudeAIService } from './ClaudeAIService';
import { DatabaseService } from './DatabaseService';
import { BusinessRulesService } from './BusinessRulesService';
import { 
  ResponseGeneration, 
  PlumbingIntent, 
  CustomerSentiment, 
  UrgencyLevel,
  ClaudeAPIRequest
} from '../models/AIModels';
import { 
  RESPONSE_GENERATION_SYSTEM_PROMPT,
  generateResponsePrompt,
  ResponseGenerationContext,
  RESPONSE_TEMPLATES,
  generateTemplateResponse
} from '../ai/prompts/responseGeneration';
import { ServiceType, Customer, Message } from '../../../shared/types';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface ResponseGeneratorConfig {
  maxResponseLength: number;
  defaultTemperature: number;
  enableTemplateMatching: boolean;
  requireHumanReview: {
    emergencies: boolean;
    complaints: boolean;
    lowConfidence: boolean;
    confidenceThreshold: number;
  };
  qualityThresholds: {
    minAppropriateness: number;
    minProfessionalism: number;
    minHelpfulness: number;
    minClarity: number;
  };
  personalizationLevel: 'none' | 'basic' | 'advanced';
  responseVariations: number;
  cacheExpiryMinutes: number;
}

export interface GenerationRequest {
  conversationId: string;
  messageId?: string;
  analysisId?: string;
  
  // Analysis results
  intent: PlumbingIntent;
  urgencyLevel: UrgencyLevel;
  customerSentiment: CustomerSentiment;
  serviceType?: ServiceType;
  isEmergency: boolean;
  
  // Context
  businessInfo: ResponseGenerationContext['businessInfo'];
  customerInfo?: ResponseGenerationContext['customerInfo'];
  conversationContext: ResponseGenerationContext['conversationContext'];
  extractedInfo?: ResponseGenerationContext['extractedInfo'];
  businessRules?: ResponseGenerationContext['businessRules'];
  
  // Options
  responseType?: 'immediate' | 'informational' | 'scheduling' | 'emergency' | 'quote' | 'follow_up';
  preferredTone?: 'professional' | 'empathetic' | 'urgent' | 'friendly' | 'formal';
  includeAlternatives?: boolean;
  useTemplate?: boolean;
}

export interface GenerationResult {
  response: ResponseGeneration;
  needsReview: boolean;
  reviewReasons: string[];
  alternatives: string[];
  templateUsed?: string;
  qualityScores: {
    appropriateness: number;
    professionalism: number;
    helpfulness: number;
    clarity: number;
    overall: number;
  };
}

export class ResponseGenerationService {
  private claudeService: ClaudeAIService;
  private databaseService: DatabaseService;
  private businessRulesService: BusinessRulesService;
  private config: ResponseGeneratorConfig;
  private responseCache: Map<string, ResponseGeneration>;
  private templateCache: Map<string, string>;

  constructor(
    claudeService: ClaudeAIService,
    databaseService: DatabaseService,
    businessRulesService: BusinessRulesService,
    config: ResponseGeneratorConfig
  ) {
    this.claudeService = claudeService;
    this.databaseService = databaseService;
    this.businessRulesService = businessRulesService;
    this.config = config;
    this.responseCache = new Map();
    this.templateCache = new Map();
    
    // Load templates into cache
    this.loadTemplates();
    
    logger.info('ResponseGenerationService initialized', {
      maxResponseLength: config.maxResponseLength,
      enableTemplateMatching: config.enableTemplateMatching,
      personalizationLevel: config.personalizationLevel,
      responseVariations: config.responseVariations
    });
  }

  /**
   * Generate response for a customer message
   */
  async generateResponse(
    request: GenerationRequest,
    options: {
      useCache?: boolean;
      priority?: 'high' | 'normal' | 'low';
      skipReview?: boolean;
    } = {}
  ): Promise<GenerationResult> {
    const { useCache = true, priority = 'normal', skipReview = false } = options;
    
    const startTime = Date.now();
    
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(request);
      if (useCache && this.responseCache.has(cacheKey)) {
        const cached = this.responseCache.get(cacheKey)!;
        logger.debug('Using cached response generation', {
          conversationId: request.conversationId,
          intent: request.intent,
          responseType: cached.responseType
        });
        
        return {
          response: cached,
          needsReview: cached.needsReview,
          reviewReasons: cached.reviewReason ? [cached.reviewReason] : [],
          alternatives: cached.alternatives.map(alt => alt.response),
          templateUsed: cached.templateUsed,
          qualityScores: {
            appropriateness: cached.appropriatenessScore,
            professionalism: 0.9, // Would calculate from stored data
            helpfulness: 0.9,
            clarity: 0.9,
            overall: cached.confidence
          }
        };
      }
      
      // Prepare context for generation
      const context = this.prepareGenerationContext(request);
      
      let generatedResponse: string;
      let alternatives: string[] = [];
      let templateUsed: string | undefined;
      
      // Try template matching first if enabled
      if (this.config.enableTemplateMatching && request.useTemplate !== false) {
        const templateResult = this.tryTemplateGeneration(request, context);
        if (templateResult) {
          generatedResponse = templateResult.response;
          templateUsed = templateResult.templateName;
          
          // Generate alternatives with different tones
          if (request.includeAlternatives) {
            alternatives = await this.generateAlternativeTones(request, context);
          }
        } else {
          // Fall back to Claude generation
          const claudeResult = await this.performClaudeGeneration(context, priority);
          generatedResponse = claudeResult.response;
          alternatives = claudeResult.alternatives;
        }
      } else {
        // Direct Claude generation
        const claudeResult = await this.performClaudeGeneration(context, priority);
        generatedResponse = claudeResult.response;
        alternatives = claudeResult.alternatives;
      }
      
      // Apply business rules
      const businessRulesApplied = await this.applyBusinessRules(
        generatedResponse,
        request,
        context
      );
      
      // Calculate quality scores
      const qualityScores = this.calculateQualityScores(
        generatedResponse,
        request,
        context
      );
      
      // Determine if review is needed
      const reviewAssessment = this.assessReviewNeeds(
        request,
        qualityScores,
        skipReview
      );
      
      // Create response object
      const response: ResponseGeneration = {
        id: uuidv4(),
        conversationId: request.conversationId,
        messageId: request.messageId,
        analysisId: request.analysisId,
        
        generatedResponse: businessRulesApplied.response,
        responseType: request.responseType || this.determineResponseType(request.intent),
        tone: request.preferredTone || this.determineTone(request.customerSentiment, request.urgencyLevel),
        
        alternatives: alternatives.map((alt, index) => ({
          response: alt,
          tone: this.getAlternativeTone(index),
          reasoning: `Alternative approach ${index + 1}`
        })),
        
        templateUsed,
        personalizationApplied: this.config.personalizationLevel !== 'none',
        
        businessRulesApplied: businessRulesApplied.rulesApplied,
        pricingMentioned: businessRulesApplied.pricingMentioned,
        schedulingSuggested: businessRulesApplied.schedulingSuggested,
        
        confidence: qualityScores.overall,
        appropriatenessScore: qualityScores.appropriateness,
        
        needsReview: reviewAssessment.needsReview,
        reviewReason: reviewAssessment.reasons.join('; '),
        
        tokensUsed: templateUsed ? 0 : 800, // Estimate for Claude generation
        processingTimeMs: Date.now() - startTime,
        modelVersion: templateUsed ? `template_${templateUsed}` : 'claude-3-sonnet-20240229',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Cache the response
      if (useCache) {
        this.responseCache.set(cacheKey, response);
      }
      
      // Store in database
      await this.storeResponse(response);
      
      logger.info('Response generation completed', {
        conversationId: request.conversationId,
        intent: request.intent,
        responseType: response.responseType,
        tone: response.tone,
        needsReview: response.needsReview,
        templateUsed,
        processingTime: response.processingTimeMs,
        qualityScore: qualityScores.overall
      });
      
      return {
        response,
        needsReview: reviewAssessment.needsReview,
        reviewReasons: reviewAssessment.reasons,
        alternatives,
        templateUsed,
        qualityScores
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Response generation failed', {
        conversationId: request.conversationId,
        intent: request.intent,
        error: (error as Error).message,
        duration
      });
      
      // Return fallback response
      return this.generateFallbackResponse(request);
    }
  }

  /**
   * Generate multiple response variations
   */
  async generateVariations(
    request: GenerationRequest,
    count: number = 3,
    options: {
      varyTone?: boolean;
      varyLength?: boolean;
      varyApproach?: boolean;
    } = {}
  ): Promise<ResponseGeneration[]> {
    const { varyTone = true, varyLength = true, varyApproach = true } = options;
    
    if (count > this.config.responseVariations) {
      throw new Error(`Requested ${count} variations exceeds maximum ${this.config.responseVariations}`);
    }
    
    const variations: ResponseGeneration[] = [];
    const baseRequest = { ...request };
    
    for (let i = 0; i < count; i++) {
      const variationRequest = { ...baseRequest };
      
      // Vary tone
      if (varyTone) {
        const tones: Array<typeof request.preferredTone> = ['professional', 'empathetic', 'friendly', 'formal'];
        variationRequest.preferredTone = tones[i % tones.length];
      }
      
      // Vary approach by slightly modifying the request
      if (varyApproach) {
        variationRequest.includeAlternatives = i % 2 === 0;
        variationRequest.useTemplate = i < count / 2;
      }
      
      const result = await this.generateResponse(variationRequest, {
        useCache: false,
        priority: 'normal'
      });
      
      variations.push(result.response);
    }
    
    logger.info('Response variations generated', {
      conversationId: request.conversationId,
      count: variations.length,
      toneVariations: varyTone,
      lengthVariations: varyLength,
      approachVariations: varyApproach
    });
    
    return variations;
  }

  /**
   * Update response based on human feedback
   */
  async updateResponseWithFeedback(
    responseId: string,
    feedback: {
      approved?: boolean;
      edited?: boolean;
      finalResponse?: string;
      rating?: number;
      improvementNotes?: string;
      editedBy?: string;
    }
  ): Promise<ResponseGeneration> {
    try {
      const response = await this.getStoredResponse(responseId);
      if (!response) {
        throw new Error('Response not found');
      }
      
      // Update with feedback
      const updatedResponse: ResponseGeneration = {
        ...response,
        humanApproved: feedback.approved,
        humanEdited: feedback.edited,
        finalResponse: feedback.finalResponse,
        internalRating: feedback.rating,
        improvementNotes: feedback.improvementNotes,
        editedBy: feedback.editedBy,
        editedAt: feedback.edited ? new Date() : undefined,
        updatedAt: new Date()
      };
      
      // Store updated response
      await this.updateStoredResponse(updatedResponse);
      
      // Learn from feedback if learning is enabled
      if (feedback.edited && feedback.finalResponse) {
        await this.recordLearningData(response, feedback.finalResponse, feedback.improvementNotes);
      }
      
      logger.info('Response updated with feedback', {
        responseId,
        approved: feedback.approved,
        edited: feedback.edited,
        rating: feedback.rating
      });
      
      return updatedResponse;
      
    } catch (error) {
      logger.error('Failed to update response with feedback', {
        responseId,
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * Try template-based generation
   */
  private tryTemplateGeneration(
    request: GenerationRequest,
    context: ResponseGenerationContext
  ): { response: string; templateName: string } | null {
    const templateKey = `${request.intent}_${request.urgencyLevel}`;
    
    // Check if we have a template for this situation
    if (!RESPONSE_TEMPLATES[request.intent as keyof typeof RESPONSE_TEMPLATES]) {
      return null;
    }
    
    const templateType = request.isEmergency ? 'emergency' : 
                        request.urgencyLevel === 'immediate' ? 'urgent' : 'standard';
    
    const templateResponse = generateTemplateResponse(request.intent, context, templateType);
    
    if (templateResponse) {
      return {
        response: this.personalizeTemplate(templateResponse, context),
        templateName: `${request.intent}_${templateType}`
      };
    }
    
    return null;
  }

  /**
   * Perform Claude AI generation
   */
  private async performClaudeGeneration(
    context: ResponseGenerationContext,
    priority: 'high' | 'normal' | 'low'
  ): Promise<{ response: string; alternatives: string[] }> {
    const prompt = generateResponsePrompt(context);
    
    const request: ClaudeAPIRequest = {
      model: 'claude-3-sonnet-20240229',
      max_tokens: this.config.maxResponseLength,
      temperature: this.config.defaultTemperature,
      system: RESPONSE_GENERATION_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    };
    
    const apiResponse = await this.claudeService.sendRequest(request, {
      requestId: `response_${Date.now()}`,
      useCache: true,
      priority
    });
    
    return this.parseClaudeResponse(apiResponse.content[0].text);
  }

  /**
   * Parse Claude's response generation
   */
  private parseClaudeResponse(responseText: string): { response: string; alternatives: string[] } {
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response generation');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      return {
        response: parsed.primaryResponse || 'Thank you for contacting us. We\'ll get back to you shortly.',
        alternatives: (parsed.alternativeResponses || []).map((alt: any) => alt.response).slice(0, 3)
      };
    } catch (error) {
      logger.error('Failed to parse Claude response generation', {
        error: (error as Error).message,
        responseText: responseText.substring(0, 500)
      });
      
      // Return fallback
      return {
        response: 'Thank you for contacting us. We\'ll have someone get back to you shortly to help with your plumbing needs.',
        alternatives: []
      };
    }
  }

  /**
   * Generate alternative tones
   */
  private async generateAlternativeTones(
    request: GenerationRequest,
    context: ResponseGenerationContext
  ): Promise<string[]> {
    const tones: Array<NonNullable<GenerationRequest['preferredTone']>> = ['professional', 'empathetic', 'friendly'];
    const alternatives: string[] = [];
    
    for (const tone of tones) {
      if (tone === request.preferredTone) continue;
      
      const altContext = { ...context };
      const altRequest = { ...request, preferredTone: tone };
      
      try {
        const result = await this.generateResponse(altRequest, { 
          useCache: false, 
          priority: 'low' 
        });
        alternatives.push(result.response.generatedResponse);
      } catch (error) {
        logger.warn('Failed to generate alternative tone', { tone, error: (error as Error).message });
      }
    }
    
    return alternatives;
  }

  /**
   * Apply business rules to response
   */
  private async applyBusinessRules(
    response: string,
    request: GenerationRequest,
    context: ResponseGenerationContext
  ): Promise<{
    response: string;
    rulesApplied: string[];
    pricingMentioned: boolean;
    schedulingSuggested: boolean;
  }> {
    const rulesApplied: string[] = [];
    let modifiedResponse = response;
    let pricingMentioned = false;
    let schedulingSuggested = false;
    
    // Emergency handling rules
    if (request.isEmergency) {
      if (!modifiedResponse.includes('emergency')) {
        modifiedResponse = `EMERGENCY SERVICE: ${modifiedResponse}`;
        rulesApplied.push('emergency_flag_added');
      }
    }
    
    // Business hours rules
    if (!context.conversationContext.isBusinessHours) {
      if (!modifiedResponse.includes('after hours') && !modifiedResponse.includes('business hours')) {
        modifiedResponse += `\n\nPlease note this message was received after business hours. Our regular hours are ${context.businessInfo.businessHours}.`;
        rulesApplied.push('after_hours_notice');
      }
    }
    
    // Pricing rules
    if (request.intent === 'quote_request' && context.businessRules?.includePricingGuidelines) {
      pricingMentioned = true;
      rulesApplied.push('pricing_guidelines_included');
    }
    
    // Scheduling rules
    if (['scheduling', 'quote_request'].includes(request.intent)) {
      schedulingSuggested = true;
      rulesApplied.push('scheduling_information_included');
    }
    
    return {
      response: modifiedResponse,
      rulesApplied,
      pricingMentioned,
      schedulingSuggested
    };
  }

  /**
   * Calculate quality scores for response
   */
  private calculateQualityScores(
    response: string,
    request: GenerationRequest,
    context: ResponseGenerationContext
  ): GenerationResult['qualityScores'] {
    // Appropriateness score
    let appropriateness = 0.8;
    if (request.isEmergency && response.toLowerCase().includes('emerg')) appropriateness += 0.1;
    if (request.customerSentiment === 'frustrated' && response.toLowerCase().includes('understand')) appropriateness += 0.1;
    
    // Professionalism score
    let professionalism = 0.8;
    if (response.includes('Thank you')) professionalism += 0.05;
    if (!response.includes('!') || response.split('!').length <= 2) professionalism += 0.05;
    
    // Helpfulness score
    let helpfulness = 0.7;
    if (response.includes('next step') || response.includes('schedule') || response.includes('call')) helpfulness += 0.1;
    if (response.includes(context.businessInfo.phone)) helpfulness += 0.1;
    
    // Clarity score
    let clarity = 0.8;
    if (response.length > 50 && response.length < 300) clarity += 0.1;
    if (response.split('.').length > 1) clarity += 0.05;
    
    // Overall score
    const overall = (appropriateness + professionalism + helpfulness + clarity) / 4;
    
    return {
      appropriateness: Math.min(1, appropriateness),
      professionalism: Math.min(1, professionalism),
      helpfulness: Math.min(1, helpfulness),
      clarity: Math.min(1, clarity),
      overall: Math.min(1, overall)
    };
  }

  /**
   * Assess if response needs human review
   */
  private assessReviewNeeds(
    request: GenerationRequest,
    qualityScores: GenerationResult['qualityScores'],
    skipReview: boolean
  ): { needsReview: boolean; reasons: string[] } {
    if (skipReview) {
      return { needsReview: false, reasons: [] };
    }
    
    const reasons: string[] = [];
    
    // Emergency review requirement
    if (request.isEmergency && this.config.requireHumanReview.emergencies) {
      reasons.push('Emergency situation detected');
    }
    
    // Complaint review requirement
    if (request.intent === 'complaint' && this.config.requireHumanReview.complaints) {
      reasons.push('Customer complaint detected');
    }
    
    // Low confidence review requirement
    if (qualityScores.overall < this.config.requireHumanReview.confidenceThreshold && 
        this.config.requireHumanReview.lowConfidence) {
      reasons.push(`Quality score ${qualityScores.overall} below threshold`);
    }
    
    // Quality threshold checks
    if (qualityScores.appropriateness < this.config.qualityThresholds.minAppropriateness) {
      reasons.push('Appropriateness score too low');
    }
    
    if (qualityScores.professionalism < this.config.qualityThresholds.minProfessionalism) {
      reasons.push('Professionalism score too low');
    }
    
    return {
      needsReview: reasons.length > 0,
      reasons
    };
  }

  /**
   * Generate fallback response when generation fails
   */
  private generateFallbackResponse(request: GenerationRequest): GenerationResult {
    const fallbackResponse: ResponseGeneration = {
      id: uuidv4(),
      conversationId: request.conversationId,
      messageId: request.messageId,
      analysisId: request.analysisId,
      
      generatedResponse: `Thank you for contacting ${request.businessInfo.name}. We've received your message and will have someone get back to you shortly to help with your plumbing needs. For urgent matters, please call us directly at ${request.businessInfo.phone}.`,
      responseType: 'informational',
      tone: 'professional',
      
      alternatives: [],
      templateUsed: 'fallback_template',
      personalizationApplied: false,
      
      businessRulesApplied: ['fallback_response'],
      pricingMentioned: false,
      schedulingSuggested: false,
      
      confidence: 0.5,
      appropriatenessScore: 0.8,
      
      needsReview: true,
      reviewReason: 'Fallback response used due to generation failure',
      
      tokensUsed: 0,
      processingTimeMs: 10,
      modelVersion: 'fallback_template',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    return {
      response: fallbackResponse,
      needsReview: true,
      reviewReasons: ['Generation system failure - manual review required'],
      alternatives: [],
      templateUsed: 'fallback_template',
      qualityScores: {
        appropriateness: 0.8,
        professionalism: 0.8,
        helpfulness: 0.6,
        clarity: 0.8,
        overall: 0.7
      }
    };
  }

  // Helper methods
  private prepareGenerationContext(request: GenerationRequest): ResponseGenerationContext {
    return {
      intent: request.intent,
      urgencyLevel: request.urgencyLevel,
      customerSentiment: request.customerSentiment,
      serviceType: request.serviceType,
      isEmergency: request.isEmergency,
      businessInfo: request.businessInfo,
      customerInfo: request.customerInfo,
      conversationContext: request.conversationContext,
      extractedInfo: request.extractedInfo,
      businessRules: request.businessRules
    };
  }

  private generateCacheKey(request: GenerationRequest): string {
    const key = {
      intent: request.intent,
      urgencyLevel: request.urgencyLevel,
      customerSentiment: request.customerSentiment,
      isEmergency: request.isEmergency,
      responseType: request.responseType,
      preferredTone: request.preferredTone,
      customerMessage: request.conversationContext.customerMessage
    };
    
    return Buffer.from(JSON.stringify(key)).toString('base64');
  }

  private personalizeTemplate(template: string, context: ResponseGenerationContext): string {
    let personalized = template;
    
    if (this.config.personalizationLevel === 'none') {
      return personalized;
    }
    
    // Basic personalization
    if (context.customerInfo?.firstName) {
      personalized = personalized.replace(/\{customerName\}/g, context.customerInfo.firstName);
    }
    
    // Advanced personalization
    if (this.config.personalizationLevel === 'advanced') {
      if (context.customerInfo?.isVIPCustomer) {
        personalized = `As one of our valued customers, ${personalized}`;
      }
      
      if (context.extractedInfo?.serviceAddress) {
        personalized = personalized.replace(/your property/g, `your property at ${context.extractedInfo.serviceAddress}`);
      }
    }
    
    return personalized;
  }

  private determineResponseType(intent: PlumbingIntent): ResponseGeneration['responseType'] {
    const typeMap: Record<PlumbingIntent, ResponseGeneration['responseType']> = {
      emergency_service: 'emergency',
      quote_request: 'quote',
      scheduling: 'scheduling',
      rescheduling: 'scheduling',
      follow_up: 'follow_up',
      complaint: 'immediate',
      payment_inquiry: 'informational',
      routine_inquiry: 'informational',
      service_information: 'informational',
      appointment_confirmation: 'scheduling',
      cancellation: 'scheduling',
      warranty_claim: 'immediate',
      maintenance_reminder: 'scheduling',
      general_question: 'informational',
      other: 'informational'
    };
    
    return typeMap[intent] || 'informational';
  }

  private determineTone(sentiment: CustomerSentiment, urgency: UrgencyLevel): ResponseGeneration['tone'] {
    if (urgency === 'immediate') return 'urgent';
    if (sentiment === 'frustrated' || sentiment === 'angry') return 'empathetic';
    if (sentiment === 'worried') return 'empathetic';
    return 'professional';
  }

  private getAlternativeTone(index: number): string {
    const tones = ['friendly', 'formal', 'empathetic'];
    return tones[index % tones.length];
  }

  private loadTemplates(): void {
    // Load templates into cache
    Object.entries(RESPONSE_TEMPLATES).forEach(([intent, templates]) => {
      Object.entries(templates).forEach(([type, template]) => {
        this.templateCache.set(`${intent}_${type}`, template);
      });
    });
    
    logger.info('Response templates loaded', {
      templateCount: this.templateCache.size
    });
  }

  // Database operations (stubs - would implement with actual database)
  private async storeResponse(response: ResponseGeneration): Promise<void> {
    // Store response in database
  }

  private async getStoredResponse(responseId: string): Promise<ResponseGeneration | null> {
    // Get response from database
    return null;
  }

  private async updateStoredResponse(response: ResponseGeneration): Promise<void> {
    // Update response in database
  }

  private async recordLearningData(
    originalResponse: ResponseGeneration,
    editedResponse: string,
    notes?: string
  ): Promise<void> {
    // Record learning data for model improvement
  }

  // Public utility methods
  clearCache(): void {
    this.responseCache.clear();
    logger.info('Response generation cache cleared');
  }

  getStats() {
    return {
      cacheSize: this.responseCache.size,
      templateCount: this.templateCache.size,
      config: { ...this.config }
    };
  }
}

// Default configuration
export const DEFAULT_RESPONSE_CONFIG: ResponseGeneratorConfig = {
  maxResponseLength: 500,
  defaultTemperature: 0.7,
  enableTemplateMatching: true,
  requireHumanReview: {
    emergencies: true,
    complaints: true,
    lowConfidence: true,
    confidenceThreshold: 0.7
  },
  qualityThresholds: {
    minAppropriateness: 0.6,
    minProfessionalism: 0.7,
    minHelpfulness: 0.6,
    minClarity: 0.7
  },
  personalizationLevel: 'basic',
  responseVariations: 5,
  cacheExpiryMinutes: 60
};