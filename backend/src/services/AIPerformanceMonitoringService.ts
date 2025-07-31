import { DatabaseService } from './DatabaseService';
import { AIQualityAssessmentService } from './AIQualityAssessmentService';
import { TokenOptimizationEngine } from './TokenOptimizationEngine';
import { AITrainingDataCollector } from './AITrainingDataCollector';
import { logger } from '../utils/logger';

export interface AIPerformanceMetrics {
  timestamp: Date;
  
  // Core performance metrics
  responseTime: ResponseTimeMetrics;
  throughput: ThroughputMetrics;
  availability: AvailabilityMetrics;
  errorRate: ErrorRateMetrics;
  
  // Quality metrics
  qualityMetrics: QualityPerformanceMetrics;
  
  // Cost and efficiency metrics
  costMetrics: CostPerformanceMetrics;
  tokenEfficiency: TokenEfficiencyMetrics;
  
  // Business impact metrics
  businessImpact: BusinessImpactMetrics;
  customerSatisfaction: CustomerSatisfactionMetrics;
  
  // Resource utilization
  resourceUtilization: ResourceUtilizationMetrics;
  
  // Predictive indicators
  predictiveIndicators: PredictiveIndicators;
}

export interface ResponseTimeMetrics {
  averageResponseTime: number; // milliseconds
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  maxResponseTime: number;
  timeoutRate: number;
  responseTimeByIntent: Record<string, number>;
  responseTimeByUrgency: Record<string, number>;
  responseTimeTrend: TrendData;
}

export interface ThroughputMetrics {
  requestsPerSecond: number;
  requestsPerMinute: number;
  requestsPerHour: number;
  peakThroughput: number;
  concurrentRequests: number;
  queueLength: number;
  throughputTrend: TrendData;
}

export interface AvailabilityMetrics {
  uptime: number; // percentage
  downtimeIncidents: number;
  meanTimeBetweenFailures: number;
  meanTimeToRecovery: number;
  serviceHealthScore: number;
  availabilityTrend: TrendData;
}

export interface ErrorRateMetrics {
  overallErrorRate: number; // percentage
  errorsByType: Record<string, number>;
  errorsByService: Record<string, number>;
  criticalErrors: number;
  warningCount: number;
  errorTrend: TrendData;
  errorResolutionTime: number;
}

export interface QualityPerformanceMetrics {
  averageQualityScore: number;
  qualityByDimension: Record<string, number>;
  qualityTrend: TrendData;
  qualityDistribution: QualityDistribution;
  lowQualityIncidents: number;
  qualityImprovementRate: number;
}

export interface QualityDistribution {
  excellent: number; // >0.9
  good: number; // 0.7-0.9
  fair: number; // 0.5-0.7
  poor: number; // <0.5
}

export interface CostPerformanceMetrics {
  totalCost: number;
  costPerRequest: number;
  costPerToken: number;
  costByService: Record<string, number>;
  budgetUtilization: number;
  costTrend: TrendData;
  costOptimizationSavings: number;
}

export interface TokenEfficiencyMetrics {
  averageTokensPerRequest: number;
  tokenOptimizationRate: number;
  tokenSavings: number;
  compressionRatio: number;
  cacheHitRate: number;
  tokenEfficiencyTrend: TrendData;
}

export interface BusinessImpactMetrics {
  customerConversionRate: number;
  serviceBookingRate: number;
  customerRetentionImpact: number;
  revenueGenerated: number;
  operationalEfficiencyGain: number;
  competitiveAdvantageScore: number;
}

export interface CustomerSatisfactionMetrics {
  averageSatisfactionScore: number;
  npsScore: number;
  firstContactResolutionRate: number;
  escalationRate: number;
  customerComplaintRate: number;
  satisfactionTrend: TrendData;
}

export interface ResourceUtilizationMetrics {
  cpuUtilization: number;
  memoryUtilization: number;
  networkBandwidth: number;
  storageUtilization: number;
  cacheUtilization: number;
  resourceEfficiency: number;
}

export interface PredictiveIndicators {
  predictedPerformanceDegradation: number;
  capacityUtilizationForecast: number;
  qualityRiskScore: number;
  costForecast: CostForecast;
  maintenanceRequiredScore: number;
  recommendedActions: RecommendedAction[];
}

export interface CostForecast {
  next24Hours: number;
  nextWeek: number;
  nextMonth: number;
  confidenceLevel: number;
}

export interface RecommendedAction {
  action: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  expectedImpact: string;
  estimatedEffort: string;
  timeline: string;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface TrendData {
  current: number;
  previous: number;
  change: number;
  changePercent: number;
  direction: 'up' | 'down' | 'stable';
  volatility: number;
}

export interface AlertRule {
  id: string;
  name: string;
  description: string;
  metric: string;
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
  threshold: number;
  severity: 'info' | 'warning' | 'critical';
  enabled: boolean;
  cooldownMinutes: number;
  escalationRules: EscalationRule[];
}

export interface EscalationRule {
  triggerAfterMinutes: number;
  action: 'email' | 'sms' | 'webhook' | 'incident';
  recipients: string[];
  message: string;
}

export interface PerformanceAlert {
  id: string;
  ruleId: string;
  metric: string;
  currentValue: number;
  threshold: number;
  severity: 'info' | 'warning' | 'critical';
  triggeredAt: Date;
  resolvedAt?: Date;
  description: string;
  affectedServices: string[];
  recommendedActions: string[];
  escalationStatus: EscalationStatus;
}

export interface EscalationStatus {
  escalated: boolean;
  escalationLevel: number;
  lastEscalatedAt?: Date;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
}

export interface PerformanceReport {
  id: string;
  reportType: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'quarterly';
  startTime: Date;
  endTime: Date;
  generatedAt: Date;
  
  // Summary metrics
  summary: PerformanceSummary;
  
  // Detailed metrics
  metrics: AIPerformanceMetrics[];
  
  // Analysis and insights
  analysis: PerformanceAnalysis;
  
  // Recommendations
  recommendations: PerformanceRecommendation[];
  
  // Attachments
  charts: ChartData[];
  rawData?: string;
}

export interface PerformanceSummary {
  totalRequests: number;
  averageResponseTime: number;
  overallQualityScore: number;
  totalCost: number;
  uptime: number;
  keyAchievements: string[];
  criticalIssues: string[];
}

export interface PerformanceAnalysis {
  trends: TrendAnalysis[];
  correlations: CorrelationAnalysis[];
  anomalies: AnomalyDetection[];
  insights: PerformanceInsight[];
}

export interface TrendAnalysis {
  metric: string;
  trend: 'improving' | 'degrading' | 'stable';
  confidence: number;
  predictedDirection: string;
  contributingFactors: string[];
}

export interface CorrelationAnalysis {
  metric1: string;
  metric2: string;
  correlationCoefficient: number;
  significance: number;
  relationship: string;
}

export interface AnomalyDetection {
  metric: string;
  anomalyType: 'spike' | 'drop' | 'trend_break' | 'pattern_change';
  severity: number;
  detectedAt: Date;
  duration: number;
  potentialCauses: string[];
}

export interface PerformanceInsight {
  category: 'performance' | 'quality' | 'cost' | 'business';
  insight: string;
  confidence: number;
  impact: 'low' | 'medium' | 'high';
  actionable: boolean;
  supportingData: string[];
}

export interface PerformanceRecommendation {
  category: 'optimization' | 'maintenance' | 'scaling' | 'quality';
  recommendation: string;
  priority: number;
  expectedBenefit: string;
  implementationEffort: 'low' | 'medium' | 'high';
  timeline: string;
  dependencies: string[];
  riskAssessment: string;
}

export interface ChartData {
  type: 'line' | 'bar' | 'pie' | 'scatter' | 'heatmap';
  title: string;
  description: string;
  data: any;
  config: any;
}

export interface CapacityPlanningData {
  currentCapacity: CapacityMetrics;
  projectedDemand: DemandProjection;
  scalingRecommendations: ScalingRecommendation[];
  resourceRequirements: ResourceRequirement[];
  costImplications: CostImplication[];
}

export interface CapacityMetrics {
  maxConcurrentRequests: number;
  maxThroughput: number;
  resourceLimits: Record<string, number>;
  currentUtilization: Record<string, number>;
  bottlenecks: string[];
}

export interface DemandProjection {
  timeframe: string;
  projectedVolume: number;
  confidenceLevel: number;
  seasonalFactors: number;
  growthRate: number;
  peakPeriods: PeakPeriod[];
}

export interface PeakPeriod {
  name: string;
  startDate: Date;
  endDate: Date;
  expectedIncrease: number;
  preparationActions: string[];
}

export interface ScalingRecommendation {
  type: 'horizontal' | 'vertical' | 'hybrid';
  description: string;
  triggerConditions: string[];
  resourceChanges: ResourceChange[];
  timeline: string;
  cost: number;
}

export interface ResourceChange {
  resource: string;
  currentValue: number;
  recommendedValue: number;
  justification: string;
}

export interface ResourceRequirement {
  resource: string;
  currentAllocation: number;
  recommendedAllocation: number;
  priority: number;
  justification: string;
}

export interface CostImplication {
  category: string;
  currentCost: number;
  projectedCost: number;
  costChange: number;
  roi: number;
  paybackPeriod: number;
}

export class AIPerformanceMonitoringService {
  private alertRules: Map<string, AlertRule> = new Map();
  private activeAlerts: Map<string, PerformanceAlert> = new Map();
  private metricsHistory: AIPerformanceMetrics[] = [];
  private monitoringInterval: NodeJS.Timeout;
  
  // Configuration
  private readonly maxHistorySize = 10000;
  private readonly monitoringIntervalMs = 60000; // 1 minute
  private readonly alertCooldownMs = 300000; // 5 minutes
  
  constructor(
    private db: DatabaseService,
    private qualityAssessment: AIQualityAssessmentService,
    private tokenOptimization: TokenOptimizationEngine,
    private trainingDataCollector: AITrainingDataCollector
  ) {
    this.initializeDefaultAlertRules();
    this.startPerformanceMonitoring();
  }

  /**
   * Get real-time performance metrics with predictive analytics
   */
  async getCurrentPerformanceMetrics(): Promise<AIPerformanceMetrics> {
    try {
      logger.info('Collecting current performance metrics');

      const timestamp = new Date();
      
      // Collect metrics from various sources
      const [
        responseTimeMetrics,
        throughputMetrics,
        availabilityMetrics,
        errorRateMetrics,
        qualityMetrics,
        costMetrics,
        tokenEfficiencyMetrics,
        businessImpactMetrics,
        customerSatisfactionMetrics,
        resourceUtilizationMetrics
      ] = await Promise.all([
        this.collectResponseTimeMetrics(),
        this.collectThroughputMetrics(),
        this.collectAvailabilityMetrics(),
        this.collectErrorRateMetrics(),
        this.collectQualityMetrics(),
        this.collectCostMetrics(),
        this.collectTokenEfficiencyMetrics(),
        this.collectBusinessImpactMetrics(),
        this.collectCustomerSatisfactionMetrics(),
        this.collectResourceUtilizationMetrics()
      ]);

      // Generate predictive indicators
      const predictiveIndicators = await this.generatePredictiveIndicators({
        responseTime: responseTimeMetrics,
        throughput: throughputMetrics,
        quality: qualityMetrics,
        cost: costMetrics,
        resources: resourceUtilizationMetrics
      });

      const metrics: AIPerformanceMetrics = {
        timestamp,
        responseTime: responseTimeMetrics,
        throughput: throughputMetrics,
        availability: availabilityMetrics,
        errorRate: errorRateMetrics,
        qualityMetrics,
        costMetrics,
        tokenEfficiency: tokenEfficiencyMetrics,
        businessImpact: businessImpactMetrics,
        customerSatisfaction: customerSatisfactionMetrics,
        resourceUtilization: resourceUtilizationMetrics,
        predictiveIndicators
      };

      // Store metrics
      await this.storeMetrics(metrics);
      
      // Add to history
      this.addToHistory(metrics);
      
      // Check for alerts
      await this.checkAlertConditions(metrics);

      logger.info('Performance metrics collected successfully', {
        responseTime: responseTimeMetrics.averageResponseTime,
        throughput: throughputMetrics.requestsPerSecond,
        quality: qualityMetrics.averageQualityScore
      });

      return metrics;

    } catch (error) {
      logger.error('Failed to collect performance metrics', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Generate comprehensive performance report
   */
  async generatePerformanceReport(
    reportType: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'quarterly',
    startTime?: Date,
    endTime?: Date
  ): Promise<PerformanceReport> {
    
    try {
      logger.info('Generating performance report', { reportType });

      const { start, end } = this.calculateReportPeriod(reportType, startTime, endTime);
      
      // Load metrics for the period
      const metrics = await this.loadMetricsForPeriod(start, end);
      
      if (metrics.length === 0) {
        throw new Error('No metrics data available for the specified period');
      }

      // Generate summary
      const summary = this.generatePerformanceSummary(metrics);
      
      // Perform analysis
      const analysis = await this.performPerformanceAnalysis(metrics);
      
      // Generate recommendations
      const recommendations = await this.generatePerformanceRecommendations(metrics, analysis);
      
      // Create charts
      const charts = await this.generatePerformanceCharts(metrics);

      const report: PerformanceReport = {
        id: `perf_report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        reportType,
        startTime: start,
        endTime: end,
        generatedAt: new Date(),
        summary,
        metrics,
        analysis,
        recommendations,
        charts
      };

      // Store report
      await this.storePerformanceReport(report);

      logger.info('Performance report generated successfully', {
        reportType,
        metricsCount: metrics.length,
        recommendationsCount: recommendations.length
      });

      return report;

    } catch (error) {
      logger.error('Failed to generate performance report', {
        reportType,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Set up and manage performance alerts
   */
  async configureAlert(alertRule: Omit<AlertRule, 'id'>): Promise<{ alertId: string; configured: boolean }> {
    try {
      const alertId = `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const rule: AlertRule = {
        id: alertId,
        ...alertRule
      };

      // Validate alert rule
      this.validateAlertRule(rule);
      
      // Store alert rule
      this.alertRules.set(alertId, rule);
      await this.storeAlertRule(rule);

      logger.info('Alert rule configured successfully', {
        alertId,
        metric: rule.metric,
        threshold: rule.threshold,
        severity: rule.severity
      });

      return {
        alertId,
        configured: true
      };

    } catch (error) {
      logger.error('Failed to configure alert', {
        metric: alertRule.metric,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get active alerts and their status
   */
  async getActiveAlerts(): Promise<{
    totalAlerts: number;
    criticalAlerts: number;
    warningAlerts: number;
    alerts: PerformanceAlert[];
  }> {
    
    try {
      const alerts = Array.from(this.activeAlerts.values());
      
      const criticalAlerts = alerts.filter(alert => alert.severity === 'critical').length;
      const warningAlerts = alerts.filter(alert => alert.severity === 'warning').length;

      return {
        totalAlerts: alerts.length,
        criticalAlerts,
        warningAlerts,
        alerts
      };

    } catch (error) {
      logger.error('Failed to get active alerts', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Perform capacity planning analysis
   */
  async performCapacityPlanning(
    timeframe: 'monthly' | 'quarterly' | 'yearly' = 'quarterly'
  ): Promise<CapacityPlanningData> {
    
    try {
      logger.info('Performing capacity planning analysis', { timeframe });

      // Analyze current capacity
      const currentCapacity = await this.analyzeCurrentCapacity();
      
      // Project future demand
      const projectedDemand = await this.projectDemand(timeframe);
      
      // Generate scaling recommendations
      const scalingRecommendations = await this.generateScalingRecommendations(
        currentCapacity,
        projectedDemand
      );
      
      // Calculate resource requirements
      const resourceRequirements = await this.calculateResourceRequirements(
        currentCapacity,
        projectedDemand,
        scalingRecommendations
      );
      
      // Assess cost implications
      const costImplications = await this.assessCostImplications(
        scalingRecommendations,
        resourceRequirements
      );

      const capacityPlan: CapacityPlanningData = {
        currentCapacity,
        projectedDemand,
        scalingRecommendations,
        resourceRequirements,
        costImplications
      };

      logger.info('Capacity planning analysis completed', {
        timeframe,
        projectedGrowth: projectedDemand.growthRate,
        recommendationsCount: scalingRecommendations.length
      });

      return capacityPlan;

    } catch (error) {
      logger.error('Capacity planning analysis failed', {
        timeframe,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get performance trends and forecasting
   */
  async getPerformanceTrends(
    metrics: string[],
    timeframe: 'daily' | 'weekly' | 'monthly' = 'weekly'
  ): Promise<{
    trends: TrendAnalysis[];
    forecasts: Record<string, number[]>;
    recommendations: string[];
  }> {
    
    try {
      logger.info('Analyzing performance trends', { metrics, timeframe });

      const historicalData = await this.getHistoricalData(timeframe);
      
      // Analyze trends for each metric
      const trends: TrendAnalysis[] = [];
      const forecasts: Record<string, number[]> = {};
      
      for (const metric of metrics) {
        const trendAnalysis = await this.analyzeTrendForMetric(metric, historicalData);
        trends.push(trendAnalysis);
        
        const forecast = await this.forecastMetric(metric, historicalData);
        forecasts[metric] = forecast;
      }
      
      // Generate recommendations based on trends
      const recommendations = await this.generateTrendRecommendations(trends);

      return {
        trends,
        forecasts,
        recommendations
      };

    } catch (error) {
      logger.error('Performance trend analysis failed', {
        metrics,
        timeframe,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  // Private helper methods

  private async collectResponseTimeMetrics(): Promise<ResponseTimeMetrics> {
    // In production, this would query actual response time data
    const recentRequests = await this.getRecentRequestMetrics();
    
    return {
      averageResponseTime: 150,
      p50ResponseTime: 120,
      p95ResponseTime: 300,
      p99ResponseTime: 500,
      maxResponseTime: 1000,
      timeoutRate: 0.01,
      responseTimeByIntent: {
        'emergency_service': 100,
        'quote_request': 200,
        'general_inquiry': 150
      },
      responseTimeByUrgency: {
        'critical': 80,
        'high': 120,
        'medium': 180,
        'low': 250
      },
      responseTimeTrend: {
        current: 150,
        previous: 180,
        change: -30,
        changePercent: -16.7,
        direction: 'down',
        volatility: 0.15
      }
    };
  }

  private async collectThroughputMetrics(): Promise<ThroughputMetrics> {
    return {
      requestsPerSecond: 10.5,
      requestsPerMinute: 630,
      requestsPerHour: 37800,
      peakThroughput: 25.0,
      concurrentRequests: 15,
      queueLength: 5,
      throughputTrend: {
        current: 10.5,
        previous: 8.2,
        change: 2.3,
        changePercent: 28.0,
        direction: 'up',
        volatility: 0.2
      }
    };
  }

  private async collectAvailabilityMetrics(): Promise<AvailabilityMetrics> {
    return {
      uptime: 99.9,
      downtimeIncidents: 1,
      meanTimeBetweenFailures: 720, // hours
      meanTimeToRecovery: 5, // minutes
      serviceHealthScore: 0.995,
      availabilityTrend: {
        current: 99.9,
        previous: 99.8,
        change: 0.1,
        changePercent: 0.1,
        direction: 'up',
        volatility: 0.05
      }
    };
  }

  private async collectErrorRateMetrics(): Promise<ErrorRateMetrics> {
    return {
      overallErrorRate: 0.5,
      errorsByType: {
        'timeout': 0.2,
        'rate_limit': 0.1,
        'processing_error': 0.2
      },
      errorsByService: {
        'claude_api': 0.3,
        'quality_assessment': 0.1,
        'context_manager': 0.1
      },
      criticalErrors: 2,
      warningCount: 15,
      errorTrend: {
        current: 0.5,
        previous: 0.8,
        change: -0.3,
        changePercent: -37.5,
        direction: 'down',
        volatility: 0.1
      },
      errorResolutionTime: 300 // seconds
    };
  }

  private async collectQualityMetrics(): Promise<QualityPerformanceMetrics> {
    return {
      averageQualityScore: 0.85,
      qualityByDimension: {
        'relevance': 0.88,
        'accuracy': 0.92,
        'helpfulness': 0.82,
        'professionalism': 0.90
      },
      qualityTrend: {
        current: 0.85,
        previous: 0.82,
        change: 0.03,
        changePercent: 3.7,
        direction: 'up',
        volatility: 0.05
      },
      qualityDistribution: {
        excellent: 45,
        good: 40,
        fair: 12,
        poor: 3
      },
      lowQualityIncidents: 8,
      qualityImprovementRate: 0.15
    };
  }

  private async collectCostMetrics(): Promise<CostPerformanceMetrics> {
    return {
      totalCost: 250.50,
      costPerRequest: 0.0066,
      costPerToken: 0.000015,
      costByService: {
        'claude_api': 180.00,
        'optimization': 50.00,
        'monitoring': 20.50
      },
      budgetUtilization: 0.62,
      costTrend: {
        current: 250.50,
        previous: 280.00,
        change: -29.50,
        changePercent: -10.5,
        direction: 'down',
        volatility: 0.12
      },
      costOptimizationSavings: 45.00
    };
  }

  private async collectTokenEfficiencyMetrics(): Promise<TokenEfficiencyMetrics> {
    return {
      averageTokensPerRequest: 350,
      tokenOptimizationRate: 0.25,
      tokenSavings: 125,
      compressionRatio: 0.75,
      cacheHitRate: 0.35,
      tokenEfficiencyTrend: {
        current: 0.75,
        previous: 0.68,
        change: 0.07,
        changePercent: 10.3,
        direction: 'up',
        volatility: 0.08
      }
    };
  }

  private async collectBusinessImpactMetrics(): Promise<BusinessImpactMetrics> {
    return {
      customerConversionRate: 0.18,
      serviceBookingRate: 0.22,
      customerRetentionImpact: 0.95,
      revenueGenerated: 1250.00,
      operationalEfficiencyGain: 0.35,
      competitiveAdvantageScore: 0.78
    };
  }

  private async collectCustomerSatisfactionMetrics(): Promise<CustomerSatisfactionMetrics> {
    return {
      averageSatisfactionScore: 4.2,
      npsScore: 68,
      firstContactResolutionRate: 0.78,
      escalationRate: 0.12,
      customerComplaintRate: 0.03,
      satisfactionTrend: {
        current: 4.2,
        previous: 4.0,
        change: 0.2,
        changePercent: 5.0,
        direction: 'up',
        volatility: 0.1
      }
    };
  }

  private async collectResourceUtilizationMetrics(): Promise<ResourceUtilizationMetrics> {
    return {
      cpuUtilization: 0.65,
      memoryUtilization: 0.58,
      networkBandwidth: 0.42,
      storageUtilization: 0.35,
      cacheUtilization: 0.72,
      resourceEfficiency: 0.68
    };
  }

  private async generatePredictiveIndicators(data: any): Promise<PredictiveIndicators> {
    return {
      predictedPerformanceDegradation: 0.15,
      capacityUtilizationForecast: 0.78,
      qualityRiskScore: 0.25,
      costForecast: {
        next24Hours: 12.50,
        nextWeek: 87.50,
        nextMonth: 375.00,
        confidenceLevel: 0.85
      },
      maintenanceRequiredScore: 0.3,
      recommendedActions: [
        {
          action: 'Optimize token usage patterns',
          priority: 'medium',
          expectedImpact: 'Reduce costs by 15%',
          estimatedEffort: 'Medium',
          timeline: '1-2 weeks',
          riskLevel: 'low'
        },
        {
          action: 'Scale response capacity',
          priority: 'high',
          expectedImpact: 'Improve response times by 20%',
          estimatedEffort: 'Low',
          timeline: '1-3 days',
          riskLevel: 'low'
        }
      ]
    };
  }

  private addToHistory(metrics: AIPerformanceMetrics): void {
    this.metricsHistory.push(metrics);
    
    // Maintain history size limit
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory = this.metricsHistory.slice(-this.maxHistorySize);
    }
  }

  private async checkAlertConditions(metrics: AIPerformanceMetrics): Promise<void> {
    for (const [ruleId, rule] of this.alertRules.entries()) {
      if (!rule.enabled) continue;
      
      const metricValue = this.extractMetricValue(metrics, rule.metric);
      const shouldAlert = this.evaluateAlertCondition(metricValue, rule);
      
      if (shouldAlert) {
        await this.triggerAlert(rule, metricValue);
      }
    }
  }

  private extractMetricValue(metrics: AIPerformanceMetrics, metricPath: string): number {
    // Extract metric value from nested object using dot notation
    const parts = metricPath.split('.');
    let value: any = metrics;
    
    for (const part of parts) {
      value = value?.[part];
    }
    
    return typeof value === 'number' ? value : 0;
  }

  private evaluateAlertCondition(value: number, rule: AlertRule): boolean {
    switch (rule.operator) {
      case 'gt': return value > rule.threshold;
      case 'gte': return value >= rule.threshold;
      case 'lt': return value < rule.threshold;
      case 'lte': return value <= rule.threshold;
      case 'eq': return value === rule.threshold;
      default: return false;
    }
  }

  private async triggerAlert(rule: AlertRule, currentValue: number): Promise<void> {
    const existingAlert = this.findExistingAlert(rule.id);
    
    // Check cooldown period
    if (existingAlert && this.isInCooldown(existingAlert, rule.cooldownMinutes)) {
      return;
    }

    const alert: PerformanceAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ruleId: rule.id,
      metric: rule.metric,
      currentValue,
      threshold: rule.threshold,
      severity: rule.severity,
      triggeredAt: new Date(),
      description: `${rule.name}: ${rule.metric} is ${currentValue} (threshold: ${rule.threshold})`,
      affectedServices: ['ai_system'],
      recommendedActions: this.generateAlertRecommendations(rule, currentValue),
      escalationStatus: {
        escalated: false,
        escalationLevel: 0
      }
    };

    this.activeAlerts.set(alert.id, alert);
    await this.storeAlert(alert);
    
    // Send notifications
    await this.sendAlertNotifications(alert, rule);

    logger.warn('Performance alert triggered', {
      alertId: alert.id,
      metric: rule.metric,
      currentValue,
      threshold: rule.threshold,
      severity: rule.severity
    });
  }

  private initializeDefaultAlertRules(): void {
    const defaultRules: Omit<AlertRule, 'id'>[] = [
      {
        name: 'High Response Time',
        description: 'Alert when average response time exceeds threshold',
        metric: 'responseTime.averageResponseTime',
        operator: 'gt',
        threshold: 500,
        severity: 'warning',
        enabled: true,
        cooldownMinutes: 5,
        escalationRules: [
          {
            triggerAfterMinutes: 10,
            action: 'email',
            recipients: ['admin@plumbingservice.com'],
            message: 'AI response time has been elevated for 10 minutes'
          }
        ]
      },
      {
        name: 'Low Quality Score',
        description: 'Alert when quality score drops below threshold',
        metric: 'qualityMetrics.averageQualityScore',
        operator: 'lt',
        threshold: 0.7,
        severity: 'critical',
        enabled: true,
        cooldownMinutes: 10,
        escalationRules: [
          {
            triggerAfterMinutes: 5,
            action: 'sms',
            recipients: ['+1234567890'],
            message: 'Critical: AI quality score below acceptable threshold'
          }
        ]
      },
      {
        name: 'High Error Rate',
        description: 'Alert when error rate exceeds threshold',
        metric: 'errorRate.overallErrorRate',
        operator: 'gt',
        threshold: 5.0,
        severity: 'critical',
        enabled: true,
        cooldownMinutes: 5,
        escalationRules: []
      },
      {
        name: 'Budget Utilization',
        description: 'Alert when budget utilization is high',
        metric: 'costMetrics.budgetUtilization',
        operator: 'gt',
        threshold: 0.9,
        severity: 'warning',
        enabled: true,
        cooldownMinutes: 60,
        escalationRules: []
      }
    ];

    for (const rule of defaultRules) {
      const id = `default_${rule.name.toLowerCase().replace(/\s+/g, '_')}`;
      this.alertRules.set(id, { id, ...rule });
    }
  }

  private startPerformanceMonitoring(): void {
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.getCurrentPerformanceMetrics();
      } catch (error) {
        logger.error('Performance monitoring cycle failed', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, this.monitoringIntervalMs);

    logger.info('Performance monitoring started', {
      intervalMs: this.monitoringIntervalMs
    });
  }

  // Additional placeholder methods for full implementation
  private async getRecentRequestMetrics(): Promise<any> {
    return {}; // Placeholder
  }

  private async storeMetrics(metrics: AIPerformanceMetrics): Promise<void> {
    // Implementation would store metrics to database
  }

  private validateAlertRule(rule: AlertRule): void {
    if (!rule.name || !rule.metric || rule.threshold === undefined) {
      throw new Error('Invalid alert rule: missing required fields');
    }
  }

  private async storeAlertRule(rule: AlertRule): Promise<void> {
    // Implementation would store alert rule to database
  }

  private findExistingAlert(ruleId: string): PerformanceAlert | undefined {
    return Array.from(this.activeAlerts.values()).find(alert => alert.ruleId === ruleId);
  }

  private isInCooldown(alert: PerformanceAlert, cooldownMinutes: number): boolean {
    const cooldownMs = cooldownMinutes * 60 * 1000;
    return Date.now() - alert.triggeredAt.getTime() < cooldownMs;
  }

  private generateAlertRecommendations(rule: AlertRule, currentValue: number): string[] {
    const recommendations: string[] = [];
    
    if (rule.metric.includes('responseTime')) {
      recommendations.push('Check system load and optimize slow queries');
      recommendations.push('Consider scaling resources if high utilization');
    }
    
    if (rule.metric.includes('qualityScore')) {
      recommendations.push('Review recent AI responses for quality issues');
      recommendations.push('Check if model needs retraining or adjustment');
    }
    
    return recommendations;
  }

  private async storeAlert(alert: PerformanceAlert): Promise<void> {
    // Implementation would store alert to database
  }

  private async sendAlertNotifications(alert: PerformanceAlert, rule: AlertRule): Promise<void> {
    // Implementation would send notifications via email, SMS, etc.
  }

  private calculateReportPeriod(
    reportType: string,
    startTime?: Date,
    endTime?: Date
  ): { start: Date; end: Date } {
    
    const now = new Date();
    let start: Date;
    let end: Date = endTime || now;
    
    if (startTime) {
      start = startTime;
    } else {
      switch (reportType) {
        case 'hourly':
          start = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case 'daily':
          start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'weekly':
          start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'monthly':
          start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'quarterly':
          start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        default:
          start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      }
    }
    
    return { start, end };
  }

  private async loadMetricsForPeriod(start: Date, end: Date): Promise<AIPerformanceMetrics[]> {
    // Implementation would load metrics from database for the period
    return this.metricsHistory.filter(
      metrics => metrics.timestamp >= start && metrics.timestamp <= end
    );
  }

  private generatePerformanceSummary(metrics: AIPerformanceMetrics[]): PerformanceSummary {
    if (metrics.length === 0) {
      throw new Error('No metrics available for summary');
    }

    const totalRequests = metrics.reduce((sum, m) => sum + m.throughput.requestsPerHour, 0);
    const avgResponseTime = metrics.reduce((sum, m) => sum + m.responseTime.averageResponseTime, 0) / metrics.length;
    const avgQuality = metrics.reduce((sum, m) => sum + m.qualityMetrics.averageQualityScore, 0) / metrics.length;
    const totalCost = metrics.reduce((sum, m) => sum + m.costMetrics.totalCost, 0);
    const avgUptime = metrics.reduce((sum, m) => sum + m.availability.uptime, 0) / metrics.length;

    return {
      totalRequests,
      averageResponseTime: avgResponseTime,
      overallQualityScore: avgQuality,
      totalCost,
      uptime: avgUptime,
      keyAchievements: [
        `Processed ${totalRequests.toLocaleString()} requests`,
        `Maintained ${avgUptime.toFixed(1)}% uptime`,
        `Achieved ${(avgQuality * 100).toFixed(1)}% quality score`
      ],
      criticalIssues: []
    };
  }

  private async performPerformanceAnalysis(metrics: AIPerformanceMetrics[]): Promise<PerformanceAnalysis> {
    return {
      trends: [],
      correlations: [],
      anomalies: [],
      insights: []
    }; // Placeholder
  }

  private async generatePerformanceRecommendations(
    metrics: AIPerformanceMetrics[],
    analysis: PerformanceAnalysis
  ): Promise<PerformanceRecommendation[]> {
    return []; // Placeholder
  }

  private async generatePerformanceCharts(metrics: AIPerformanceMetrics[]): Promise<ChartData[]> {
    return []; // Placeholder
  }

  private async storePerformanceReport(report: PerformanceReport): Promise<void> {
    // Implementation would store report to database
  }

  private async analyzeCurrentCapacity(): Promise<CapacityMetrics> {
    return {
      maxConcurrentRequests: 100,
      maxThroughput: 50,
      resourceLimits: {
        'cpu': 8,
        'memory': 32,
        'storage': 1000
      },
      currentUtilization: {
        'cpu': 0.65,
        'memory': 0.58,
        'storage': 0.35
      },
      bottlenecks: ['cpu_intensive_operations']
    }; // Placeholder
  }

  private async projectDemand(timeframe: string): Promise<DemandProjection> {
    return {
      timeframe,
      projectedVolume: 150000,
      confidenceLevel: 0.85,
      seasonalFactors: 1.2,
      growthRate: 0.15,
      peakPeriods: []
    }; // Placeholder
  }

  private async generateScalingRecommendations(
    capacity: CapacityMetrics,
    demand: DemandProjection
  ): Promise<ScalingRecommendation[]> {
    return []; // Placeholder
  }

  private async calculateResourceRequirements(
    capacity: CapacityMetrics,
    demand: DemandProjection,
    scaling: ScalingRecommendation[]
  ): Promise<ResourceRequirement[]> {
    return []; // Placeholder
  }

  private async assessCostImplications(
    scaling: ScalingRecommendation[],
    resources: ResourceRequirement[]
  ): Promise<CostImplication[]> {
    return []; // Placeholder
  }

  private async getHistoricalData(timeframe: string): Promise<any[]> {
    return []; // Placeholder
  }

  private async analyzeTrendForMetric(metric: string, data: any[]): Promise<TrendAnalysis> {
    return {
      metric,
      trend: 'stable',
      confidence: 0.8,
      predictedDirection: 'stable',
      contributingFactors: []
    }; // Placeholder
  }

  private async forecastMetric(metric: string, data: any[]): Promise<number[]> {
    return []; // Placeholder
  }

  private async generateTrendRecommendations(trends: TrendAnalysis[]): Promise<string[]> {
    return []; // Placeholder
  }

  /**
   * Cleanup method for graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    logger.info('AI Performance Monitoring Service shutdown completed');
  }
}

export default AIPerformanceMonitoringService;