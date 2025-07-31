import { DatabaseService } from './DatabaseService';
import { logger } from '../utils/logger';
import { Staff, Customer, EmergencyRouting } from '../../shared/types';

export interface EmergencyContext {
  messageText: string;
  customerPhone: string;
  customer?: Customer;
  timestamp: Date;
  location?: {
    address?: string;
    city?: string;
    zipCode?: string;
    latitude?: number;
    longitude?: number;
  };
  previousEmergencies?: EmergencyIncident[];
  seasonalFactors?: SeasonalContext;
  weatherConditions?: WeatherContext;
}

export interface EmergencyClassification {
  isEmergency: boolean;
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
  urgencyScore: number; // 0-100
  emergencyType: EmergencyType;
  keyIndicators: string[];
  contextFactors: ContextFactor[];
  estimatedResponseTime: number; // minutes
  suggestedActions: string[];
  escalationRequired: boolean;
  reasoning: string;
}

export interface EmergencyRoutingDecision {
  primaryTechnician: Staff;
  backupTechnicians: Staff[];
  estimatedArrivalTime: number; // minutes
  routingReason: string;
  confidence: number;
  alternativeOptions: RoutingOption[];
  escalationPlan: EscalationStep[];
  resourceRequirements: ResourceRequirement[];
  customerNotifications: NotificationPlan[];
}

export interface RoutingOption {
  technician: Staff;
  estimatedArrivalTime: number;
  skillMatchScore: number;
  workloadScore: number;
  proximityScore: number;
  overallScore: number;
  pros: string[];
  cons: string[];
}

export interface EscalationStep {
  triggerCondition: string;
  triggerTimeMinutes: number;
  action: 'notify_backup' | 'call_manager' | 'dispatch_additional' | 'contact_emergency_services';
  assignedTo?: string;
  automated: boolean;
}

export interface ResourceRequirement {
  type: 'vehicle' | 'equipment' | 'parts' | 'expertise';
  description: string;
  required: boolean;
  estimatedCost?: number;
}

export interface NotificationPlan {
  channel: 'sms' | 'call' | 'email';
  message: string;
  timing: 'immediate' | 'eta_update' | 'arrival' | 'completion';
  priority: number;
}

export interface ContextFactor {
  factor: string;
  weight: number;
  impact: 'increases_urgency' | 'decreases_urgency' | 'affects_routing' | 'affects_resources';
  description: string;
}

export interface EmergencyIncident {
  id: string;
  timestamp: Date;
  severity: string;
  resolved: boolean;
  responseTime: number;
  outcome: string;
}

interface SeasonalContext {
  season: 'winter' | 'spring' | 'summer' | 'fall';
  temperature: number;
  freezingRisk: boolean;
  heavyRainRisk: boolean;
  holidayPeriod: boolean;
}

interface WeatherContext {
  condition: string;
  temperature: number;
  precipitation: number;
  freezeWarning: boolean;
  impact: 'none' | 'minor' | 'moderate' | 'severe';
}

type EmergencyType = 
  | 'gas_leak'
  | 'major_flood'
  | 'burst_main_line' 
  | 'sewage_backup'
  | 'no_water_service'
  | 'frozen_pipes'
  | 'water_heater_emergency'
  | 'structural_damage'
  | 'health_hazard'
  | 'general_emergency';

export class EmergencyRoutingService {
  private emergencyKeywords: Map<string, { severity: string; type: EmergencyType; weight: number }>;
  private contextAnalyzers: ContextAnalyzer[];

  constructor(private db: DatabaseService) {
    this.initializeEmergencyKeywords();
    this.initializeContextAnalyzers();
  }

  /**
   * Enhanced emergency detection and classification
   */
  async classifyEmergency(context: EmergencyContext): Promise<EmergencyClassification> {
    try {
      const startTime = Date.now();
      
      logger.info('Starting emergency classification', {
        customerPhone: context.customerPhone,
        messageLength: context.messageText.length
      });

      // 1. Keyword-based initial detection
      const keywordAnalysis = this.analyzeKeywords(context.messageText);
      
      // 2. Context-aware analysis
      const contextAnalysis = await this.analyzeContext(context);
      
      // 3. Historical pattern analysis
      const historicalAnalysis = await this.analyzeHistoricalPatterns(context);
      
      // 4. Semantic analysis for nuanced understanding
      const semanticAnalysis = this.analyzeSemantics(context.messageText);
      
      // 5. Combine all analyses for final classification
      const classification = this.combineAnalyses(
        keywordAnalysis,
        contextAnalysis,
        historicalAnalysis,
        semanticAnalysis,
        context
      );

      const processingTime = Date.now() - startTime;
      
      logger.info('Emergency classification completed', {
        isEmergency: classification.isEmergency,
        severity: classification.severity,
        confidence: classification.confidence,
        processingTimeMs: processingTime
      });

      // Log for training and improvement
      await this.logClassificationForTraining(context, classification, processingTime);

      return classification;

    } catch (error) {
      logger.error('Emergency classification failed', {
        customerPhone: context.customerPhone,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Return safe fallback classification
      return this.createSafetyFallbackClassification(context);
    }
  }

  /**
   * Intelligent routing based on multiple factors
   */
  async routeEmergency(
    classification: EmergencyClassification,
    context: EmergencyContext
  ): Promise<EmergencyRoutingDecision> {
    try {
      const startTime = Date.now();
      
      // 1. Get available technicians
      const availableTechnicians = await this.getAvailableTechnicians(classification, context);
      
      // 2. Score technicians based on multiple factors
      const scoredOptions = await this.scoreTechnicians(
        availableTechnicians,
        classification,
        context
      );
      
      // 3. Select optimal routing
      const routingDecision = await this.selectOptimalRouting(
        scoredOptions,
        classification,
        context
      );
      
      // 4. Create escalation plan
      const escalationPlan = this.createEscalationPlan(classification, routingDecision);
      
      // 5. Plan customer notifications
      const notificationPlan = this.createNotificationPlan(classification, routingDecision);
      
      const finalDecision: EmergencyRoutingDecision = {
        ...routingDecision,
        escalationPlan,
        customerNotifications: notificationPlan
      };

      const processingTime = Date.now() - startTime;
      
      logger.info('Emergency routing completed', {
        primaryTechnician: finalDecision.primaryTechnician.id,
        estimatedArrivalTime: finalDecision.estimatedArrivalTime,
        processingTimeMs: processingTime
      });

      // Start automated escalation monitoring
      await this.startEscalationMonitoring(finalDecision, classification, context);

      return finalDecision;

    } catch (error) {
      logger.error('Emergency routing failed', {
        severity: classification.severity,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Real-time monitoring and escalation
   */
  async monitorEmergencyResponse(emergencyId: string): Promise<void> {
    // This would run as a background process
    // Implementation would include:
    // - Tracking technician location and ETA
    // - Automatic escalation based on time thresholds
    // - Customer communication updates
    // - Resource reallocation if needed
    
    logger.info('Starting emergency response monitoring', { emergencyId });
    
    // Implementation details would go here...
  }

  // Private helper methods

  private initializeEmergencyKeywords(): void {
    this.emergencyKeywords = new Map([
      // Critical emergencies
      ['gas leak', { severity: 'critical', type: 'gas_leak', weight: 10 }],
      ['smell gas', { severity: 'critical', type: 'gas_leak', weight: 10 }],
      ['flooding', { severity: 'critical', type: 'major_flood', weight: 9 }],
      ['water everywhere', { severity: 'critical', type: 'major_flood', weight: 9 }],
      ['burst main', { severity: 'critical', type: 'burst_main_line', weight: 9 }],
      ['sewage backup', { severity: 'critical', type: 'sewage_backup', weight: 8 }],
      
      // High priority emergencies
      ['no water', { severity: 'high', type: 'no_water_service', weight: 7 }],
      ['burst pipe', { severity: 'high', type: 'burst_main_line', weight: 7 }],
      ['frozen pipes', { severity: 'high', type: 'frozen_pipes', weight: 6 }],
      ['water heater leak', { severity: 'high', type: 'water_heater_emergency', weight: 6 }],
      
      // Medium priority
      ['toilet overflow', { severity: 'medium', type: 'general_emergency', weight: 4 }],
      ['drain backup', { severity: 'medium', type: 'general_emergency', weight: 4 }],
      
      // Context indicators
      ['emergency', { severity: 'high', type: 'general_emergency', weight: 5 }],
      ['urgent', { severity: 'medium', type: 'general_emergency', weight: 3 }],
      ['help asap', { severity: 'high', type: 'general_emergency', weight: 5 }]
    ]);
  }

  private initializeContextAnalyzers(): void {
    this.contextAnalyzers = [
      new TimeContextAnalyzer(),
      new LocationContextAnalyzer(),
      new CustomerHistoryAnalyzer(),
      new SeasonalAnalyzer(),
      new WeatherAnalyzer()
    ];
  }

  private analyzeKeywords(messageText: string): KeywordAnalysis {
    const text = messageText.toLowerCase();
    const matches: Array<{ keyword: string; severity: string; type: EmergencyType; weight: number }> = [];
    let totalWeight = 0;

    for (const [keyword, data] of this.emergencyKeywords.entries()) {
      if (text.includes(keyword)) {
        matches.push({ keyword, ...data });
        totalWeight += data.weight;
      }
    }

    const isEmergency = matches.length > 0;
    const maxSeverity = this.getMaxSeverity(matches.map(m => m.severity));
    const confidence = Math.min(0.9, totalWeight / 10); // Cap at 90% for keyword-only analysis

    return {
      isEmergency,
      severity: maxSeverity,
      confidence,
      matches,
      totalWeight
    };
  }

  private async analyzeContext(context: EmergencyContext): Promise<ContextAnalysis> {
    const analyses = await Promise.all(
      this.contextAnalyzers.map(analyzer => analyzer.analyze(context))
    );

    return {
      factors: analyses.flatMap(a => a.factors),
      urgencyModifier: analyses.reduce((sum, a) => sum + a.urgencyModifier, 0),
      confidence: Math.min(1.0, analyses.reduce((sum, a) => sum + a.confidence, 0) / analyses.length)
    };
  }

  private async analyzeHistoricalPatterns(context: EmergencyContext): Promise<HistoricalAnalysis> {
    if (!context.customer) {
      return { hasPatterns: false, confidence: 0, insights: [] };
    }

    const knex = await this.db.getKnex();
    
    // Get customer's emergency history
    const emergencyHistory = await knex('conversations')
      .join('messages', 'conversations.id', 'messages.conversationId')
      .where('conversations.customerId', context.customer.id)
      .where('conversations.isEmergency', true)
      .where('messages.createdAt', '>', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)) // Last year
      .select('messages.content', 'conversations.priority', 'messages.createdAt')
      .orderBy('messages.createdAt', 'desc')
      .limit(10);

    const insights: string[] = [];
    let confidence = 0.3; // Base confidence for historical analysis

    if (emergencyHistory.length > 0) {
      insights.push(`Customer has ${emergencyHistory.length} emergency contacts in the past year`);
      
      // Check for recurring patterns
      const recentEmergencies = emergencyHistory.filter(e => 
        new Date(e.createdAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      );
      
      if (recentEmergencies.length > 1) {
        insights.push('Multiple recent emergencies - possible ongoing issue');
        confidence += 0.2;
      }
      
      // Check for seasonal patterns
      const currentMonth = new Date().getMonth();
      const sameMonthEmergencies = emergencyHistory.filter(e => 
        new Date(e.createdAt).getMonth() === currentMonth
      );
      
      if (sameMonthEmergencies.length > 0) {
        insights.push('Historical emergencies in same time period');
        confidence += 0.1;
      }
    }

    return {
      hasPatterns: insights.length > 0,
      confidence,
      insights
    };
  }

  private analyzeSemantics(messageText: string): SemanticAnalysis {
    // Advanced semantic analysis would integrate with NLP services
    // For now, implementing rule-based semantic analysis
    
    const text = messageText.toLowerCase();
    const urgencyIndicators = [
      'right now', 'immediately', 'can\'t wait', 'dangerous', 'safety issue',
      'health hazard', 'getting worse', 'spreading', 'all over'
    ];
    
    const emotionalIndicators = [
      'panicking', 'scared', 'worried', 'desperate', 'frantic', 'stressed'
    ];
    
    const quantityIndicators = [
      'everywhere', 'lots of', 'tons of', 'gallons', 'flooding', 'soaked'
    ];

    let semanticScore = 0;
    const indicators: string[] = [];

    // Check for urgency
    for (const indicator of urgencyIndicators) {
      if (text.includes(indicator)) {
        semanticScore += 0.3;
        indicators.push(`urgency: ${indicator}`);
      }
    }

    // Check for emotional distress
    for (const indicator of emotionalIndicators) {
      if (text.includes(indicator)) {
        semanticScore += 0.2;
        indicators.push(`emotional: ${indicator}`);
      }
    }

    // Check for quantity/severity indicators
    for (const indicator of quantityIndicators) {
      if (text.includes(indicator)) {
        semanticScore += 0.25;
        indicators.push(`quantity: ${indicator}`);
      }
    }

    return {
      urgencyScore: Math.min(1.0, semanticScore),
      indicators,
      confidence: indicators.length > 0 ? 0.7 : 0.3
    };
  }

  private combineAnalyses(
    keywordAnalysis: KeywordAnalysis,
    contextAnalysis: ContextAnalysis,
    historicalAnalysis: HistoricalAnalysis,
    semanticAnalysis: SemanticAnalysis,
    context: EmergencyContext
  ): EmergencyClassification {
    
    // Calculate base urgency score
    let urgencyScore = 0;
    
    if (keywordAnalysis.isEmergency) {
      urgencyScore += keywordAnalysis.totalWeight * 8; // Base score from keywords
    }
    
    urgencyScore += semanticAnalysis.urgencyScore * 20; // Semantic urgency
    urgencyScore += contextAnalysis.urgencyModifier * 10; // Context factors
    
    // Apply historical patterns
    if (historicalAnalysis.hasPatterns) {
      urgencyScore += 10;
    }
    
    // Normalize urgency score (0-100)
    urgencyScore = Math.min(100, Math.max(0, urgencyScore));
    
    // Determine severity based on urgency score
    let severity: 'critical' | 'high' | 'medium' | 'low';
    if (urgencyScore >= 80) severity = 'critical';
    else if (urgencyScore >= 60) severity = 'high';
    else if (urgencyScore >= 40) severity = 'medium';
    else severity = 'low';
    
    // Calculate overall confidence
    const confidenceWeights = [
      keywordAnalysis.confidence * 0.4,
      contextAnalysis.confidence * 0.3,
      historicalAnalysis.confidence * 0.2,
      semanticAnalysis.confidence * 0.1
    ];
    const confidence = confidenceWeights.reduce((sum, weight) => sum + weight, 0);
    
    // Determine if this qualifies as an emergency
    const isEmergency = urgencyScore >= 40 || keywordAnalysis.isEmergency;
    
    // Determine emergency type
    const emergencyType = keywordAnalysis.matches.length > 0 
      ? keywordAnalysis.matches[0].type 
      : 'general_emergency';
    
    // Extract key indicators
    const keyIndicators = [
      ...keywordAnalysis.matches.map(m => m.keyword),
      ...semanticAnalysis.indicators
    ];
    
    // Estimate response time
    const responseTime = this.calculateResponseTime(severity, context);
    
    // Generate suggested actions
    const suggestedActions = this.generateSuggestedActions(severity, emergencyType, context);
    
    // Determine if escalation is required
    const escalationRequired = severity === 'critical' || urgencyScore >= 90;

    return {
      isEmergency,
      severity,
      confidence,
      urgencyScore,
      emergencyType,
      keyIndicators,
      contextFactors: contextAnalysis.factors,
      estimatedResponseTime: responseTime,
      suggestedActions,
      escalationRequired,
      reasoning: this.generateReasoning(keywordAnalysis, contextAnalysis, historicalAnalysis, semanticAnalysis)
    };
  }

  private async getAvailableTechnicians(
    classification: EmergencyClassification,
    context: EmergencyContext
  ): Promise<Staff[]> {
    const knex = await this.db.getKnex();
    
    // Base query for active technicians
    let query = knex('staff')
      .where('status', 'active')
      .where('onCallAvailable', true);
    
    // For critical emergencies, include emergency technicians
    if (classification.severity === 'critical') {
      query = query.where('emergencyTechnician', true);
    }
    
    // TODO: Add scheduling integration to check actual availability
    // For now, assume all active technicians are potentially available
    
    const technicians = await query;
    return technicians;
  }

  private async scoreTechnicians(
    technicians: Staff[],
    classification: EmergencyClassification,
    context: EmergencyContext
  ): Promise<RoutingOption[]> {
    
    const options: RoutingOption[] = [];
    
    for (const technician of technicians) {
      // Calculate skill match score (0-1)
      const skillMatchScore = this.calculateSkillMatch(technician, classification.emergencyType);
      
      // Calculate workload score (0-1) - lower workload = higher score
      const workloadScore = await this.calculateWorkloadScore(technician);
      
      // Calculate proximity score (0-1) - closer = higher score
      const proximityScore = await this.calculateProximityScore(technician, context);
      
      // Calculate overall score with weights
      const overallScore = 
        skillMatchScore * 0.4 +
        workloadScore * 0.3 +
        proximityScore * 0.3;
      
      // Estimate arrival time
      const estimatedArrivalTime = await this.estimateArrivalTime(technician, context);
      
      options.push({
        technician,
        estimatedArrivalTime,
        skillMatchScore,
        workloadScore,
        proximityScore,
        overallScore,
        pros: this.generatePros(technician, skillMatchScore, workloadScore, proximityScore),
        cons: this.generateCons(technician, skillMatchScore, workloadScore, proximityScore)
      });
    }
    
    return options.sort((a, b) => b.overallScore - a.overallScore);
  }

  private async selectOptimalRouting(
    options: RoutingOption[],
    classification: EmergencyClassification,
    context: EmergencyContext
  ): Promise<Omit<EmergencyRoutingDecision, 'escalationPlan' | 'customerNotifications'>> {
    
    if (options.length === 0) {
      throw new Error('No available technicians for emergency routing');
    }
    
    const primaryTechnician = options[0].technician;
    const backupTechnicians = options.slice(1, 3).map(opt => opt.technician);
    
    // Calculate resource requirements
    const resourceRequirements = this.calculateResourceRequirements(classification, context);
    
    return {
      primaryTechnician,
      backupTechnicians,
      estimatedArrivalTime: options[0].estimatedArrivalTime,
      routingReason: `Selected based on optimal combination of skills (${(options[0].skillMatchScore * 100).toFixed(0)}%), availability (${(options[0].workloadScore * 100).toFixed(0)}%), and proximity (${(options[0].proximityScore * 100).toFixed(0)}%)`,
      confidence: options[0].overallScore,
      alternativeOptions: options.slice(1, 4),
      resourceRequirements
    };
  }

  private createEscalationPlan(
    classification: EmergencyClassification,
    routing: Partial<EmergencyRoutingDecision>
  ): EscalationStep[] {
    
    const steps: EscalationStep[] = [];
    
    // Immediate escalation for critical emergencies
    if (classification.severity === 'critical') {
      steps.push({
        triggerCondition: 'immediate',
        triggerTimeMinutes: 0,
        action: 'notify_backup',
        automated: true
      });
      
      steps.push({
        triggerCondition: 'no_response_from_primary',
        triggerTimeMinutes: 5,
        action: 'dispatch_additional',
        automated: true
      });
    }
    
    // Standard escalation timeline
    steps.push({
      triggerCondition: 'no_arrival_confirmation',
      triggerTimeMinutes: Math.ceil((routing.estimatedArrivalTime || 30) * 1.2),
      action: 'call_manager',
      automated: true
    });
    
    if (classification.emergencyType === 'gas_leak') {
      steps.push({
        triggerCondition: 'gas_emergency_protocol',
        triggerTimeMinutes: 0,
        action: 'contact_emergency_services',
        automated: false
      });
    }
    
    return steps;
  }

  private createNotificationPlan(
    classification: EmergencyClassification,
    routing: Partial<EmergencyRoutingDecision>
  ): NotificationPlan[] {
    
    const notifications: NotificationPlan[] = [];
    
    // Immediate acknowledgment
    notifications.push({
      channel: 'sms',
      message: `Emergency received. ${routing.primaryTechnician?.firstName} is being dispatched. ETA: ${routing.estimatedArrivalTime} minutes.`,
      timing: 'immediate',
      priority: 1
    });
    
    // ETA updates
    notifications.push({
      channel: 'sms',
      message: 'Technician is on the way. Updated ETA: {eta} minutes.',
      timing: 'eta_update',
      priority: 2
    });
    
    // Arrival notification
    notifications.push({
      channel: 'sms',
      message: 'Technician has arrived at your location.',
      timing: 'arrival',
      priority: 1
    });
    
    // For critical emergencies, add phone call
    if (classification.severity === 'critical') {
      notifications.unshift({
        channel: 'call',
        message: 'This is an automated call regarding your plumbing emergency. A technician is being dispatched immediately.',
        timing: 'immediate',
        priority: 0
      });
    }
    
    return notifications;
  }

  // Additional helper methods would be implemented here...
  // (Due to length constraints, I'm showing the core structure)

  private getMaxSeverity(severities: string[]): 'critical' | 'high' | 'medium' | 'low' {
    if (severities.includes('critical')) return 'critical';
    if (severities.includes('high')) return 'high';
    if (severities.includes('medium')) return 'medium';
    return 'low';
  }

  private calculateResponseTime(severity: string, context: EmergencyContext): number {
    const baseTimes = {
      critical: 20,
      high: 45,
      medium: 90,
      low: 180
    };
    
    let responseTime = baseTimes[severity as keyof typeof baseTimes] || 120;
    
    // Adjust for time of day
    const hour = context.timestamp.getHours();
    if (hour < 7 || hour > 19) {
      responseTime *= 1.3; // Slower response outside business hours
    }
    
    return Math.round(responseTime);
  }

  private generateSuggestedActions(
    severity: string,
    emergencyType: EmergencyType,
    context: EmergencyContext
  ): string[] {
    const actions: string[] = [];
    
    actions.push('DISPATCH_TECHNICIAN');
    actions.push('SEND_CUSTOMER_NOTIFICATION');
    
    if (severity === 'critical') {
      actions.push('NOTIFY_MANAGEMENT');
      actions.push('PREPARE_BACKUP_TECHNICIAN');
    }
    
    if (emergencyType === 'gas_leak') {
      actions.push('CONTACT_GAS_COMPANY');
      actions.push('ADVISE_EVACUATION');
    }
    
    if (emergencyType === 'major_flood') {
      actions.push('DISPATCH_WATER_EXTRACTION_EQUIPMENT');
      actions.push('CONTACT_INSURANCE_NOTIFICATION_SERVICE');
    }
    
    return actions;
  }

  private generateReasoning(
    keywordAnalysis: KeywordAnalysis,
    contextAnalysis: ContextAnalysis,
    historicalAnalysis: HistoricalAnalysis,
    semanticAnalysis: SemanticAnalysis
  ): string {
    const reasons: string[] = [];
    
    if (keywordAnalysis.isEmergency) {
      reasons.push(`Emergency keywords detected: ${keywordAnalysis.matches.map(m => m.keyword).join(', ')}`);
    }
    
    if (semanticAnalysis.indicators.length > 0) {
      reasons.push(`Semantic analysis indicates urgency: ${semanticAnalysis.indicators.join(', ')}`);
    }
    
    if (contextAnalysis.factors.length > 0) {
      reasons.push(`Context factors: ${contextAnalysis.factors.map(f => f.factor).join(', ')}`);
    }
    
    if (historicalAnalysis.hasPatterns) {
      reasons.push(`Historical patterns: ${historicalAnalysis.insights.join(', ')}`);
    }
    
    return reasons.join('. ');
  }

  private createSafetyFallbackClassification(context: EmergencyContext): EmergencyClassification {
    return {
      isEmergency: true, // Err on the side of caution
      severity: 'high',
      confidence: 0.5,
      urgencyScore: 70,
      emergencyType: 'general_emergency',
      keyIndicators: ['safety_fallback_triggered'],
      contextFactors: [],
      estimatedResponseTime: 45,
      suggestedActions: ['DISPATCH_TECHNICIAN', 'MANUAL_REVIEW_REQUIRED'],
      escalationRequired: true,
      reasoning: 'Emergency classification failed - using safety fallback protocol'
    };
  }

  private async logClassificationForTraining(
    context: EmergencyContext,
    classification: EmergencyClassification,
    processingTime: number
  ): Promise<void> {
    // Log classification results for machine learning training
    const knex = await this.db.getKnex();
    
    try {
      await knex('emergency_classification_logs').insert({
        id: `ecl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        messageText: context.messageText,
        customerPhone: context.customerPhone,
        classification: JSON.stringify(classification),
        processingTimeMs: processingTime,
        createdAt: new Date()
      });
    } catch (error) {
      logger.warn('Failed to log classification for training', { error });
    }
  }

  private async startEscalationMonitoring(
    decision: EmergencyRoutingDecision,
    classification: EmergencyClassification,
    context: EmergencyContext
  ): Promise<void> {
    // Start background monitoring process
    // This would typically be handled by a job queue system
    logger.info('Starting escalation monitoring', {
      emergencyType: classification.emergencyType,
      severity: classification.severity,
      primaryTechnician: decision.primaryTechnician.id
    });
  }

  // Stub methods for complex calculations that would be fully implemented
  private calculateSkillMatch(technician: Staff, emergencyType: EmergencyType): number {
    // Implementation would check technician specialties against emergency type
    return 0.8; // Placeholder
  }

  private async calculateWorkloadScore(technician: Staff): Promise<number> {
    // Implementation would check current job assignments
    return 0.7; // Placeholder
  }

  private async calculateProximityScore(technician: Staff, context: EmergencyContext): Promise<number> {
    // Implementation would use GPS/mapping services
    return 0.9; // Placeholder
  }

  private async estimateArrivalTime(technician: Staff, context: EmergencyContext): Promise<number> {
    // Implementation would use real traffic data
    return 35; // Placeholder
  }

  private generatePros(technician: Staff, skillScore: number, workloadScore: number, proximityScore: number): string[] {
    const pros: string[] = [];
    if (skillScore > 0.8) pros.push('Highly skilled for this emergency type');
    if (workloadScore > 0.8) pros.push('Low current workload');
    if (proximityScore > 0.8) pros.push('Close to emergency location');
    return pros;
  }

  private generateCons(technician: Staff, skillScore: number, workloadScore: number, proximityScore: number): string[] {
    const cons: string[] = [];
    if (skillScore < 0.5) cons.push('Limited experience with this emergency type');
    if (workloadScore < 0.5) cons.push('High current workload');
    if (proximityScore < 0.5) cons.push('Far from emergency location');
    return cons;
  }

  private calculateResourceRequirements(
    classification: EmergencyClassification,
    context: EmergencyContext
  ): ResourceRequirement[] {
    const requirements: ResourceRequirement[] = [];
    
    // Standard requirements
    requirements.push({
      type: 'vehicle',
      description: 'Service vehicle with standard plumbing tools',
      required: true
    });
    
    // Emergency-specific requirements
    if (classification.emergencyType === 'major_flood') {
      requirements.push({
        type: 'equipment',
        description: 'Water extraction equipment',
        required: true,
        estimatedCost: 200
      });
    }
    
    if (classification.emergencyType === 'gas_leak') {
      requirements.push({
        type: 'expertise',
        description: 'Gas line certified technician',
        required: true
      });
    }
    
    return requirements;
  }
}

// Supporting interfaces and classes
interface KeywordAnalysis {
  isEmergency: boolean;
  severity: string;
  confidence: number;
  matches: Array<{ keyword: string; severity: string; type: EmergencyType; weight: number }>;
  totalWeight: number;
}

interface ContextAnalysis {
  factors: ContextFactor[];
  urgencyModifier: number;
  confidence: number;
}

interface HistoricalAnalysis {
  hasPatterns: boolean;
  confidence: number;
  insights: string[];
}

interface SemanticAnalysis {
  urgencyScore: number;
  indicators: string[];
  confidence: number;
}

// Abstract context analyzer classes
abstract class ContextAnalyzer {
  abstract analyze(context: EmergencyContext): Promise<{ factors: ContextFactor[]; urgencyModifier: number; confidence: number }>;
}

class TimeContextAnalyzer extends ContextAnalyzer {
  async analyze(context: EmergencyContext): Promise<{ factors: ContextFactor[]; urgencyModifier: number; confidence: number }> {
    const hour = context.timestamp.getHours();
    const factors: ContextFactor[] = [];
    let urgencyModifier = 0;
    
    if (hour < 6 || hour > 22) {
      factors.push({
        factor: 'after_hours_emergency',
        weight: 0.3,
        impact: 'increases_urgency',
        description: 'Emergency occurred outside normal business hours'
      });
      urgencyModifier += 0.2;
    }
    
    return { factors, urgencyModifier, confidence: 0.9 };
  }
}

class LocationContextAnalyzer extends ContextAnalyzer {
  async analyze(context: EmergencyContext): Promise<{ factors: ContextFactor[]; urgencyModifier: number; confidence: number }> {
    // Implementation would analyze location-specific factors
    return { factors: [], urgencyModifier: 0, confidence: 0.5 };
  }
}

class CustomerHistoryAnalyzer extends ContextAnalyzer {
  async analyze(context: EmergencyContext): Promise<{ factors: ContextFactor[]; urgencyModifier: number; confidence: number }> {
    // Implementation would analyze customer history
    return { factors: [], urgencyModifier: 0, confidence: 0.6 };
  }
}

class SeasonalAnalyzer extends ContextAnalyzer {
  async analyze(context: EmergencyContext): Promise<{ factors: ContextFactor[]; urgencyModifier: number; confidence: number }> {
    const month = context.timestamp.getMonth();
    const factors: ContextFactor[] = [];
    let urgencyModifier = 0;
    
    // Winter months - higher risk of frozen pipes
    if (month >= 11 || month <= 2) {
      factors.push({
        factor: 'winter_season',
        weight: 0.2,
        impact: 'increases_urgency',
        description: 'Winter season increases risk of frozen pipes'
      });
      urgencyModifier += 0.1;
    }
    
    return { factors, urgencyModifier, confidence: 0.8 };
  }
}

class WeatherAnalyzer extends ContextAnalyzer {
  async analyze(context: EmergencyContext): Promise<{ factors: ContextFactor[]; urgencyModifier: number; confidence: number }> {
    // Implementation would integrate with weather API
    return { factors: [], urgencyModifier: 0, confidence: 0.4 };
  }
}

export default EmergencyRoutingService;