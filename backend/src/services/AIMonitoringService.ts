import { DatabaseService } from './DatabaseService';
import { NotificationService } from './NotificationService';
import { AIError, AIPerformanceMetrics } from '../models/AIModels';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface AIMonitoringConfig {
  errorThreshold: {
    critical: number; // errors per minute
    warning: number;
  };
  performanceThresholds: {
    maxResponseTime: number; // milliseconds
    minConfidence: number;
    maxTokensPerRequest: number;
  };
  alerting: {
    enableSlackAlerts: boolean;
    enableEmailAlerts: boolean;
    slackWebhook?: string;
    alertEmails: string[];
  };
  metricsRetention: {
    detailedMetricsDays: number;
    summaryMetricsMonths: number;
  };
  healthCheckInterval: number; // minutes
}

export interface AIHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: {
    claudeAPI: 'healthy' | 'degraded' | 'unhealthy';
    conversationAnalyzer: 'healthy' | 'degraded' | 'unhealthy';
    intentClassifier: 'healthy' | 'degraded' | 'unhealthy';
    responseGenerator: 'healthy' | 'degraded' | 'unhealthy';
  };
  metrics: {
    errorRate: number;
    averageResponseTime: number;
    successRate: number;
    tokensPerMinute: number;
  };
  lastUpdated: Date;
}

export interface AlertPayload {
  severity: 'critical' | 'warning' | 'info';
  service: string;
  message: string;
  details: Record<string, any>;
  timestamp: Date;
  actionItems?: string[];
}

export class AIMonitoringService {
  private databaseService: DatabaseService;
  private notificationService: NotificationService;
  private config: AIMonitoringConfig;
  private errorCounts: Map<string, { count: number; windowStart: number }>;
  private performanceMetrics: Map<string, number[]>;
  private healthStatus: AIHealthStatus;
  private monitoringInterval?: NodeJS.Timeout;

  constructor(
    databaseService: DatabaseService,
    notificationService: NotificationService,
    config: AIMonitoringConfig
  ) {
    this.databaseService = databaseService;
    this.notificationService = notificationService;
    this.config = config;
    this.errorCounts = new Map();
    this.performanceMetrics = new Map();
    
    this.healthStatus = {
      status: 'healthy',
      services: {
        claudeAPI: 'healthy',
        conversationAnalyzer: 'healthy',
        intentClassifier: 'healthy',
        responseGenerator: 'healthy'
      },
      metrics: {
        errorRate: 0,
        averageResponseTime: 0,
        successRate: 100,
        tokensPerMinute: 0
      },
      lastUpdated: new Date()
    };
    
    this.startMonitoring();
    
    logger.info('AIMonitoringService initialized', {
      errorThreshold: config.errorThreshold,
      healthCheckInterval: config.healthCheckInterval
    });
  }

  /**
   * Record an AI operation error
   */
  async recordError(error: Omit<AIError, 'id' | 'createdAt'>): Promise<void> {
    try {
      const aiError: AIError = {
        id: uuidv4(),
        ...error,
        createdAt: new Date()
      };

      // Store error in database
      await this.storeError(aiError);

      // Update error counts for monitoring
      this.updateErrorCounts(error.service);

      // Check if alert thresholds are exceeded
      await this.checkErrorThresholds(error.service, error.impactLevel);

      logger.error('AI error recorded', {
        errorId: aiError.id,
        service: aiError.service,
        errorType: aiError.errorType,
        impactLevel: aiError.impactLevel
      });

    } catch (monitoringError) {
      logger.error('Failed to record AI error', {
        originalError: error,
        monitoringError: monitoringError.message
      });
    }
  }

  /**
   * Record performance metrics for AI operations
   */
  recordPerformanceMetric(
    service: string,
    operation: string,
    metrics: {
      responseTime: number;
      tokensUsed: number;
      confidence?: number;
      success: boolean;
    }
  ): void {
    try {
      const metricKey = `${service}_${operation}`;
      
      // Store response time
      if (!this.performanceMetrics.has(`${metricKey}_response_time`)) {
        this.performanceMetrics.set(`${metricKey}_response_time`, []);
      }
      this.performanceMetrics.get(`${metricKey}_response_time`)!.push(metrics.responseTime);

      // Store token usage
      if (!this.performanceMetrics.has(`${metricKey}_tokens`)) {
        this.performanceMetrics.set(`${metricKey}_tokens`, []);
      }
      this.performanceMetrics.get(`${metricKey}_tokens`)!.push(metrics.tokensUsed);

      // Store confidence if available
      if (metrics.confidence !== undefined) {
        if (!this.performanceMetrics.has(`${metricKey}_confidence`)) {
          this.performanceMetrics.set(`${metricKey}_confidence`, []);
        }
        this.performanceMetrics.get(`${metricKey}_confidence`)!.push(metrics.confidence);
      }

      // Check performance thresholds
      this.checkPerformanceThresholds(service, operation, metrics);

      // Limit metric storage to prevent memory issues
      this.limitMetricStorage();

    } catch (error) {
      logger.error('Failed to record performance metric', {
        service,
        operation,
        metrics,
        error: error.message
      });
    }
  }

  /**
   * Get current health status
   */
  getHealthStatus(): AIHealthStatus {
    return { ...this.healthStatus };
  }

  /**
   * Get performance metrics for a service
   */
  getServiceMetrics(
    service: string,
    timeRange: { start: Date; end: Date }
  ): Promise<{
    totalRequests: number;
    successRate: number;
    averageResponseTime: number;
    averageTokensUsed: number;
    averageConfidence: number;
    errorBreakdown: Record<string, number>;
  }> {
    // This would query the database for metrics
    // For now, return current cached metrics
    const responseTimeKey = `${service}_response_time`;
    const tokensKey = `${service}_tokens`;
    const confidenceKey = `${service}_confidence`;

    const responseTimes = this.performanceMetrics.get(responseTimeKey) || [];
    const tokens = this.performanceMetrics.get(tokensKey) || [];
    const confidences = this.performanceMetrics.get(confidenceKey) || [];

    return Promise.resolve({
      totalRequests: responseTimes.length,
      successRate: 95, // Would calculate from actual data
      averageResponseTime: responseTimes.length > 0 ? 
        responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0,
      averageTokensUsed: tokens.length > 0 ? 
        tokens.reduce((a, b) => a + b, 0) / tokens.length : 0,
      averageConfidence: confidences.length > 0 ? 
        confidences.reduce((a, b) => a + b, 0) / confidences.length : 0,
      errorBreakdown: {}
    });
  }

  /**
   * Generate performance report
   */
  async generatePerformanceReport(
    period: 'hour' | 'day' | 'week' | 'month'
  ): Promise<{
    period: string;
    startDate: Date;
    endDate: Date;
    overallMetrics: AIPerformanceMetrics;
    serviceBreakdown: Record<string, any>;
    topErrors: Array<{ error: string; count: number }>;
    recommendations: string[];
  }> {
    const endDate = new Date();
    const startDate = this.getStartDateForPeriod(period, endDate);

    // This would query the database for comprehensive metrics
    // For now, return a structured report with current data
    const overallMetrics: AIPerformanceMetrics = {
      id: uuidv4(),
      metricType: period === 'hour' ? 'daily' : period === 'day' ? 'daily' : 
                 period === 'week' ? 'weekly' : 'monthly',
      periodStart: startDate,
      periodEnd: endDate,
      
      totalAnalyses: 100, // Would get from database
      conversationAnalyses: 40,
      intentClassifications: 35,
      responseGenerations: 25,
      
      averageIntentConfidence: 0.85,
      emergencyDetectionAccuracy: 0.95,
      responseApprovalRate: 0.88,
      humanEditRate: 0.12,
      
      averageProcessingTime: 1500,
      totalTokensUsed: 50000,
      averageTokensPerRequest: 500,
      costPerRequest: 0.05,
      totalCost: 25.00,
      
      customerSatisfactionScore: 4.2,
      responseEffectivenessScore: 0.87,
      
      errorRate: 0.02,
      timeoutRate: 0.001,
      retryRate: 0.05,
      
      createdAt: new Date()
    };

    return {
      period,
      startDate,
      endDate,
      overallMetrics,
      serviceBreakdown: {
        claudeAPI: { uptime: 99.9, averageResponseTime: 800 },
        conversationAnalyzer: { uptime: 100, averageResponseTime: 1200 },
        intentClassifier: { uptime: 99.8, averageResponseTime: 600 },
        responseGenerator: { uptime: 99.9, averageResponseTime: 900 }
      },
      topErrors: [
        { error: 'Rate limit exceeded', count: 5 },
        { error: 'Timeout error', count: 3 },
        { error: 'Invalid response format', count: 2 }
      ],
      recommendations: [
        'Consider implementing more aggressive caching for frequently requested intents',
        'Monitor token usage during peak hours to optimize costs',
        'Review and update emergency detection keywords based on recent conversations'
      ]
    };
  }

  /**
   * Set up alerting rules
   */
  async setupAlertRule(
    rule: {
      name: string;
      condition: string;
      threshold: number;
      severity: 'critical' | 'warning' | 'info';
      enabled: boolean;
    }
  ): Promise<string> {
    const ruleId = uuidv4();
    
    // Store alert rule in database
    await this.databaseService.query(
      `INSERT INTO ai_alert_rules (id, name, condition_rule, threshold_value, severity, enabled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        ruleId,
        rule.name,
        rule.condition,
        rule.threshold,
        rule.severity,
        rule.enabled,
        new Date().toISOString()
      ]
    );

    logger.info('Alert rule created', {
      ruleId,
      name: rule.name,
      condition: rule.condition,
      threshold: rule.threshold,
      severity: rule.severity
    });

    return ruleId;
  }

  /**
   * Start monitoring loop
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(
      () => this.performHealthCheck(),
      this.config.healthCheckInterval * 60 * 1000
    );

    logger.info('AI monitoring started', {
      intervalMinutes: this.config.healthCheckInterval
    });
  }

  /**
   * Perform health check
   */
  private async performHealthCheck(): Promise<void> {
    try {
      // Check each service health
      const serviceHealth = await this.checkServiceHealth();
      
      // Update overall health status
      this.healthStatus = {
        status: this.determineOverallHealth(serviceHealth),
        services: serviceHealth,
        metrics: await this.calculateCurrentMetrics(),
        lastUpdated: new Date()
      };

      // Log health status
      logger.info('Health check completed', {
        status: this.healthStatus.status,
        services: this.healthStatus.services,
        metrics: this.healthStatus.metrics
      });

      // Send alerts if unhealthy
      if (this.healthStatus.status !== 'healthy') {
        await this.sendHealthAlert();
      }

    } catch (error) {
      logger.error('Health check failed', {
        error: error.message
      });
    }
  }

  /**
   * Check individual service health
   */
  private async checkServiceHealth(): Promise<AIHealthStatus['services']> {
    // This would implement actual health checks for each service
    // For now, return based on recent error rates
    
    const services: AIHealthStatus['services'] = {
      claudeAPI: 'healthy',
      conversationAnalyzer: 'healthy',
      intentClassifier: 'healthy',
      responseGenerator: 'healthy'
    };

    // Check error rates for each service
    for (const [service, errorData] of this.errorCounts.entries()) {
      const errorRate = this.calculateErrorRate(errorData);
      
      if (errorRate > this.config.errorThreshold.critical) {
        services[service as keyof AIHealthStatus['services']] = 'unhealthy';
      } else if (errorRate > this.config.errorThreshold.warning) {
        services[service as keyof AIHealthStatus['services']] = 'degraded';
      }
    }

    return services;
  }

  /**
   * Calculate current metrics
   */
  private async calculateCurrentMetrics(): Promise<AIHealthStatus['metrics']> {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Calculate metrics from recent data
    let totalErrors = 0;
    let totalRequests = 0;
    let totalResponseTime = 0;
    let totalTokens = 0;

    // Aggregate metrics from all services
    for (const [key, values] of this.performanceMetrics.entries()) {
      if (key.includes('response_time')) {
        totalRequests += values.length;
        totalResponseTime += values.reduce((a, b) => a + b, 0);
      } else if (key.includes('tokens')) {
        totalTokens += values.reduce((a, b) => a + b, 0);
      }
    }

    // Count recent errors
    for (const [, errorData] of this.errorCounts.entries()) {
      if (errorData.windowStart > oneMinuteAgo) {
        totalErrors += errorData.count;
      }
    }

    return {
      errorRate: totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0,
      averageResponseTime: totalRequests > 0 ? totalResponseTime / totalRequests : 0,
      successRate: totalRequests > 0 ? ((totalRequests - totalErrors) / totalRequests) * 100 : 100,
      tokensPerMinute: totalTokens // Approximate since we don't track exact timing
    };
  }

  /**
   * Update error counts for monitoring
   */
  private updateErrorCounts(service: string): void {
    const now = Date.now();
    const oneMinuteWindow = 60000;

    if (!this.errorCounts.has(service)) {
      this.errorCounts.set(service, { count: 0, windowStart: now });
    }

    const errorData = this.errorCounts.get(service)!;

    // Reset window if it's been more than a minute
    if (now - errorData.windowStart > oneMinuteWindow) {
      errorData.count = 1;
      errorData.windowStart = now;
    } else {
      errorData.count++;
    }

    this.errorCounts.set(service, errorData);
  }

  /**
   * Check error thresholds and send alerts
   */
  private async checkErrorThresholds(
    service: string,
    impactLevel: AIError['impactLevel']
  ): Promise<void> {
    const errorData = this.errorCounts.get(service);
    if (!errorData) return;

    const errorRate = this.calculateErrorRate(errorData);

    // Send critical alert
    if (errorRate > this.config.errorThreshold.critical || impactLevel === 'critical') {
      await this.sendAlert({
        severity: 'critical',
        service,
        message: `Critical error threshold exceeded for ${service}`,
        details: {
          errorRate,
          threshold: this.config.errorThreshold.critical,
          impactLevel,
          errorCount: errorData.count
        },
        timestamp: new Date(),
        actionItems: [
          'Check service logs immediately',
          'Consider failing over to backup systems',
          'Alert on-call engineer'
        ]
      });
    }
    // Send warning alert
    else if (errorRate > this.config.errorThreshold.warning) {
      await this.sendAlert({
        severity: 'warning',
        service,
        message: `Warning error threshold exceeded for ${service}`,
        details: {
          errorRate,
          threshold: this.config.errorThreshold.warning,
          errorCount: errorData.count
        },
        timestamp: new Date(),
        actionItems: [
          'Monitor service closely',
          'Review recent changes',
          'Check resource utilization'
        ]
      });
    }
  }

  /**
   * Check performance thresholds
   */
  private checkPerformanceThresholds(
    service: string,
    operation: string,
    metrics: { responseTime: number; tokensUsed: number; confidence?: number }
  ): void {
    // Check response time
    if (metrics.responseTime > this.config.performanceThresholds.maxResponseTime) {
      logger.warn('Performance threshold exceeded', {
        service,
        operation,
        responseTime: metrics.responseTime,
        threshold: this.config.performanceThresholds.maxResponseTime
      });
    }

    // Check confidence
    if (metrics.confidence !== undefined && 
        metrics.confidence < this.config.performanceThresholds.minConfidence) {
      logger.warn('Confidence threshold not met', {
        service,
        operation,
        confidence: metrics.confidence,
        threshold: this.config.performanceThresholds.minConfidence
      });
    }

    // Check token usage
    if (metrics.tokensUsed > this.config.performanceThresholds.maxTokensPerRequest) {
      logger.warn('Token usage threshold exceeded', {
        service,
        operation,
        tokensUsed: metrics.tokensUsed,
        threshold: this.config.performanceThresholds.maxTokensPerRequest
      });
    }
  }

  /**
   * Send alert
   */
  private async sendAlert(alert: AlertPayload): Promise<void> {
    try {
      // Log alert
      logger.warn('AI monitoring alert', alert);

      // Send Slack alert if enabled
      if (this.config.alerting.enableSlackAlerts && this.config.alerting.slackWebhook) {
        await this.sendSlackAlert(alert);
      }

      // Send email alert if enabled
      if (this.config.alerting.enableEmailAlerts && this.config.alerting.alertEmails.length > 0) {
        await this.sendEmailAlert(alert);
      }

      // Store alert in database
      await this.storeAlert(alert);

    } catch (error) {
      logger.error('Failed to send AI monitoring alert', {
        alert,
        error: error.message
      });
    }
  }

  /**
   * Send health alert
   */
  private async sendHealthAlert(): Promise<void> {
    await this.sendAlert({
      severity: this.healthStatus.status === 'unhealthy' ? 'critical' : 'warning',
      service: 'AI_SYSTEM',
      message: `AI system health is ${this.healthStatus.status}`,
      details: {
        services: this.healthStatus.services,
        metrics: this.healthStatus.metrics
      },
      timestamp: new Date(),
      actionItems: [
        'Check individual service health',
        'Review recent error logs',
        'Consider scaling resources if needed'
      ]
    });
  }

  // Helper methods
  private calculateErrorRate(errorData: { count: number; windowStart: number }): number {
    const timeWindow = Date.now() - errorData.windowStart;
    const minutes = Math.max(1, timeWindow / 60000);
    return errorData.count / minutes;
  }

  private determineOverallHealth(
    services: AIHealthStatus['services']
  ): AIHealthStatus['status'] {
    const serviceStatuses = Object.values(services);
    
    if (serviceStatuses.includes('unhealthy')) {
      return 'unhealthy';
    }
    
    if (serviceStatuses.includes('degraded')) {
      return 'degraded';
    }
    
    return 'healthy';
  }

  private limitMetricStorage(): void {
    const maxMetricsPerKey = 100;
    
    for (const [key, values] of this.performanceMetrics.entries()) {
      if (values.length > maxMetricsPerKey) {
        // Keep only the most recent metrics
        this.performanceMetrics.set(key, values.slice(-maxMetricsPerKey));
      }
    }
  }

  private getStartDateForPeriod(period: string, endDate: Date): Date {
    const start = new Date(endDate);
    
    switch (period) {
      case 'hour':
        start.setHours(start.getHours() - 1);
        break;
      case 'day':
        start.setDate(start.getDate() - 1);
        break;
      case 'week':
        start.setDate(start.getDate() - 7);
        break;
      case 'month':
        start.setMonth(start.getMonth() - 1);
        break;
    }
    
    return start;
  }

  // Database operations (stubs)
  private async storeError(error: AIError): Promise<void> {
    // Store error in database
  }

  private async storeAlert(alert: AlertPayload): Promise<void> {
    // Store alert in database
  }

  private async sendSlackAlert(alert: AlertPayload): Promise<void> {
    // Send alert to Slack
  }

  private async sendEmailAlert(alert: AlertPayload): Promise<void> {
    // Send alert via email
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    
    logger.info('AI monitoring stopped');
  }
}

// Default configuration
export const DEFAULT_MONITORING_CONFIG: AIMonitoringConfig = {
  errorThreshold: {
    critical: 10, // 10 errors per minute
    warning: 5
  },
  performanceThresholds: {
    maxResponseTime: 5000, // 5 seconds
    minConfidence: 0.5,
    maxTokensPerRequest: 2000
  },
  alerting: {
    enableSlackAlerts: false,
    enableEmailAlerts: true,
    alertEmails: []
  },
  metricsRetention: {
    detailedMetricsDays: 30,
    summaryMetricsMonths: 12
  },
  healthCheckInterval: 5 // 5 minutes
};