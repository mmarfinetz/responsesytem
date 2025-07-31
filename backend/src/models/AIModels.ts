import { ServiceType } from '../../../shared/types';

// Core AI Intent Types
export type PlumbingIntent = 
  | 'emergency_service'
  | 'routine_inquiry'
  | 'quote_request'
  | 'scheduling'
  | 'rescheduling'
  | 'complaint'
  | 'follow_up'
  | 'payment_inquiry'
  | 'service_information'
  | 'appointment_confirmation'
  | 'cancellation'
  | 'warranty_claim'
  | 'maintenance_reminder'
  | 'general_question'
  | 'other';

export type EmergencyType = 
  | 'flooding'
  | 'burst_pipe'
  | 'gas_leak'
  | 'sewage_backup'
  | 'no_water'
  | 'major_leak'
  | 'toilet_overflow'
  | 'water_heater_failure'
  | 'none';

export type UrgencyLevel = 'immediate' | 'same_day' | 'within_week' | 'flexible' | 'unknown';

export type CustomerSentiment = 'positive' | 'neutral' | 'frustrated' | 'angry' | 'worried' | 'unknown';

// AI Analysis Results
export interface ConversationAnalysis {
  id: string;
  conversationId: string;
  analysisType: 'initial' | 'update' | 'summary';
  
  // Intent Analysis
  primaryIntent: PlumbingIntent;
  secondaryIntents: PlumbingIntent[];
  intentConfidence: number;
  
  // Emergency Detection
  isEmergency: boolean;
  emergencyType: EmergencyType;
  emergencyConfidence: number;
  
  // Urgency Assessment
  urgencyLevel: UrgencyLevel;
  urgencyReasons: string[];
  
  // Customer Analysis
  customerSentiment: CustomerSentiment;
  sentimentConfidence: number;
  frustrationIndicators: string[];
  
  // Service Information
  serviceType?: ServiceType;
  serviceTypeConfidence?: number;
  
  // Extracted Information
  extractedInfo: {
    serviceAddress?: string;
    preferredTimes?: string[];
    budgetMentioned?: boolean;
    budgetRange?: string;
    decisionMaker?: string;
    contactPreference?: 'call' | 'text' | 'email';
    accessInstructions?: string;
    problemDescription?: string;
    symptoms?: string[];
    propertyType?: 'residential' | 'commercial';
  };
  
  // Context Analysis
  conversationStage: 'initial_contact' | 'information_gathering' | 'quote_discussion' | 'scheduling' | 'follow_up' | 'resolved';
  nextRecommendedAction: string;
  suggestedFollowUp?: string;
  
  // Summary
  shortSummary: string;
  keyPoints: string[];
  actionItems: string[];
  
  // Metadata
  tokensUsed: number;
  processingTimeMs: number;
  modelVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

// Intent Classification Results
export interface IntentClassification {
  id: string;
  messageId: string;
  conversationId: string;
  
  // Primary Intent
  primaryIntent: PlumbingIntent;
  primaryConfidence: number;
  
  // All Possible Intents (ranked)
  intents: Array<{
    intent: PlumbingIntent;
    confidence: number;
    reasoning: string;
  }>;
  
  // Context Factors
  contextFactors: {
    timeOfDay: 'business_hours' | 'after_hours' | 'emergency_hours';
    messageLength: 'short' | 'medium' | 'long';
    hasQuestionWords: boolean;
    hasUrgentKeywords: boolean;
    previousIntentInfluence: boolean;
  };
  
  // Processing Metadata
  tokensUsed: number;
  processingTimeMs: number;
  modelVersion: string;
  createdAt: Date;
}

// Response Generation Results
export interface ResponseGeneration {
  id: string;
  conversationId: string;
  messageId?: string;
  analysisId?: string;
  
  // Generated Response
  generatedResponse: string;
  responseType: 'immediate' | 'informational' | 'scheduling' | 'emergency' | 'quote' | 'follow_up';
  tone: 'professional' | 'empathetic' | 'urgent' | 'friendly' | 'formal';
  
  // Alternative Responses
  alternatives: Array<{
    response: string;
    tone: string;
    reasoning: string;
  }>;
  
  // Template Information
  templateUsed?: string;
  personalizationApplied: boolean;
  
  // Business Rules Applied
  businessRulesApplied: string[];
  pricingMentioned: boolean;
  schedulingSuggested: boolean;
  
  // Quality Metrics
  confidence: number;
  appropriatenessScore: number;
  
  // Human Review
  needsReview: boolean;
  reviewReason?: string;
  humanApproved?: boolean;
  humanEdited?: boolean;
  finalResponse?: string;
  editedBy?: string;
  editedAt?: Date;
  
  // Feedback
  customerFeedback?: 'positive' | 'neutral' | 'negative';
  internalRating?: number;
  improvementNotes?: string;
  
  // Metadata
  tokensUsed: number;
  processingTimeMs: number;
  modelVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

// AI Configuration and Settings
export interface AIConfiguration {
  id: string;
  configType: 'conversation_analysis' | 'intent_classification' | 'response_generation';
  
  // Model Settings
  modelVersion: string;
  temperature: number;
  maxTokens: number;
  
  // Business Context
  businessInfo: {
    name: string;
    phone: string;
    email: string;
    address: string;
    serviceArea: string;
    businessHours: string;
    emergencyAvailable: boolean;
    afterHoursContact?: string;
  };
  
  // Service Settings
  serviceTypes: ServiceType[];
  emergencyKeywords: string[];
  urgentKeywords: string[];
  
  // Response Guidelines
  responseGuidelines: {
    maxLength: number;
    includeBusinessHours: boolean;
    includeEmergencyInfo: boolean;
    professionalTone: boolean;
    personalizeResponses: boolean;
  };
  
  // Quality Thresholds
  qualityThresholds: {
    minConfidenceForAutoResponse: number;
    requireReviewIfUrgencyAbove: UrgencyLevel;
    requireReviewForEmergencies: boolean;
    requireReviewForComplaints: boolean;
  };
  
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// AI Performance Metrics
export interface AIPerformanceMetrics {
  id: string;
  metricType: 'daily' | 'weekly' | 'monthly';
  periodStart: Date;
  periodEnd: Date;
  
  // Volume Metrics
  totalAnalyses: number;
  conversationAnalyses: number;
  intentClassifications: number;
  responseGenerations: number;
  
  // Accuracy Metrics
  averageIntentConfidence: number;
  emergencyDetectionAccuracy: number;
  responseApprovalRate: number;
  humanEditRate: number;
  
  // Performance Metrics
  averageProcessingTime: number;
  totalTokensUsed: number;
  averageTokensPerRequest: number;
  costPerRequest: number;
  totalCost: number;
  
  // Quality Metrics
  customerSatisfactionScore?: number;
  responseEffectivenessScore?: number;
  
  // Error Metrics
  errorRate: number;
  timeoutRate: number;
  retryRate: number;
  
  createdAt: Date;
}

// AI Training Data
export interface AITrainingData {
  id: string;
  dataType: 'conversation' | 'intent_example' | 'response_template';
  
  // Input Data
  inputText: string;
  context?: Record<string, any>;
  
  // Expected Output
  expectedIntent?: PlumbingIntent;
  expectedResponse?: string;
  expectedEntities?: Record<string, any>;
  
  // Quality Labels
  isHighQuality: boolean;
  verifiedBy?: string;
  verifiedAt?: Date;
  
  // Usage Tracking
  usedInTraining: boolean;
  trainingRuns: number;
  lastUsed?: Date;
  
  // Metadata
  source: 'real_conversation' | 'synthetic' | 'manual_entry';
  tags: string[];
  notes?: string;
  
  createdAt: Date;
  updatedAt: Date;
}

// AI Error Logging
export interface AIError {
  id: string;
  errorType: 'api_error' | 'timeout' | 'rate_limit' | 'invalid_response' | 'processing_error';
  service: 'conversation_analysis' | 'intent_classification' | 'response_generation';
  
  // Error Details
  errorMessage: string;
  errorCode?: string;
  stackTrace?: string;
  
  // Request Context
  requestId?: string;
  conversationId?: string;
  messageId?: string;
  
  // Request Data
  inputData?: Record<string, any>;
  modelParameters?: Record<string, any>;
  
  // Recovery Information
  retryAttempt: number;
  resolved: boolean;
  resolution?: string;
  resolvedAt?: Date;
  
  // Impact Assessment
  impactLevel: 'low' | 'medium' | 'high' | 'critical';
  userImpacted: boolean;
  fallbackUsed: boolean;
  
  createdAt: Date;
}

// Claude API Request/Response Types
export interface ClaudeAPIRequest {
  model: string;
  messages: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
  max_tokens: number;
  temperature?: number;
  system?: string;
}

export interface ClaudeAPIResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{
    type: 'text';
    text: string;
  }>;
  model: string;
  stop_reason: string;
  stop_sequence: null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// Cache Types
export interface AICache {
  key: string;
  value: any;
  expiry: Date;
  hitCount: number;
  lastAccessed: Date;
  createdAt: Date;
}

export interface CacheStats {
  totalEntries: number;
  hitRate: number;
  missRate: number;
  averageResponseTime: number;
  cacheSize: number;
  oldestEntry: Date;
  newestEntry: Date;
}