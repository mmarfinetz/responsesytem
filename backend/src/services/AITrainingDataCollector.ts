import { DatabaseService } from './DatabaseService';
import { AIQualityAssessmentService, QualityAssessmentResult } from './AIQualityAssessmentService';
import { ConversationContextManager } from './ConversationContextManager';
import { logger } from '../utils/logger';
import { 
  PlumbingIntent, 
  CustomerSentiment, 
  UrgencyLevel 
} from '../models/AIModels';

export interface TrainingDataPoint {
  id: string;
  type: TrainingDataType;
  source: DataSource;
  
  // Input data
  inputData: TrainingInput;
  
  // Expected output
  expectedOutput: TrainingOutput;
  
  // Actual output (if available)
  actualOutput?: TrainingOutput;
  
  // Quality metrics
  qualityMetrics: QualityMetrics;
  
  // Human feedback
  humanFeedback?: HumanFeedback;
  
  // Business outcomes
  businessOutcomes?: BusinessOutcomes;
  
  // Learning metadata
  metadata: TrainingMetadata;
  
  // Processing status
  status: ProcessingStatus;
  
  timestamps: DataTimestamps;
}

export type TrainingDataType = 
  | 'prompt_response_pair'
  | 'intent_classification'
  | 'sentiment_analysis'
  | 'quality_assessment'
  | 'context_optimization'
  | 'customer_interaction'
  | 'business_outcome'
  | 'error_correction';

export type DataSource = 
  | 'live_conversation'
  | 'staff_correction'
  | 'customer_feedback'
  | 'quality_review'
  | 'business_outcome'
  | 'synthetic_generation'
  | 'expert_annotation';

export interface TrainingInput {
  rawText: string;
  context: InputContext;
  intent?: PlumbingIntent;
  sentiment?: CustomerSentiment;
  urgency?: UrgencyLevel;
  businessContext: BusinessContext;
  customerProfile?: CustomerProfile;
  conversationHistory?: ConversationHistory;
}

export interface InputContext {
  conversationId: string;
  messageId: string;
  channelType: 'sms' | 'call' | 'email' | 'web';
  timeOfDay: string;
  dayOfWeek: string;
  seasonalContext: string;
  isEmergency: boolean;
  customerTier: string;
}

export interface BusinessContext {
  serviceType: string;
  businessHours: boolean;
  availableStaff: number;
  currentWorkload: string;
  seasonalDemand: string;
  marketConditions: string;
}

export interface CustomerProfile {
  customerId: string;
  customerType: 'residential' | 'commercial';
  relationshipTier: 'new' | 'regular' | 'vip';
  serviceHistory: ServiceHistoryEntry[];
  communicationPreferences: CommunicationPreferences;
  satisfactionHistory: SatisfactionEntry[];
}

export interface ServiceHistoryEntry {
  date: Date;
  serviceType: string;
  cost: number;
  satisfaction: number;
  outcome: string;
}

export interface CommunicationPreferences {
  preferredChannel: string;
  responseStyle: string;
  detailLevel: string;
  frequency: string;
}

export interface SatisfactionEntry {
  date: Date;
  rating: number;
  category: string;
  feedback: string;
}

export interface ConversationHistory {
  recentMessages: HistoricalMessage[];
  conversationSummary: string;
  keyTopics: string[];
  emotionalJourney: EmotionalState[];
}

export interface HistoricalMessage {
  role: 'customer' | 'business';
  content: string;
  timestamp: Date;
  intent?: string;
  sentiment?: string;
}

export interface EmotionalState {
  timestamp: Date;
  sentiment: CustomerSentiment;
  confidence: number;
  triggers: string[];
}

export interface TrainingOutput {
  responseText: string;
  responseType: ResponseType;
  intentClassification?: IntentClassification;
  sentimentAnalysis?: SentimentAnalysis;
  qualityScores?: QualityScores;
  businessRecommendations?: BusinessRecommendation[];
  nextSteps?: NextStep[];
}

export type ResponseType = 
  | 'direct_answer'
  | 'information_request'
  | 'escalation'
  | 'scheduling'
  | 'quote_provision'
  | 'emergency_response'
  | 'follow_up';

export interface IntentClassification {
  primaryIntent: PlumbingIntent;
  confidence: number;
  secondaryIntents: IntentScore[];
  reasoning: string;
}

export interface IntentScore {
  intent: PlumbingIntent;
  score: number;
}

export interface SentimentAnalysis {
  sentiment: CustomerSentiment;
  confidence: number;
  emotionalIndicators: string[];
  intensityLevel: number;
}

export interface QualityScores {
  overallScore: number;
  dimensionScores: Record<string, number>;
  strengths: string[];
  improvements: string[];
}

export interface BusinessRecommendation {
  type: string;
  description: string;
  priority: number;
  expectedImpact: string;
}

export interface NextStep {
  action: string;
  assignee: string;
  timeline: string;
  priority: number;
}

export interface QualityMetrics {
  responseQuality: number;
  customerSatisfaction?: number;
  businessAlignment: number;
  accuracyScore: number;
  completenessScore: number;
  timeliness: number;
  appropriateness: number;
}

export interface HumanFeedback {
  reviewerId: string;
  reviewTimestamp: Date;
  feedbackType: FeedbackType;
  qualityRating: number;
  corrections: Correction[];
  suggestions: Suggestion[];
  approvalStatus: 'approved' | 'needs_revision' | 'rejected';
  notes: string;
}

export type FeedbackType = 
  | 'quality_review'
  | 'accuracy_check'
  | 'customer_complaint'
  | 'staff_improvement'
  | 'training_annotation';

export interface Correction {
  field: string;
  originalValue: string;
  correctedValue: string;
  reasoning: string;
  importance: 'low' | 'medium' | 'high' | 'critical';
}

export interface Suggestion {
  category: string;
  suggestion: string;
  expectedBenefit: string;
  priority: number;
}

export interface BusinessOutcomes {
  customerSatisfaction: CustomerSatisfactionOutcome;
  businessMetrics: BusinessMetricOutcomes;
  operationalImpact: OperationalImpact;
  revenueImpact: RevenueImpact;
  relationshipImpact: RelationshipImpact;
}

export interface CustomerSatisfactionOutcome {
  satisfactionRating?: number;
  npsScore?: number;
  completionRate: number;
  escalationRequired: boolean;
  additionalContactsNeeded: number;
  issueResolved: boolean;
}

export interface BusinessMetricOutcomes {
  responseTime: number;
  resolutionTime: number;
  firstContactResolution: boolean;
  upsellOpportunities: number;
  crossSellOpportunities: number;
  retentionImpact: number;
}

export interface OperationalImpact {
  staffTimeRequired: number;
  resourceUtilization: number;
  processEfficiency: number;
  errorRate: number;
  automationSuccess: boolean;
}

export interface RevenueImpact {
  immediateRevenue: number;
  potentialRevenue: number;
  costSavings: number;
  lifetimeValueImpact: number;
  competitiveAdvantage: number;
}

export interface RelationshipImpact {
  trustChange: number;
  loyaltyChange: number;
  advocacyPotential: number;
  retentionProbability: number;
  referralLikelihood: number;
}

export interface TrainingMetadata {
  dataVersion: string;
  modelVersion: string;
  annotatorId?: string;
  confidence: number;
  processingTime: number;
  tokensUsed: number;
  businessRulesApplied: string[];
  validationStatus: ValidationStatus;
}

export interface ValidationStatus {
  validated: boolean;
  validationMethod: 'automatic' | 'human' | 'hybrid';
  validationScore: number;
  validationNotes: string;
  validatedBy?: string;
  validatedAt?: Date;
}

export type ProcessingStatus = 
  | 'collected'
  | 'processing'
  | 'validated'
  | 'reviewed'
  | 'approved'
  | 'rejected'
  | 'training_ready'
  | 'in_training'
  | 'deployed';

export interface DataTimestamps {
  collected: Date;
  processed?: Date;
  validated?: Date;
  reviewed?: Date;
  lastUpdated: Date;
}

export interface LearningInsight {
  id: string;
  category: InsightCategory;
  insight: string;
  confidence: number;
  supportingEvidence: Evidence[];
  businessImpact: BusinessImpactAssessment;
  actionableRecommendations: ActionableRecommendation[];
  implementationPriority: number;
  discoveredAt: Date;
}

export type InsightCategory = 
  | 'response_pattern'
  | 'customer_behavior'
  | 'quality_improvement'
  | 'business_opportunity'
  | 'operational_efficiency'
  | 'risk_mitigation';

export interface Evidence {
  type: 'data_pattern' | 'correlation' | 'feedback' | 'outcome';
  description: string;
  strength: number;
  dataPoints: number;
  timeframe: string;
}

export interface BusinessImpactAssessment {
  impactArea: string;
  magnitude: 'low' | 'medium' | 'high' | 'critical';
  timeframe: 'immediate' | 'short_term' | 'medium_term' | 'long_term';
  confidence: number;
  quantifiedBenefit?: number;
}

export interface ActionableRecommendation {
  action: string;
  description: string;
  effort: 'low' | 'medium' | 'high';
  timeline: string;
  expectedROI: number;
  riskLevel: 'low' | 'medium' | 'high';
  dependencies: string[];
}

export interface TrainingDatasetMetrics {
  totalDataPoints: number;
  dataPointsByType: Record<TrainingDataType, number>;
  dataPointsBySource: Record<DataSource, number>;
  qualityDistribution: QualityDistribution;
  temporalDistribution: TemporalDistribution;
  businessContextDistribution: ContextDistribution;
  outcomeDistribution: OutcomeDistribution;
}

export interface QualityDistribution {
  excellent: number; // >0.9
  good: number; // 0.7-0.9
  fair: number; // 0.5-0.7
  poor: number; // <0.5
  averageQuality: number;
}

export interface TemporalDistribution {
  last24Hours: number;
  lastWeek: number;
  lastMonth: number;
  lastQuarter: number;
  older: number;
}

export interface ContextDistribution {
  emergencyScenarios: number;
  routineService: number;
  customerTiers: Record<string, number>;
  channelTypes: Record<string, number>;
  timeOfDay: Record<string, number>;
}

export interface OutcomeDistribution {
  successfulResolutions: number;
  escalationsRequired: number;
  customerSatisfactionRates: Record<string, number>;
  businessGoalsAchieved: number;
}

export class AITrainingDataCollector {
  private processingQueue: Map<string, TrainingDataPoint> = new Map();
  private insights: Map<string, LearningInsight> = new Map();
  private datasetMetrics: TrainingDatasetMetrics;
  
  // Configuration
  private readonly batchSize = 100;
  private readonly processingInterval = 5 * 60 * 1000; // 5 minutes
  private readonly maxQueueSize = 10000;
  private readonly qualityThreshold = 0.6;
  
  constructor(
    private db: DatabaseService,
    private qualityAssessment: AIQualityAssessmentService,
    private contextManager: ConversationContextManager
  ) {
    this.initializeDatasetMetrics();
    this.startProcessingScheduler();
  }

  /**
   * Collect training data from live AI response generation
   */
  async collectResponseData(
    request: {
      conversationId: string;
      messageId: string;
      originalPrompt: string;
      generatedResponse: string;
      context: any;
      qualityAssessment?: QualityAssessmentResult;
    }
  ): Promise<{ dataPointId: string; queued: boolean }> {
    
    try {
      logger.info('Collecting response training data', {
        conversationId: request.conversationId,
        messageId: request.messageId
      });

      // Load conversation context for enrichment
      const conversationContext = await this.contextManager.getContext(
        request.conversationId
      );

      // Create training data point
      const dataPoint: TrainingDataPoint = {
        id: `tdp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'prompt_response_pair',
        source: 'live_conversation',
        inputData: await this.extractInputData(
          request.originalPrompt,
          request.context,
          conversationContext
        ),
        expectedOutput: await this.extractExpectedOutput(
          request.generatedResponse,
          request.context
        ),
        actualOutput: await this.extractActualOutput(
          request.generatedResponse,
          request.qualityAssessment
        ),
        qualityMetrics: await this.extractQualityMetrics(
          request.qualityAssessment
        ),
        metadata: {
          dataVersion: '1.0.0',
          modelVersion: 'claude-3-sonnet',
          confidence: request.qualityAssessment?.confidenceScore || 0.8,
          processingTime: 0,
          tokensUsed: this.estimateTokens(request.originalPrompt + request.generatedResponse),
          businessRulesApplied: [],
          validationStatus: {
            validated: false,
            validationMethod: 'automatic',
            validationScore: 0,
            validationNotes: 'Pending validation'
          }
        },
        status: 'collected',
        timestamps: {
          collected: new Date(),
          lastUpdated: new Date()
        }
      };

      // Add to processing queue
      const queued = await this.queueForProcessing(dataPoint);

      logger.info('Response training data collected', {
        dataPointId: dataPoint.id,
        queued
      });

      return {
        dataPointId: dataPoint.id,
        queued
      };

    } catch (error) {
      logger.error('Failed to collect response training data', {
        conversationId: request.conversationId,
        messageId: request.messageId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Collect training data from staff corrections and edits
   */
  async collectStaffFeedback(
    originalDataPointId: string,
    corrections: {
      originalResponse: string;
      correctedResponse: string;
      reasoning: string;
      staffId: string;
      quality: QualityMetrics;
    }
  ): Promise<{ dataPointId: string; processed: boolean }> {
    
    try {
      logger.info('Collecting staff feedback training data', {
        originalDataPointId,
        staffId: corrections.staffId
      });

      // Load original data point
      const originalDataPoint = await this.getDataPoint(originalDataPointId);
      
      if (!originalDataPoint) {
        throw new Error('Original data point not found');
      }

      // Create correction data point
      const correctionDataPoint: TrainingDataPoint = {
        id: `correction_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: 'error_correction',
        source: 'staff_correction',
        inputData: originalDataPoint.inputData,
        expectedOutput: await this.extractExpectedOutput(
          corrections.correctedResponse,
          originalDataPoint.inputData.context
        ),
        actualOutput: originalDataPoint.actualOutput,
        qualityMetrics: corrections.quality,
        humanFeedback: {
          reviewerId: corrections.staffId,
          reviewTimestamp: new Date(),
          feedbackType: 'staff_improvement',
          qualityRating: corrections.quality.responseQuality,
          corrections: [{
            field: 'response_text',
            originalValue: corrections.originalResponse,
            correctedValue: corrections.correctedResponse,
            reasoning: corrections.reasoning,
            importance: 'high'
          }],
          suggestions: [],
          approvalStatus: 'approved',
          notes: corrections.reasoning
        },
        metadata: {
          dataVersion: '1.0.0',
          modelVersion: 'staff_correction',
          annotatorId: corrections.staffId,
          confidence: 0.95, // High confidence for staff corrections
          processingTime: 0,
          tokensUsed: this.estimateTokens(corrections.correctedResponse),
          businessRulesApplied: ['staff_review'],
          validationStatus: {
            validated: true,
            validationMethod: 'human',
            validationScore: 1.0,
            validationNotes: 'Validated by staff correction',
            validatedBy: corrections.staffId,
            validatedAt: new Date()
          }
        },
        status: 'validated',
        timestamps: {
          collected: new Date(),
          validated: new Date(),
          lastUpdated: new Date()
        }
      };

      // Process immediately due to high value
      const processed = await this.processDataPoint(correctionDataPoint);

      // Generate learning insights from the correction
      await this.generateCorrectionInsights(originalDataPoint, correctionDataPoint);

      logger.info('Staff feedback training data collected', {
        dataPointId: correctionDataPoint.id,
        originalDataPointId,
        processed
      });

      return {
        dataPointId: correctionDataPoint.id,
        processed
      };

    } catch (error) {
      logger.error('Failed to collect staff feedback', {
        originalDataPointId,
        staffId: corrections.staffId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Collect training data from customer feedback and outcomes
   */
  async collectCustomerOutcome(
    dataPointId: string,
    outcomes: {
      satisfactionRating?: number;
      feedbackText?: string;
      issueResolved: boolean;
      additionalContactsNeeded: number;
      escalationRequired: boolean;
      businessMetrics: BusinessMetricOutcomes;
    }
  ): Promise<{ updated: boolean; insightsGenerated: number }> {
    
    try {
      logger.info('Collecting customer outcome data', {
        dataPointId,
        satisfactionRating: outcomes.satisfactionRating
      });

      // Load existing data point
      const dataPoint = await this.getDataPoint(dataPointId);
      
      if (!dataPoint) {
        throw new Error('Data point not found');
      }

      // Update with business outcomes
      dataPoint.businessOutcomes = {
        customerSatisfaction: {
          satisfactionRating: outcomes.satisfactionRating,
          completionRate: outcomes.issueResolved ? 1.0 : 0.5,
          escalationRequired: outcomes.escalationRequired,
          additionalContactsNeeded: outcomes.additionalContactsNeeded,
          issueResolved: outcomes.issueResolved
        },
        businessMetrics: outcomes.businessMetrics,
        operationalImpact: {
          staffTimeRequired: outcomes.businessMetrics.resolutionTime,
          resourceUtilization: 0.8, // Placeholder
          processEfficiency: outcomes.businessMetrics.firstContactResolution ? 1.0 : 0.6,
          errorRate: outcomes.escalationRequired ? 1.0 : 0.0,
          automationSuccess: !outcomes.escalationRequired
        },
        revenueImpact: {
          immediateRevenue: 0, // Would be calculated based on service booked
          potentialRevenue: outcomes.businessMetrics.upsellOpportunities * 100,
          costSavings: outcomes.businessMetrics.firstContactResolution ? 50 : 0,
          lifetimeValueImpact: outcomes.satisfactionRating ? outcomes.satisfactionRating * 10 : 0,
          competitiveAdvantage: outcomes.satisfactionRating || 0 > 4 ? 1 : 0
        },
        relationshipImpact: {
          trustChange: this.calculateTrustChange(outcomes),
          loyaltyChange: this.calculateLoyaltyChange(outcomes),
          advocacyPotential: outcomes.satisfactionRating || 0 > 4 ? 0.8 : 0.2,
          retentionProbability: outcomes.issueResolved ? 0.9 : 0.6,
          referralLikelihood: outcomes.satisfactionRating || 0 > 4 ? 0.7 : 0.2
        }
      };

      // Add customer feedback if provided
      if (outcomes.feedbackText) {
        if (!dataPoint.humanFeedback) {
          dataPoint.humanFeedback = {
            reviewerId: 'customer',
            reviewTimestamp: new Date(),
            feedbackType: 'customer_complaint',
            qualityRating: outcomes.satisfactionRating || 0,
            corrections: [],
            suggestions: [],
            approvalStatus: 'approved',
            notes: outcomes.feedbackText
          };
        } else {
          dataPoint.humanFeedback.notes = outcomes.feedbackText;
        }
      }

      // Update status and timestamps
      dataPoint.status = 'reviewed';
      dataPoint.timestamps.reviewed = new Date();
      dataPoint.timestamps.lastUpdated = new Date();

      // Save updated data point
      await this.saveDataPoint(dataPoint);

      // Generate insights from outcomes
      const insights = await this.generateOutcomeInsights(dataPoint);

      logger.info('Customer outcome data collected', {
        dataPointId,
        insightsGenerated: insights.length
      });

      return {
        updated: true,
        insightsGenerated: insights.length
      };

    } catch (error) {
      logger.error('Failed to collect customer outcome', {
        dataPointId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Process training data batch and extract learning insights
   */
  async processTrainingBatch(): Promise<{
    processed: number;
    insights: number;
    quality: number;
    readyForTraining: number;
  }> {
    
    try {
      logger.info('Processing training data batch');

      const batch = Array.from(this.processingQueue.values()).slice(0, this.batchSize);
      
      if (batch.length === 0) {
        return { processed: 0, insights: 0, quality: 0, readyForTraining: 0 };
      }

      let processed = 0;
      let insights = 0;
      let qualitySum = 0;
      let readyForTraining = 0;

      for (const dataPoint of batch) {
        try {
          // Process data point
          const processResult = await this.processDataPoint(dataPoint);
          
          if (processResult) {
            processed++;
            qualitySum += dataPoint.qualityMetrics.responseQuality;
            
            // Generate insights
            const dataInsights = await this.generateDataPointInsights(dataPoint);
            insights += dataInsights.length;
            
            // Check if ready for training
            if (this.isReadyForTraining(dataPoint)) {
              dataPoint.status = 'training_ready';
              readyForTraining++;
            }
            
            // Remove from queue
            this.processingQueue.delete(dataPoint.id);
          }
        } catch (error) {
          logger.warn('Failed to process individual data point', {
            dataPointId: dataPoint.id,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      const averageQuality = processed > 0 ? qualitySum / processed : 0;

      // Update dataset metrics
      await this.updateDatasetMetrics();

      logger.info('Training data batch processed', {
        processed,
        insights,
        averageQuality,
        readyForTraining
      });

      return {
        processed,
        insights,
        quality: averageQuality,
        readyForTraining
      };

    } catch (error) {
      logger.error('Failed to process training batch', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get learning insights for continuous improvement
   */
  async getLearningInsights(
    filters?: {
      category?: InsightCategory[];
      minConfidence?: number;
      timeframe?: string;
      businessImpact?: string[];
    }
  ): Promise<{
    insights: LearningInsight[];
    priorityInsights: LearningInsight[];
    totalInsights: number;
    actionableCount: number;
  }> {
    
    try {
      logger.info('Retrieving learning insights', { filters });

      // Load insights from storage
      const allInsights = await this.loadInsights(filters);
      
      // Filter by criteria
      let filteredInsights = allInsights;
      
      if (filters?.category) {
        filteredInsights = filteredInsights.filter(
          insight => filters.category!.includes(insight.category)
        );
      }
      
      if (filters?.minConfidence) {
        filteredInsights = filteredInsights.filter(
          insight => insight.confidence >= filters.minConfidence!
        );
      }

      // Sort by implementation priority
      filteredInsights.sort((a, b) => b.implementationPriority - a.implementationPriority);

      // Identify priority insights (high impact, high confidence)
      const priorityInsights = filteredInsights.filter(
        insight => insight.confidence > 0.8 && 
                  insight.businessImpact.magnitude === 'high' &&
                  insight.implementationPriority > 7
      );

      // Count actionable insights
      const actionableCount = filteredInsights.filter(
        insight => insight.actionableRecommendations.length > 0
      ).length;

      logger.info('Learning insights retrieved', {
        totalInsights: filteredInsights.length,
        priorityInsights: priorityInsights.length,
        actionableCount
      });

      return {
        insights: filteredInsights,
        priorityInsights,
        totalInsights: filteredInsights.length,
        actionableCount
      };

    } catch (error) {
      logger.error('Failed to get learning insights', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get training dataset metrics and statistics
   */
  async getDatasetMetrics(): Promise<TrainingDatasetMetrics> {
    try {
      await this.updateDatasetMetrics();
      return this.datasetMetrics;
    } catch (error) {
      logger.error('Failed to get dataset metrics', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  // Private helper methods

  private async extractInputData(
    prompt: string,
    context: any,
    conversationContext: any
  ): Promise<TrainingInput> {
    
    return {
      rawText: prompt,
      context: {
        conversationId: context.conversationId || '',
        messageId: context.messageId || '',
        channelType: context.channelType || 'sms',
        timeOfDay: new Date().getHours() < 18 ? 'business' : 'after_hours',
        dayOfWeek: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
        seasonalContext: this.getCurrentSeason(),
        isEmergency: context.isEmergency || false,
        customerTier: context.customerTier || 'regular'
      },
      intent: context.intent,
      sentiment: context.sentiment,
      urgency: context.urgency,
      businessContext: {
        serviceType: context.serviceType || 'general',
        businessHours: this.isBusinessHours(),
        availableStaff: context.availableStaff || 5,
        currentWorkload: context.currentWorkload || 'normal',
        seasonalDemand: this.getSeasonalDemand(),
        marketConditions: 'stable'
      },
      customerProfile: context.customerProfile,
      conversationHistory: conversationContext ? {
        recentMessages: conversationContext.messages.slice(-5).map((msg: any) => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          intent: msg.intent,
          sentiment: msg.sentiment
        })),
        conversationSummary: this.generateConversationSummary(conversationContext),
        keyTopics: conversationContext.conversationMemory?.shortTermMemory?.keyFacts?.map((f: any) => f.fact) || [],
        emotionalJourney: []
      } : undefined
    };
  }

  private async extractExpectedOutput(
    response: string,
    context: any
  ): Promise<TrainingOutput> {
    
    return {
      responseText: response,
      responseType: this.classifyResponseType(response, context),
      intentClassification: context.intentClassification,
      sentimentAnalysis: context.sentimentAnalysis,
      qualityScores: context.qualityScores,
      businessRecommendations: context.businessRecommendations || [],
      nextSteps: context.nextSteps || []
    };
  }

  private async extractActualOutput(
    response: string,
    qualityAssessment?: QualityAssessmentResult
  ): Promise<TrainingOutput | undefined> {
    
    if (!qualityAssessment) return undefined;
    
    return {
      responseText: response,
      responseType: 'direct_answer', // Would be determined by analysis
      qualityScores: {
        overallScore: qualityAssessment.overallScore,
        dimensionScores: Object.entries(qualityAssessment.dimensionScores)
          .reduce((acc, [key, value]) => ({ ...acc, [key]: value.score }), {}),
        strengths: qualityAssessment.detailedAnalysis.strengthAreas.map(s => s.area),
        improvements: qualityAssessment.detailedAnalysis.weaknessAreas.map(w => w.area)
      }
    };
  }

  private async extractQualityMetrics(
    qualityAssessment?: QualityAssessmentResult
  ): Promise<QualityMetrics> {
    
    if (!qualityAssessment) {
      return {
        responseQuality: 0.8, // Default placeholder
        businessAlignment: 0.8,
        accuracyScore: 0.8,
        completenessScore: 0.8,
        timeliness: 0.8,
        appropriateness: 0.8
      };
    }
    
    return {
      responseQuality: qualityAssessment.overallScore,
      businessAlignment: qualityAssessment.dimensionScores.brandAlignment.score,
      accuracyScore: qualityAssessment.dimensionScores.accuracy.score,
      completenessScore: qualityAssessment.dimensionScores.completeness.score,
      timeliness: qualityAssessment.dimensionScores.timeliness.score,
      appropriateness: qualityAssessment.dimensionScores.professionalism.score
    };
  }

  private async queueForProcessing(dataPoint: TrainingDataPoint): Promise<boolean> {
    if (this.processingQueue.size >= this.maxQueueSize) {
      logger.warn('Processing queue is full, dropping oldest entries');
      const oldestEntries = Array.from(this.processingQueue.entries())
        .sort(([,a], [,b]) => a.timestamps.collected.getTime() - b.timestamps.collected.getTime())
        .slice(0, Math.floor(this.maxQueueSize * 0.1));
      
      for (const [id] of oldestEntries) {
        this.processingQueue.delete(id);
      }
    }
    
    this.processingQueue.set(dataPoint.id, dataPoint);
    return true;
  }

  private async processDataPoint(dataPoint: TrainingDataPoint): Promise<boolean> {
    try {
      // Update status
      dataPoint.status = 'processing';
      dataPoint.timestamps.processed = new Date();
      
      // Validate data quality
      const validation = await this.validateDataPoint(dataPoint);
      
      if (!validation.valid) {
        dataPoint.status = 'rejected';
        dataPoint.metadata.validationStatus = {
          validated: false,
          validationMethod: 'automatic',
          validationScore: validation.score,
          validationNotes: validation.reason
        };
        await this.saveDataPoint(dataPoint);
        return false;
      }
      
      // Apply business rules enrichment
      await this.applyBusinessRulesEnrichment(dataPoint);
      
      // Update validation status
      dataPoint.metadata.validationStatus = {
        validated: true,
        validationMethod: 'automatic',
        validationScore: validation.score,
        validationNotes: 'Passed automatic validation'
      };
      
      dataPoint.status = 'validated';
      dataPoint.timestamps.validated = new Date();
      dataPoint.timestamps.lastUpdated = new Date();
      
      // Save to database
      await this.saveDataPoint(dataPoint);
      
      return true;
      
    } catch (error) {
      logger.error('Failed to process data point', {
        dataPointId: dataPoint.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  private async validateDataPoint(dataPoint: TrainingDataPoint): Promise<{
    valid: boolean;
    score: number;
    reason: string;
  }> {
    
    let score = 1.0;
    const issues: string[] = [];
    
    // Check required fields
    if (!dataPoint.inputData.rawText || dataPoint.inputData.rawText.length < 10) {
      score -= 0.3;
      issues.push('Input text too short');
    }
    
    if (!dataPoint.expectedOutput.responseText || dataPoint.expectedOutput.responseText.length < 5) {
      score -= 0.3;
      issues.push('Response text too short');
    }
    
    // Check quality metrics
    if (dataPoint.qualityMetrics.responseQuality < this.qualityThreshold) {
      score -= 0.2;
      issues.push('Quality below threshold');
    }
    
    // Check for PII or sensitive data
    if (this.containsSensitiveData(dataPoint)) {
      score -= 0.5;
      issues.push('Contains sensitive data');
    }
    
    const valid = score >= 0.6;
    const reason = issues.length > 0 ? issues.join(', ') : 'Validation passed';
    
    return { valid, score, reason };
  }

  private async applyBusinessRulesEnrichment(dataPoint: TrainingDataPoint): Promise<void> {
    // Apply business-specific enrichment rules
    const rules: string[] = [];
    
    // Emergency classification rule
    if (dataPoint.inputData.context.isEmergency) {
      rules.push('emergency_classification');
    }
    
    // Customer tier rule
    if (dataPoint.inputData.customerProfile?.relationshipTier === 'vip') {
      rules.push('vip_customer_handling');
    }
    
    // Quality threshold rule
    if (dataPoint.qualityMetrics.responseQuality > 0.9) {
      rules.push('high_quality_response');
    }
    
    dataPoint.metadata.businessRulesApplied = rules;
  }

  private isReadyForTraining(dataPoint: TrainingDataPoint): boolean {
    return dataPoint.status === 'validated' &&
           dataPoint.qualityMetrics.responseQuality >= this.qualityThreshold &&
           dataPoint.metadata.validationStatus.validated;
  }

  private async generateCorrectionInsights(
    original: TrainingDataPoint,
    correction: TrainingDataPoint
  ): Promise<LearningInsight[]> {
    
    const insights: LearningInsight[] = [];
    
    // Analyze the correction pattern
    const correctionInsight: LearningInsight = {
      id: `insight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      category: 'quality_improvement',
      insight: `Staff correction improved response quality from ${original.qualityMetrics.responseQuality} to ${correction.qualityMetrics.responseQuality}`,
      confidence: 0.9,
      supportingEvidence: [{
        type: 'feedback',
        description: 'Staff provided correction with reasoning',
        strength: 0.9,
        dataPoints: 1,
        timeframe: 'immediate'
      }],
      businessImpact: {
        impactArea: 'response_quality',
        magnitude: 'medium',
        timeframe: 'short_term',
        confidence: 0.8
      },
      actionableRecommendations: [{
        action: 'Update response templates',
        description: 'Incorporate correction patterns into response generation',
        effort: 'medium',
        timeline: '1-2 weeks',
        expectedROI: 0.15,
        riskLevel: 'low',
        dependencies: ['template_update_system']
      }],
      implementationPriority: 8,
      discoveredAt: new Date()
    };
    
    insights.push(correctionInsight);
    
    // Store insights
    for (const insight of insights) {
      this.insights.set(insight.id, insight);
      await this.saveInsight(insight);
    }
    
    return insights;
  }

  private async generateOutcomeInsights(dataPoint: TrainingDataPoint): Promise<LearningInsight[]> {
    const insights: LearningInsight[] = [];
    
    if (!dataPoint.businessOutcomes) return insights;
    
    const outcomes = dataPoint.businessOutcomes;
    
    // Customer satisfaction insight
    if (outcomes.customerSatisfaction.satisfactionRating !== undefined) {
      const satisfactionInsight: LearningInsight = {
        id: `insight_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        category: 'customer_behavior',
        insight: `Response achieved ${outcomes.customerSatisfaction.satisfactionRating}/5 customer satisfaction`,
        confidence: 0.8,
        supportingEvidence: [{
          type: 'outcome',
          description: 'Customer satisfaction rating provided',
          strength: 0.8,
          dataPoints: 1,
          timeframe: 'immediate'
        }],
        businessImpact: {
          impactArea: 'customer_satisfaction',
          magnitude: outcomes.customerSatisfaction.satisfactionRating > 4 ? 'high' : 'medium',
          timeframe: 'immediate',
          confidence: 0.9
        },
        actionableRecommendations: [],
        implementationPriority: outcomes.customerSatisfaction.satisfactionRating > 4 ? 9 : 6,
        discoveredAt: new Date()
      };
      
      insights.push(satisfactionInsight);
    }
    
    // Store insights
    for (const insight of insights) {
      this.insights.set(insight.id, insight);
      await this.saveInsight(insight);
    }
    
    return insights;
  }

  private async generateDataPointInsights(dataPoint: TrainingDataPoint): Promise<LearningInsight[]> {
    // Generate insights from individual data points
    return []; // Placeholder implementation
  }

  private initializeDatasetMetrics(): void {
    this.datasetMetrics = {
      totalDataPoints: 0,
      dataPointsByType: {} as Record<TrainingDataType, number>,
      dataPointsBySource: {} as Record<DataSource, number>,
      qualityDistribution: {
        excellent: 0,
        good: 0,
        fair: 0,
        poor: 0,
        averageQuality: 0
      },
      temporalDistribution: {
        last24Hours: 0,
        lastWeek: 0,
        lastMonth: 0,
        lastQuarter: 0,
        older: 0
      },
      businessContextDistribution: {
        emergencyScenarios: 0,
        routineService: 0,
        customerTiers: {},
        channelTypes: {},
        timeOfDay: {}
      },
      outcomeDistribution: {
        successfulResolutions: 0,
        escalationsRequired: 0,
        customerSatisfactionRates: {},
        businessGoalsAchieved: 0
      }
    };
  }

  private startProcessingScheduler(): void {
    setInterval(async () => {
      try {
        await this.processTrainingBatch();
      } catch (error) {
        logger.error('Training data processing failed', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, this.processingInterval);
  }

  // Placeholder implementations for helper methods
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private async getDataPoint(id: string): Promise<TrainingDataPoint | null> {
    // Implementation would load from database
    return null; // Placeholder
  }

  private async saveDataPoint(dataPoint: TrainingDataPoint): Promise<void> {
    // Implementation would save to database
  }

  private async saveInsight(insight: LearningInsight): Promise<void> {
    // Implementation would save insight to database
  }

  private async loadInsights(filters?: any): Promise<LearningInsight[]> {
    // Implementation would load insights from database
    return Array.from(this.insights.values()); // Placeholder
  }

  private async updateDatasetMetrics(): Promise<void> {
    // Implementation would update metrics from database
  }

  private calculateTrustChange(outcomes: any): number {
    return outcomes.satisfactionRating ? (outcomes.satisfactionRating - 3) * 0.2 : 0;
  }

  private calculateLoyaltyChange(outcomes: any): number {
    return outcomes.issueResolved ? 0.1 : -0.1;
  }

  private getCurrentSeason(): string {
    const month = new Date().getMonth();
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'fall';
    return 'winter';
  }

  private isBusinessHours(): boolean {
    const hour = new Date().getHours();
    return hour >= 8 && hour <= 18;
  }

  private getSeasonalDemand(): string {
    // Implementation would determine seasonal demand patterns
    return 'normal'; // Placeholder
  }

  private generateConversationSummary(context: any): string {
    // Implementation would generate conversation summary
    return 'Customer inquiry about plumbing service'; // Placeholder
  }

  private classifyResponseType(response: string, context: any): ResponseType {
    // Implementation would classify response type
    return 'direct_answer'; // Placeholder
  }

  private containsSensitiveData(dataPoint: TrainingDataPoint): boolean {
    // Implementation would check for PII and sensitive data
    return false; // Placeholder
  }
}

export default AITrainingDataCollector;