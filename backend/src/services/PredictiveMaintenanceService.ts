import { DatabaseService } from './DatabaseService';
import { logger } from '../utils/logger';
import { Customer, Property, Equipment, ServiceHistory, MaintenanceSchedule } from '../../shared/types';

export interface MaintenancePrediction {
  equipmentId: string;
  predictedFailureDate: Date;
  failureRisk: 'low' | 'medium' | 'high' | 'critical';
  confidenceScore: number;
  recommendedAction: MaintenanceAction;
  reasoning: PredictionReasoning;
  costImplications: CostAnalysis;
  preventiveOptions: PreventiveOption[];
}

export interface MaintenanceAction {
  type: 'inspection' | 'service' | 'repair' | 'replace' | 'monitor';
  urgency: 'immediate' | 'within_week' | 'within_month' | 'routine';
  estimatedCost: number;
  estimatedDuration: number; // minutes
  requiredSkills: string[];
  requiredParts: PartRequirement[];
  description: string;
}

export interface PredictionReasoning {
  primaryFactors: RiskFactor[];
  contributingFactors: RiskFactor[];
  historicalPatterns: HistoricalPattern[];
  seasonalFactors: SeasonalFactor[];
  usagePatterns: UsagePattern[];
  modelConfidence: ModelConfidence;
}

export interface RiskFactor {
  factor: string;
  weight: number;
  impact: 'increases_risk' | 'decreases_risk';
  severity: 'low' | 'medium' | 'high';
  description: string;
  evidenceStrength: number; // 0-1
}

export interface HistoricalPattern {
  pattern: string;
  frequency: number;
  averageLifespan: number; // months
  failureModes: string[];
  seasonality: boolean;
  reliability: number; // 0-1
}

export interface SeasonalFactor {
  season: 'winter' | 'spring' | 'summer' | 'fall';
  riskMultiplier: number;
  commonIssues: string[];
  preventiveMeasures: string[];
}

export interface UsagePattern {
  usageIntensity: 'light' | 'moderate' | 'heavy' | 'extreme';
  peakUsagePeriods: Date[];
  stressFactors: string[];
  wearRate: number; // 0-10 scale
}

export interface ModelConfidence {
  overallConfidence: number;
  dataQuality: number;
  historicalAccuracy: number;
  patternStrength: number;
  uncertaintyFactors: string[];
}

export interface CostAnalysis {
  preventiveCost: number;
  reactiveCost: number;
  costSavings: number;
  riskCostFactors: CostRiskFactor[];
  roi: number; // Return on investment for preventive maintenance
}

export interface CostRiskFactor {
  factor: string;
  probability: number;
  potentialCost: number;
  description: string;
}

export interface PreventiveOption {
  id: string;
  name: string;
  description: string;
  cost: number;
  riskReduction: number; // percentage
  extendedLife: number; // months
  frequencyRequired: 'monthly' | 'quarterly' | 'semi_annual' | 'annual';
  priority: 'low' | 'medium' | 'high';
}

export interface PartRequirement {
  partName: string;
  partNumber?: string;
  quantity: number;
  estimatedCost: number;
  availability: 'in_stock' | 'special_order' | 'discontinued';
  leadTime: number; // days
}

export interface LifecycleAnalysis {
  equipmentId: string;
  currentStage: 'new' | 'prime' | 'mature' | 'declining' | 'critical';
  timeInService: number; // months
  expectedLifespan: number; // months
  remainingLife: number; // months
  maintenanceCostTrend: 'decreasing' | 'stable' | 'increasing' | 'accelerating';
  replacementRecommendation: ReplacementRecommendation;
}

export interface ReplacementRecommendation {
  shouldReplace: boolean;
  recommendedTiming: Date;
  reasoning: string[];
  costBenefit: {
    currentMaintenanceCost: number;
    newEquipmentCost: number;
    energySavings: number;
    reliabilityImprovement: number;
    paybackPeriod: number; // months
  };
  upgradeOptions: UpgradeOption[];
}

export interface UpgradeOption {
  description: string;
  cost: number;
  benefits: string[];
  energyEfficiency: number; // percentage improvement
  expectedLifespan: number; // years
  maintenanceReduction: number; // percentage
}

export interface MaintenanceOptimization {
  customerId: string;
  propertyId: string;
  totalEquipment: number;
  optimizedSchedule: OptimizedScheduleItem[];
  costSavings: number;
  riskReduction: number;
  routeOptimization: RouteOptimization;
  bundlingOpportunities: BundlingOpportunity[];
}

export interface OptimizedScheduleItem {
  equipmentId: string;
  maintenanceType: string;
  scheduledDate: Date;
  priority: number;
  estimatedDuration: number;
  technicianRequirements: string[];
  partRequirements: PartRequirement[];
  dependsOn?: string[]; // Other maintenance items that should be done first
}

export interface RouteOptimization {
  visitDate: Date;
  equipmentToService: string[];
  estimatedTotalTime: number;
  travelOptimization: {
    fromLocation?: string;
    toLocation?: string;
    estimatedTravelTime: number;
    routeNotes?: string;
  };
}

export interface BundlingOpportunity {
  description: string;
  equipmentIds: string[];
  combinedCost: number;
  individualCosts: number;
  savings: number;
  efficiencyGain: string;
}

export class PredictiveMaintenanceService {
  private predictionModels: Map<string, PredictionModel> = new Map();
  private equipmentProfiles: Map<string, EquipmentProfile> = new Map();

  constructor(private db: DatabaseService) {
    this.initializePredictionModels();
    this.loadEquipmentProfiles();
  }

  /**
   * Generate maintenance predictions for equipment
   */
  async generatePredictions(
    equipmentIds?: string[],
    customerId?: string,
    propertyId?: string,
    horizonMonths: number = 12
  ): Promise<MaintenancePrediction[]> {
    try {
      const startTime = Date.now();
      
      logger.info('Starting predictive maintenance analysis', {
        equipmentCount: equipmentIds?.length,
        customerId,
        propertyId,
        horizonMonths
      });

      // 1. Get equipment to analyze
      const equipment = await this.getEquipmentForAnalysis(equipmentIds, customerId, propertyId);
      
      if (equipment.length === 0) {
        return [];
      }

      // 2. Generate predictions for each piece of equipment
      const predictions = await Promise.all(
        equipment.map(async (equip) => {
          return await this.generateEquipmentPrediction(equip, horizonMonths);
        })
      );

      // 3. Filter out low-confidence predictions
      const filteredPredictions = predictions.filter(
        pred => pred.confidenceScore >= 0.6
      );

      // 4. Sort by risk and urgency
      filteredPredictions.sort((a, b) => {
        const riskOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        const aRisk = riskOrder[a.failureRisk];
        const bRisk = riskOrder[b.failureRisk];
        
        if (aRisk !== bRisk) {
          return bRisk - aRisk; // Higher risk first
        }
        
        return a.predictedFailureDate.getTime() - b.predictedFailureDate.getTime(); // Sooner first
      });

      const processingTime = Date.now() - startTime;
      
      logger.info('Predictive maintenance analysis completed', {
        equipmentAnalyzed: equipment.length,
        predictionsGenerated: filteredPredictions.length,
        highRiskCount: filteredPredictions.filter(p => p.failureRisk === 'critical' || p.failureRisk === 'high').length,
        processingTimeMs: processingTime
      });

      // 5. Log predictions for model improvement
      await this.logPredictions(filteredPredictions, processingTime);

      return filteredPredictions;

    } catch (error) {
      logger.error('Predictive maintenance analysis failed', {
        equipmentIds,
        customerId,
        propertyId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Optimize maintenance schedules for a customer/property
   */
  async optimizeMaintenanceSchedule(
    customerId: string,
    propertyId?: string,
    optimizationPeriod: number = 6 // months
  ): Promise<MaintenanceOptimization> {
    try {
      logger.info('Starting maintenance schedule optimization', {
        customerId,
        propertyId,
        optimizationPeriod
      });

      // 1. Get all equipment for the customer/property
      const equipment = await this.getEquipmentForAnalysis(undefined, customerId, propertyId);
      
      // 2. Get maintenance predictions
      const predictions = await this.generatePredictions(
        equipment.map(e => e.id),
        customerId,
        propertyId,
        optimizationPeriod
      );

      // 3. Get existing maintenance schedules
      const existingSchedules = await this.getExistingSchedules(customerId, propertyId);

      // 4. Optimize scheduling
      const optimizedSchedule = await this.createOptimizedSchedule(
        predictions,
        existingSchedules,
        equipment
      );

      // 5. Analyze route optimization opportunities
      const routeOptimization = await this.optimizeServiceRoutes(optimizedSchedule);

      // 6. Find bundling opportunities
      const bundlingOpportunities = await this.findBundlingOpportunities(
        optimizedSchedule,
        equipment
      );

      // 7. Calculate cost savings
      const costSavings = await this.calculateOptimizationSavings(
        optimizedSchedule,
        existingSchedules,
        bundlingOpportunities
      );

      // 8. Calculate risk reduction
      const riskReduction = this.calculateRiskReduction(predictions, optimizedSchedule);

      const result: MaintenanceOptimization = {
        customerId,
        propertyId: propertyId || '',
        totalEquipment: equipment.length,
        optimizedSchedule,
        costSavings,
        riskReduction,
        routeOptimization,
        bundlingOpportunities
      };

      logger.info('Maintenance schedule optimization completed', {
        customerId,
        totalEquipment: equipment.length,
        scheduledItems: optimizedSchedule.length,
        costSavings,
        riskReduction
      });

      return result;

    } catch (error) {
      logger.error('Maintenance schedule optimization failed', {
        customerId,
        propertyId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Analyze equipment lifecycle status
   */
  async analyzeEquipmentLifecycle(equipmentId: string): Promise<LifecycleAnalysis> {
    try {
      const equipment = await this.getEquipmentById(equipmentId);
      if (!equipment) {
        throw new Error(`Equipment ${equipmentId} not found`);
      }

      // Calculate time in service
      const installDate = equipment.installationDate || equipment.createdAt;
      const timeInService = this.calculateMonthsBetween(installDate, new Date());

      // Get equipment profile for lifecycle analysis
      const profile = this.getEquipmentProfile(equipment.equipmentType);
      const expectedLifespan = profile.expectedLifespan;
      const remainingLife = Math.max(0, expectedLifespan - timeInService);

      // Determine current lifecycle stage
      const currentStage = this.determineLifecycleStage(timeInService, expectedLifespan);

      // Analyze maintenance cost trend
      const maintenanceCostTrend = await this.analyzeMaintenanceCostTrend(equipmentId);

      // Generate replacement recommendation
      const replacementRecommendation = await this.generateReplacementRecommendation(
        equipment,
        timeInService,
        remainingLife,
        maintenanceCostTrend
      );

      return {
        equipmentId,
        currentStage,
        timeInService,
        expectedLifespan,
        remainingLife,
        maintenanceCostTrend,
        replacementRecommendation
      };

    } catch (error) {
      logger.error('Equipment lifecycle analysis failed', {
        equipmentId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Create proactive maintenance recommendations
   */
  async generateProactiveRecommendations(
    customerId: string,
    priority: 'high_risk' | 'cost_savings' | 'comprehensive' = 'comprehensive'
  ): Promise<{
    recommendations: MaintenancePrediction[];
    summary: {
      totalEquipment: number;
      highRiskItems: number;
      potentialSavings: number;
      recommendedActions: number;
    };
  }> {
    
    // Get all customer equipment
    const equipment = await this.getEquipmentForAnalysis(undefined, customerId);
    
    // Generate predictions
    const predictions = await this.generatePredictions(equipment.map(e => e.id), customerId);
    
    // Filter based on priority
    let filteredRecommendations: MaintenancePrediction[];
    
    switch (priority) {
      case 'high_risk':
        filteredRecommendations = predictions.filter(
          p => p.failureRisk === 'critical' || p.failureRisk === 'high'
        );
        break;
      case 'cost_savings':
        filteredRecommendations = predictions.filter(
          p => p.costImplications.costSavings > 200
        );
        break;
      default:
        filteredRecommendations = predictions;
    }

    const summary = {
      totalEquipment: equipment.length,
      highRiskItems: predictions.filter(p => p.failureRisk === 'critical' || p.failureRisk === 'high').length,
      potentialSavings: predictions.reduce((sum, p) => sum + p.costImplications.costSavings, 0),
      recommendedActions: filteredRecommendations.length
    };

    return {
      recommendations: filteredRecommendations,
      summary
    };
  }

  // Private helper methods

  private async generateEquipmentPrediction(
    equipment: Equipment,
    horizonMonths: number
  ): Promise<MaintenancePrediction> {
    
    // Get equipment profile and model
    const profile = this.getEquipmentProfile(equipment.equipmentType);
    const model = this.getPredictionModel(equipment.equipmentType);
    
    // Gather data for prediction
    const serviceHistory = await this.getEquipmentServiceHistory(equipment.id);
    const usagePatterns = await this.analyzeUsagePatterns(equipment);
    const environmentalFactors = await this.getEnvironmentalFactors(equipment);
    
    // Calculate age and condition factors
    const ageMonths = equipment.ageYears ? equipment.ageYears * 12 : 
                     this.calculateMonthsBetween(equipment.installationDate || equipment.createdAt, new Date());
    
    // Apply prediction model
    const riskFactors = this.calculateRiskFactors(equipment, serviceHistory, usagePatterns, ageMonths);
    const failureRisk = this.assessFailureRisk(riskFactors, profile);
    const predictedFailureDate = this.calculatePredictedFailureDate(riskFactors, ageMonths, profile);
    const confidenceScore = this.calculateConfidence(riskFactors, serviceHistory);
    
    // Generate recommendations
    const recommendedAction = this.generateMaintenanceAction(failureRisk, equipment, riskFactors);
    const preventiveOptions = this.generatePreventiveOptions(equipment, riskFactors);
    
    // Analyze costs
    const costImplications = await this.analyzeCostImplications(equipment, recommendedAction, preventiveOptions);
    
    // Create reasoning
    const reasoning = this.createPredictionReasoning(riskFactors, serviceHistory, usagePatterns, confidenceScore);

    return {
      equipmentId: equipment.id,
      predictedFailureDate,
      failureRisk,
      confidenceScore,
      recommendedAction,
      reasoning,
      costImplications,
      preventiveOptions
    };
  }

  private async getEquipmentForAnalysis(
    equipmentIds?: string[],
    customerId?: string,
    propertyId?: string
  ): Promise<Equipment[]> {
    
    const knex = await this.db.getKnex();
    let query = knex('equipment').where('isActive', true);
    
    if (equipmentIds) {
      query = query.whereIn('id', equipmentIds);
    }
    
    if (propertyId) {
      query = query.where('propertyId', propertyId);
    } else if (customerId) {
      query = query.join('properties', 'equipment.propertyId', 'properties.id')
                   .where('properties.customerId', customerId);
    }
    
    return await query;
  }

  private async getEquipmentServiceHistory(equipmentId: string): Promise<ServiceHistory[]> {
    const knex = await this.db.getKnex();
    
    return await knex('service_history')
      .where('equipmentServiced', 'like', `%${equipmentId}%`)
      .orderBy('serviceDate', 'desc')
      .limit(50); // Get last 50 service records
  }

  private async analyzeUsagePatterns(equipment: Equipment): Promise<UsagePattern> {
    // Analyze usage patterns based on service history, customer type, equipment location
    // This would integrate with IoT data if available
    
    return {
      usageIntensity: 'moderate', // Placeholder
      peakUsagePeriods: [],
      stressFactors: [],
      wearRate: 5
    };
  }

  private async getEnvironmentalFactors(equipment: Equipment): Promise<any> {
    // Get environmental factors like temperature, humidity, water quality, etc.
    return {};
  }

  private calculateRiskFactors(
    equipment: Equipment,
    serviceHistory: ServiceHistory[],
    usagePatterns: UsagePattern,
    ageMonths: number
  ): RiskFactor[] {
    
    const factors: RiskFactor[] = [];
    
    // Age factor
    const profile = this.getEquipmentProfile(equipment.equipmentType);
    const ageRatio = ageMonths / profile.expectedLifespan;
    
    if (ageRatio > 0.8) {
      factors.push({
        factor: 'equipment_age',
        weight: 0.3,
        impact: 'increases_risk',
        severity: ageRatio > 0.9 ? 'high' : 'medium',
        description: `Equipment is ${Math.round(ageRatio * 100)}% through expected lifespan`,
        evidenceStrength: 0.9
      });
    }
    
    // Service history factor
    const recentServices = serviceHistory.filter(s => 
      new Date(s.serviceDate) > new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000)
    );
    
    if (recentServices.length > 2) {
      factors.push({
        factor: 'frequent_repairs',
        weight: 0.25,
        impact: 'increases_risk',
        severity: 'medium',
        description: `${recentServices.length} services in past 6 months`,
        evidenceStrength: 0.8
      });
    }
    
    // Condition factor
    if (equipment.condition === 'poor' || equipment.condition === 'needs_replacement') {
      factors.push({
        factor: 'poor_condition',
        weight: 0.4,
        impact: 'increases_risk',
        severity: 'high',
        description: `Equipment condition rated as ${equipment.condition}`,
        evidenceStrength: 0.9
      });
    }
    
    // Usage intensity factor
    if (usagePatterns.usageIntensity === 'heavy' || usagePatterns.usageIntensity === 'extreme') {
      factors.push({
        factor: 'heavy_usage',
        weight: 0.2,
        impact: 'increases_risk',
        severity: 'medium',
        description: `Equipment has ${usagePatterns.usageIntensity} usage patterns`,
        evidenceStrength: 0.7
      });
    }
    
    return factors;
  }

  private assessFailureRisk(
    riskFactors: RiskFactor[],
    profile: EquipmentProfile
  ): 'low' | 'medium' | 'high' | 'critical' {
    
    const totalRisk = riskFactors.reduce((sum, factor) => {
      const severityWeight = { low: 1, medium: 2, high: 3 }[factor.severity];
      return sum + (factor.weight * severityWeight * factor.evidenceStrength);
    }, 0);
    
    if (totalRisk >= 2.0) return 'critical';
    if (totalRisk >= 1.5) return 'high';
    if (totalRisk >= 1.0) return 'medium';
    return 'low';
  }

  private calculatePredictedFailureDate(
    riskFactors: RiskFactor[],
    ageMonths: number,
    profile: EquipmentProfile
  ): Date {
    
    const baseLifespan = profile.expectedLifespan;
    const remainingLife = baseLifespan - ageMonths;
    
    // Adjust remaining life based on risk factors
    let adjustedRemainingLife = remainingLife;
    
    for (const factor of riskFactors) {
      if (factor.impact === 'increases_risk') {
        const reduction = factor.weight * factor.evidenceStrength * 6; // months
        adjustedRemainingLife -= reduction;
      }
    }
    
    // Ensure minimum remaining life of 1 month
    adjustedRemainingLife = Math.max(1, adjustedRemainingLife);
    
    const predictedDate = new Date();
    predictedDate.setMonth(predictedDate.getMonth() + Math.round(adjustedRemainingLife));
    
    return predictedDate;
  }

  private calculateConfidence(
    riskFactors: RiskFactor[],
    serviceHistory: ServiceHistory[]
  ): number {
    
    let confidence = 0.5; // Base confidence
    
    // Increase confidence with more data points
    confidence += Math.min(0.3, serviceHistory.length * 0.05);
    
    // Increase confidence with strong evidence
    const strongEvidenceCount = riskFactors.filter(f => f.evidenceStrength > 0.8).length;
    confidence += strongEvidenceCount * 0.1;
    
    // Decrease confidence if factors are conflicting
    const conflictingFactors = riskFactors.filter(f => f.impact === 'decreases_risk').length;
    if (conflictingFactors > 0) {
      confidence -= conflictingFactors * 0.05;
    }
    
    return Math.min(0.95, Math.max(0.3, confidence));
  }

  private generateMaintenanceAction(
    failureRisk: string,
    equipment: Equipment,
    riskFactors: RiskFactor[]
  ): MaintenanceAction {
    
    let type: MaintenanceAction['type'];
    let urgency: MaintenanceAction['urgency'];
    let estimatedCost: number;
    
    switch (failureRisk) {
      case 'critical':
        type = equipment.condition === 'needs_replacement' ? 'replace' : 'repair';
        urgency = 'immediate';
        estimatedCost = type === 'replace' ? 2000 : 500;
        break;
      case 'high':
        type = 'service';
        urgency = 'within_week';
        estimatedCost = 300;
        break;
      case 'medium':
        type = 'inspection';
        urgency = 'within_month';
        estimatedCost = 150;
        break;
      default:
        type = 'monitor';
        urgency = 'routine';
        estimatedCost = 75;
    }
    
    const profile = this.getEquipmentProfile(equipment.equipmentType);
    
    return {
      type,
      urgency,
      estimatedCost,
      estimatedDuration: profile.serviceTime,
      requiredSkills: profile.requiredSkills,
      requiredParts: [], // Would be populated based on specific equipment needs
      description: this.generateActionDescription(type, equipment, riskFactors)
    };
  }

  private generatePreventiveOptions(
    equipment: Equipment,
    riskFactors: RiskFactor[]
  ): PreventiveOption[] {
    
    const options: PreventiveOption[] = [];
    
    // Standard preventive maintenance
    options.push({
      id: 'standard_service',
      name: 'Standard Maintenance Service',
      description: 'Regular maintenance to prevent common issues',
      cost: 200,
      riskReduction: 30,
      extendedLife: 12,
      frequencyRequired: 'semi_annual',
      priority: 'medium'
    });
    
    // Equipment-specific options based on type
    const profile = this.getEquipmentProfile(equipment.equipmentType);
    options.push(...profile.preventiveOptions);
    
    return options;
  }

  private async analyzeCostImplications(
    equipment: Equipment,
    recommendedAction: MaintenanceAction,
    preventiveOptions: PreventiveOption[]
  ): Promise<CostAnalysis> {
    
    const preventiveCost = recommendedAction.estimatedCost;
    
    // Estimate reactive cost (cost if equipment fails)
    let reactiveCost = preventiveCost * 3; // Typically 3x more expensive
    
    if (equipment.equipmentType === 'water_heater') {
      reactiveCost += 1000; // Emergency replacement costs
    }
    
    const costSavings = reactiveCost - preventiveCost;
    const roi = costSavings / preventiveCost;
    
    const riskCostFactors: CostRiskFactor[] = [
      {
        factor: 'emergency_service_premium',
        probability: 0.3,
        potentialCost: 500,
        description: 'Additional cost for emergency service calls'
      },
      {
        factor: 'secondary_damage',
        probability: 0.2,
        potentialCost: 1500,
        description: 'Potential damage to property from equipment failure'
      }
    ];
    
    return {
      preventiveCost,
      reactiveCost,
      costSavings,
      riskCostFactors,
      roi
    };
  }

  private createPredictionReasoning(
    riskFactors: RiskFactor[],
    serviceHistory: ServiceHistory[],
    usagePatterns: UsagePattern,
    confidenceScore: number
  ): PredictionReasoning {
    
    const primaryFactors = riskFactors.filter(f => f.weight > 0.2 && f.severity === 'high');
    const contributingFactors = riskFactors.filter(f => f.weight <= 0.2 || f.severity !== 'high');
    
    return {
      primaryFactors,
      contributingFactors,
      historicalPatterns: [], // Would be populated with actual patterns
      seasonalFactors: [], // Would be populated with seasonal analysis
      usagePatterns: [usagePatterns],
      modelConfidence: {
        overallConfidence: confidenceScore,
        dataQuality: serviceHistory.length > 5 ? 0.8 : 0.5,
        historicalAccuracy: 0.75, // Based on model performance
        patternStrength: 0.7,
        uncertaintyFactors: confidenceScore < 0.7 ? ['Limited service history'] : []
      }
    };
  }

  // Equipment profile and model management
  private getEquipmentProfile(equipmentType: string): EquipmentProfile {
    return this.equipmentProfiles.get(equipmentType) || this.getDefaultProfile();
  }

  private getPredictionModel(equipmentType: string): PredictionModel {
    return this.predictionModels.get(equipmentType) || this.getDefaultModel();
  }

  private initializePredictionModels(): void {
    // Initialize prediction models for different equipment types
    this.predictionModels.set('water_heater', {
      type: 'water_heater',
      algorithm: 'survival_analysis',
      accuracy: 0.82,
      lastUpdated: new Date()
    });
    
    // Add more models for other equipment types
  }

  private loadEquipmentProfiles(): void {
    // Load equipment profiles with lifecycle data
    this.equipmentProfiles.set('water_heater', {
      type: 'water_heater',
      expectedLifespan: 120, // 10 years in months
      serviceTime: 90, // 1.5 hours
      requiredSkills: ['plumbing', 'electrical'],
      preventiveOptions: [
        {
          id: 'annual_flush',
          name: 'Annual Tank Flush',
          description: 'Remove sediment buildup to improve efficiency',
          cost: 150,
          riskReduction: 40,
          extendedLife: 18,
          frequencyRequired: 'annual',
          priority: 'high'
        }
      ]
    });
    
    // Add more profiles for other equipment types
  }

  private getDefaultProfile(): EquipmentProfile {
    return {
      type: 'unknown',
      expectedLifespan: 120,
      serviceTime: 60,
      requiredSkills: ['general'],
      preventiveOptions: []
    };
  }

  private getDefaultModel(): PredictionModel {
    return {
      type: 'default',
      algorithm: 'rule_based',
      accuracy: 0.65,
      lastUpdated: new Date()
    };
  }

  // Utility methods
  private calculateMonthsBetween(startDate: Date, endDate: Date): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    let months = (end.getFullYear() - start.getFullYear()) * 12;
    months -= start.getMonth();
    months += end.getMonth();
    
    return Math.max(0, months);
  }

  private determineLifecycleStage(
    timeInService: number,
    expectedLifespan: number
  ): LifecycleAnalysis['currentStage'] {
    
    const ratio = timeInService / expectedLifespan;
    
    if (ratio < 0.1) return 'new';
    if (ratio < 0.4) return 'prime';
    if (ratio < 0.7) return 'mature';
    if (ratio < 0.9) return 'declining';
    return 'critical';
  }

  private async analyzeMaintenanceCostTrend(equipmentId: string): Promise<LifecycleAnalysis['maintenanceCostTrend']> {
    // Analyze trend in maintenance costs over time
    // This would query service history and calculate cost trends
    return 'stable'; // Placeholder
  }

  private async generateReplacementRecommendation(
    equipment: Equipment,
    timeInService: number,
    remainingLife: number,
    costTrend: string
  ): Promise<ReplacementRecommendation> {
    
    const shouldReplace = remainingLife < 12 || costTrend === 'accelerating';
    
    return {
      shouldReplace,
      recommendedTiming: new Date(Date.now() + remainingLife * 30 * 24 * 60 * 60 * 1000),
      reasoning: shouldReplace ? 
        ['Equipment approaching end of useful life', 'Maintenance costs increasing'] :
        ['Equipment still has useful life remaining'],
      costBenefit: {
        currentMaintenanceCost: 500,
        newEquipmentCost: 2000,
        energySavings: 300,
        reliabilityImprovement: 0.8,
        paybackPeriod: 24
      },
      upgradeOptions: []
    };
  }

  // Optimization methods (simplified implementations)
  private async getExistingSchedules(customerId: string, propertyId?: string): Promise<MaintenanceSchedule[]> {
    const knex = await this.db.getKnex();
    
    let query = knex('maintenance_schedules')
      .where('customerId', customerId)
      .where('status', 'active');
    
    if (propertyId) {
      query = query.where('propertyId', propertyId);
    }
    
    return await query;
  }

  private async createOptimizedSchedule(
    predictions: MaintenancePrediction[],
    existingSchedules: MaintenanceSchedule[],
    equipment: Equipment[]
  ): Promise<OptimizedScheduleItem[]> {
    
    const optimizedItems: OptimizedScheduleItem[] = [];
    
    // Convert predictions to schedule items
    for (const prediction of predictions) {
      optimizedItems.push({
        equipmentId: prediction.equipmentId,
        maintenanceType: prediction.recommendedAction.type,
        scheduledDate: this.calculateOptimalDate(prediction),
        priority: this.calculatePriority(prediction),
        estimatedDuration: prediction.recommendedAction.estimatedDuration,
        technicianRequirements: prediction.recommendedAction.requiredSkills,
        partRequirements: prediction.recommendedAction.requiredParts
      });
    }
    
    return optimizedItems;
  }

  private async optimizeServiceRoutes(schedule: OptimizedScheduleItem[]): Promise<RouteOptimization> {
    // Group items by date and optimize routes
    return {
      visitDate: new Date(),
      equipmentToService: schedule.map(s => s.equipmentId),
      estimatedTotalTime: schedule.reduce((sum, s) => sum + s.estimatedDuration, 0),
      travelOptimization: {
        estimatedTravelTime: 30
      }
    };
  }

  private async findBundlingOpportunities(
    schedule: OptimizedScheduleItem[],
    equipment: Equipment[]
  ): Promise<BundlingOpportunity[]> {
    // Find opportunities to bundle maintenance tasks
    return [];
  }

  private async calculateOptimizationSavings(
    optimizedSchedule: OptimizedScheduleItem[],
    existingSchedules: MaintenanceSchedule[],
    bundlingOpportunities: BundlingOpportunity[]
  ): Promise<number> {
    // Calculate cost savings from optimization
    return 500; // Placeholder
  }

  private calculateRiskReduction(
    predictions: MaintenancePrediction[],
    optimizedSchedule: OptimizedScheduleItem[]
  ): number {
    // Calculate overall risk reduction percentage
    return 35; // Placeholder
  }

  private generateActionDescription(
    type: MaintenanceAction['type'],
    equipment: Equipment,
    riskFactors: RiskFactor[]
  ): string {
    
    const descriptions = {
      inspection: `Inspect ${equipment.equipmentType} for potential issues`,
      service: `Perform preventive maintenance on ${equipment.equipmentType}`,
      repair: `Repair identified issues with ${equipment.equipmentType}`,
      replace: `Replace ${equipment.equipmentType} due to end of lifecycle`,
      monitor: `Continue monitoring ${equipment.equipmentType} condition`
    };
    
    return descriptions[type];
  }

  private calculateOptimalDate(prediction: MaintenancePrediction): Date {
    const urgencyDays = {
      immediate: 1,
      within_week: 7,
      within_month: 30,
      routine: 90
    };
    
    const days = urgencyDays[prediction.recommendedAction.urgency];
    const optimalDate = new Date();
    optimalDate.setDate(optimalDate.getDate() + days);
    
    return optimalDate;
  }

  private calculatePriority(prediction: MaintenancePrediction): number {
    const riskPriority = {
      critical: 1,
      high: 2,
      medium: 3,
      low: 4
    };
    
    return riskPriority[prediction.failureRisk];
  }

  private async getEquipmentById(equipmentId: string): Promise<Equipment | null> {
    const knex = await this.db.getKnex();
    return await knex('equipment').where('id', equipmentId).first();
  }

  private async logPredictions(
    predictions: MaintenancePrediction[],
    processingTime: number
  ): Promise<void> {
    const knex = await this.db.getKnex();
    
    try {
      for (const prediction of predictions) {
        await knex('maintenance_predictions').insert({
          id: `mp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          equipmentId: prediction.equipmentId,
          predictedFailureDate: prediction.predictedFailureDate,
          failureRisk: prediction.failureRisk,
          confidenceScore: prediction.confidenceScore,
          recommendedAction: JSON.stringify(prediction.recommendedAction),
          reasoning: JSON.stringify(prediction.reasoning),
          createdAt: new Date()
        });
      }
    } catch (error) {
      logger.warn('Failed to log maintenance predictions', { error });
    }
  }
}

// Supporting interfaces
interface PredictionModel {
  type: string;
  algorithm: string;
  accuracy: number;
  lastUpdated: Date;
}

interface EquipmentProfile {
  type: string;
  expectedLifespan: number; // months
  serviceTime: number; // minutes
  requiredSkills: string[];
  preventiveOptions: PreventiveOption[];
}

export default PredictiveMaintenanceService;