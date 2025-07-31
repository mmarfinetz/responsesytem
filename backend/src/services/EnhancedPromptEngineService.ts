import { DatabaseService } from './DatabaseService';
import { EmergencyRoutingService, EmergencyClassification } from './EmergencyRoutingService';
import { AdvancedCustomerMatchingService } from './AdvancedCustomerMatchingService';
import { DynamicPricingEngine } from './DynamicPricingEngine';
import { PredictiveMaintenanceService } from './PredictiveMaintenanceService';
import { logger } from '../utils/logger';
import { 
  PlumbingIntent, 
  CustomerSentiment, 
  UrgencyLevel,
  ServiceType 
} from '../models/AIModels';
import { Customer, Staff } from '../../shared/types';

export interface EnhancedPromptContext {
  // Core request information
  customerMessage: string;
  intent: PlumbingIntent;
  urgencyLevel: UrgencyLevel;
  customerSentiment: CustomerSentiment;
  isEmergency: boolean;
  
  // Business intelligence integration
  emergencyClassification?: EmergencyClassification;
  customerInsights?: CustomerIntelligence;
  pricingIntelligence?: PricingContext;
  maintenanceRecommendations?: MaintenanceContext;
  
  // Conversation context
  conversationHistory: ConversationMessage[];
  customerRelationships?: RelatedCustomer[];
  seasonalContext: SeasonalFactors;
  marketContext: MarketIntelligence;
  
  // Business context
  businessInfo: BusinessInformation;
  availableStaff?: Staff[];
  currentWorkload?: WorkloadContext;
  
  // Personalization factors
  customerPreferences?: CustomerPreferences;
  communicationStyle?: CommunicationStyleProfile;
  previousInteractions?: InteractionHistory;
}

export interface CustomerIntelligence {
  customerId: string;
  customerType: 'residential' | 'commercial' | 'property_manager';
  relationshipTier: 'new' | 'regular' | 'vip' | 'high_value';
  serviceHistory: ServiceRecord[];
  preferredTechnicians?: string[];
  communicationPreferences: CommunicationPreferences;
  riskFactors: CustomerRiskFactor[];
  lifetimeValue: number;
  satisfaction: CustomerSatisfactionProfile;
  paymentHistory: PaymentProfile;
}

export interface PricingContext {
  serviceType: ServiceType;
  marketRate: number;
  competitivePosition: 'below' | 'at' | 'above';
  demandLevel: 'low' | 'normal' | 'high' | 'peak';
  seasonalAdjustment: number;
  customerPricing: CustomerPricingProfile;
  recommendedQuoteRange: { min: number; max: number };
  valuePropositions: string[];
}

export interface MaintenanceContext {
  predictedIssues: PredictedIssue[];
  preventativeRecommendations: MaintenanceRecommendation[];
  equipmentWarranties: WarrantyInfo[];
  maintenanceHistory: MaintenanceRecord[];
  riskAssessment: MaintenanceRiskProfile;
}

export interface ConversationMessage {
  role: 'customer' | 'business' | 'system';
  content: string;
  timestamp: Date;
  sentiment?: CustomerSentiment;
  intent?: PlumbingIntent;
  metadata?: Record<string, any>;
}

export interface RelatedCustomer {
  customerId: string;
  relationship: 'family' | 'business' | 'property' | 'referral';
  relevance: number;
  sharedServices: string[];
}

export interface SeasonalFactors {
  season: 'winter' | 'spring' | 'summer' | 'fall';
  weatherPattern: string;
  temperatureRange: { min: number; max: number };
  precipitationLevel: 'low' | 'normal' | 'high' | 'extreme';
  seasonalRisks: string[];
  demandFactors: string[];
}

export interface MarketIntelligence {
  competitorActivity: CompetitorInsight[];
  industryTrends: IndustryTrend[];
  pricePositioning: PricePosition;
  marketOpportunities: MarketOpportunity[];
  customerAcquisitionContext: AcquisitionContext;
}

export interface BusinessInformation {
  name: string;
  phone: string;
  email: string;
  address: string;
  serviceArea: string[];
  businessHours: BusinessHours;
  emergencyAvailable: boolean;
  specialties: string[];
  certifications: string[];
  warranties: WarrantyOffering[];
  paymentOptions: PaymentOption[];
  serviceGuarantees: ServiceGuarantee[];
}

export interface WorkloadContext {
  currentJobs: number;
  scheduledJobs: number;
  availableCapacity: number;
  averageResponseTime: number;
  peakHours: boolean;
  resourceConstraints: string[];
}

export interface CustomerPreferences {
  contactMethod: 'call' | 'text' | 'email';
  appointmentTiming: string[];
  servicePreferences: string[];
  communicationFrequency: 'minimal' | 'regular' | 'detailed';
  priceTransparency: 'basic' | 'detailed' | 'comprehensive';
}

export interface CommunicationStyleProfile {
  formality: 'casual' | 'professional' | 'formal';
  detailLevel: 'brief' | 'moderate' | 'comprehensive';
  technicality: 'simple' | 'moderate' | 'technical';
  urgencyTone: 'calm' | 'concerned' | 'urgent';
  personalTouch: 'minimal' | 'moderate' | 'high';
}

export interface InteractionHistory {
  totalInteractions: number;
  recentInteractions: RecentInteraction[];
  commonQuestions: string[];
  resolutionPatterns: ResolutionPattern[];
  satisfactionTrend: SatisfactionTrend;
}

// Enhanced prompt templates with business intelligence
export interface PromptTemplate {
  id: string;
  name: string;
  intent: PlumbingIntent;
  urgencyLevel: UrgencyLevel;
  template: string;
  requiredContext: string[];
  optionalContext: string[];
  businessRules: BusinessRule[];
  personalizationFactors: PersonalizationFactor[];
  qualityChecks: QualityCheck[];
}

export interface BusinessRule {
  condition: string;
  action: string;
  weight: number;
  mandatory: boolean;
}

export interface PersonalizationFactor {
  factor: string;
  weight: number;
  applicableScenarios: string[];
}

export interface QualityCheck {
  check: string;
  threshold: number;
  action: 'warn' | 'block' | 'enhance';
}

export interface GeneratedPrompt {
  prompt: string;
  template: PromptTemplate;
  contextUsed: string[];
  personalizationApplied: PersonalizationFactor[];
  qualityScore: number;
  estimatedTokens: number;
  businessRulesApplied: BusinessRule[];
  confidenceScore: number;
  fallbackReason?: string;
}

export class EnhancedPromptEngineService {
  private templates: Map<string, PromptTemplate> = new Map();
  private contextProviders: Map<string, ContextProvider> = new Map();
  
  constructor(
    private db: DatabaseService,
    private emergencyRouting: EmergencyRoutingService,
    private customerMatching: AdvancedCustomerMatchingService,
    private pricingEngine: DynamicPricingEngine,
    private maintenance: PredictiveMaintenanceService
  ) {
    this.initializePromptTemplates();
    this.initializeContextProviders();
  }

  /**
   * Generate context-aware prompt with business intelligence integration
   */
  async generateEnhancedPrompt(context: EnhancedPromptContext): Promise<GeneratedPrompt> {
    try {
      const startTime = Date.now();
      
      logger.info('Generating enhanced prompt', {
        intent: context.intent,
        urgency: context.urgencyLevel,
        hasCustomerInsights: !!context.customerInsights,
        isEmergency: context.isEmergency
      });

      // 1. Select optimal prompt template
      const template = await this.selectOptimalTemplate(context);
      
      // 2. Enrich context with business intelligence
      const enrichedContext = await this.enrichContextWithBusinessIntelligence(context);
      
      // 3. Apply personalization
      const personalizedContext = await this.applyPersonalization(enrichedContext);
      
      // 4. Generate prompt from template
      const generatedPrompt = await this.generateFromTemplate(template, personalizedContext);
      
      // 5. Apply quality enhancements
      const enhancedPrompt = await this.applyQualityEnhancements(generatedPrompt, template, personalizedContext);
      
      // 6. Validate and score
      const finalPrompt = await this.validateAndScore(enhancedPrompt, template, personalizedContext);

      const processingTime = Date.now() - startTime;
      
      logger.info('Enhanced prompt generated successfully', {
        templateId: template.id,
        qualityScore: finalPrompt.qualityScore,
        estimatedTokens: finalPrompt.estimatedTokens,
        processingTimeMs: processingTime
      });

      // Log for continuous improvement
      await this.logPromptGeneration(context, finalPrompt, processingTime);

      return finalPrompt;

    } catch (error) {
      logger.error('Enhanced prompt generation failed', {
        intent: context.intent,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Return fallback prompt
      return this.generateFallbackPrompt(context, error);
    }
  }

  /**
   * Generate service-specific prompts based on business context
   */
  async generateServiceSpecificPrompt(
    serviceType: ServiceType,
    context: Partial<EnhancedPromptContext>
  ): Promise<GeneratedPrompt> {
    
    const serviceTemplates = {
      emergency: 'emergency_service_comprehensive',
      routine: 'routine_service_detailed',
      quote: 'quote_generation_intelligent',
      maintenance: 'maintenance_advisory_expert',
      follow_up: 'follow_up_personalized'
    };

    const templateId = serviceTemplates[serviceType] || 'general_service_enhanced';
    const template = this.templates.get(templateId);
    
    if (!template) {
      throw new Error(`Service-specific template not found: ${templateId}`);
    }

    // Build enhanced context for service type
    const enhancedContext: EnhancedPromptContext = {
      customerMessage: context.customerMessage || '',
      intent: this.deriveIntentFromService(serviceType),
      urgencyLevel: this.deriveUrgencyFromService(serviceType),
      customerSentiment: context.customerSentiment || 'neutral',
      isEmergency: serviceType === 'emergency',
      conversationHistory: context.conversationHistory || [],
      seasonalContext: context.seasonalContext || await this.getSeasonalContext(),
      marketContext: context.marketContext || await this.getMarketContext(),
      businessInfo: context.businessInfo || await this.getBusinessInfo(),
      ...context
    };

    return this.generateEnhancedPrompt(enhancedContext);
  }

  /**
   * Generate sentiment-adaptive responses
   */
  async generateSentimentAdaptivePrompt(
    baseSentiment: CustomerSentiment,
    context: EnhancedPromptContext
  ): Promise<GeneratedPrompt> {
    
    // Adjust communication style based on sentiment
    const sentimentAdjustments = {
      frustrated: {
        tone: 'empathetic',
        urgency: 'immediate',
        detailLevel: 'comprehensive',
        personalTouch: 'high'
      },
      concerned: {
        tone: 'reassuring',
        urgency: 'prompt',
        detailLevel: 'detailed',
        personalTouch: 'moderate'
      },
      satisfied: {
        tone: 'professional',
        urgency: 'standard',
        detailLevel: 'moderate',
        personalTouch: 'minimal'
      },
      angry: {
        tone: 'apologetic',
        urgency: 'immediate',
        detailLevel: 'comprehensive',
        personalTouch: 'high'
      },
      neutral: {
        tone: 'friendly',
        urgency: 'standard',
        detailLevel: 'moderate',
        personalTouch: 'moderate'
      }
    };

    const adjustments = sentimentAdjustments[baseSentiment] || sentimentAdjustments.neutral;
    
    // Apply sentiment-specific adjustments to context
    const adaptedContext: EnhancedPromptContext = {
      ...context,
      communicationStyle: {
        formality: adjustments.tone === 'formal' ? 'formal' : 'professional',
        detailLevel: adjustments.detailLevel as any,
        technicality: 'simple',
        urgencyTone: adjustments.urgency as any,
        personalTouch: adjustments.personalTouch as any
      }
    };

    return this.generateEnhancedPrompt(adaptedContext);
  }

  // Private methods

  private initializePromptTemplates(): void {
    // Emergency service template with business intelligence
    this.templates.set('emergency_service_comprehensive', {
      id: 'emergency_service_comprehensive',
      name: 'Emergency Service - Comprehensive Response',
      intent: 'emergency_service',
      urgencyLevel: 'critical',
      template: `
EMERGENCY RESPONSE PROTOCOL - BUSINESS INTELLIGENCE ENHANCED

CUSTOMER EMERGENCY CLASSIFICATION:
- Severity: {{emergencyClassification.severity}}
- Emergency Type: {{emergencyClassification.emergencyType}}
- Confidence: {{emergencyClassification.confidence}}
- Key Indicators: {{emergencyClassification.keyIndicators}}

CUSTOMER INTELLIGENCE:
{{#if customerInsights}}
- Customer Type: {{customerInsights.customerType}}
- Relationship Tier: {{customerInsights.relationshipTier}}
- Lifetime Value: $\{\{customerInsights.lifetimeValue\}\}
- Previous Emergencies: {{customerInsights.serviceHistory.emergencyCount}}
- Preferred Technician: {{customerInsights.preferredTechnicians}}
- Risk Factors: {{customerInsights.riskFactors}}
{{/if}}

OPTIMAL RESPONSE STRATEGY:
{{#if emergencyClassification.estimatedResponseTime}}
- Estimated Response Time: {{emergencyClassification.estimatedResponseTime}} minutes
{{/if}}
- Suggested Actions: {{emergencyClassification.suggestedActions}}
- Escalation Required: {{emergencyClassification.escalationRequired}}

SEASONAL/WEATHER CONSIDERATIONS:
- Season: {{seasonalContext.season}}
- Weather Pattern: {{seasonalContext.weatherPattern}}
- Seasonal Risks: {{seasonalContext.seasonalRisks}}

PERSONALIZED COMMUNICATION:
{{#if customerPreferences}}
- Preferred Contact: {{customerPreferences.contactMethod}}
- Communication Style: {{communicationStyle.formality}}
{{/if}}

BUSINESS CONTEXT:
- Current Workload: {{#if currentWorkload}}{{currentWorkload.currentJobs}} active jobs{{else}}Standard capacity{{/if}}
- Available Emergency Staff: {{availableStaff.length}} technicians
- Service Area: {{businessInfo.serviceArea}}

Generate a response that:
1. Immediately acknowledges the emergency with appropriate urgency
2. Provides specific timeline based on severity and availability
3. Includes safety instructions if relevant to emergency type
4. Uses customer's preferred communication style
5. Leverages relationship history for personalization
6. Includes relevant business intelligence context
7. Follows emergency escalation protocols if required

The response should be professional, empathetic, and action-oriented while demonstrating deep understanding of the customer's situation and history.
      `,
      requiredContext: ['emergencyClassification', 'businessInfo'],
      optionalContext: ['customerInsights', 'seasonalContext', 'availableStaff'],
      businessRules: [
        {
          condition: 'emergencyClassification.severity === "critical"',
          action: 'include_immediate_dispatch_confirmation',
          weight: 1.0,
          mandatory: true
        },
        {
          condition: 'customerInsights.relationshipTier === "vip"',
          action: 'add_vip_treatment_language',
          weight: 0.8,
          mandatory: false
        }
      ],
      personalizationFactors: [
        {
          factor: 'customer_history',
          weight: 0.3,
          applicableScenarios: ['repeat_customer', 'vip_customer']
        },
        {
          factor: 'communication_preference',
          weight: 0.4,
          applicableScenarios: ['all']
        }
      ],
      qualityChecks: [
        {
          check: 'includes_response_time',
          threshold: 1.0,
          action: 'block'
        },
        {
          check: 'acknowledges_urgency',
          threshold: 1.0,
          action: 'block'
        }
      ]
    });

    // Routine service template with intelligent recommendations
    this.templates.set('routine_service_detailed', {
      id: 'routine_service_detailed',
      name: 'Routine Service - Intelligent Advisory',
      intent: 'service_request',
      urgencyLevel: 'medium',
      template: `
ROUTINE SERVICE ADVISORY - BUSINESS INTELLIGENCE ENHANCED

CUSTOMER PROFILE:
{{#if customerInsights}}
- Customer Since: {{customerInsights.relationshipStartDate}}
- Service History: {{customerInsights.serviceHistory.length}} previous services
- Satisfaction Score: {{customerInsights.satisfaction.averageScore}}/5
- Payment Profile: {{customerInsights.paymentHistory.rating}}
{{/if}}

PREDICTIVE MAINTENANCE INSIGHTS:
{{#if maintenanceRecommendations}}
- Predicted Issues: {{maintenanceRecommendations.predictedIssues}}
- Preventative Recommendations: {{maintenanceRecommendations.preventativeRecommendations}}
- Equipment Warranties: {{maintenanceRecommendations.equipmentWarranties}}
{{/if}}

PRICING INTELLIGENCE:
{{#if pricingIntelligence}}
- Market Position: {{pricingIntelligence.competitivePosition}} market rate
- Demand Level: {{pricingIntelligence.demandLevel}}
- Recommended Quote Range: $\{\{pricingIntelligence.recommendedQuoteRange.min\}\} - $\{\{pricingIntelligence.recommendedQuoteRange.max\}\}
- Value Propositions: {{pricingIntelligence.valuePropositions}}
{{/if}}

SEASONAL CONTEXT:
- Current Season: {{seasonalContext.season}}
- Relevant Risks: {{seasonalContext.seasonalRisks}}
- Demand Factors: {{seasonalContext.demandFactors}}

PERSONALIZED APPROACH:
{{#if customerPreferences}}
- Preferred Appointment Times: {{customerPreferences.appointmentTiming}}
- Communication Preference: {{customerPreferences.communicationFrequency}}
- Price Transparency Level: {{customerPreferences.priceTransparency}}
{{/if}}

Generate a response that:
1. Acknowledges their specific service request
2. Incorporates relevant service history and relationship context
3. Provides intelligent recommendations based on predictive analysis
4. Includes appropriate pricing guidance with market context
5. Suggests preventative measures based on seasonal factors
6. Uses their preferred communication style and detail level
7. Offers value-added services that align with their profile

The response should demonstrate expertise while building on the established customer relationship.
      `,
      requiredContext: ['businessInfo'],
      optionalContext: ['customerInsights', 'maintenanceRecommendations', 'pricingIntelligence', 'seasonalContext'],
      businessRules: [
        {
          condition: 'customerInsights.satisfaction.averageScore < 3',
          action: 'include_satisfaction_recovery_language',
          weight: 0.9,
          mandatory: true
        },
        {
          condition: 'maintenanceRecommendations.predictedIssues.length > 0',
          action: 'highlight_preventative_opportunities',
          weight: 0.7,
          mandatory: false
        }
      ],
      personalizationFactors: [
        {
          factor: 'service_history',
          weight: 0.4,
          applicableScenarios: ['repeat_customer']
        },
        {
          factor: 'communication_style',
          weight: 0.3,
          applicableScenarios: ['all']
        }
      ],
      qualityChecks: [
        {
          check: 'includes_personalization',
          threshold: 0.7,
          action: 'enhance'
        },
        {
          check: 'provides_value_add',
          threshold: 0.6,
          action: 'warn'
        }
      ]
    });

    // Quote generation template with intelligent pricing
    this.templates.set('quote_generation_intelligent', {
      id: 'quote_generation_intelligent',
      name: 'Quote Generation - Intelligent Pricing',
      intent: 'quote_request',
      urgencyLevel: 'medium',
      template: `
INTELLIGENT QUOTE GENERATION - BUSINESS INTELLIGENCE ENHANCED

CUSTOMER CONTEXT:
{{#if customerInsights}}
- Customer Value Tier: {{customerInsights.relationshipTier}}
- Historical Project Value: $\{\{customerInsights.averageProjectValue\}\}
- Payment Terms: {{customerInsights.paymentHistory.preferredTerms}}
- Decision Timeline: {{customerInsights.decisionPatterns.averageDays}} days
{{/if}}

MARKET INTELLIGENCE:
{{#if pricingIntelligence}}
- Current Market Rate: $\{\{pricingIntelligence.marketRate\}\}
- Our Position: {{pricingIntelligence.competitivePosition}} market
- Demand Level: {{pricingIntelligence.demandLevel}}
- Seasonal Adjustment: {{pricingIntelligence.seasonalAdjustment}}%
{{/if}}

COMPETITIVE ADVANTAGES:
- Certifications: {{businessInfo.certifications}}
- Warranties: {{businessInfo.warranties}}
- Service Guarantees: {{businessInfo.serviceGuarantees}}
- Payment Options: {{businessInfo.paymentOptions}}

INTELLIGENT RECOMMENDATIONS:
{{#if maintenanceRecommendations}}
- Related Services: {{maintenanceRecommendations.relatedOpportunities}}
- Future Maintenance: {{maintenanceRecommendations.upcomingNeeds}}
{{/if}}

Generate a quote response that:
1. Acknowledges their specific project requirements
2. Provides transparent pricing with market context justification
3. Highlights unique value propositions and competitive advantages
4. Includes intelligent upselling opportunities based on analysis
5. Addresses their decision-making timeline and preferences
6. Offers flexible payment options appropriate to their profile
7. Uses pricing transparency level matching their preferences

The response should build confidence in our expertise while demonstrating value beyond just price.
      `,
      requiredContext: ['businessInfo'],
      optionalContext: ['customerInsights', 'pricingIntelligence', 'maintenanceRecommendations'],
      businessRules: [
        {
          condition: 'pricingIntelligence.competitivePosition === "above"',
          action: 'emphasize_value_justification',
          weight: 1.0,
          mandatory: true
        },
        {
          condition: 'customerInsights.relationshipTier === "price_sensitive"',
          action: 'highlight_cost_savings_opportunities',
          weight: 0.8,
          mandatory: false
        }
      ],
      personalizationFactors: [
        {
          factor: 'pricing_preference',
          weight: 0.5,
          applicableScenarios: ['quote_request']
        },
        {
          factor: 'decision_timeline',
          weight: 0.3,
          applicableScenarios: ['quote_request']
        }
      ],
      qualityChecks: [
        {
          check: 'includes_pricing_justification',
          threshold: 0.8,
          action: 'enhance'
        },
        {
          check: 'addresses_value_proposition',
          threshold: 0.7,
          action: 'warn'
        }
      ]
    });
  }

  private initializeContextProviders(): void {
    this.contextProviders.set('customer_intelligence', new CustomerIntelligenceProvider(this.customerMatching));
    this.contextProviders.set('pricing_intelligence', new PricingIntelligenceProvider(this.pricingEngine));
    this.contextProviders.set('maintenance_intelligence', new MaintenanceIntelligenceProvider(this.maintenance));
    this.contextProviders.set('seasonal_context', new SeasonalContextProvider());
    this.contextProviders.set('market_intelligence', new MarketIntelligenceProvider());
  }

  private async selectOptimalTemplate(context: EnhancedPromptContext): Promise<PromptTemplate> {
    // Template selection based on intent, urgency, and context
    const intentTemplateMap = {
      'emergency_service': 'emergency_service_comprehensive',
      'service_request': 'routine_service_detailed',
      'quote_request': 'quote_generation_intelligent',
      'maintenance_inquiry': 'maintenance_advisory_expert',
      'follow_up': 'follow_up_personalized',
      'complaint': 'complaint_resolution_expert'
    };

    const baseTemplateId = intentTemplateMap[context.intent] || 'general_service_enhanced';
    let template = this.templates.get(baseTemplateId);

    if (!template) {
      // Fallback to general template
      template = this.getGeneralTemplate();
    }

    // Adjust template based on urgency level
    if (context.urgencyLevel === 'critical' && !baseTemplateId.includes('emergency')) {
      const emergencyTemplate = this.templates.get('emergency_service_comprehensive');
      if (emergencyTemplate) {
        template = emergencyTemplate;
      }
    }

    return template;
  }

  private async enrichContextWithBusinessIntelligence(
    context: EnhancedPromptContext
  ): Promise<EnhancedPromptContext> {
    
    const enrichedContext = { ...context };

    try {
      // Enrich with customer intelligence if customer ID available
      if (context.customerInsights?.customerId) {
        const customerProvider = this.contextProviders.get('customer_intelligence') as CustomerIntelligenceProvider;
        enrichedContext.customerInsights = await customerProvider.getCustomerIntelligence(
          context.customerInsights.customerId
        );
      }

      // Enrich with pricing intelligence
      if (context.intent === 'quote_request' || context.intent === 'service_request') {
        const pricingProvider = this.contextProviders.get('pricing_intelligence') as PricingIntelligenceProvider;
        enrichedContext.pricingIntelligence = await pricingProvider.getPricingContext(
          context.intent,
          context.customerInsights
        );
      }

      // Enrich with maintenance recommendations
      if (context.customerInsights?.customerId) {
        const maintenanceProvider = this.contextProviders.get('maintenance_intelligence') as MaintenanceIntelligenceProvider;
        enrichedContext.maintenanceRecommendations = await maintenanceProvider.getMaintenanceContext(
          context.customerInsights.customerId
        );
      }

      // Enrich with seasonal context
      const seasonalProvider = this.contextProviders.get('seasonal_context') as SeasonalContextProvider;
      enrichedContext.seasonalContext = await seasonalProvider.getSeasonalContext();

      // Enrich with market intelligence
      const marketProvider = this.contextProviders.get('market_intelligence') as MarketIntelligenceProvider;
      enrichedContext.marketContext = await marketProvider.getMarketContext();

    } catch (error) {
      logger.warn('Failed to enrich context with business intelligence', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }

    return enrichedContext;
  }

  private async applyPersonalization(context: EnhancedPromptContext): Promise<EnhancedPromptContext> {
    const personalizedContext = { ...context };

    // Apply communication style personalization
    if (context.customerInsights) {
      personalizedContext.communicationStyle = this.deriveCommunicationStyle(
        context.customerInsights,
        context.customerSentiment
      );
    }

    // Apply content personalization based on customer preferences
    if (context.customerInsights?.communicationPreferences) {
      personalizedContext.customerPreferences = this.deriveCustomerPreferences(
        context.customerInsights.communicationPreferences
      );
    }

    return personalizedContext;
  }

  private async generateFromTemplate(
    template: PromptTemplate,
    context: EnhancedPromptContext
  ): Promise<string> {
    
    // Simple template engine (in production, use Handlebars or similar)
    let prompt = template.template;

    // Replace template variables with context values
    prompt = this.replaceTemplateVariables(prompt, context);

    return prompt;
  }

  private async applyQualityEnhancements(
    prompt: string,
    template: PromptTemplate,
    context: EnhancedPromptContext
  ): Promise<string> {
    
    let enhancedPrompt = prompt;

    // Apply business rules
    for (const rule of template.businessRules) {
      if (this.evaluateBusinessRule(rule, context)) {
        enhancedPrompt = this.applyBusinessRuleAction(enhancedPrompt, rule);
      }
    }

    // Apply personalization factors
    for (const factor of template.personalizationFactors) {
      if (this.shouldApplyPersonalizationFactor(factor, context)) {
        enhancedPrompt = this.applyPersonalizationFactor(enhancedPrompt, factor, context);
      }
    }

    return enhancedPrompt;
  }

  private async validateAndScore(
    prompt: string,
    template: PromptTemplate,
    context: EnhancedPromptContext
  ): Promise<GeneratedPrompt> {
    
    let qualityScore = 0.8; // Base score
    const contextUsed: string[] = [];
    const businessRulesApplied: BusinessRule[] = [];
    const personalizationApplied: PersonalizationFactor[] = [];

    // Validate quality checks
    for (const check of template.qualityChecks) {
      const checkResult = this.performQualityCheck(check, prompt, context);
      if (checkResult.passed) {
        qualityScore += 0.05;
      } else if (check.action === 'block') {
        throw new Error(`Quality check failed: ${check.check}`);
      }
    }

    // Estimate token count
    const estimatedTokens = this.estimateTokenCount(prompt);

    return {
      prompt,
      template,
      contextUsed,
      personalizationApplied,
      qualityScore: Math.min(1.0, qualityScore),
      estimatedTokens,
      businessRulesApplied,
      confidenceScore: this.calculateConfidenceScore(prompt, context),
    };
  }

  // Helper methods (simplified implementations)
  private deriveIntentFromService(serviceType: ServiceType): PlumbingIntent {
    const mapping = {
      emergency: 'emergency_service',
      routine: 'service_request',
      quote: 'quote_request',
      maintenance: 'maintenance_inquiry',
      follow_up: 'follow_up'
    };
    return mapping[serviceType] || 'service_request';
  }

  private deriveUrgencyFromService(serviceType: ServiceType): UrgencyLevel {
    const mapping = {
      emergency: 'critical',
      routine: 'medium',
      quote: 'low',
      maintenance: 'medium',
      follow_up: 'low'
    };
    return mapping[serviceType] || 'medium';
  }

  private async getSeasonalContext(): Promise<SeasonalFactors> {
    const now = new Date();
    const month = now.getMonth();
    
    let season: 'winter' | 'spring' | 'summer' | 'fall';
    if (month >= 2 && month <= 4) season = 'spring';
    else if (month >= 5 && month <= 7) season = 'summer';
    else if (month >= 8 && month <= 10) season = 'fall';
    else season = 'winter';

    return {
      season,
      weatherPattern: 'normal',
      temperatureRange: { min: 20, max: 80 },
      precipitationLevel: 'normal',
      seasonalRisks: this.getSeasonalRisks(season),
      demandFactors: this.getSeasonalDemandFactors(season)
    };
  }

  private async getMarketContext(): Promise<MarketIntelligence> {
    return {
      competitorActivity: [],
      industryTrends: [],
      pricePositioning: { position: 'competitive', confidence: 0.8 },
      marketOpportunities: [],
      customerAcquisitionContext: { source: 'organic', confidence: 0.9 }
    };
  }

  private async getBusinessInfo(): Promise<BusinessInformation> {
    // In production, this would fetch from database
    return {
      name: 'Professional Plumbing Services',
      phone: '(555) 123-4567',
      email: 'service@plumbingpro.com',
      address: '123 Main St, City, State',
      serviceArea: ['City', 'Surrounding Areas'],
      businessHours: { 
        monday: '8:00 AM - 6:00 PM',
        tuesday: '8:00 AM - 6:00 PM',
        wednesday: '8:00 AM - 6:00 PM',
        thursday: '8:00 AM - 6:00 PM',
        friday: '8:00 AM - 6:00 PM',
        saturday: '9:00 AM - 4:00 PM',
        sunday: 'Emergency Only'
      },
      emergencyAvailable: true,
      specialties: ['Emergency Repairs', 'Water Heaters', 'Drain Cleaning', 'Pipe Installation'],
      certifications: ['Licensed', 'Bonded', 'Insured'],
      warranties: [{ type: 'Labor', duration: '1 year' }, { type: 'Parts', duration: '2 years' }],
      paymentOptions: [{ type: 'Credit Card' }, { type: 'Check' }, { type: 'Financing Available' }],
      serviceGuarantees: [{ type: 'Satisfaction Guarantee', description: '100% satisfaction or we return' }]
    };
  }

  private deriveCommunicationStyle(
    customerInsights: CustomerIntelligence,
    sentiment: CustomerSentiment
  ): CommunicationStyleProfile {
    return {
      formality: customerInsights.customerType === 'commercial' ? 'professional' : 'casual',
      detailLevel: customerInsights.relationshipTier === 'vip' ? 'comprehensive' : 'moderate',
      technicality: 'simple',
      urgencyTone: sentiment === 'frustrated' || sentiment === 'angry' ? 'urgent' : 'calm',
      personalTouch: customerInsights.relationshipTier === 'vip' ? 'high' : 'moderate'
    };
  }

  private deriveCustomerPreferences(
    commPrefs: CommunicationPreferences
  ): CustomerPreferences {
    return {
      contactMethod: commPrefs.preferredChannel || 'text',
      appointmentTiming: commPrefs.preferredTimes || [],
      servicePreferences: [],
      communicationFrequency: commPrefs.frequency || 'regular',
      priceTransparency: 'detailed'
    };
  }

  private replaceTemplateVariables(template: string, context: EnhancedPromptContext): string {
    // Simple variable replacement (in production, use a proper template engine)
    let result = template;
    
    // Replace simple variables
    result = result.replace(/\{\{customerMessage\}\}/g, context.customerMessage);
    result = result.replace(/\{\{intent\}\}/g, context.intent);
    result = result.replace(/\{\{urgencyLevel\}\}/g, context.urgencyLevel);
    
    // Handle conditional blocks and object properties
    // This is a simplified implementation - use Handlebars or similar in production
    
    return result;
  }

  private evaluateBusinessRule(rule: BusinessRule, context: EnhancedPromptContext): boolean {
    // Simple rule evaluation (in production, use a proper rule engine)
    try {
      // This would use a proper rule evaluation engine
      return true; // Placeholder
    } catch (error) {
      return false;
    }
  }

  private applyBusinessRuleAction(prompt: string, rule: BusinessRule): string {
    // Apply business rule action to prompt
    return prompt; // Placeholder implementation
  }

  private shouldApplyPersonalizationFactor(
    factor: PersonalizationFactor,
    context: EnhancedPromptContext
  ): boolean {
    return factor.applicableScenarios.includes('all') || 
           factor.applicableScenarios.includes(context.intent);
  }

  private applyPersonalizationFactor(
    prompt: string,
    factor: PersonalizationFactor,
    context: EnhancedPromptContext
  ): string {
    // Apply personalization factor to prompt
    return prompt; // Placeholder implementation
  }

  private performQualityCheck(
    check: QualityCheck,
    prompt: string,
    context: EnhancedPromptContext
  ): { passed: boolean; score: number } {
    // Perform quality check on generated prompt
    return { passed: true, score: 0.9 }; // Placeholder implementation
  }

  private estimateTokenCount(prompt: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(prompt.length / 4);
  }

  private calculateConfidenceScore(prompt: string, context: EnhancedPromptContext): number {
    let confidence = 0.8; // Base confidence
    
    // Increase confidence based on available context
    if (context.customerInsights) confidence += 0.1;
    if (context.emergencyClassification) confidence += 0.05;
    if (context.pricingIntelligence) confidence += 0.05;
    
    return Math.min(1.0, confidence);
  }

  private getSeasonalRisks(season: string): string[] {
    const risks = {
      winter: ['Frozen pipes', 'Ice dams', 'Heating system overload'],
      spring: ['Flooding', 'Sump pump issues', 'Tree root intrusion'],
      summer: ['High water usage', 'Irrigation problems', 'AC condensation'],
      fall: ['Leaf clogs', 'Pre-winter maintenance', 'Outdoor fixture winterization']
    };
    return risks[season as keyof typeof risks] || [];
  }

  private getSeasonalDemandFactors(season: string): string[] {
    const factors = {
      winter: ['Emergency heating', 'Frozen pipe repairs'],
      spring: ['Spring cleaning', 'System tune-ups'],
      summer: ['High usage strain', 'Vacation preparations'],
      fall: ['Winter preparation', 'Maintenance before cold weather']
    };
    return factors[season as keyof typeof factors] || [];
  }

  private getGeneralTemplate(): PromptTemplate {
    return {
      id: 'general_service_enhanced',
      name: 'General Service - Enhanced',
      intent: 'service_request',
      urgencyLevel: 'medium',
      template: 'Thank you for contacting {{businessInfo.name}}. We understand your plumbing needs and are here to help with professional, reliable service.',
      requiredContext: ['businessInfo'],
      optionalContext: [],
      businessRules: [],
      personalizationFactors: [],
      qualityChecks: []
    };
  }

  private generateFallbackPrompt(
    context: EnhancedPromptContext,
    error: any
  ): GeneratedPrompt {
    const fallbackTemplate = this.getGeneralTemplate();
    
    return {
      prompt: `Thank you for contacting us. We understand your ${context.intent} request and will respond appropriately. Our team is here to help with professional plumbing services.`,
      template: fallbackTemplate,
      contextUsed: [],
      personalizationApplied: [],
      qualityScore: 0.5,
      estimatedTokens: 30,
      businessRulesApplied: [],
      confidenceScore: 0.3,
      fallbackReason: `Prompt generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }

  private async logPromptGeneration(
    context: EnhancedPromptContext,
    result: GeneratedPrompt,
    processingTime: number
  ): Promise<void> {
    try {
      const knex = await this.db.getKnex();
      
      await knex('ai_prompt_generation_logs').insert({
        id: `pgl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        intent: context.intent,
        urgencyLevel: context.urgencyLevel,
        templateId: result.template.id,
        qualityScore: result.qualityScore,
        confidenceScore: result.confidenceScore,
        estimatedTokens: result.estimatedTokens,
        processingTimeMs: processingTime,
        contextUsed: JSON.stringify(result.contextUsed),
        personalizationApplied: JSON.stringify(result.personalizationApplied),
        createdAt: new Date()
      });
    } catch (error) {
      logger.warn('Failed to log prompt generation', { error });
    }
  }
}

// Context provider interfaces and implementations
abstract class ContextProvider {
  abstract getContext(params: any): Promise<any>;
}

class CustomerIntelligenceProvider extends ContextProvider {
  constructor(private customerMatching: AdvancedCustomerMatchingService) {
    super();
  }

  async getCustomerIntelligence(customerId: string): Promise<CustomerIntelligence> {
    // Implementation would use AdvancedCustomerMatchingService
    return {
      customerId,
      customerType: 'residential',
      relationshipTier: 'regular',
      serviceHistory: [],
      communicationPreferences: { preferredChannel: 'text', frequency: 'regular', preferredTimes: [] },
      riskFactors: [],
      lifetimeValue: 0,
      satisfaction: { averageScore: 4.5, trendDirection: 'stable', lastUpdated: new Date() },
      paymentHistory: { rating: 'excellent', preferredTerms: 'net_30' }
    };
  }

  async getContext(customerId: string): Promise<CustomerIntelligence> {
    return this.getCustomerIntelligence(customerId);
  }
}

class PricingIntelligenceProvider extends ContextProvider {
  constructor(private pricingEngine: DynamicPricingEngine) {
    super();
  }

  async getPricingContext(serviceType: string, customerInsights?: CustomerIntelligence): Promise<PricingContext> {
    // Implementation would use DynamicPricingEngine
    return {
      serviceType: serviceType as ServiceType,
      marketRate: 150,
      competitivePosition: 'at',
      demandLevel: 'normal',
      seasonalAdjustment: 0,
      customerPricing: { tier: 'standard', discountEligible: false },
      recommendedQuoteRange: { min: 120, max: 180 },
      valuePropositions: ['Licensed and insured', '24/7 emergency service', 'Satisfaction guarantee']
    };
  }

  async getContext(params: { serviceType: string; customerInsights?: CustomerIntelligence }): Promise<PricingContext> {
    return this.getPricingContext(params.serviceType, params.customerInsights);
  }
}

class MaintenanceIntelligenceProvider extends ContextProvider {
  constructor(private maintenance: PredictiveMaintenanceService) {
    super();
  }

  async getMaintenanceContext(customerId: string): Promise<MaintenanceContext> {
    // Implementation would use PredictiveMaintenanceService
    return {
      predictedIssues: [],
      preventativeRecommendations: [],
      equipmentWarranties: [],
      maintenanceHistory: [],
      riskAssessment: { overallRisk: 'low', factors: [] }
    };
  }

  async getContext(customerId: string): Promise<MaintenanceContext> {
    return this.getMaintenanceContext(customerId);
  }
}

class SeasonalContextProvider extends ContextProvider {
  async getSeasonalContext(): Promise<SeasonalFactors> {
    const now = new Date();
    const month = now.getMonth();
    
    let season: 'winter' | 'spring' | 'summer' | 'fall';
    if (month >= 2 && month <= 4) season = 'spring';
    else if (month >= 5 && month <= 7) season = 'summer';
    else if (month >= 8 && month <= 10) season = 'fall';
    else season = 'winter';

    return {
      season,
      weatherPattern: 'normal',
      temperatureRange: { min: 20, max: 80 },
      precipitationLevel: 'normal',
      seasonalRisks: [],
      demandFactors: []
    };
  }

  async getContext(): Promise<SeasonalFactors> {
    return this.getSeasonalContext();
  }
}

class MarketIntelligenceProvider extends ContextProvider {
  async getMarketContext(): Promise<MarketIntelligence> {
    return {
      competitorActivity: [],
      industryTrends: [],
      pricePositioning: { position: 'competitive', confidence: 0.8 },
      marketOpportunities: [],
      customerAcquisitionContext: { source: 'organic', confidence: 0.9 }
    };
  }

  async getContext(): Promise<MarketIntelligence> {
    return this.getMarketContext();
  }
}

// Supporting type definitions
interface ServiceRecord {
  id: string;
  date: Date;
  type: ServiceType;
  cost: number;
  satisfaction: number;
  technician: string;
}

interface CommunicationPreferences {
  preferredChannel: 'call' | 'text' | 'email';
  frequency: 'minimal' | 'regular' | 'detailed';
  preferredTimes: string[];
}

interface CustomerRiskFactor {
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
}

interface CustomerSatisfactionProfile {
  averageScore: number;
  trendDirection: 'improving' | 'stable' | 'declining';
  lastUpdated: Date;
}

interface PaymentProfile {
  rating: 'excellent' | 'good' | 'fair' | 'poor';
  preferredTerms: string;
}

interface CustomerPricingProfile {
  tier: 'standard' | 'preferred' | 'vip';
  discountEligible: boolean;
}

interface PredictedIssue {
  type: string;
  probability: number;
  timeline: string;
  preventative: string[];
}

interface MaintenanceRecommendation {
  service: string;
  priority: 'low' | 'medium' | 'high';
  timeline: string;
  estimatedCost: number;
}

interface WarrantyInfo {
  equipment: string;
  expiryDate: Date;
  coverage: string;
}

interface MaintenanceRecord {
  date: Date;
  service: string;
  cost: number;
  nextDue: Date;
}

interface MaintenanceRiskProfile {
  overallRisk: 'low' | 'medium' | 'high';
  factors: string[];
}

interface CompetitorInsight {
  competitor: string;
  activity: string;
  impact: 'positive' | 'negative' | 'neutral';
}

interface IndustryTrend {
  trend: string;
  direction: 'up' | 'down' | 'stable';
  impact: string;
}

interface PricePosition {
  position: 'below' | 'competitive' | 'above';
  confidence: number;
}

interface MarketOpportunity {
  opportunity: string;
  potential: 'low' | 'medium' | 'high';
  timeline: string;
}

interface AcquisitionContext {
  source: string;
  confidence: number;
}

interface BusinessHours {
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
}

interface WarrantyOffering {
  type: string;
  duration: string;
}

interface PaymentOption {
  type: string;
}

interface ServiceGuarantee {
  type: string;
  description: string;
}

interface RecentInteraction {
  date: Date;
  channel: string;
  summary: string;
  outcome: string;
}

interface ResolutionPattern {
  issue: string;
  resolution: string;
  frequency: number;
}

interface SatisfactionTrend {
  direction: 'improving' | 'stable' | 'declining';
  recentScore: number;
  changePercent: number;
}

export default EnhancedPromptEngineService;