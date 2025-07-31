import { EventEmitter } from 'events';
import { logger } from '@/utils/logger';

export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
  expectedErrors?: Array<string | RegExp>;
  volumeThreshold: number;
  errorThresholdPercentage: number;
  slowCallDurationThreshold?: number;
  slowCallRateThreshold?: number;
  maxWaitTimeInHalfOpenState?: number;
  permittedNumberOfCallsInHalfOpenState?: number;
}

export interface CircuitBreakerMetrics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  slowCalls: number;
  rejectedCalls: number;
  averageResponseTime: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  stateTransitionHistory: Array<{
    from: CircuitBreakerState;
    to: CircuitBreakerState;
    timestamp: Date;
    reason: string;
  }>;
}

export interface CircuitBreakerStatus {
  name: string;
  state: CircuitBreakerState;
  isCallPermitted: boolean;
  metrics: CircuitBreakerMetrics;
  lastStateTransition: Date;
  nextRetryTime?: Date;
  errorRate: number;
  slowCallRate: number;
}

/**
 * Production-grade Circuit Breaker implementation with comprehensive monitoring
 * Supports multiple failure modes, partial failure detection, and adaptive recovery
 */
export class CircuitBreakerService extends EventEmitter {
  private readonly options: Required<CircuitBreakerOptions>;
  private state: CircuitBreakerState = 'closed';
  private metrics: CircuitBreakerMetrics;
  private lastStateTransition: Date = new Date();
  private nextRetryTime?: Date;
  private callsInCurrentPeriod: Array<{
    startTime: number;
    endTime?: number;
    success?: boolean;
    error?: Error;
  }> = [];
  private halfOpenCallCount = 0;
  private monitoringInterval?: NodeJS.Timeout;

  constructor(options: CircuitBreakerOptions) {
    super();
    
    // Set defaults for optional parameters
    this.options = {
      name: options.name,
      failureThreshold: options.failureThreshold,
      recoveryTimeout: options.recoveryTimeout,
      monitoringPeriod: options.monitoringPeriod,
      expectedErrors: options.expectedErrors || [],
      volumeThreshold: options.volumeThreshold,
      errorThresholdPercentage: options.errorThresholdPercentage,
      slowCallDurationThreshold: options.slowCallDurationThreshold || 5000, // 5 seconds
      slowCallRateThreshold: options.slowCallRateThreshold || 50, // 50%
      maxWaitTimeInHalfOpenState: options.maxWaitTimeInHalfOpenState || 60000, // 1 minute
      permittedNumberOfCallsInHalfOpenState: options.permittedNumberOfCallsInHalfOpenState || 3,
    };

    this.metrics = {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      slowCalls: 0,
      rejectedCalls: 0,
      averageResponseTime: 0,
      stateTransitionHistory: [],
    };

    this.startMonitoring();
    
    logger.info('Circuit breaker initialized', {
      name: this.options.name,
      options: this.options,
    });
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(
    fn: () => Promise<T>,
    context?: { correlationId?: string; timeout?: number }
  ): Promise<T> {
    const { correlationId, timeout } = context || {};
    const startTime = Date.now();
    
    // Check if call is permitted
    if (!this.isCallPermitted()) {
      this.metrics.rejectedCalls++;
      const error = new Error(`Circuit breaker '${this.options.name}' is OPEN - calls are rejected`);
      error.name = 'CircuitBreakerOpenError';
      
      logger.warn('Circuit breaker rejected call', {
        circuitBreaker: this.options.name,
        state: this.state,
        correlationId,
        reason: 'Circuit breaker is open',
      });
      
      this.emit('callRejected', {
        circuitBreaker: this.options.name,
        reason: 'open',
        correlationId,
      });
      
      throw error;
    }

    // Record call start
    const callRecord: {
      startTime: number;
      endTime?: number;
      success?: boolean;
      error?: Error;
    } = { startTime };
    this.callsInCurrentPeriod.push(callRecord);
    this.metrics.totalCalls++;

    try {
      let result: T;
      
      // Execute with timeout if specified
      if (timeout) {
        result = await Promise.race([
          fn(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Operation timeout')), timeout)
          ),
        ]);
      } else {
        result = await fn();
      }

      // Record successful call
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      callRecord.endTime = endTime;
      callRecord.success = true;
      
      this.recordSuccess(duration, correlationId);
      
      return result;
    } catch (error) {
      // Record failed call
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      callRecord.endTime = endTime;
      callRecord.success = false;
      callRecord.error = error instanceof Error ? error : new Error(String(error));
      
      this.recordFailure(error instanceof Error ? error : new Error(String(error)), duration, correlationId);
      
      throw error;
    }
  }

  /**
   * Check if calls are permitted in current state
   */
  private isCallPermitted(): boolean {
    switch (this.state) {
      case 'closed':
        return true;
      
      case 'open':
        // Check if recovery timeout has elapsed
        if (this.nextRetryTime && Date.now() >= this.nextRetryTime.getTime()) {
          this.transitionToHalfOpen('Recovery timeout elapsed');
          return true;
        }
        return false;
      
      case 'half-open':
        // Allow limited number of calls in half-open state
        return this.halfOpenCallCount < this.options.permittedNumberOfCallsInHalfOpenState;
      
      default:
        return false;
    }
  }

  /**
   * Record successful call execution
   */
  private recordSuccess(duration: number, correlationId?: string): void {
    this.metrics.successfulCalls++;
    this.metrics.lastSuccessTime = new Date();
    
    // Update average response time
    this.updateAverageResponseTime(duration);
    
    // Check for slow call
    if (duration > this.options.slowCallDurationThreshold) {
      this.metrics.slowCalls++;
      
      logger.warn('Slow call detected', {
        circuitBreaker: this.options.name,
        duration,
        threshold: this.options.slowCallDurationThreshold,
        correlationId,
      });
    }

    // Handle state transitions based on success
    if (this.state === 'half-open') {
      this.halfOpenCallCount++;
      
      // Check if we should close the circuit
      if (this.halfOpenCallCount >= this.options.permittedNumberOfCallsInHalfOpenState) {
        const recentCalls = this.getRecentCalls();
        const errorRate = this.calculateErrorRate(recentCalls);
        const slowCallRate = this.calculateSlowCallRate(recentCalls);
        
        if (errorRate <= this.options.errorThresholdPercentage &&
            slowCallRate <= this.options.slowCallRateThreshold) {
          this.transitionToClosed('Half-open evaluation successful');
        } else {
          this.transitionToOpen('Half-open evaluation failed', errorRate, slowCallRate);
        }
      }
    }

    this.emit('callSuccess', {
      circuitBreaker: this.options.name,
      duration,
      correlationId,
    });
  }

  /**
   * Record failed call execution
   */
  private recordFailure(error: Error, duration: number, correlationId?: string): void {
    // Check if this is an expected error (shouldn't trigger circuit breaker)
    if (this.isExpectedError(error)) {
      logger.debug('Expected error occurred, not counting towards circuit breaker', {
        circuitBreaker: this.options.name,
        error: error.message,
        correlationId,
      });
      return;
    }

    this.metrics.failedCalls++;
    this.metrics.lastFailureTime = new Date();
    
    // Update average response time
    this.updateAverageResponseTime(duration);
    
    // Check for slow call
    if (duration > this.options.slowCallDurationThreshold) {
      this.metrics.slowCalls++;
    }

    // Handle state transitions based on failure
    if (this.state === 'closed') {
      // Check if we should open the circuit
      const recentCalls = this.getRecentCalls();
      
      if (recentCalls.length >= this.options.volumeThreshold) {
        const errorRate = this.calculateErrorRate(recentCalls);
        const slowCallRate = this.calculateSlowCallRate(recentCalls);
        
        if (errorRate > this.options.errorThresholdPercentage ||
            slowCallRate > this.options.slowCallRateThreshold) {
          this.transitionToOpen('Error threshold exceeded', errorRate, slowCallRate);
        }
      }
    } else if (this.state === 'half-open') {
      // Any failure in half-open state should open the circuit
      this.transitionToOpen('Failure in half-open state');
    }

    this.emit('callFailure', {
      circuitBreaker: this.options.name,
      error: error.message,
      duration,
      correlationId,
    });

    logger.warn('Circuit breaker recorded failure', {
      circuitBreaker: this.options.name,
      state: this.state,
      error: error.message,
      duration,
      correlationId,
    });
  }

  /**
   * Transition circuit breaker to OPEN state
   */
  private transitionToOpen(reason: string, errorRate?: number, slowCallRate?: number): void {
    const previousState = this.state;
    this.state = 'open';
    this.lastStateTransition = new Date();
    this.nextRetryTime = new Date(Date.now() + this.options.recoveryTimeout);
    this.halfOpenCallCount = 0;

    this.recordStateTransition(previousState, 'open', reason);

    logger.error('Circuit breaker opened', {
      circuitBreaker: this.options.name,
      reason,
      errorRate,
      slowCallRate,
      nextRetryTime: this.nextRetryTime,
      previousState,
    });

    this.emit('stateChange', {
      circuitBreaker: this.options.name,
      from: previousState,
      to: 'open',
      reason,
      errorRate,
      slowCallRate,
    });
  }

  /**
   * Transition circuit breaker to HALF-OPEN state
   */
  private transitionToHalfOpen(reason: string): void {
    const previousState = this.state;
    this.state = 'half-open';
    this.lastStateTransition = new Date();
    this.nextRetryTime = undefined;
    this.halfOpenCallCount = 0;

    this.recordStateTransition(previousState, 'half-open', reason);

    // Set maximum wait time in half-open state
    setTimeout(() => {
      if (this.state === 'half-open') {
        this.transitionToOpen('Half-open state timeout');
      }
    }, this.options.maxWaitTimeInHalfOpenState);

    logger.info('Circuit breaker half-opened', {
      circuitBreaker: this.options.name,
      reason,
      previousState,
    });

    this.emit('stateChange', {
      circuitBreaker: this.options.name,
      from: previousState,
      to: 'half-open',
      reason,
    });
  }

  /**
   * Transition circuit breaker to CLOSED state
   */
  private transitionToClosed(reason: string): void {
    const previousState = this.state;
    this.state = 'closed';
    this.lastStateTransition = new Date();
    this.nextRetryTime = undefined;
    this.halfOpenCallCount = 0;

    this.recordStateTransition(previousState, 'closed', reason);

    logger.info('Circuit breaker closed', {
      circuitBreaker: this.options.name,
      reason,
      previousState,
    });

    this.emit('stateChange', {
      circuitBreaker: this.options.name,
      from: previousState,
      to: 'closed',
      reason,
    });
  }

  /**
   * Record state transition in history
   */
  private recordStateTransition(
    from: CircuitBreakerState,
    to: CircuitBreakerState,
    reason: string
  ): void {
    this.metrics.stateTransitionHistory.push({
      from,
      to,
      timestamp: new Date(),
      reason,
    });

    // Keep only last 50 transitions
    if (this.metrics.stateTransitionHistory.length > 50) {
      this.metrics.stateTransitionHistory = this.metrics.stateTransitionHistory.slice(-50);
    }
  }

  /**
   * Check if error is expected and shouldn't trigger circuit breaker
   */
  private isExpectedError(error: Error): boolean {
    return this.options.expectedErrors.some(expectedError => {
      if (typeof expectedError === 'string') {
        return error.message.includes(expectedError) || error.name === expectedError;
      } else if (expectedError instanceof RegExp) {
        return expectedError.test(error.message) || expectedError.test(error.name);
      }
      return false;
    });
  }

  /**
   * Get recent calls within monitoring period
   */
  private getRecentCalls() {
    const cutoffTime = Date.now() - this.options.monitoringPeriod;
    return this.callsInCurrentPeriod.filter(call => call.startTime >= cutoffTime);
  }

  /**
   * Calculate error rate from recent calls
   */
  private calculateErrorRate(calls: typeof this.callsInCurrentPeriod): number {
    if (calls.length === 0) return 0;
    
    const failedCalls = calls.filter(call => call.success === false).length;
    return (failedCalls / calls.length) * 100;
  }

  /**
   * Calculate slow call rate from recent calls
   */
  private calculateSlowCallRate(calls: typeof this.callsInCurrentPeriod): number {
    if (calls.length === 0) return 0;
    
    const slowCalls = calls.filter(call => 
      call.endTime && 
      (call.endTime - call.startTime) > this.options.slowCallDurationThreshold
    ).length;
    
    return (slowCalls / calls.length) * 100;
  }

  /**
   * Update average response time
   */
  private updateAverageResponseTime(duration: number): void {
    const totalTime = this.metrics.averageResponseTime * (this.metrics.totalCalls - 1) + duration;
    this.metrics.averageResponseTime = totalTime / this.metrics.totalCalls;
  }

  /**
   * Start monitoring and cleanup
   */
  private startMonitoring(): void {
    this.monitoringInterval = setInterval(() => {
      this.cleanupOldCalls();
      this.emitMetrics();
    }, Math.min(this.options.monitoringPeriod / 10, 30000)); // Every 30 seconds max
  }

  /**
   * Cleanup old call records
   */
  private cleanupOldCalls(): void {
    const cutoffTime = Date.now() - this.options.monitoringPeriod * 2; // Keep extra for analysis
    this.callsInCurrentPeriod = this.callsInCurrentPeriod.filter(
      call => call.startTime >= cutoffTime
    );
  }

  /**
   * Emit metrics for monitoring
   */
  private emitMetrics(): void {
    const recentCalls = this.getRecentCalls();
    const status = this.getStatus();
    
    this.emit('metrics', {
      circuitBreaker: this.options.name,
      status,
      recentCallsCount: recentCalls.length,
    });
  }

  /**
   * Get current circuit breaker status
   */
  getStatus(): CircuitBreakerStatus {
    const recentCalls = this.getRecentCalls();
    
    return {
      name: this.options.name,
      state: this.state,
      isCallPermitted: this.isCallPermitted(),
      metrics: { ...this.metrics },
      lastStateTransition: this.lastStateTransition,
      nextRetryTime: this.nextRetryTime,
      errorRate: this.calculateErrorRate(recentCalls),
      slowCallRate: this.calculateSlowCallRate(recentCalls),
    };
  }

  /**
   * Manually reset circuit breaker to closed state
   */
  reset(reason = 'Manual reset'): void {
    this.transitionToClosed(reason);
    this.callsInCurrentPeriod = [];
    
    // Reset metrics but keep transition history
    this.metrics = {
      ...this.metrics,
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      slowCalls: 0,
      rejectedCalls: 0,
      averageResponseTime: 0,
    };

    logger.info('Circuit breaker reset', {
      circuitBreaker: this.options.name,
      reason,
    });
  }

  /**
   * Destroy circuit breaker and cleanup resources
   */
  destroy(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    
    this.removeAllListeners();
    
    logger.info('Circuit breaker destroyed', {
      circuitBreaker: this.options.name,
    });
  }
}

/**
 * Circuit Breaker Manager for managing multiple circuit breakers
 */
export class CircuitBreakerManager {
  private circuitBreakers = new Map<string, CircuitBreakerService>();
  private static instance: CircuitBreakerManager;

  static getInstance(): CircuitBreakerManager {
    if (!this.instance) {
      this.instance = new CircuitBreakerManager();
    }
    return this.instance;
  }

  /**
   * Create a new circuit breaker
   */
  create(options: CircuitBreakerOptions): CircuitBreakerService {
    if (this.circuitBreakers.has(options.name)) {
      throw new Error(`Circuit breaker '${options.name}' already exists`);
    }

    const circuitBreaker = new CircuitBreakerService(options);
    this.circuitBreakers.set(options.name, circuitBreaker);

    logger.info('Circuit breaker created', {
      name: options.name,
      totalCircuitBreakers: this.circuitBreakers.size,
    });

    return circuitBreaker;
  }

  /**
   * Get circuit breaker by name
   */
  get(name: string): CircuitBreakerService | undefined {
    return this.circuitBreakers.get(name);
  }

  /**
   * Get all circuit breaker statuses
   */
  getAllStatuses(): CircuitBreakerStatus[] {
    return Array.from(this.circuitBreakers.values()).map(cb => cb.getStatus());
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(reason = 'Global reset'): void {
    this.circuitBreakers.forEach(cb => cb.reset(reason));
    
    logger.info('All circuit breakers reset', {
      reason,
      count: this.circuitBreakers.size,
    });
  }

  /**
   * Destroy all circuit breakers
   */
  destroyAll(): void {
    this.circuitBreakers.forEach(cb => cb.destroy());
    this.circuitBreakers.clear();
    
    logger.info('All circuit breakers destroyed');
  }
}

// Default circuit breaker configurations for common services
export const CIRCUIT_BREAKER_CONFIGS = {
  CLAUDE_AI: {
    name: 'claude-ai',
    failureThreshold: 5,
    recoveryTimeout: 60000, // 1 minute
    monitoringPeriod: 60000, // 1 minute
    volumeThreshold: 10,
    errorThresholdPercentage: 50,
    slowCallDurationThreshold: 30000, // 30 seconds
    slowCallRateThreshold: 50,
    expectedErrors: ['rate_limit_error', 'timeout', /authentication/i],
  },
  
  GOOGLE_VOICE_API: {
    name: 'google-voice-api',
    failureThreshold: 3,
    recoveryTimeout: 30000, // 30 seconds
    monitoringPeriod: 60000, // 1 minute
    volumeThreshold: 5,
    errorThresholdPercentage: 40,
    slowCallDurationThreshold: 10000, // 10 seconds
    slowCallRateThreshold: 40,
    expectedErrors: ['quota_exceeded', 'rate_limit', /unauthorized/i],
  },
  
  DATABASE: {
    name: 'database',
    failureThreshold: 5,
    recoveryTimeout: 15000, // 15 seconds
    monitoringPeriod: 30000, // 30 seconds
    volumeThreshold: 10,
    errorThresholdPercentage: 30,
    slowCallDurationThreshold: 5000, // 5 seconds
    slowCallRateThreshold: 60,
    expectedErrors: ['connection timeout', /deadlock/i],
  },
} as const;