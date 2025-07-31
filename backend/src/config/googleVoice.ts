import dotenv from 'dotenv';
import { logger } from '../utils/logger';

dotenv.config();

export interface GoogleVoiceConfig {
  oauth: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scopes: {
      required: string[];
      optional: string[];
    };
  };
  api: {
    baseUrl: string;
    version: string;
    timeout: number;
    retryAttempts: number;
    retryDelay: number;
  };
  sync: {
    defaultBatchSize: number;
    maxBatchSize: number;
    syncIntervalMinutes: number;
    maxHistoryDays: number;
    duplicateDetectionWindowHours: number;
  };
  security: {
    tokenEncryptionKey: string;
    sessionSecret: string;
    pkceExpirationMinutes: number;
    tokenRefreshBufferMinutes: number;
  };
  rateLimits: {
    requestsPerMinute: number;
    requestsPerHour: number;
    requestsPerDay: number;
    burstLimit: number;
    cooldownMinutes: number;
  };
  features: {
    enableWebhooks: boolean;
    enableContactSync: boolean;
    enableCallHistory: boolean;
    enableVoicemailTranscription: boolean;
    enableMessageSearch: boolean;
  };
}

class GoogleVoiceConfigManager {
  private config: GoogleVoiceConfig;
  private isInitialized = false;

  constructor() {
    this.config = this.loadConfig();
    this.validateConfig();
    this.isInitialized = true;
  }

  /**
   * Load configuration from environment variables with defaults
   */
  private loadConfig(): GoogleVoiceConfig {
    return {
      oauth: {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
        scopes: {
          required: [
            'https://www.googleapis.com/auth/voice.v1',
            'https://www.googleapis.com/auth/voice.readonly',
            'https://www.googleapis.com/auth/userinfo.email',
            'https://www.googleapis.com/auth/userinfo.profile'
          ],
          optional: [
            'https://www.googleapis.com/auth/contacts.readonly',
            'https://www.googleapis.com/auth/calendar.readonly'
          ]
        }
      },
      api: {
        baseUrl: process.env.GOOGLE_VOICE_API_BASE_URL || 'https://www.google.com/voice/api',
        version: process.env.GOOGLE_VOICE_API_VERSION || 'v1',
        timeout: parseInt(process.env.GOOGLE_VOICE_API_TIMEOUT || '30000'),
        retryAttempts: parseInt(process.env.GOOGLE_VOICE_API_RETRY_ATTEMPTS || '3'),
        retryDelay: parseInt(process.env.GOOGLE_VOICE_API_RETRY_DELAY || '1000')
      },
      sync: {
        defaultBatchSize: parseInt(process.env.GOOGLE_VOICE_SYNC_BATCH_SIZE || '50'),
        maxBatchSize: parseInt(process.env.GOOGLE_VOICE_SYNC_MAX_BATCH_SIZE || '200'),
        syncIntervalMinutes: parseInt(process.env.GOOGLE_VOICE_SYNC_INTERVAL_MINUTES || '15'),
        maxHistoryDays: parseInt(process.env.GOOGLE_VOICE_MAX_HISTORY_DAYS || '365'),
        duplicateDetectionWindowHours: parseInt(process.env.GOOGLE_VOICE_DUPLICATE_WINDOW_HOURS || '24')
      },
      security: {
        tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY || 'default-key-change-in-production',
        sessionSecret: process.env.SESSION_SECRET || 'default-session-secret',
        pkceExpirationMinutes: parseInt(process.env.PKCE_EXPIRATION_MINUTES || '15'),
        tokenRefreshBufferMinutes: parseInt(process.env.TOKEN_REFRESH_BUFFER_MINUTES || '5')
      },
      rateLimits: {
        requestsPerMinute: parseInt(process.env.GOOGLE_VOICE_REQUESTS_PER_MINUTE || '60'),
        requestsPerHour: parseInt(process.env.GOOGLE_VOICE_REQUESTS_PER_HOUR || '1000'),
        requestsPerDay: parseInt(process.env.GOOGLE_VOICE_REQUESTS_PER_DAY || '10000'),
        burstLimit: parseInt(process.env.GOOGLE_VOICE_BURST_LIMIT || '10'),
        cooldownMinutes: parseInt(process.env.GOOGLE_VOICE_COOLDOWN_MINUTES || '60')
      },
      features: {
        enableWebhooks: process.env.GOOGLE_VOICE_ENABLE_WEBHOOKS === 'true',
        enableContactSync: process.env.GOOGLE_VOICE_ENABLE_CONTACT_SYNC === 'true',
        enableCallHistory: process.env.GOOGLE_VOICE_ENABLE_CALL_HISTORY === 'true',
        enableVoicemailTranscription: process.env.GOOGLE_VOICE_ENABLE_VOICEMAIL_TRANSCRIPTION === 'true',
        enableMessageSearch: process.env.GOOGLE_VOICE_ENABLE_MESSAGE_SEARCH === 'true'
      }
    };
  }

  /**
   * Validate configuration and log warnings for missing required values
   */
  private validateConfig(): void {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required OAuth settings
    if (!this.config.oauth.clientId) {
      errors.push('GOOGLE_CLIENT_ID is required');
    }
    if (!this.config.oauth.clientSecret) {
      errors.push('GOOGLE_CLIENT_SECRET is required');
    }
    if (!this.config.oauth.redirectUri) {
      errors.push('GOOGLE_REDIRECT_URI is required');
    }

    // Security warnings
    if (this.config.security.tokenEncryptionKey === 'default-key-change-in-production') {
      warnings.push('Using default token encryption key - please set TOKEN_ENCRYPTION_KEY in production');
    }
    if (this.config.security.sessionSecret === 'default-session-secret') {
      warnings.push('Using default session secret - please set SESSION_SECRET in production');
    }

    // Validate numeric ranges
    if (this.config.api.timeout < 1000 || this.config.api.timeout > 60000) {
      warnings.push('API timeout should be between 1000ms and 60000ms');
    }
    if (this.config.sync.defaultBatchSize > this.config.sync.maxBatchSize) {
      warnings.push('Default batch size cannot be larger than max batch size');
    }
    if (this.config.sync.maxHistoryDays > 3650) {
      warnings.push('Max history days is very large - consider reducing for better performance');
    }

    // Validate rate limits
    if (this.config.rateLimits.requestsPerMinute > 100) {
      warnings.push('Requests per minute is high - may exceed Google Voice API limits');
    }

    // Log errors and warnings
    if (errors.length > 0) {
      logger.error('Google Voice configuration errors:', errors);
      throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
    }

    if (warnings.length > 0) {
      logger.warn('Google Voice configuration warnings:', warnings);
    }

    logger.info('Google Voice configuration loaded successfully', {
      features: Object.entries(this.config.features)
        .filter(([, enabled]) => enabled)
        .map(([feature]) => feature),
      syncInterval: `${this.config.sync.syncIntervalMinutes} minutes`,
      batchSize: this.config.sync.defaultBatchSize,
      timeout: `${this.config.api.timeout}ms`
    });
  }

  /**
   * Get the complete configuration object
   */
  getConfig(): GoogleVoiceConfig {
    if (!this.isInitialized) {
      throw new Error('Configuration not initialized');
    }
    return { ...this.config };
  }

  /**
   * Get OAuth configuration
   */
  getOAuthConfig() {
    return { ...this.config.oauth };
  }

  /**
   * Get API configuration
   */
  getApiConfig() {
    return { ...this.config.api };
  }

  /**
   * Get sync configuration
   */
  getSyncConfig() {
    return { ...this.config.sync };
  }

  /**
   * Get security configuration
   */
  getSecurityConfig() {
    return { ...this.config.security };
  }

  /**
   * Get rate limit configuration
   */
  getRateLimitConfig() {
    return { ...this.config.rateLimits };
  }

  /**
   * Get feature flags
   */
  getFeatureFlags() {
    return { ...this.config.features };
  }

  /**
   * Check if a specific feature is enabled
   */
  isFeatureEnabled(feature: keyof GoogleVoiceConfig['features']): boolean {
    return this.config.features[feature];
  }

  /**
   * Get all required OAuth scopes
   */
  getRequiredScopes(): string[] {
    return [...this.config.oauth.scopes.required];
  }

  /**
   * Get all OAuth scopes (required + optional)
   */
  getAllScopes(): string[] {
    return [
      ...this.config.oauth.scopes.required,
      ...this.config.oauth.scopes.optional
    ];
  }

  /**
   * Update configuration at runtime (for testing or dynamic updates)
   */
  updateConfig(updates: Partial<GoogleVoiceConfig>): void {
    this.config = {
      ...this.config,
      ...updates,
      oauth: { ...this.config.oauth, ...updates.oauth },
      api: { ...this.config.api, ...updates.api },
      sync: { ...this.config.sync, ...updates.sync },
      security: { ...this.config.security, ...updates.security },
      rateLimits: { ...this.config.rateLimits, ...updates.rateLimits },
      features: { ...this.config.features, ...updates.features }
    };

    logger.info('Google Voice configuration updated', { updates });
  }

  /**
   * Get environment-specific configuration suggestions
   */
  getEnvironmentRecommendations(): Record<string, string[]> {
    const env = process.env.NODE_ENV || 'development';
    
    const recommendations: Record<string, string[]> = {
      development: [
        'Set TOKEN_ENCRYPTION_KEY to a secure random string',
        'Use a test Google Voice account for development',
        'Enable debug logging for detailed API responses',
        'Consider using ngrok for OAuth callback testing'
      ],
      staging: [
        'Use production-like Google Voice credentials',
        'Test with realistic message volumes',
        'Validate rate limiting behavior',
        'Test error handling and recovery scenarios'
      ],
      production: [
        'Use strong encryption keys (TOKEN_ENCRYPTION_KEY)',
        'Monitor rate limit usage closely',
        'Set up alerting for authentication failures',
        'Regular backup of OAuth tokens and sync state',
        'Consider implementing webhook endpoints for real-time updates'
      ]
    };

    return { [env]: recommendations[env] || [] };
  }

  /**
   * Generate a configuration summary for debugging
   */
  getConfigSummary(): Record<string, any> {
    return {
      oauth: {
        hasClientId: !!this.config.oauth.clientId,
        hasClientSecret: !!this.config.oauth.clientSecret,
        hasRedirectUri: !!this.config.oauth.redirectUri,
        requiredScopes: this.config.oauth.scopes.required.length,
        optionalScopes: this.config.oauth.scopes.optional.length
      },
      api: {
        baseUrl: this.config.api.baseUrl,
        version: this.config.api.version,
        timeout: this.config.api.timeout,
        retryAttempts: this.config.api.retryAttempts
      },
      sync: {
        batchSize: this.config.sync.defaultBatchSize,
        intervalMinutes: this.config.sync.syncIntervalMinutes,
        maxHistoryDays: this.config.sync.maxHistoryDays
      },
      security: {
        hasCustomEncryptionKey: this.config.security.tokenEncryptionKey !== 'default-key-change-in-production',
        hasCustomSessionSecret: this.config.security.sessionSecret !== 'default-session-secret'
      },
      features: this.config.features,
      rateLimits: this.config.rateLimits
    };
  }
}

// Create singleton instance
export const googleVoiceConfig = new GoogleVoiceConfigManager();

// Export default config getter for convenience
export const getGoogleVoiceConfig = () => googleVoiceConfig.getConfig();

// Export specific config getters
export const getOAuthConfig = () => googleVoiceConfig.getOAuthConfig();
export const getApiConfig = () => googleVoiceConfig.getApiConfig();
export const getSyncConfig = () => googleVoiceConfig.getSyncConfig();
export const getSecurityConfig = () => googleVoiceConfig.getSecurityConfig();
export const getRateLimitConfig = () => googleVoiceConfig.getRateLimitConfig();
export const getFeatureFlags = () => googleVoiceConfig.getFeatureFlags();

export default googleVoiceConfig;