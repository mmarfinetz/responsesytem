import { DatabaseService } from './DatabaseService';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

export interface SyncMetrics {
  syncSessionId: string;
  totalMessages: number;
  processedMessages: number;
  successfulMessages: number;
  failedMessages: number;
  duplicateMessages: number;
  conversationsCreated: number;
  conversationsUpdated: number;
  customersCreated: number;
  customersMatched: number;
  averageProcessingTime: number;
  peakMemoryUsage: number;
  totalProcessingTime: number;
  throughputMessagesPerSecond: number;
  errorBreakdown: Record<string, number>;
  performanceIssues: string[];
}

export interface PerformanceAlert {
  alertId: string;
  alertType: 'performance' | 'error_rate' | 'memory' | 'timeout' | 'queue_backup';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details: Record<string, any>;
  timestamp: Date;
  syncSessionId?: string;
  resolved: boolean;
  resolvedAt?: Date;
}

export interface HealthCheck {
  component: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  details: Record<string, any>;
  lastCheck: Date;
  responseTime: number;
}

export class ConversationSyncMonitoringService extends EventEmitter {
  private metricsCache: Map<string, SyncMetrics> = new Map();
  private activeAlerts: Map<string, PerformanceAlert> = new Map();
  private healthStatus: Map<string, HealthCheck> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;

  // Thresholds for alerting
  private readonly PERFORMANCE_THRESHOLDS = {
    MAX_PROCESSING_TIME_MS: 5000,
    MAX_MEMORY_USAGE_MB: 512,
    MAX_ERROR_RATE_PERCENT: 5,
    MAX_QUEUE_DEPTH: 1000,
    MIN_THROUGHPUT_PER_SECOND: 1
  };

  constructor(private db: DatabaseService) {
    super();
    this.startMonitoring();
  }

  /**
   * Start the monitoring service
   */
  startMonitoring(): void {
    logger.info('Starting conversation sync monitoring service');
    
    // Start periodic health checks every 30 seconds
    this.monitoringInterval = setInterval(async () => {
      try {
        await this.performHealthChecks();
        await this.checkPerformanceAlerts();
        await this.cleanupOldMetrics();
      } catch (error) {
        logger.error('Monitoring service error', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, 30000);

    // Emit monitoring started event
    this.emit('monitoring_started');
  }

  /**
   * Stop the monitoring service
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    
    logger.info('Stopped conversation sync monitoring service');
    this.emit('monitoring_stopped');
  }

  /**
   * Record sync session metrics
   */
  async recordSyncMetrics(syncSessionId: string, metrics: Partial<SyncMetrics>): Promise<void> {
    try {
      const knex = await this.db.getKnex();
      
      // Update or create metrics cache entry
      const existingMetrics = this.metricsCache.get(syncSessionId) || {
        syncSessionId,
        totalMessages: 0,
        processedMessages: 0,
        successfulMessages: 0,
        failedMessages: 0,
        duplicateMessages: 0,
        conversationsCreated: 0,
        conversationsUpdated: 0,
        customersCreated: 0,
        customersMatched: 0,
        averageProcessingTime: 0,
        peakMemoryUsage: 0,
        totalProcessingTime: 0,
        throughputMessagesPerSecond: 0,
        errorBreakdown: {},
        performanceIssues: []
      };

      const updatedMetrics = { ...existingMetrics, ...metrics };
      this.metricsCache.set(syncSessionId, updatedMetrics);

      // Persist metrics to database
      await this.persistMetrics(syncSessionId, updatedMetrics);

      // Check for performance issues
      await this.analyzePerformance(updatedMetrics);

      logger.debug('Recorded sync metrics', {
        syncSessionId,
        processedMessages: updatedMetrics.processedMessages,
        successfulMessages: updatedMetrics.successfulMessages,
        failedMessages: updatedMetrics.failedMessages
      });

    } catch (error) {
      logger.error('Failed to record sync metrics', {
        syncSessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Record performance metric
   */
  async recordPerformanceMetric(
    syncSessionId: string,
    metricName: string,
    value: number,
    unit: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      const knex = await this.db.getKnex();
      
      await knex('sync_performance_metrics').insert({
        id: this.generateId(),
        syncSessionId,
        metricName,
        value,
        unit,
        metadata: metadata ? JSON.stringify(metadata) : null,
        recordedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Emit metric recorded event
      this.emit('metric_recorded', {
        syncSessionId,
        metricName,
        value,
        unit,
        metadata
      });

    } catch (error) {
      logger.error('Failed to record performance metric', {
        syncSessionId,
        metricName,
        value,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Create performance alert
   */
  async createAlert(
    alertType: PerformanceAlert['alertType'],
    severity: PerformanceAlert['severity'],
    message: string,
    details: Record<string, any>,
    syncSessionId?: string
  ): Promise<string> {
    const alertId = this.generateId();
    
    const alert: PerformanceAlert = {
      alertId,
      alertType,
      severity,
      message,
      details,
      timestamp: new Date(),
      syncSessionId,
      resolved: false
    };

    // Store alert
    this.activeAlerts.set(alertId, alert);

    // Persist to database
    await this.persistAlert(alert);

    // Emit alert event
    this.emit('alert_created', alert);

    logger.warn('Performance alert created', {
      alertId,
      alertType,
      severity,
      message,
      syncSessionId
    });

    return alertId;
  }

  /**
   * Resolve performance alert
   */
  async resolveAlert(alertId: string, resolution?: string): Promise<boolean> {
    try {
      const alert = this.activeAlerts.get(alertId);
      if (!alert) {
        return false;
      }

      alert.resolved = true;
      alert.resolvedAt = new Date();
      if (resolution) {
        alert.details.resolution = resolution;
      }

      // Update database
      const knex = await this.db.getKnex();
      await knex('performance_alerts')
        .where('alertId', alertId)
        .update({
          resolved: true,
          resolvedAt: alert.resolvedAt,
          details: JSON.stringify(alert.details),
          updatedAt: new Date()
        });

      // Remove from active alerts
      this.activeAlerts.delete(alertId);

      // Emit resolution event
      this.emit('alert_resolved', alert);

      logger.info('Performance alert resolved', {
        alertId,
        resolution
      });

      return true;

    } catch (error) {
      logger.error('Failed to resolve alert', {
        alertId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  /**
   * Get current sync metrics
   */
  getSyncMetrics(syncSessionId: string): SyncMetrics | null {
    return this.metricsCache.get(syncSessionId) || null;
  }

  /**
   * Get all active alerts
   */
  getActiveAlerts(): PerformanceAlert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Get system health status
   */
  getHealthStatus(): Record<string, HealthCheck> {
    const healthStatus: Record<string, HealthCheck> = {};
    this.healthStatus.forEach((value, key) => {
      healthStatus[key] = value;
    });
    return healthStatus;
  }

  /**
   * Get comprehensive monitoring dashboard data
   */
  async getDashboardData(): Promise<{
    activeSync: number;
    totalMessagesProcessed: number;
    averageProcessingTime: number;
    errorRate: number;
    activeAlerts: number;
    systemHealth: 'healthy' | 'degraded' | 'unhealthy';
    throughput: number;
    memoryUsage: number;
    queueDepth: number;
  }> {
    try {
      const knex = await this.db.getKnex();
      
      // Get active sync sessions
      const activeSyncCount = await knex('google_voice_sync_status')
        .where('status', 'running')
        .count('* as count')
        .first();

      // Get processing stats from last hour
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      const processingStats = await knex('sync_performance_metrics')
        .where('recordedAt', '>', oneHourAgo)
        .where('metricName', 'message_processing_time')
        .select(
          knex.raw('COUNT(*) as total_messages'),
          knex.raw('AVG(value) as avg_processing_time'),
          knex.raw('SUM(CASE WHEN value > ? THEN 1 ELSE 0 END) as slow_messages', [this.PERFORMANCE_THRESHOLDS.MAX_PROCESSING_TIME_MS])
        )
        .first();

      const totalMessages = processingStats?.total_messages || 0;
      const averageProcessingTime = processingStats?.avg_processing_time || 0;
      const slowMessages = processingStats?.slow_messages || 0;
      const errorRate = totalMessages > 0 ? (slowMessages / totalMessages) * 100 : 0;

      // Get queue depth
      const queueDepth = await knex('message_processing_queue')
        .whereIn('status', ['pending', 'processing'])
        .count('* as count')
        .first();

      // Calculate throughput (messages per second in last 5 minutes)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const recentMessages = await knex('sync_performance_metrics')
        .where('recordedAt', '>', fiveMinutesAgo)
        .where('metricName', 'message_processed')
        .count('* as count')
        .first();

      const throughput = (recentMessages?.count || 0) / 300; // per second

      // Get memory usage
      const memoryMetric = await knex('sync_performance_metrics')
        .where('metricName', 'memory_usage_mb')
        .orderBy('recordedAt', 'desc')
        .first();

      const memoryUsage = memoryMetric?.value || 0;

      // Determine overall system health
      const healthChecks = Array.from(this.healthStatus.values());
      let systemHealth: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      
      if (healthChecks.some(h => h.status === 'unhealthy')) {
        systemHealth = 'unhealthy';
      } else if (healthChecks.some(h => h.status === 'degraded')) {
        systemHealth = 'degraded';
      }

      return {
        activeSync: parseInt(activeSyncCount?.count || '0'),
        totalMessagesProcessed: totalMessages,
        averageProcessingTime,
        errorRate,
        activeAlerts: this.activeAlerts.size,
        systemHealth,
        throughput,
        memoryUsage,
        queueDepth: parseInt(queueDepth?.count || '0')
      };

    } catch (error) {
      logger.error('Failed to get dashboard data', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        activeSync: 0,
        totalMessagesProcessed: 0,
        averageProcessingTime: 0,
        errorRate: 0,
        activeAlerts: this.activeAlerts.size,
        systemHealth: 'unhealthy',
        throughput: 0,
        memoryUsage: 0,
        queueDepth: 0
      };
    }
  }

  // Private methods

  /**
   * Perform health checks on system components
   */
  private async performHealthChecks(): Promise<void> {
    const components = [
      'database',
      'google_voice_api',
      'message_queue',
      'memory_usage',
      'disk_space'
    ];

    for (const component of components) {
      try {
        const healthCheck = await this.checkComponentHealth(component);
        this.healthStatus.set(component, healthCheck);

        if (healthCheck.status === 'unhealthy') {
          await this.createAlert(
            'performance',
            'high',
            `Component ${component} is unhealthy`,
            healthCheck.details
          );
        }

      } catch (error) {
        logger.error(`Health check failed for ${component}`, {
          error: error instanceof Error ? error.message : 'Unknown error'
        });

        this.healthStatus.set(component, {
          component,
          status: 'unhealthy',
          details: { error: error instanceof Error ? error.message : 'Unknown error' },
          lastCheck: new Date(),
          responseTime: 0
        });
      }
    }
  }

  /**
   * Check health of individual component
   */
  private async checkComponentHealth(component: string): Promise<HealthCheck> {
    const startTime = Date.now();
    let status: HealthCheck['status'] = 'healthy';
    const details: Record<string, any> = {};

    try {
      switch (component) {
        case 'database': {
          const knex = await this.db.getKnex();
          const result = await knex.raw('SELECT 1 as test');
          
          if (!result.rows || result.rows.length === 0) {
            status = 'unhealthy';
            details.error = 'Database query returned no results';
          }
          break;
        }

        case 'google_voice_api': {
          // Check if there are any recent API errors
          const knex = await this.db.getKnex();
          const recentErrors = await knex('google_voice_sync_status')
            .where('status', 'failed')
            .where('createdAt', '>', new Date(Date.now() - 60 * 60 * 1000))
            .count('* as count')
            .first();

          const errorCount = parseInt(recentErrors?.count || '0');
          if (errorCount > 5) {
            status = 'degraded';
            details.recentErrors = errorCount;
          }
          break;
        }

        case 'message_queue': {
          const knex = await this.db.getKnex();
          const queueDepth = await knex('message_processing_queue')
            .whereIn('status', ['pending', 'processing'])
            .count('* as count')
            .first();

          const depth = parseInt(queueDepth?.count || '0');
          if (depth > this.PERFORMANCE_THRESHOLDS.MAX_QUEUE_DEPTH) {
            status = 'degraded';
            details.queueDepth = depth;
          }
          break;
        }

        case 'memory_usage': {
          const memoryUsage = process.memoryUsage();
          const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
          
          details.heapUsedMB = heapUsedMB;
          details.heapTotalMB = memoryUsage.heapTotal / 1024 / 1024;
          
          if (heapUsedMB > this.PERFORMANCE_THRESHOLDS.MAX_MEMORY_USAGE_MB) {
            status = 'degraded';
          }
          break;
        }

        case 'disk_space': {
          // This would check available disk space
          // For now, we'll assume it's healthy
          details.available = 'sufficient';
          break;
        }
      }

    } catch (error) {
      status = 'unhealthy';
      details.error = error instanceof Error ? error.message : 'Unknown error';
    }

    const responseTime = Date.now() - startTime;

    return {
      component,
      status,
      details,
      lastCheck: new Date(),
      responseTime
    };
  }

  /**
   * Check for performance alerts based on current metrics
   */
  private async checkPerformanceAlerts(): Promise<void> {
    try {
      const dashboardData = await this.getDashboardData();

      // Check error rate
      if (dashboardData.errorRate > this.PERFORMANCE_THRESHOLDS.MAX_ERROR_RATE_PERCENT) {
        await this.createAlert(
          'error_rate',
          'medium',
          `High error rate: ${dashboardData.errorRate.toFixed(2)}%`,
          {
            errorRate: dashboardData.errorRate,
            threshold: this.PERFORMANCE_THRESHOLDS.MAX_ERROR_RATE_PERCENT
          }
        );
      }

      // Check memory usage
      if (dashboardData.memoryUsage > this.PERFORMANCE_THRESHOLDS.MAX_MEMORY_USAGE_MB) {
        await this.createAlert(
          'memory',
          'high',
          `High memory usage: ${dashboardData.memoryUsage.toFixed(2)}MB`,
          {
            memoryUsage: dashboardData.memoryUsage,
            threshold: this.PERFORMANCE_THRESHOLDS.MAX_MEMORY_USAGE_MB
          }
        );
      }

      // Check queue backup
      if (dashboardData.queueDepth > this.PERFORMANCE_THRESHOLDS.MAX_QUEUE_DEPTH) {
        await this.createAlert(
          'queue_backup',
          'medium',
          `Message queue backup: ${dashboardData.queueDepth} messages`,
          {
            queueDepth: dashboardData.queueDepth,
            threshold: this.PERFORMANCE_THRESHOLDS.MAX_QUEUE_DEPTH
          }
        );
      }

      // Check low throughput
      if (dashboardData.throughput < this.PERFORMANCE_THRESHOLDS.MIN_THROUGHPUT_PER_SECOND && dashboardData.activeSync > 0) {
        await this.createAlert(
          'performance',
          'low',
          `Low throughput: ${dashboardData.throughput.toFixed(2)} messages/second`,
          {
            throughput: dashboardData.throughput,
            threshold: this.PERFORMANCE_THRESHOLDS.MIN_THROUGHPUT_PER_SECOND
          }
        );
      }

    } catch (error) {
      logger.error('Failed to check performance alerts', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Analyze performance and detect issues
   */
  private async analyzePerformance(metrics: SyncMetrics): Promise<void> {
    const issues: string[] = [];

    // Check processing time
    if (metrics.averageProcessingTime > this.PERFORMANCE_THRESHOLDS.MAX_PROCESSING_TIME_MS) {
      issues.push(`Slow processing: ${metrics.averageProcessingTime}ms average`);
    }

    // Check memory usage
    if (metrics.peakMemoryUsage > this.PERFORMANCE_THRESHOLDS.MAX_MEMORY_USAGE_MB) {
      issues.push(`High memory usage: ${metrics.peakMemoryUsage}MB peak`);
    }

    // Check error rate
    const errorRate = metrics.processedMessages > 0 ? 
      (metrics.failedMessages / metrics.processedMessages) * 100 : 0;
    
    if (errorRate > this.PERFORMANCE_THRESHOLDS.MAX_ERROR_RATE_PERCENT) {
      issues.push(`High error rate: ${errorRate.toFixed(2)}%`);
    }

    // Check throughput
    if (metrics.throughputMessagesPerSecond < this.PERFORMANCE_THRESHOLDS.MIN_THROUGHPUT_PER_SECOND) {
      issues.push(`Low throughput: ${metrics.throughputMessagesPerSecond.toFixed(2)} messages/second`);
    }

    // Update metrics with performance issues
    metrics.performanceIssues = issues;

    // Create alerts for new issues
    for (const issue of issues) {
      if (!this.hasActiveAlertForIssue(issue, metrics.syncSessionId)) {
        await this.createAlert(
          'performance',
          'medium',
          issue,
          { metrics },
          metrics.syncSessionId
        );
      }
    }
  }

  /**
   * Check if there's already an active alert for this issue
   */
  private hasActiveAlertForIssue(issue: string, syncSessionId: string): boolean {
    return Array.from(this.activeAlerts.values()).some(alert =>
      alert.message.includes(issue.split(':')[0]) &&
      alert.syncSessionId === syncSessionId &&
      !alert.resolved
    );
  }

  /**
   * Persist metrics to database
   */
  private async persistMetrics(syncSessionId: string, metrics: SyncMetrics): Promise<void> {
    try {
      const knex = await this.db.getKnex();
      
      // Record individual metrics
      const metricsToRecord = [
        { name: 'total_messages', value: metrics.totalMessages, unit: 'count' },
        { name: 'processed_messages', value: metrics.processedMessages, unit: 'count' },
        { name: 'successful_messages', value: metrics.successfulMessages, unit: 'count' },
        { name: 'failed_messages', value: metrics.failedMessages, unit: 'count' },
        { name: 'average_processing_time', value: metrics.averageProcessingTime, unit: 'ms' },
        { name: 'peak_memory_usage', value: metrics.peakMemoryUsage, unit: 'mb' },
        { name: 'throughput', value: metrics.throughputMessagesPerSecond, unit: 'messages_per_second' }
      ];

      for (const metric of metricsToRecord) {
        await knex('sync_performance_metrics').insert({
          id: this.generateId(),
          syncSessionId,
          metricName: metric.name,
          value: metric.value,
          unit: metric.unit,
          recordedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

    } catch (error) {
      logger.error('Failed to persist metrics', {
        syncSessionId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Persist alert to database
   */
  private async persistAlert(alert: PerformanceAlert): Promise<void> {
    try {
      const knex = await this.db.getKnex();
      
      // Create performance_alerts table if it doesn't exist
      const tableExists = await knex.schema.hasTable('performance_alerts');
      if (!tableExists) {
        await knex.schema.createTable('performance_alerts', (table) => {
          table.string('id').primary();
          table.string('alertId').notNullable().unique();
          table.enum('alertType', ['performance', 'error_rate', 'memory', 'timeout', 'queue_backup']).notNullable();
          table.enum('severity', ['low', 'medium', 'high', 'critical']).notNullable();
          table.text('message').notNullable();
          table.json('details').notNullable();
          table.datetime('timestamp').notNullable();
          table.string('syncSessionId');
          table.boolean('resolved').defaultTo(false);
          table.datetime('resolvedAt');
          table.timestamps(true, true);

          table.index(['alertType']);
          table.index(['severity']);
          table.index(['resolved']);
          table.index(['timestamp']);
        });
      }

      await knex('performance_alerts').insert({
        id: this.generateId(),
        alertId: alert.alertId,
        alertType: alert.alertType,
        severity: alert.severity,
        message: alert.message,
        details: JSON.stringify(alert.details),
        timestamp: alert.timestamp,
        syncSessionId: alert.syncSessionId,
        resolved: alert.resolved,
        resolvedAt: alert.resolvedAt,
        createdAt: new Date(),
        updatedAt: new Date()
      });

    } catch (error) {
      logger.error('Failed to persist alert', {
        alertId: alert.alertId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Clean up old metrics and resolved alerts
   */
  private async cleanupOldMetrics(): Promise<void> {
    try {
      const knex = await this.db.getKnex();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Clean up old performance metrics
      await knex('sync_performance_metrics')
        .where('recordedAt', '<', thirtyDaysAgo)
        .delete();

      // Clean up resolved alerts older than 7 days
      if (await knex.schema.hasTable('performance_alerts')) {
        await knex('performance_alerts')
          .where('resolved', true)
          .where('resolvedAt', '<', sevenDaysAgo)
          .delete();
      }

      // Clean up metrics cache for old sessions
      const activeSessionIds = Array.from(this.metricsCache.keys());
      for (const sessionId of activeSessionIds) {
        const syncStatus = await knex('google_voice_sync_status')
          .where('id', sessionId)
          .first();

        if (!syncStatus || syncStatus.status !== 'running') {
          this.metricsCache.delete(sessionId);
        }
      }

    } catch (error) {
      logger.error('Failed to cleanup old metrics', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `monitor_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default ConversationSyncMonitoringService;