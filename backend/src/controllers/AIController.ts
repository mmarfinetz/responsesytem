import { Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { 
  ClaudeAIService, 
  createClaudeAIService, 
  DEFAULT_CLAUDE_CONFIG 
} from '../services/ClaudeAIService';
import { 
  ConversationAnalyzerService, 
  DEFAULT_ANALYZER_CONFIG 
} from '../services/ConversationAnalyzerService';
import { 
  IntentClassificationService, 
  DEFAULT_INTENT_CONFIG 
} from '../services/IntentClassificationService';
import { 
  ResponseGenerationService, 
  DEFAULT_RESPONSE_CONFIG 
} from '../services/ResponseGenerationService';
import { DatabaseService } from '../services/DatabaseService';
import { BusinessRulesService } from '../services/BusinessRulesService';
import { ValidationError, formatValidationErrors, asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { 
  GenerateAIResponseRequest, 
  GenerateAIResponseResponse 
} from '../../../shared/types';
import { PlumbingIntent, UrgencyLevel, CustomerSentiment } from '../models/AIModels';

export class AIController {
  private claudeService: ClaudeAIService;
  private conversationAnalyzer: ConversationAnalyzerService;
  private intentClassifier: IntentClassificationService;
  private responseGenerator: ResponseGenerationService;
  private databaseService: DatabaseService;
  private businessRulesService: BusinessRulesService;

  constructor() {
    // Initialize services
    this.databaseService = new DatabaseService();
    this.businessRulesService = new BusinessRulesService(this.databaseService);
    
    // Initialize Claude AI service
    const claudeConfig = {
      ...DEFAULT_CLAUDE_CONFIG,
      apiKey: process.env.CLAUDE_API_KEY || ''
    };
    this.claudeService = createClaudeAIService(claudeConfig);
    
    // Initialize AI services
    this.conversationAnalyzer = new ConversationAnalyzerService(
      this.claudeService,
      this.databaseService,
      DEFAULT_ANALYZER_CONFIG
    );
    
    this.intentClassifier = new IntentClassificationService(
      this.claudeService,
      this.databaseService,
      DEFAULT_INTENT_CONFIG
    );
    
    this.responseGenerator = new ResponseGenerationService(
      this.claudeService,
      this.databaseService,
      this.businessRulesService,
      DEFAULT_RESPONSE_CONFIG
    );
    
    logger.info('AIController initialized with all AI services');
  }

  /**
   * Generate AI response for customer message
   */
  generateResponse = asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', formatValidationErrors(errors.array()));
    }

    const { 
      conversationId, 
      messageContent, 
      context 
    }: GenerateAIResponseRequest = req.body;

    const startTime = Date.now();

    try {
      // Step 1: Analyze the message for intent
      const intentResult = await this.intentClassifier.predictIntent(messageContent, {
        message: messageContent,
        contextualInfo: {
          timeOfDay: new Date().toLocaleTimeString(),
          isBusinessHours: this.isBusinessHours(),
          dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' })
        }
      });

      // Step 2: Generate response based on intent and context
      const businessInfo = await this.getBusinessInfo();
      
      const responseRequest = {
        conversationId,
        intent: intentResult.intent,
        urgencyLevel: this.determineUrgency(messageContent, intentResult.intent),
        customerSentiment: this.determineSentiment(messageContent),
        isEmergency: intentResult.intent === 'emergency_service',
        
        businessInfo,
        conversationContext: {
          customerMessage: messageContent,
          isFirstContact: true, // Would determine from conversation history
          timeOfDay: new Date().toLocaleTimeString(),
          isBusinessHours: this.isBusinessHours(),
          dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' })
        },
        
        // Include context if provided
        customerInfo: context?.customerInfo ? {
          ...context.customerInfo,
          customerType: context.customerInfo.customerType && context.customerInfo.customerType !== 'property_manager' 
            ? context.customerInfo.customerType as 'residential' | 'commercial'
            : 'commercial' // Default property managers to commercial
        } : undefined,
        extractedInfo: this.extractBasicInfo(messageContent),
        businessRules: await this.getBusinessRules()
      };

      const generationResult = await this.responseGenerator.generateResponse(
        responseRequest,
        {
          priority: intentResult.intent === 'emergency_service' ? 'high' : 'normal'
        }
      );

      // Step 3: Format response
      const response: GenerateAIResponseResponse = {
        response: generationResult.response.generatedResponse,
        intent: intentResult.intent,
        confidence: intentResult.confidence,
        entities: this.extractEntities(messageContent),
        suggestedActions: this.getSuggestedActions(intentResult.intent),
        followUpQuestions: this.getFollowUpQuestions(intentResult.intent)
      };

      const processingTime = Date.now() - startTime;

      logger.info('AI response generated successfully', {
        conversationId,
        intent: intentResult.intent,
        confidence: intentResult.confidence,
        needsReview: generationResult.needsReview,
        processingTime
      });

      res.json(response);

    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('AI response generation failed', {
        conversationId,
        error: (error as Error).message,
        processingTime
      });

      // Return fallback response
      const fallbackResponse: GenerateAIResponseResponse = {
        response: "Thank you for contacting us! I'll have our team get back to you shortly to help with your plumbing needs.",
        intent: "general_question",
        confidence: 0.1,
        entities: {},
        suggestedActions: ["manual_review", "callback_customer"],
        followUpQuestions: ["What type of plumbing issue are you experiencing?"]
      };

      res.json(fallbackResponse);
    }
  });

  /**
   * Analyze conversation for insights
   */
  analyzeConversation = asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', formatValidationErrors(errors.array()));
    }

    const { conversationId } = req.params;
    const { forceReanalysis = false } = req.query;

    try {
      const businessInfo = await this.getBusinessInfo();
      
      const analysisContext = {
        businessInfo,
        currentContext: {
          timeOfDay: new Date().toLocaleTimeString(),
          dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
          isBusinessHours: this.isBusinessHours()
        }
      };

      const analysis = await this.conversationAnalyzer.analyzeConversation(
        conversationId,
        analysisContext,
        {
          forceReanalysis: forceReanalysis === 'true',
          analysisType: 'summary'
        }
      );

      logger.info('Conversation analysis completed', {
        conversationId,
        primaryIntent: analysis.primaryIntent,
        isEmergency: analysis.isEmergency,
        urgencyLevel: analysis.urgencyLevel,
        customerSentiment: analysis.customerSentiment
      });

      res.json({
        analysis: {
          id: analysis.id,
          conversationId: analysis.conversationId,
          primaryIntent: analysis.primaryIntent,
          secondaryIntents: analysis.secondaryIntents,
          intentConfidence: analysis.intentConfidence,
          
          isEmergency: analysis.isEmergency,
          emergencyType: analysis.emergencyType,
          emergencyConfidence: analysis.emergencyConfidence,
          
          urgencyLevel: analysis.urgencyLevel,
          urgencyReasons: analysis.urgencyReasons,
          
          customerSentiment: analysis.customerSentiment,
          sentimentConfidence: analysis.sentimentConfidence,
          frustrationIndicators: analysis.frustrationIndicators,
          
          serviceType: analysis.serviceType,
          extractedInfo: analysis.extractedInfo,
          
          conversationStage: analysis.conversationStage,
          nextRecommendedAction: analysis.nextRecommendedAction,
          suggestedFollowUp: analysis.suggestedFollowUp,
          
          shortSummary: analysis.shortSummary,
          keyPoints: analysis.keyPoints,
          actionItems: analysis.actionItems,
          
          tokensUsed: analysis.tokensUsed,
          processingTimeMs: analysis.processingTimeMs,
          createdAt: analysis.createdAt
        }
      });

    } catch (error) {
      logger.error('Conversation analysis failed', {
        conversationId,
        error: (error as Error).message
      });

      res.status(500).json({
        error: 'Analysis failed',
        message: (error as Error).message
      });
    }
  });

  /**
   * Classify intent for a single message
   */
  classifyIntent = asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', formatValidationErrors(errors.array()));
    }

    const { messageId } = req.params;
    const { conversationId } = req.body;

    try {
      const classification = await this.intentClassifier.classifyIntent(
        messageId,
        conversationId,
        {
          contextualInfo: {
            timeOfDay: new Date().toLocaleTimeString(),
            isBusinessHours: this.isBusinessHours(),
            dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' })
          }
        }
      );

      logger.info('Intent classification completed', {
        messageId,
        conversationId,
        primaryIntent: classification.primaryIntent,
        confidence: classification.primaryConfidence
      });

      res.json({
        classification: {
          id: classification.id,
          messageId: classification.messageId,
          conversationId: classification.conversationId,
          primaryIntent: classification.primaryIntent,
          primaryConfidence: classification.primaryConfidence,
          intents: classification.intents,
          contextFactors: classification.contextFactors,
          processingTimeMs: classification.processingTimeMs,
          createdAt: classification.createdAt
        }
      });

    } catch (error) {
      logger.error('Intent classification failed', {
        messageId,
        conversationId,
        error: (error as Error).message
      });

      res.status(500).json({
        error: 'Intent classification failed',
        message: (error as Error).message
      });
    }
  });

  /**
   * Generate response variations
   */
  generateVariations = asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', formatValidationErrors(errors.array()));
    }

    const { 
      conversationId,
      messageContent,
      intent,
      count = 3,
      varyTone = true,
      varyApproach = true
    } = req.body;

    try {
      const businessInfo = await this.getBusinessInfo();
      
      const responseRequest = {
        conversationId,
        intent: intent as PlumbingIntent,
        urgencyLevel: this.determineUrgency(messageContent, intent),
        customerSentiment: this.determineSentiment(messageContent),
        isEmergency: intent === 'emergency_service',
        
        businessInfo,
        conversationContext: {
          customerMessage: messageContent,
          isFirstContact: true,
          timeOfDay: new Date().toLocaleTimeString(),
          isBusinessHours: this.isBusinessHours(),
          dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' })
        },
        
        extractedInfo: this.extractBasicInfo(messageContent),
        businessRules: await this.getBusinessRules()
      };

      const variations = await this.responseGenerator.generateVariations(
        responseRequest,
        count,
        { varyTone, varyApproach }
      );

      logger.info('Response variations generated', {
        conversationId,
        intent,
        variationCount: variations.length
      });

      res.json({
        variations: variations.map(variation => ({
          id: variation.id,
          response: variation.generatedResponse,
          tone: variation.tone,
          confidence: variation.confidence,
          needsReview: variation.needsReview,
          templateUsed: variation.templateUsed
        }))
      });

    } catch (error) {
      logger.error('Response variation generation failed', {
        conversationId,
        intent,
        error: (error as Error).message
      });

      res.status(500).json({
        error: 'Variation generation failed',
        message: (error as Error).message
      });
    }
  });

  /**
   * Update response with human feedback
   */
  updateResponseFeedback = asyncHandler(async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      throw new ValidationError('Validation failed', formatValidationErrors(errors.array()));
    }

    const { responseId } = req.params;
    const {
      approved,
      edited,
      finalResponse,
      rating,
      improvementNotes,
      editedBy
    } = req.body;

    try {
      const updatedResponse = await this.responseGenerator.updateResponseWithFeedback(
        responseId,
        {
          approved,
          edited,
          finalResponse,
          rating,
          improvementNotes,
          editedBy
        }
      );

      logger.info('Response feedback updated', {
        responseId,
        approved,
        edited,
        rating
      });

      res.json({
        success: true,
        response: {
          id: updatedResponse.id,
          humanApproved: updatedResponse.humanApproved,
          humanEdited: updatedResponse.humanEdited,
          finalResponse: updatedResponse.finalResponse,
          internalRating: updatedResponse.internalRating,
          editedBy: updatedResponse.editedBy,
          editedAt: updatedResponse.editedAt
        }
      });

    } catch (error) {
      logger.error('Response feedback update failed', {
        responseId,
        error: (error as Error).message
      });

      res.status(500).json({
        error: 'Feedback update failed',
        message: (error as Error).message
      });
    }
  });

  /**
   * Get AI service statistics
   */
  getStats = asyncHandler(async (req: Request, res: Response) => {
    try {
      const stats = {
        claudeService: this.claudeService.getStats(),
        conversationAnalyzer: this.conversationAnalyzer.getStats(),
        intentClassifier: this.intentClassifier.getStats(),
        responseGenerator: this.responseGenerator.getStats(),
        timestamp: new Date().toISOString()
      };

      res.json(stats);

    } catch (error) {
      logger.error('Failed to get AI service stats', {
        error: (error as Error).message
      });

      res.status(500).json({
        error: 'Failed to get statistics',
        message: (error as Error).message
      });
    }
  });

  /**
   * Clear AI service caches
   */
  clearCaches = asyncHandler(async (req: Request, res: Response) => {
    try {
      this.claudeService.clearCache();
      this.conversationAnalyzer.clearCache();
      this.intentClassifier.clearCache();
      this.responseGenerator.clearCache();

      logger.info('All AI service caches cleared');

      res.json({
        success: true,
        message: 'All AI service caches cleared',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Failed to clear AI service caches', {
        error: (error as Error).message
      });

      res.status(500).json({
        error: 'Failed to clear caches',
        message: (error as Error).message
      });
    }
  });

  // Helper methods
  private isBusinessHours(): boolean {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0 = Sunday, 6 = Saturday
    
    // Assume business hours are 8 AM - 6 PM, Monday - Friday
    return day >= 1 && day <= 5 && hour >= 8 && hour < 18;
  }

  private async getBusinessInfo() {
    // This would typically come from database or configuration
    return {
      name: process.env.BUSINESS_NAME || 'Professional Plumbing Services',
      phone: process.env.BUSINESS_PHONE || '(555) 123-4567',
      email: process.env.BUSINESS_EMAIL || 'info@plumbingpro.com',
      address: process.env.BUSINESS_ADDRESS || '123 Main St, City, State 12345',
      serviceArea: process.env.SERVICE_AREA || '25 mile radius',
      businessHours: process.env.BUSINESS_HOURS || 'Monday-Friday 8AM-6PM',
      emergencyAvailable: process.env.EMERGENCY_AVAILABLE === 'true',
      afterHoursContact: process.env.AFTER_HOURS_CONTACT
    };
  }

  private async getBusinessRules() {
    // This would typically come from BusinessRulesService
    return {
      emergencyResponseTime: 30, // minutes
      standardResponseTime: 4, // hours
      includeEmergencyInfo: true,
      includePricingGuidelines: false,
      requireQuoteForWork: true,
      schedulingAdvanceNotice: 1 // days
    };
  }

  private determineUrgency(messageContent: string, intent: PlumbingIntent): UrgencyLevel {
    const emergencyKeywords = ['emergency', 'urgent', 'flooding', 'burst', 'gas leak'];
    const urgentKeywords = ['asap', 'soon', 'today', 'quickly'];
    
    const lowerContent = messageContent.toLowerCase();
    
    if (intent === 'emergency_service' || emergencyKeywords.some(kw => lowerContent.includes(kw))) {
      return 'immediate';
    }
    
    if (urgentKeywords.some(kw => lowerContent.includes(kw))) {
      return 'same_day';
    }
    
    if (lowerContent.includes('week')) {
      return 'within_week';
    }
    
    return 'flexible';
  }

  private determineSentiment(messageContent: string): CustomerSentiment {
    const lowerContent = messageContent.toLowerCase();
    
    const frustratedWords = ['frustrated', 'terrible', 'awful', 'problem', 'issue'];
    const angryWords = ['angry', 'mad', 'ridiculous', 'unacceptable'];
    const worriedWords = ['worried', 'concerned', 'nervous'];
    const positiveWords = ['thank', 'appreciate', 'great', 'excellent'];
    
    if (angryWords.some(word => lowerContent.includes(word))) {
      return 'angry';
    }
    
    if (frustratedWords.some(word => lowerContent.includes(word))) {
      return 'frustrated';
    }
    
    if (worriedWords.some(word => lowerContent.includes(word))) {
      return 'worried';
    }
    
    if (positiveWords.some(word => lowerContent.includes(word))) {
      return 'positive';
    }
    
    return 'neutral';
  }

  private extractBasicInfo(messageContent: string) {
    const addressRegex = /\d+\s+[A-Za-z\s]+(?:street|st|avenue|ave|road|rd|lane|ln|drive|dr|court|ct|way|blvd)/i;
    const phoneRegex = /(\+?1[-.\s]?)?(\([0-9]{3}\)|[0-9]{3})[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/;
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
    
    const extracted: any = {};
    
    const addressMatch = messageContent.match(addressRegex);
    if (addressMatch) {
      extracted.serviceAddress = addressMatch[0];
    }
    
    const phoneMatch = messageContent.match(phoneRegex);
    if (phoneMatch) {
      extracted.contactPhone = phoneMatch[0];
    }
    
    const emailMatch = messageContent.match(emailRegex);
    if (emailMatch) {
      extracted.contactEmail = emailMatch[0];
    }
    
    // Check for budget mentions
    if (messageContent.toLowerCase().includes('budget') || 
        messageContent.toLowerCase().includes('cost') ||
        messageContent.toLowerCase().includes('price')) {
      extracted.budgetMentioned = true;
    }
    
    return extracted;
  }

  private extractEntities(messageContent: string): Record<string, any> {
    const entities: Record<string, any> = {};
    
    // Extract common plumbing entities
    const plumbingTerms = [
      'toilet', 'sink', 'faucet', 'drain', 'pipe', 'water heater', 
      'shower', 'bathtub', 'garbage disposal', 'sump pump'
    ];
    
    const foundTerms = plumbingTerms.filter(term => 
      messageContent.toLowerCase().includes(term.toLowerCase())
    );
    
    if (foundTerms.length > 0) {
      entities.plumbingComponents = foundTerms;
    }
    
    // Extract problem descriptions
    const problemWords = ['leak', 'clog', 'broken', 'not working', 'overflow', 'backup'];
    const foundProblems = problemWords.filter(problem =>
      messageContent.toLowerCase().includes(problem.toLowerCase())
    );
    
    if (foundProblems.length > 0) {
      entities.problemTypes = foundProblems;
    }
    
    return entities;
  }

  private getSuggestedActions(intent: PlumbingIntent): string[] {
    const actionMap: Record<PlumbingIntent, string[]> = {
      emergency_service: ['dispatch_technician', 'call_customer', 'prioritize_response'],
      quote_request: ['schedule_estimate', 'gather_details', 'prepare_pricing'],
      scheduling: ['check_availability', 'confirm_appointment', 'send_reminder'],
      complaint: ['escalate_to_manager', 'schedule_followup', 'document_issue'],
      routine_inquiry: ['provide_information', 'schedule_callback', 'send_brochure'],
      follow_up: ['check_job_status', 'update_customer', 'schedule_next_step'],
      rescheduling: ['check_new_availability', 'confirm_changes', 'update_schedule'],
      payment_inquiry: ['review_billing', 'explain_charges', 'process_payment'],
      service_information: ['provide_details', 'send_information', 'schedule_consultation'],
      appointment_confirmation: ['confirm_details', 'send_reminder', 'prepare_technician'],
      cancellation: ['confirm_cancellation', 'check_cancellation_policy', 'offer_reschedule'],
      warranty_claim: ['review_warranty', 'schedule_inspection', 'process_claim'],
      maintenance_reminder: ['schedule_maintenance', 'review_history', 'prepare_checklist'],
      general_question: ['provide_answer', 'offer_assistance', 'schedule_callback'],
      other: ['manual_review', 'categorize_properly', 'respond_appropriately']
    };
    
    return actionMap[intent] || ['manual_review'];
  }

  private getFollowUpQuestions(intent: PlumbingIntent): string[] {
    const questionMap: Record<PlumbingIntent, string[]> = {
      emergency_service: [
        'Is there immediate safety concern?',
        'Can you shut off the water?',
        'What is your exact location?'
      ],
      quote_request: [
        'What type of plumbing work do you need?',
        'When would you like the work completed?',
        'Have you had an estimate from other contractors?'
      ],
      scheduling: [
        'What days work best for you?',
        'Do you prefer morning or afternoon appointments?',
        'Will someone be home during the service?'
      ],
      complaint: [
        'When did this issue first occur?',
        'What would you like us to do to resolve this?',
        'Can we schedule someone to come back out?'
      ],
      routine_inquiry: [
        'What specific information can I help you with?',
        'Are you planning any plumbing work?',
        'Would you like to schedule a consultation?'
      ],
      follow_up: [
        'How satisfied were you with our service?',
        'Is there anything else you need help with?',
        'Would you recommend us to others?'
      ],
      rescheduling: [
        'What dates would work better for you?',
        'Would you prefer a different time of day?',
        'Is there a specific reason for rescheduling?'
      ],
      payment_inquiry: [
        'Which invoice are you asking about?',
        'What payment method would you prefer?',
        'Do you need a copy of your receipt?'
      ],
      service_information: [
        'What specific service are you interested in?',
        'Is this for preventive maintenance or a current issue?',
        'Would you like a consultation to discuss options?'
      ],
      appointment_confirmation: [
        'Will the original contact person be present?',
        'Are there any access restrictions we should know about?',
        'Do you have any questions before our visit?'
      ],
      cancellation: [
        'Is there a specific reason for cancelling?',
        'Would you like to reschedule for a later date?',
        'Can we help resolve any concerns?'
      ],
      warranty_claim: [
        'When was the original work completed?',
        'Can you describe the issue you are experiencing?',
        'Do you have your service receipt or job number?'
      ],
      maintenance_reminder: [
        'When was your last maintenance service?',
        'Are you experiencing any current issues?',
        'Would you like to schedule your annual maintenance?'
      ],
      general_question: [
        'What type of plumbing issue are you experiencing?',
        'When would be a good time for us to call you back?',
        'Is this for residential or commercial property?'
      ],
      other: [
        'Can you provide more details about your needs?',
        'What would be the best way to contact you?',
        'Is this urgent or can it wait?'
      ]
    };
    
    return questionMap[intent] || [
      'How can we best help you with your plumbing needs?',
      'What additional information can I provide?'
    ];
  }
}

// Validation middleware
export const generateResponseValidation = [
  body('conversationId')
    .isUUID()
    .withMessage('Valid conversation ID is required'),
  body('messageContent')
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Message content is required and must be under 2000 characters'),
  body('context.customerInfo.name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Customer name must be under 100 characters'),
  body('context.isEmergency')
    .optional()
    .isBoolean()
    .withMessage('Emergency flag must be boolean'),
  body('context.businessHours')
    .optional()
    .isBoolean()
    .withMessage('Business hours flag must be boolean')
];

export const analyzeConversationValidation = [
  param('conversationId')
    .isUUID()
    .withMessage('Valid conversation ID is required'),
  query('forceReanalysis')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('Force reanalysis must be true or false')
];

export const classifyIntentValidation = [
  param('messageId')
    .isUUID()
    .withMessage('Valid message ID is required'),
  body('conversationId')
    .isUUID()
    .withMessage('Valid conversation ID is required')
];

export const generateVariationsValidation = [
  body('conversationId')
    .isUUID()
    .withMessage('Valid conversation ID is required'),
  body('messageContent')
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Message content is required and must be under 2000 characters'),
  body('intent')
    .isIn([
      'emergency_service', 'routine_inquiry', 'quote_request', 'scheduling',
      'rescheduling', 'complaint', 'follow_up', 'payment_inquiry',
      'service_information', 'appointment_confirmation', 'cancellation',
      'warranty_claim', 'maintenance_reminder', 'general_question', 'other'
    ])
    .withMessage('Valid intent is required'),
  body('count')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Count must be between 1 and 5'),
  body('varyTone')
    .optional()
    .isBoolean()
    .withMessage('Vary tone must be boolean'),
  body('varyApproach')
    .optional()
    .isBoolean()
    .withMessage('Vary approach must be boolean')
];

export const updateResponseFeedbackValidation = [
  param('responseId')
    .isUUID()
    .withMessage('Valid response ID is required'),
  body('approved')
    .optional()
    .isBoolean()
    .withMessage('Approved must be boolean'),
  body('edited')
    .optional()
    .isBoolean()
    .withMessage('Edited must be boolean'),
  body('finalResponse')
    .optional()
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Final response must be under 1000 characters'),
  body('rating')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Rating must be between 1 and 5'),
  body('improvementNotes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Improvement notes must be under 500 characters'),
  body('editedBy')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Edited by must be under 100 characters')
];