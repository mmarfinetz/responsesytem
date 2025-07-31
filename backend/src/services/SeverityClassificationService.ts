import { DatabaseService } from './DatabaseService';
import { logger } from '../utils/logger';
import { EmergencyContext, EmergencyClassification } from './EmergencyRoutingService';

export interface SeverityMetrics {
  urgencyScore: number; // 0-100
  riskScore: number; // 0-100
  impactScore: number; // 0-100
  timeScore: number; // 0-100
  resourceScore: number; // 0-100
  combinedScore: number; // 0-100
}

export interface SeverityFactors {
  keywordFactors: KeywordFactor[];
  contextualFactors: ContextualFactor[];
  temporalFactors: TemporalFactor[];
  historicalFactors: HistoricalFactor[];
  riskFactors: RiskFactor[];
}

export interface KeywordFactor {
  keyword: string;
  category: 'damage' | 'safety' | 'urgency' | 'volume' | 'emotion';
  baseScore: number;
  multiplier: number;
  confidence: number;
}

export interface ContextualFactor {
  factor: string;
  type: 'property' | 'customer' | 'location' | 'weather' | 'equipment';
  impact: number; // -50 to +50
  confidence: number;
}

export interface TemporalFactor {
  factor: string;
  timeOfDay: 'business_hours' | 'after_hours' | 'overnight' | 'weekend' | 'holiday';
  seasonalImpact: number;
  urgencyMultiplier: number;
}

export interface HistoricalFactor {
  pattern: string;
  frequency: number;
  averageSeverity: string;
  outcomeSuccess: number; // 0-1
  responseTimeImpact: number;
}

export interface RiskFactor {
  risk: string;
  probability: number; // 0-1
  potential_damage: 'low' | 'medium' | 'high' | 'critical';
  safety_concern: boolean;
  property_threat: boolean;
  business_impact: boolean;
}

export interface SeverityClassificationResult {
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
  metrics: SeverityMetrics;
  factors: SeverityFactors;
  reasoning: DetailedReasoning;
  recommendedResponse: ResponseRecommendation;
  escalationTriggers: EscalationTrigger[];
}

export interface DetailedReasoning {
  primaryReasons: string[];
  contributingFactors: string[];
  mitigatingFactors: string[];
  uncertainties: string[];
  modelConfidence: ModelConfidence;
}

export interface ModelConfidence {
  overallConfidence: number;
  keywordConfidence: number;
  contextConfidence: number;
  historicalConfidence: number;
  riskAssessmentConfidence: number;
}

export interface ResponseRecommendation {
  immediateActions: string[];
  resourcesNeeded: string[];
  timeframe: string;
  skillsRequired: string[];
  equipmentRequired: string[];
  safetyPrecautions: string[];
}

export interface EscalationTrigger {
  condition: string;
  threshold: number;
  timeframe: number; // minutes
  action: string;
  automated: boolean;
}

export class SeverityClassificationService {
  private severityRules: Map<string, SeverityRule>;
  private contextualRules: Map<string, ContextualRule>;
  private emergencyPatterns: Map<string, EmergencyPattern>;

  constructor(private db: DatabaseService) {
    this.initializeSeverityRules();
    this.initializeContextualRules();
    this.initializeEmergencyPatterns();
  }

  /**
   * Advanced severity classification with confidence scoring
   */
  async classifySeverity(
    context: EmergencyContext,
    initialClassification?: Partial<EmergencyClassification>
  ): Promise<SeverityClassificationResult> {
    try {
      const startTime = Date.now();
      
      logger.info('Starting severity classification', {
        customerPhone: context.customerPhone,
        hasInitialClassification: !!initialClassification
      });

      // 1. Analyze keyword factors
      const keywordFactors = this.analyzeKeywordFactors(context.messageText);
      
      // 2. Analyze contextual factors
      const contextualFactors = await this.analyzeContextualFactors(context);
      
      // 3. Analyze temporal factors
      const temporalFactors = this.analyzeTemporalFactors(context);
      
      // 4. Analyze historical factors
      const historicalFactors = await this.analyzeHistoricalFactors(context);
      
      // 5. Assess risk factors
      const riskFactors = await this.assessRiskFactors(context, keywordFactors);
      
      // 6. Calculate severity metrics
      const metrics = this.calculateSeverityMetrics(
        keywordFactors,
        contextualFactors,
        temporalFactors,
        historicalFactors,
        riskFactors
      );
      
      // 7. Determine final severity level
      const severity = this.determineSeverityLevel(metrics);
      
      // 8. Calculate overall confidence
      const confidence = this.calculateOverallConfidence(
        keywordFactors,
        contextualFactors,
        temporalFactors,
        historicalFactors,
        riskFactors
      );
      
      // 9. Generate detailed reasoning
      const reasoning = this.generateDetailedReasoning(
        keywordFactors,
        contextualFactors,
        temporalFactors,
        historicalFactors,
        riskFactors,
        metrics
      );
      
      // 10. Create response recommendations
      const recommendedResponse = this.createResponseRecommendation(
        severity,
        context,
        keywordFactors,
        riskFactors
      );
      
      // 11. Define escalation triggers
      const escalationTriggers = this.defineEscalationTriggers(severity, metrics);

      const result: SeverityClassificationResult = {
        severity,
        confidence,
        metrics,
        factors: {
          keywordFactors,
          contextualFactors,
          temporalFactors,
          historicalFactors,
          riskFactors
        },
        reasoning,
        recommendedResponse,
        escalationTriggers
      };

      const processingTime = Date.now() - startTime;
      
      logger.info('Severity classification completed', {
        severity,
        confidence,
        combinedScore: metrics.combinedScore,
        processingTimeMs: processingTime
      });

      // Log classification for continuous improvement
      await this.logClassificationResult(context, result, processingTime);

      return result;

    } catch (error) {
      logger.error('Severity classification failed', {
        customerPhone: context.customerPhone,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Return safe fallback classification
      return this.createFallbackClassification(context);
    }
  }

  /**
   * Re-evaluate severity based on new information
   */
  async reevaluateSeverity(
    originalResult: SeverityClassificationResult,
    newContext: EmergencyContext,
    updates: {
      technicianFeedback?: string;
      customerUpdate?: string;
      situationChanges?: string[];
    }
  ): Promise<SeverityClassificationResult> {
    
    logger.info('Re-evaluating severity classification', {
      originalSeverity: originalResult.severity,
      hasUpdates: Object.keys(updates).length > 0
    });

    // Create enhanced context with updates
    const enhancedContext: EmergencyContext = {
      ...newContext,
      messageText: `${newContext.messageText} ${updates.technicianFeedback || ''} ${updates.customerUpdate || ''}`.trim()
    };

    // Re-run classification with enhanced context
    const newResult = await this.classifySeverity(enhancedContext);

    // Compare results and log significant changes
    if (newResult.severity !== originalResult.severity) {
      logger.warn('Severity level changed during re-evaluation', {
        originalSeverity: originalResult.severity,
        newSeverity: newResult.severity,
        confidence: newResult.confidence
      });
    }

    return newResult;
  }

  /**
   * Batch classify multiple emergencies for comparison
   */
  async batchClassifySeverity(contexts: EmergencyContext[]): Promise<SeverityClassificationResult[]> {
    logger.info('Starting batch severity classification', { count: contexts.length });

    const results = await Promise.all(
      contexts.map(context => this.classifySeverity(context))
    );

    // Sort by severity and combined score for prioritization
    results.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      const aSeverityScore = severityOrder[a.severity];
      const bSeverityScore = severityOrder[b.severity];
      
      if (aSeverityScore !== bSeverityScore) {
        return bSeverityScore - aSeverityScore;
      }
      
      return b.metrics.combinedScore - a.metrics.combinedScore;
    });

    logger.info('Batch severity classification completed', {
      critical: results.filter(r => r.severity === 'critical').length,
      high: results.filter(r => r.severity === 'high').length,
      medium: results.filter(r => r.severity === 'medium').length,
      low: results.filter(r => r.severity === 'low').length
    });

    return results;
  }

  // Private helper methods

  private initializeSeverityRules(): void {
    this.severityRules = new Map([
      // Critical severity rules
      ['gas_leak_detection', {
        pattern: /gas\s*(leak|smell|odor)|smell.*gas|propane.*leak/i,
        baseScore: 95,
        category: 'safety',
        riskFactors: ['explosion_risk', 'evacuation_required'],
        immediateActions: ['evacuate_area', 'contact_gas_company', 'no_electrical_switches']
      }],
      
      ['major_flooding', {
        pattern: /flooding|water\s*everywhere|gallons.*water|basement.*flood/i,
        baseScore: 90,
        category: 'damage',
        riskFactors: ['property_damage', 'electrical_hazard', 'mold_risk'],
        immediateActions: ['shut_off_water', 'electricity_safety_check', 'water_extraction']
      }],
      
      ['sewage_emergency', {
        pattern: /sewage.*backup|raw.*sewage|toilet.*overflowing.*sewage/i,
        baseScore: 85,
        category: 'health',
        riskFactors: ['health_hazard', 'contamination', 'property_damage'],
        immediateActions: ['avoid_contact', 'ventilate_area', 'sanitization_required']
      }],
      
      // High severity rules
      ['burst_main_line', {
        pattern: /burst.*main|main.*line.*burst|water.*main.*broken/i,
        baseScore: 80,
        category: 'damage',
        riskFactors: ['property_damage', 'service_disruption'],
        immediateActions: ['shut_off_main_water', 'assess_damage']
      }],
      
      ['no_water_service', {
        pattern: /no.*water|water.*stopped|water.*shut.*off|no.*pressure/i,
        baseScore: 70,
        category: 'service',
        riskFactors: ['service_disruption', 'health_concern'],
        immediateActions: ['check_main_valve', 'assess_service_area']
      }],
      
      // Medium severity rules
      ['significant_leak', {
        pattern: /leak.*ceiling|leak.*wall|pipe.*leak|dripping.*lots/i,
        baseScore: 60,
        category: 'damage',
        riskFactors: ['property_damage', 'mold_risk'],
        immediateActions: ['locate_shutoff', 'contain_water']
      }],
      
      // Low severity rules
      ['minor_issues', {
        pattern: /slow.*drain|drip.*faucet|toilet.*running|minor.*leak/i,
        baseScore: 30,
        category: 'maintenance',
        riskFactors: ['water_waste', 'minor_damage'],
        immediateActions: ['schedule_service']
      }]
    ]);
  }

  private initializeContextualRules(): void {
    this.contextualRules = new Map([
      // Property type impacts
      ['commercial_property', {
        condition: (context: EmergencyContext) => context.customer?.customerType === 'commercial',
        impact: 15,
        reasoning: 'Commercial properties have higher impact due to business disruption'
      }],
      
      ['multi_unit_property', {
        condition: (context: EmergencyContext) => 
          context.location?.address?.toLowerCase().includes('apt') ||
          context.location?.address?.toLowerCase().includes('unit'),
        impact: 10,
        reasoning: 'Multi-unit properties affect multiple tenants'
      }],
      
      // Time-based impacts
      ['after_hours', {
        condition: (context: EmergencyContext) => {
          const hour = context.timestamp.getHours();
          return hour < 7 || hour > 19;
        },
        impact: 8,
        reasoning: 'After-hours emergencies have limited response options'
      }],
      
      ['weekend_emergency', {
        condition: (context: EmergencyContext) => {
          const day = context.timestamp.getDay();
          return day === 0 || day === 6;
        },
        impact: 5,
        reasoning: 'Weekend emergencies have longer resolution times'
      }],
      
      // Weather impacts
      ['freezing_conditions', {
        condition: (context: EmergencyContext) => 
          context.seasonalFactors?.freezingRisk === true,
        impact: 12,
        reasoning: 'Freezing conditions increase pipe burst risk'
      }],
      
      // Customer history impacts
      ['repeat_emergency_customer', {
        condition: (context: EmergencyContext) => 
          (context.previousEmergencies?.length || 0) > 2,
        impact: -5,
        reasoning: 'Repeat customers may have non-critical issues'
      }]
    ]);
  }

  private initializeEmergencyPatterns(): void {
    this.emergencyPatterns = new Map([
      // Escalation patterns
      ['rapid_escalation', {
        indicators: ['getting worse', 'spreading', 'more water', 'bigger leak'],
        severity_increase: 20,
        time_sensitivity: 'high'
      }],
      
      ['customer_panic', {
        indicators: ['help', 'desperate', 'don\'t know what to do', 'scared'],
        severity_increase: 10,
        time_sensitivity: 'medium'
      }],
      
      // De-escalation patterns
      ['contained_situation', {
        indicators: ['turned off water', 'stopped for now', 'under control'],
        severity_decrease: 15,
        time_sensitivity: 'reduced'
      }],
      
      ['minor_impact', {
        indicators: ['small leak', 'not urgent', 'can wait', 'minor problem'],
        severity_decrease: 10,
        time_sensitivity: 'low'
      }]
    ]);
  }

  private analyzeKeywordFactors(messageText: string): KeywordFactor[] {
    const factors: KeywordFactor[] = [];
    const text = messageText.toLowerCase();

    for (const [ruleId, rule] of this.severityRules.entries()) {
      const match = rule.pattern.test(text);
      if (match) {
        factors.push({
          keyword: ruleId,
          category: rule.category as any,
          baseScore: rule.baseScore,
          multiplier: 1.0,
          confidence: 0.9 // High confidence for direct pattern matches
        });
      }
    }

    // Check for intensity modifiers
    const intensityModifiers = [
      { pattern: /emergency|urgent|asap|immediately/i, multiplier: 1.3 },
      { pattern: /lots of|tons of|everywhere|massive/i, multiplier: 1.2 },
      { pattern: /small|minor|little bit/i, multiplier: 0.8 },
      { pattern: /not urgent|can wait|minor/i, multiplier: 0.7 }
    ];

    for (const factor of factors) {
      for (const modifier of intensityModifiers) {
        if (modifier.pattern.test(text)) {
          factor.multiplier *= modifier.multiplier;
        }
      }
    }

    return factors;
  }

  private async analyzeContextualFactors(context: EmergencyContext): Promise<ContextualFactor[]> {
    const factors: ContextualFactor[] = [];

    for (const [ruleId, rule] of this.contextualRules.entries()) {
      if (rule.condition(context)) {
        factors.push({
          factor: ruleId,
          type: this.getContextualType(ruleId),
          impact: rule.impact,
          confidence: 0.8
        });
      }
    }

    // Add location-specific factors
    if (context.location?.city) {
      const locationFactors = await this.analyzeLocationFactors(context.location);
      factors.push(...locationFactors);
    }

    return factors;
  }

  private analyzeTemporalFactors(context: EmergencyContext): TemporalFactor[] {
    const factors: TemporalFactor[] = [];
    const timestamp = context.timestamp;
    const hour = timestamp.getHours();
    const day = timestamp.getDay();
    const month = timestamp.getMonth();

    // Time of day analysis
    let timeOfDay: TemporalFactor['timeOfDay'];
    let urgencyMultiplier = 1.0;

    if (hour >= 7 && hour < 19 && day >= 1 && day <= 5) {
      timeOfDay = 'business_hours';
      urgencyMultiplier = 1.0;
    } else if ((hour >= 19 && hour < 23) || (hour >= 6 && hour < 7)) {
      timeOfDay = 'after_hours';
      urgencyMultiplier = 1.2;
    } else if (hour >= 23 || hour < 6) {
      timeOfDay = 'overnight';
      urgencyMultiplier = 1.4;
    } else if (day === 0 || day === 6) {
      timeOfDay = 'weekend';
      urgencyMultiplier = 1.3;
    } else {
      timeOfDay = 'business_hours';
    }

    // Seasonal impact analysis
    let seasonalImpact = 0;
    if (month >= 11 || month <= 2) { // Winter months
      seasonalImpact = 10; // Higher impact due to freezing risk
    } else if (month >= 3 && month <= 5) { // Spring
      seasonalImpact = 5; // Moderate impact due to weather changes
    } else if (month >= 6 && month <= 8) { // Summer
      seasonalImpact = 0; // Base impact
    } else { // Fall
      seasonalImpact = 3; // Slight increase due to weather prep
    }

    factors.push({
      factor: 'time_analysis',
      timeOfDay,
      seasonalImpact,
      urgencyMultiplier
    });

    return factors;
  }

  private async analyzeHistoricalFactors(context: EmergencyContext): Promise<HistoricalFactor[]> {
    const factors: HistoricalFactor[] = [];

    if (!context.customer) {
      return factors;
    }

    const knex = await this.db.getKnex();

    try {
      // Analyze emergency patterns for this customer
      const emergencyHistory = await knex('conversations')
        .join('messages', 'conversations.id', 'messages.conversationId')
        .where('conversations.customerId', context.customer.id)
        .where('conversations.isEmergency', true)
        .where('messages.createdAt', '>', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000))
        .select('conversations.priority', 'messages.content', 'conversations.resolvedAt', 'conversations.createdAt')
        .orderBy('messages.createdAt', 'desc');

      if (emergencyHistory.length > 0) {
        // Calculate average severity
        const priorities = emergencyHistory.map(e => e.priority);
        const avgSeverity = this.calculateAverageSeverity(priorities);
        
        // Calculate resolution success rate
        const resolvedCount = emergencyHistory.filter(e => e.resolvedAt).length;
        const outcomeSuccess = resolvedCount / emergencyHistory.length;
        
        // Calculate average response time impact
        const responseTimes = emergencyHistory
          .filter(e => e.resolvedAt)
          .map(e => (new Date(e.resolvedAt).getTime() - new Date(e.createdAt).getTime()) / (1000 * 60));
        
        const avgResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
        const responseTimeImpact = avgResponseTime > 120 ? 5 : -2; // Penalty for slow historical response

        factors.push({
          pattern: 'customer_emergency_history',
          frequency: emergencyHistory.length,
          averageSeverity: avgSeverity,
          outcomeSuccess,
          responseTimeImpact
        });
      }

      // Analyze seasonal patterns
      const currentMonth = context.timestamp.getMonth();
      const seasonalEmergencies = emergencyHistory.filter(e => 
        new Date(e.createdAt).getMonth() === currentMonth
      );

      if (seasonalEmergencies.length > 0) {
        factors.push({
          pattern: 'seasonal_pattern',
          frequency: seasonalEmergencies.length,
          averageSeverity: this.calculateAverageSeverity(seasonalEmergencies.map(e => e.priority)),
          outcomeSuccess: 1.0, // Assume successful for seasonal analysis
          responseTimeImpact: 0
        });
      }

    } catch (error) {
      logger.warn('Failed to analyze historical factors', { error });
    }

    return factors;
  }

  private async assessRiskFactors(
    context: EmergencyContext,
    keywordFactors: KeywordFactor[]
  ): Promise<RiskFactor[]> {
    const risks: RiskFactor[] = [];

    // Safety risks based on keywords
    if (keywordFactors.some(f => f.keyword.includes('gas'))) {
      risks.push({
        risk: 'explosion_hazard',
        probability: 0.8,
        potential_damage: 'critical',
        safety_concern: true,
        property_threat: true,
        business_impact: true
      });
    }

    if (keywordFactors.some(f => f.keyword.includes('flooding') || f.keyword.includes('sewage'))) {
      risks.push({
        risk: 'health_hazard',
        probability: 0.7,
        potential_damage: 'high',
        safety_concern: true,
        property_threat: true,
        business_impact: false
      });
    }

    // Property damage risks
    if (keywordFactors.some(f => f.category === 'damage')) {
      risks.push({
        risk: 'property_damage_escalation',
        probability: 0.6,
        potential_damage: 'medium',
        safety_concern: false,
        property_threat: true,
        business_impact: context.customer?.customerType === 'commercial'
      });
    }

    // Time-sensitive risks
    const hour = context.timestamp.getHours();
    if (hour < 7 || hour > 19) {
      risks.push({
        risk: 'limited_response_availability',
        probability: 0.9,
        potential_damage: 'low',
        safety_concern: false,
        property_threat: false,
        business_impact: true
      });
    }

    return risks;
  }

  private calculateSeverityMetrics(
    keywordFactors: KeywordFactor[],
    contextualFactors: ContextualFactor[],
    temporalFactors: TemporalFactor[],
    historicalFactors: HistoricalFactor[],
    riskFactors: RiskFactor[]
  ): SeverityMetrics {
    
    // Calculate urgency score (0-100)
    let urgencyScore = 0;
    keywordFactors.forEach(factor => {
      urgencyScore += factor.baseScore * factor.multiplier;
    });
    urgencyScore = Math.min(100, urgencyScore);

    // Calculate risk score (0-100)
    let riskScore = 0;
    riskFactors.forEach(risk => {
      const damageWeight = { low: 10, medium: 25, high: 40, critical: 60 }[risk.potential_damage];
      const safetyWeight = risk.safety_concern ? 20 : 0;
      riskScore += risk.probability * (damageWeight + safetyWeight);
    });
    riskScore = Math.min(100, riskScore);

    // Calculate impact score (0-100)
    let impactScore = 50; // Base impact
    contextualFactors.forEach(factor => {
      impactScore += factor.impact;
    });
    impactScore = Math.min(100, Math.max(0, impactScore));

    // Calculate time score (0-100)
    let timeScore = 50; // Base time sensitivity
    temporalFactors.forEach(factor => {
      timeScore *= factor.urgencyMultiplier;
      timeScore += factor.seasonalImpact;
    });
    timeScore = Math.min(100, timeScore);

    // Calculate resource score (0-100)
    let resourceScore = 50; // Base resource requirement
    historicalFactors.forEach(factor => {
      resourceScore += factor.responseTimeImpact;
      if (factor.outcomeSuccess < 0.8) {
        resourceScore += 10; // More resources needed for difficult cases
      }
    });
    resourceScore = Math.min(100, Math.max(0, resourceScore));

    // Calculate combined score with weights
    const combinedScore = Math.round(
      urgencyScore * 0.3 +
      riskScore * 0.25 +
      impactScore * 0.2 +
      timeScore * 0.15 +
      resourceScore * 0.1
    );

    return {
      urgencyScore: Math.round(urgencyScore),
      riskScore: Math.round(riskScore),
      impactScore: Math.round(impactScore),
      timeScore: Math.round(timeScore),
      resourceScore: Math.round(resourceScore),
      combinedScore: Math.min(100, Math.max(0, combinedScore))
    };
  }

  private determineSeverityLevel(metrics: SeverityMetrics): 'critical' | 'high' | 'medium' | 'low' {
    const { combinedScore, riskScore, urgencyScore } = metrics;
    
    // Critical: Very high combined score or extreme risk/urgency
    if (combinedScore >= 85 || riskScore >= 90 || urgencyScore >= 95) {
      return 'critical';
    }
    
    // High: High combined score or significant risk
    if (combinedScore >= 70 || riskScore >= 70 || urgencyScore >= 80) {
      return 'high';
    }
    
    // Medium: Moderate combined score
    if (combinedScore >= 50 || urgencyScore >= 60) {
      return 'medium';
    }
    
    // Low: Everything else
    return 'low';
  }

  private calculateOverallConfidence(
    keywordFactors: KeywordFactor[],
    contextualFactors: ContextualFactor[],
    temporalFactors: TemporalFactor[],
    historicalFactors: HistoricalFactor[],
    riskFactors: RiskFactor[]
  ): number {
    
    const keywordConfidence = keywordFactors.length > 0 
      ? keywordFactors.reduce((sum, f) => sum + f.confidence, 0) / keywordFactors.length
      : 0.3;
    
    const contextConfidence = contextualFactors.length > 0
      ? contextualFactors.reduce((sum, f) => sum + f.confidence, 0) / contextualFactors.length
      : 0.5;
    
    const temporalConfidence = 0.9; // High confidence in temporal analysis
    
    const historicalConfidence = historicalFactors.length > 0 ? 0.7 : 0.4;
    
    const riskConfidence = riskFactors.length > 0 ? 0.8 : 0.5;
    
    // Weighted average of all confidence scores
    const overallConfidence = 
      keywordConfidence * 0.3 +
      contextConfidence * 0.25 +
      temporalConfidence * 0.2 +
      historicalConfidence * 0.15 +
      riskConfidence * 0.1;
    
    return Math.round(overallConfidence * 100) / 100;
  }

  // Additional helper methods would continue here...
  // (Implementing remaining methods for completeness)

  private generateDetailedReasoning(
    keywordFactors: KeywordFactor[],
    contextualFactors: ContextualFactor[],
    temporalFactors: TemporalFactor[],
    historicalFactors: HistoricalFactor[],
    riskFactors: RiskFactor[],
    metrics: SeverityMetrics
  ): DetailedReasoning {
    
    const primaryReasons: string[] = [];
    const contributingFactors: string[] = [];
    const mitigatingFactors: string[] = [];
    const uncertainties: string[] = [];

    // Extract primary reasons from highest-scoring keyword factors
    const topKeywordFactors = keywordFactors
      .sort((a, b) => (b.baseScore * b.multiplier) - (a.baseScore * a.multiplier))
      .slice(0, 3);
    
    topKeywordFactors.forEach(factor => {
      primaryReasons.push(`Detected ${factor.keyword} with ${factor.category} impact (score: ${Math.round(factor.baseScore * factor.multiplier)})`);
    });

    // Extract contributing factors
    contextualFactors
      .filter(f => f.impact > 0)
      .forEach(factor => {
        contributingFactors.push(`${factor.factor}: +${factor.impact} impact`);
      });

    temporalFactors.forEach(factor => {
      if (factor.urgencyMultiplier > 1.0) {
        contributingFactors.push(`${factor.timeOfDay} increases urgency by ${Math.round((factor.urgencyMultiplier - 1) * 100)}%`);
      }
      if (factor.seasonalImpact > 0) {
        contributingFactors.push(`Seasonal factors add ${factor.seasonalImpact} points`);
      }
    });

    // Extract mitigating factors
    contextualFactors
      .filter(f => f.impact < 0)
      .forEach(factor => {
        mitigatingFactors.push(`${factor.factor}: ${factor.impact} impact`);
      });

    historicalFactors.forEach(factor => {
      if (factor.outcomeSuccess > 0.8) {
        mitigatingFactors.push(`High historical success rate (${Math.round(factor.outcomeSuccess * 100)}%)`);
      }
    });

    // Identify uncertainties
    if (keywordFactors.some(f => f.confidence < 0.7)) {
      uncertainties.push('Some keyword matches have lower confidence');
    }
    
    if (historicalFactors.length === 0) {
      uncertainties.push('No historical data available for this customer');
    }
    
    if (contextualFactors.length < 2) {
      uncertainties.push('Limited contextual information available');
    }

    const modelConfidence: ModelConfidence = {
      overallConfidence: this.calculateOverallConfidence(keywordFactors, contextualFactors, temporalFactors, historicalFactors, riskFactors),
      keywordConfidence: keywordFactors.length > 0 ? keywordFactors.reduce((sum, f) => sum + f.confidence, 0) / keywordFactors.length : 0.3,
      contextConfidence: contextualFactors.length > 0 ? contextualFactors.reduce((sum, f) => sum + f.confidence, 0) / contextualFactors.length : 0.5,
      historicalConfidence: historicalFactors.length > 0 ? 0.7 : 0.4,
      riskAssessmentConfidence: riskFactors.length > 0 ? 0.8 : 0.5
    };

    return {
      primaryReasons,
      contributingFactors,
      mitigatingFactors,
      uncertainties,
      modelConfidence
    };
  }

  private createResponseRecommendation(
    severity: 'critical' | 'high' | 'medium' | 'low',
    context: EmergencyContext,
    keywordFactors: KeywordFactor[],
    riskFactors: RiskFactor[]
  ): ResponseRecommendation {
    
    const immediateActions: string[] = [];
    const resourcesNeeded: string[] = [];
    const skillsRequired: string[] = [];
    const equipmentRequired: string[] = [];
    const safetyPrecautions: string[] = [];
    
    // Base actions by severity
    switch (severity) {
      case 'critical':
        immediateActions.push('DISPATCH_IMMEDIATELY', 'NOTIFY_MANAGEMENT', 'PREPARE_BACKUP_TEAM');
        resourcesNeeded.push('Emergency response team', 'Specialized equipment');
        break;
      case 'high':
        immediateActions.push('PRIORITIZE_DISPATCH', 'NOTIFY_SUPERVISOR');
        resourcesNeeded.push('Experienced technician', 'Standard equipment');
        break;
      case 'medium':
        immediateActions.push('SCHEDULE_SAME_DAY', 'ASSIGN_TECHNICIAN');
        resourcesNeeded.push('Regular technician', 'Basic tools');
        break;
      case 'low':
        immediateActions.push('SCHEDULE_WITHIN_24_HOURS');
        resourcesNeeded.push('Any available technician');
        break;
    }
    
    // Add specific actions based on keyword factors
    keywordFactors.forEach(factor => {
      if (factor.keyword.includes('gas')) {
        immediateActions.push('CONTACT_GAS_COMPANY', 'ADVISE_EVACUATION');
        safetyPrecautions.push('No open flames or electrical switches', 'Evacuate area immediately');
        skillsRequired.push('Gas line certification');
      }
      
      if (factor.keyword.includes('flooding')) {
        immediateActions.push('WATER_SHUTOFF_GUIDANCE', 'ELECTRICAL_SAFETY_CHECK');
        equipmentRequired.push('Water extraction equipment', 'Moisture detection tools');
        safetyPrecautions.push('Check electrical safety', 'Wear protective equipment');
      }
      
      if (factor.keyword.includes('sewage')) {
        safetyPrecautions.push('Avoid direct contact', 'Use PPE', 'Ensure ventilation');
        equipmentRequired.push('Protective equipment', 'Sanitization supplies');
        skillsRequired.push('Hazmat handling experience');
      }
    });
    
    // Add safety precautions based on risk factors
    riskFactors.forEach(risk => {
      if (risk.safety_concern) {
        safetyPrecautions.push(`Address ${risk.risk} immediately`);
      }
    });
    
    const timeframe = severity === 'critical' ? 'Within 15 minutes' :
                     severity === 'high' ? 'Within 1 hour' :
                     severity === 'medium' ? 'Within 4 hours' :
                     'Within 24 hours';

    return {
      immediateActions,
      resourcesNeeded,
      timeframe,
      skillsRequired,
      equipmentRequired,
      safetyPrecautions
    };
  }

  private defineEscalationTriggers(
    severity: 'critical' | 'high' | 'medium' | 'low',
    metrics: SeverityMetrics
  ): EscalationTrigger[] {
    
    const triggers: EscalationTrigger[] = [];
    
    // Base escalation triggers by severity
    const escalationTimes = {
      critical: { noResponse: 5, noArrival: 15, noUpdate: 10 },
      high: { noResponse: 15, noArrival: 45, noUpdate: 30 },
      medium: { noResponse: 30, noArrival: 90, noUpdate: 60 },
      low: { noResponse: 60, noArrival: 180, noUpdate: 120 }
    };
    
    const times = escalationTimes[severity];
    
    triggers.push({
      condition: 'no_technician_response',
      threshold: 1,
      timeframe: times.noResponse,
      action: 'notify_backup_technician',
      automated: true
    });
    
    triggers.push({
      condition: 'no_arrival_confirmation',
      threshold: 1,
      timeframe: times.noArrival,
      action: 'escalate_to_supervisor',
      automated: true
    });
    
    triggers.push({
      condition: 'no_status_update',
      threshold: 1,
      timeframe: times.noUpdate,
      action: 'request_status_update',
      automated: true
    });
    
    // Add specific triggers for high-risk situations
    if (severity === 'critical' || metrics.riskScore > 80) {
      triggers.push({
        condition: 'immediate_management_notification',
        threshold: 1,
        timeframe: 0,
        action: 'notify_management_immediately',
        automated: true
      });
    }
    
    return triggers;
  }

  private createFallbackClassification(context: EmergencyContext): SeverityClassificationResult {
    return {
      severity: 'high', // Err on the side of caution
      confidence: 0.5,
      metrics: {
        urgencyScore: 70,
        riskScore: 60,
        impactScore: 50,
        timeScore: 50,
        resourceScore: 50,
        combinedScore: 65
      },
      factors: {
        keywordFactors: [],
        contextualFactors: [],
        temporalFactors: [],
        historicalFactors: [],
        riskFactors: []
      },
      reasoning: {
        primaryReasons: ['Classification system fallback triggered'],
        contributingFactors: ['Limited analysis data available'],
        mitigatingFactors: [],
        uncertainties: ['High uncertainty due to system error'],
        modelConfidence: {
          overallConfidence: 0.5,
          keywordConfidence: 0.3,
          contextConfidence: 0.4,
          historicalConfidence: 0.3,
          riskAssessmentConfidence: 0.4
        }
      },
      recommendedResponse: {
        immediateActions: ['MANUAL_REVIEW_REQUIRED', 'DISPATCH_TECHNICIAN'],
        resourcesNeeded: ['Experienced technician for assessment'],
        timeframe: 'Within 1 hour',
        skillsRequired: ['General plumbing expertise'],
        equipmentRequired: ['Standard diagnostic tools'],
        safetyPrecautions: ['Follow standard safety protocols']
      },
      escalationTriggers: [
        {
          condition: 'immediate_review_required',
          threshold: 1,
          timeframe: 0,
          action: 'notify_human_reviewer',
          automated: true
        }
      ]
    };
  }

  private async logClassificationResult(
    context: EmergencyContext,
    result: SeverityClassificationResult,
    processingTime: number
  ): Promise<void> {
    const knex = await this.db.getKnex();
    
    try {
      await knex('severity_classification_logs').insert({
        id: `scl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        customerPhone: context.customerPhone,
        messageText: context.messageText,
        severity: result.severity,
        confidence: result.confidence,
        combinedScore: result.metrics.combinedScore,
        factors: JSON.stringify(result.factors),
        reasoning: JSON.stringify(result.reasoning),
        processingTimeMs: processingTime,
        createdAt: new Date()
      });
    } catch (error) {
      logger.warn('Failed to log severity classification', { error });
    }
  }

  // Helper methods
  private getContextualType(ruleId: string): ContextualFactor['type'] {
    if (ruleId.includes('property')) return 'property';
    if (ruleId.includes('customer')) return 'customer';
    if (ruleId.includes('location')) return 'location';
    if (ruleId.includes('weather') || ruleId.includes('freezing')) return 'weather';
    if (ruleId.includes('equipment')) return 'equipment';
    return 'property'; // default
  }

  private async analyzeLocationFactors(location: NonNullable<EmergencyContext['location']>): Promise<ContextualFactor[]> {
    const factors: ContextualFactor[] = [];
    
    // This would integrate with location services to determine factors like:
    // - High-density residential areas
    // - Commercial districts
    // - Areas with older infrastructure
    // - Flood-prone areas
    // - Areas with frequent service calls
    
    // Placeholder implementation
    if (location.city?.toLowerCase().includes('downtown')) {
      factors.push({
        factor: 'high_density_area',
        type: 'location',
        impact: 8,
        confidence: 0.7
      });
    }
    
    return factors;
  }

  private calculateAverageSeverity(priorities: string[]): string {
    const severityScores = { low: 1, medium: 2, high: 3, critical: 4, emergency: 4 };
    const totalScore = priorities.reduce((sum, priority) => {
      return sum + (severityScores[priority as keyof typeof severityScores] || 2);
    }, 0);
    
    const averageScore = totalScore / priorities.length;
    
    if (averageScore >= 3.5) return 'critical';
    if (averageScore >= 2.5) return 'high';
    if (averageScore >= 1.5) return 'medium';
    return 'low';
  }
}

// Supporting interfaces
interface SeverityRule {
  pattern: RegExp;
  baseScore: number;
  category: string;
  riskFactors: string[];
  immediateActions: string[];
}

interface ContextualRule {
  condition: (context: EmergencyContext) => boolean;
  impact: number;
  reasoning: string;
}

interface EmergencyPattern {
  indicators: string[];
  severity_increase?: number;
  severity_decrease?: number;
  time_sensitivity: string;
}

export default SeverityClassificationService;