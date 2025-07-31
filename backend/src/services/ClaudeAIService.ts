import Anthropic from '@anthropic-ai/sdk';
import { ClaudeAPIRequest, ClaudeAPIResponse, AIError } from '../models/AIModels';
import { logger } from '../utils/logger';
import { CircuitBreakerService, CircuitBreakerManager, CIRCUIT_BREAKER_CONFIGS } from './CircuitBreakerService';

export interface ClaudeServiceConfig {
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  rateLimitRpm: number; // requests per minute
  enableCaching: boolean;
  cacheExpiryMinutes: number;
}

export interface ClaudeRateLimiter {
  requestCount: number;
  windowStart: number;
  rpm: number;
}

export interface CachedResponse {
  response: ClaudeAPIResponse;
  timestamp: number;
  expiryTime: number;
}

export class ClaudeAIService {
  private client: Anthropic;
  private config: ClaudeServiceConfig;
  private rateLimiter: ClaudeRateLimiter;
  private cache: Map<string, CachedResponse>;
  private errorCount: number;
  private lastErrorReset: number;
  private circuitBreaker: CircuitBreakerService;

  constructor(config: ClaudeServiceConfig) {
    this.config = config;
    this.client = new Anthropic({
      apiKey: config.apiKey,
      timeout: config.timeoutMs
    });
    
    this.rateLimiter = {
      requestCount: 0,
      windowStart: Date.now(),
      rpm: config.rateLimitRpm
    };
    
    this.cache = new Map();
    this.errorCount = 0;
    this.lastErrorReset = Date.now();
    
    // Initialize circuit breaker
    const circuitBreakerManager = CircuitBreakerManager.getInstance();
    this.circuitBreaker = circuitBreakerManager.create({
      ...CIRCUIT_BREAKER_CONFIGS.CLAUDE_AI,
      expectedErrors: [...(CIRCUIT_BREAKER_CONFIGS.CLAUDE_AI.expectedErrors || [])],
      name: `claude-ai-${Date.now()}`, // Unique name for this instance
    });

    // Set up circuit breaker event listeners
    this.setupCircuitBreakerEvents();
    
    // Clean up cache every 5 minutes
    setInterval(() => this.cleanupCache(), 5 * 60 * 1000);
    
    logger.info('ClaudeAIService initialized', {
      model: config.model,
      maxTokens: config.maxTokens,
      rateLimitRpm: config.rateLimitRpm,
      cachingEnabled: config.enableCaching,
      circuitBreakerEnabled: true,
    });
  }

  /**
   * Setup circuit breaker event listeners for monitoring
   */
  private setupCircuitBreakerEvents(): void {
    this.circuitBreaker.on('stateChange', (event) => {
      logger.warn('Claude AI circuit breaker state changed', event);
    });

    this.circuitBreaker.on('callRejected', (event) => {
      logger.warn('Claude AI call rejected by circuit breaker', event);
    });

    this.circuitBreaker.on('callFailure', (event) => {
      logger.error('Claude AI call failed', event);
    });
  }

  /**
   * Send a request to Claude API with circuit breaker protection, retry logic and rate limiting
   */
  async sendRequest(
    request: ClaudeAPIRequest,
    options: {
      requestId?: string;
      useCache?: boolean;
      priority?: 'high' | 'normal' | 'low';
      correlationId?: string;
    } = {}
  ): Promise<ClaudeAPIResponse> {
    const { requestId = this.generateRequestId(), useCache = true, priority = 'normal', correlationId } = options;
    
    const startTime = Date.now();
    
    try {
      // Check rate limiting first (before circuit breaker)
      await this.checkRateLimit(priority);
      
      // Check cache first (before circuit breaker to avoid unnecessary calls)
      if (useCache && this.config.enableCaching) {
        const cached = this.getCachedResponse(request);
        if (cached) {
          logger.debug('Cache hit for Claude request', { requestId, correlationId });
          return cached;
        }
      }
      
      // Validate request
      this.validateRequest(request);
      
      // Execute request through circuit breaker
      const response = await this.circuitBreaker.execute(
        () => this.sendWithRetry(request, requestId, correlationId),
        {
          correlationId,
          timeout: this.config.timeoutMs,
        }
      );
      
      // Cache successful response
      if (useCache && this.config.enableCaching) {
        this.cacheResponse(request, response);
      }
      
      // Log successful request
      const duration = Date.now() - startTime;
      logger.info('Claude API request successful', {
        requestId,
        correlationId,
        model: request.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        duration,
        cached: false,
        circuitBreakerState: this.circuitBreaker.getStatus().state,
      });
      
      // Reset error count on success
      this.errorCount = 0;
      
      return response;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Check if error is from circuit breaker
      if ((error as Error).name === 'CircuitBreakerOpenError') {
        logger.warn('Claude AI request blocked by circuit breaker', {
          requestId,
          correlationId,
          duration,
          circuitBreakerStatus: this.circuitBreaker.getStatus(),
        });
        
        // Throw a more specific error for circuit breaker
        const cbError = new Error('Claude AI service temporarily unavailable due to high error rate');
        cbError.name = 'ServiceUnavailableError';
        throw cbError;
      }
      
      this.handleError(error, requestId, duration, correlationId);
      throw error;
    }
  }

  /**
   * Send request with retry logic
   */
  private async sendWithRetry(
    request: ClaudeAPIRequest,
    requestId: string,
    correlationId?: string,
    attempt: number = 1
  ): Promise<ClaudeAPIResponse> {
    try {
      const response = await this.client.messages.create({
        model: request.model,
        max_tokens: request.max_tokens,
        temperature: request.temperature,
        system: request.system,
        messages: request.messages
      });
      
      return this.formatResponse(response);
      
    } catch (error) {
      const isRetryable = this.isRetryableError(error);
      const shouldRetry = attempt < this.config.maxRetries && isRetryable;
      
      logger.warn('Claude API request failed', {
        requestId,
        correlationId,
        attempt,
        error: (error as Error).message,
        isRetryable,
        willRetry: shouldRetry
      });
      
      if (shouldRetry) {
        const delay = this.calculateRetryDelay(attempt);
        await this.sleep(delay);
        return this.sendWithRetry(request, requestId, correlationId, attempt + 1);
      }
      
      throw error;
    }
  }

  /**
   * Check rate limiting before sending request
   */
  private async checkRateLimit(priority: 'high' | 'normal' | 'low'): Promise<void> {
    const now = Date.now();
    const windowDuration = 60 * 1000; // 1 minute
    
    // Reset window if needed
    if (now - this.rateLimiter.windowStart >= windowDuration) {
      this.rateLimiter.requestCount = 0;
      this.rateLimiter.windowStart = now;
    }
    
    // Check if we're at the limit
    if (this.rateLimiter.requestCount >= this.rateLimiter.rpm) {
      const waitTime = windowDuration - (now - this.rateLimiter.windowStart);
      
      // Emergency requests get priority
      if (priority === 'high' && this.rateLimiter.requestCount < this.rateLimiter.rpm * 1.1) {
        logger.warn('Rate limit exceeded but allowing high priority request', {
          requestCount: this.rateLimiter.requestCount,
          limit: this.rateLimiter.rpm
        });
      } else {
        logger.warn('Rate limit exceeded, waiting', {
          requestCount: this.rateLimiter.requestCount,
          limit: this.rateLimiter.rpm,
          waitTime
        });
        
        await this.sleep(waitTime);
        
        // Reset after waiting
        this.rateLimiter.requestCount = 0;
        this.rateLimiter.windowStart = Date.now();
      }
    }
    
    this.rateLimiter.requestCount++;
  }

  /**
   * Get cached response if available and not expired
   */
  private getCachedResponse(request: ClaudeAPIRequest): ClaudeAPIResponse | null {
    const cacheKey = this.generateCacheKey(request);
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() < cached.expiryTime) {
      return cached.response;
    }
    
    // Remove expired entry
    if (cached) {
      this.cache.delete(cacheKey);
    }
    
    return null;
  }

  /**
   * Cache successful response
   */
  private cacheResponse(request: ClaudeAPIRequest, response: ClaudeAPIResponse): void {
    const cacheKey = this.generateCacheKey(request);
    const expiryTime = Date.now() + (this.config.cacheExpiryMinutes * 60 * 1000);
    
    this.cache.set(cacheKey, {
      response,
      timestamp: Date.now(),
      expiryTime
    });
  }

  /**
   * Generate cache key from request
   */
  private generateCacheKey(request: ClaudeAPIRequest): string {
    const key = {
      model: request.model,
      system: request.system,
      messages: request.messages,
      temperature: request.temperature
    };
    
    return Buffer.from(JSON.stringify(key)).toString('base64');
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    let removedCount = 0;
    
    for (const [key, cached] of this.cache.entries()) {
      if (now >= cached.expiryTime) {
        this.cache.delete(key);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      logger.debug('Cache cleanup completed', {
        removedEntries: removedCount,
        remainingEntries: this.cache.size
      });
    }
  }

  /**
   * Validate request before sending
   */
  private validateRequest(request: ClaudeAPIRequest): void {
    if (!request.model) {
      throw new Error('Model is required');
    }
    
    if (!request.messages || request.messages.length === 0) {
      throw new Error('Messages array is required and must not be empty');
    }
    
    if (request.max_tokens <= 0 || request.max_tokens > 4096) {
      throw new Error('max_tokens must be between 1 and 4096');
    }
    
    if (request.temperature !== undefined && (request.temperature < 0 || request.temperature > 1)) {
      throw new Error('temperature must be between 0 and 1');
    }
    
    // Check total token estimate
    const estimatedTokens = this.estimateTokens(request);
    if (estimatedTokens > 200000) { // Claude's context limit
      throw new Error(`Estimated tokens (${estimatedTokens}) exceeds model limit`);
    }
  }

  /**
   * Estimate token count for request
   */
  private estimateTokens(request: ClaudeAPIRequest): number {
    // Rough estimation: 1 token ≈ 4 characters
    let totalChars = 0;
    
    if (request.system) {
      totalChars += request.system.length;
    }
    
    for (const message of request.messages) {
      totalChars += message.content.length;
    }
    
    return Math.ceil(totalChars / 4);
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    // Network errors, timeouts, and rate limits are retryable
    const retryableErrors = [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'timeout',
      'rate_limit_error',
      'overloaded_error',
      'internal_server_error'
    ];
    
    const errorMessage = error.message?.toLowerCase() || '';
    const errorType = error.type?.toLowerCase() || '';
    const errorCode = error.code?.toLowerCase() || '';
    
    return retryableErrors.some(retryableError => 
      errorMessage.includes(retryableError) ||
      errorType.includes(retryableError) ||
      errorCode.includes(retryableError)
    );
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateRetryDelay(attempt: number): number {
    const baseDelay = this.config.retryDelayMs;
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 1000; // Add jitter to avoid thundering herd
    
    return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
  }

  /**
   * Format API response to standard format
   */
  private formatResponse(apiResponse: any): ClaudeAPIResponse {
    return {
      id: apiResponse.id,
      type: apiResponse.type,
      role: apiResponse.role,
      content: apiResponse.content,
      model: apiResponse.model,
      stop_reason: apiResponse.stop_reason,
      stop_sequence: apiResponse.stop_sequence,
      usage: {
        input_tokens: apiResponse.usage.input_tokens,
        output_tokens: apiResponse.usage.output_tokens
      }
    };
  }

  /**
   * Handle and log errors
   */
  private handleError(error: any, requestId: string, duration: number, correlationId?: string): void {
    this.errorCount++;
    
    const errorInfo: Partial<AIError> = {
      errorType: this.categorizeError(error),
      service: 'response_generation',
      errorMessage: error.message,
      errorCode: error.code,
      requestId,
      impactLevel: this.assessErrorImpact(error),
      userImpacted: true,
      fallbackUsed: false
    };
    
    logger.error('Claude API request failed', {
      ...errorInfo,
      correlationId,
      duration,
      errorCount: this.errorCount,
      stackTrace: error.stack,
      circuitBreakerState: this.circuitBreaker.getStatus().state,
    });
    
    // Circuit breaker logic
    if (this.errorCount >= 10) {
      const timeSinceLastReset = Date.now() - this.lastErrorReset;
      if (timeSinceLastReset < 60000) { // 1 minute
        logger.error('Circuit breaker triggered - too many errors', {
          errorCount: this.errorCount,
          timeWindow: timeSinceLastReset
        });
        throw new Error('Claude AI service temporarily unavailable due to high error rate');
      } else {
        // Reset error count after time window
        this.errorCount = 0;
        this.lastErrorReset = Date.now();
      }
    }
  }

  /**
   * Categorize error type
   */
  private categorizeError(error: any): AIError['errorType'] {
    const message = error.message?.toLowerCase() || '';
    const type = error.type?.toLowerCase() || '';
    
    if (message.includes('timeout') || type.includes('timeout')) {
      return 'timeout';
    }
    
    if (message.includes('rate') || type.includes('rate_limit')) {
      return 'rate_limit';
    }
    
    if (message.includes('invalid') || type.includes('invalid')) {
      return 'invalid_response';
    }
    
    if (type.includes('api_error')) {
      return 'api_error';
    }
    
    return 'processing_error';
  }

  /**
   * Assess error impact level
   */
  private assessErrorImpact(error: any): AIError['impactLevel'] {
    const message = error.message?.toLowerCase() || '';
    
    if (message.includes('authentication') || message.includes('authorization')) {
      return 'critical';
    }
    
    if (message.includes('rate limit') || message.includes('quota')) {
      return 'high';
    }
    
    if (message.includes('timeout') || message.includes('network')) {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `claude_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get service statistics including circuit breaker status
   */
  getStats() {
    return {
      rateLimiter: { ...this.rateLimiter },
      cacheSize: this.cache.size,
      errorCount: this.errorCount,
      circuitBreaker: this.circuitBreaker.getStatus(),
      config: {
        model: this.config.model,
        maxTokens: this.config.maxTokens,
        rateLimitRpm: this.config.rateLimitRpm,
        cachingEnabled: this.config.enableCaching
      }
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('Claude AI service cache cleared');
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ClaudeServiceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.rateLimitRpm) {
      this.rateLimiter.rpm = newConfig.rateLimitRpm;
    }
    
    logger.info('Claude AI service configuration updated', {
      updatedFields: Object.keys(newConfig)
    });
  }
}

// Create singleton instance
export const createClaudeAIService = (config: ClaudeServiceConfig): ClaudeAIService => {
  return new ClaudeAIService(config);
};

// Default configuration
export const DEFAULT_CLAUDE_CONFIG: ClaudeServiceConfig = {
  apiKey: process.env.CLAUDE_API_KEY || '',
  model: 'claude-3-sonnet-20240229',
  maxTokens: 4096,
  temperature: 0.7,
  timeoutMs: 60000, // 60 seconds
  maxRetries: 3,
  retryDelayMs: 1000,
  rateLimitRpm: 50, // Conservative rate limit
  enableCaching: true,
  cacheExpiryMinutes: 15
};