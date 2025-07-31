import { google } from 'googleapis';
import axios, { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { GoogleVoiceAuthService } from './GoogleVoiceAuthService';
import { DatabaseService } from './DatabaseService';
import { logger } from '../utils/logger';
import { CircuitBreakerService, CircuitBreakerManager, CIRCUIT_BREAKER_CONFIGS } from './CircuitBreakerService';

export interface GoogleVoiceMessage {
  id: string;
  threadId: string;
  text: string;
  timestamp: string;
  phoneNumber: string;
  direction: 'inbound' | 'outbound';
  type: 'sms' | 'mms' | 'voicemail';
  status: 'read' | 'unread';
  attachments?: Array<{
    url: string;
    mimeType: string;
    filename: string;
    size?: number;
  }>;
  metadata?: Record<string, any>;
}

export interface GoogleVoiceThread {
  id: string;
  phoneNumber: string;
  participantCount: number;
  messageCount: number;
  lastMessageTime: string;
  lastMessageText: string;
  isRead: boolean;
  isArchived: boolean;
  isSpam: boolean;
  metadata?: Record<string, any>;
}

export interface GoogleVoiceCall {
  id: string;
  phoneNumber: string;
  direction: 'inbound' | 'outbound';
  duration: number; // in seconds
  status: 'answered' | 'missed' | 'voicemail';
  timestamp: string;
  transcription?: string;
  recordingUrl?: string;
  metadata?: Record<string, any>;
}

export interface GoogleVoiceContact {
  phoneNumber: string;
  name?: string;
  organization?: string;
  email?: string;
  photoUrl?: string;
  lastContactTime?: string;
  contactFrequency?: number;
  metadata?: Record<string, any>;
}

export interface SendMessageOptions {
  to: string;
  text: string;
  from?: string; // Google Voice number to send from
  attachments?: Array<{
    data: Buffer;
    filename: string;
    mimeType: string;
  }>;
}

export interface MessageListOptions {
  limit?: number;
  pageToken?: string;
  threadId?: string;
  phoneNumber?: string;
  startTime?: Date;
  endTime?: Date;
  messageType?: 'sms' | 'mms' | 'voicemail';
  status?: 'read' | 'unread';
}

export interface RateLimitInfo {
  endpoint: string;
  requestCount: number;
  quotaLimit: number;
  quotaRemaining: number;
  resetTime: Date;
  isThrottled: boolean;
}

export class GoogleVoiceApiClient {
  private authService: GoogleVoiceAuthService;
  private db: DatabaseService;
  private httpClient: AxiosInstance;
  private rateLimitCache: Map<string, RateLimitInfo> = new Map();
  private circuitBreaker: CircuitBreakerService;

  // Google Voice API endpoints (unofficial - may need adjustment)
  private static readonly API_BASE_URL = 'https://www.google.com/voice/api';
  private static readonly VOICE_API_VERSION = 'v1';

  constructor(authService: GoogleVoiceAuthService, db: DatabaseService) {
    this.authService = authService;
    this.db = db;

    // Initialize circuit breaker
    const circuitBreakerManager = CircuitBreakerManager.getInstance();
    this.circuitBreaker = circuitBreakerManager.create({
      ...CIRCUIT_BREAKER_CONFIGS.GOOGLE_VOICE_API,
      expectedErrors: [...(CIRCUIT_BREAKER_CONFIGS.GOOGLE_VOICE_API.expectedErrors || [])],
      name: `google-voice-api-${Date.now()}`, // Unique name for this instance
    });

    // Set up circuit breaker event listeners
    this.setupCircuitBreakerEvents();

    // Configure HTTP client with retry logic
    this.httpClient = axios.create({
      baseURL: GoogleVoiceApiClient.API_BASE_URL,
      timeout: 30000,
      maxRedirects: 3
    });

    // Add request interceptor for authentication and rate limiting
    this.httpClient.interceptors.request.use(
      async (config) => await this.handleRequestInterceptor(config),
      (error) => Promise.reject(error)
    );

    // Add response interceptor for error handling and rate limit tracking
    this.httpClient.interceptors.response.use(
      (response) => this.handleResponseInterceptor(response),
      (error) => this.handleErrorInterceptor(error)
    );
  }

  /**
   * Setup circuit breaker event listeners for monitoring
   */
  private setupCircuitBreakerEvents(): void {
    this.circuitBreaker.on('stateChange', (event) => {
      logger.warn('Google Voice API circuit breaker state changed', event);
    });

    this.circuitBreaker.on('callRejected', (event) => {
      logger.warn('Google Voice API call rejected by circuit breaker', event);
    });

    this.circuitBreaker.on('callFailure', (event) => {
      logger.error('Google Voice API call failed', event);
    });
  }

  /**
   * Get list of Google Voice numbers associated with the account
   */
  async getVoiceNumbers(tokenId: string): Promise<string[]> {
    try {
      const response = await this.makeRequest(tokenId, {
        method: 'GET',
        url: '/account/numbers'
      });

      const numbers = response.data?.numbers || [];
      return numbers.map((num: any) => num.formattedNumber || num.number);
    } catch (error) {
      logger.error('Failed to get Google Voice numbers', {
        tokenId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get messages with pagination support
   */
  async getMessages(tokenId: string, options: MessageListOptions = {}): Promise<{
    messages: GoogleVoiceMessage[];
    nextPageToken?: string;
    totalCount?: number;
  }> {
    try {
      const params: any = {
        limit: options.limit || 50,
        ...(options.pageToken && { pageToken: options.pageToken }),
        ...(options.threadId && { threadId: options.threadId }),
        ...(options.phoneNumber && { phoneNumber: options.phoneNumber }),
        ...(options.startTime && { startTime: options.startTime.toISOString() }),
        ...(options.endTime && { endTime: options.endTime.toISOString() }),
        ...(options.messageType && { type: options.messageType }),
        ...(options.status && { status: options.status })
      };

      const response = await this.makeRequest(tokenId, {
        method: 'GET',
        url: '/messages',
        params
      });

      const messages = this.parseMessages(response.data.messages || []);
      
      return {
        messages,
        nextPageToken: response.data.nextPageToken,
        totalCount: response.data.totalCount
      };
    } catch (error) {
      logger.error('Failed to get messages', {
        tokenId,
        options,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get a specific message by ID
   */
  async getMessage(tokenId: string, messageId: string): Promise<GoogleVoiceMessage | null> {
    try {
      const response = await this.makeRequest(tokenId, {
        method: 'GET',
        url: `/messages/${messageId}`
      });

      return response.data ? this.parseMessage(response.data) : null;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      
      logger.error('Failed to get message', {
        tokenId,
        messageId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get conversation threads
   */
  async getThreads(tokenId: string, options: MessageListOptions = {}): Promise<{
    threads: GoogleVoiceThread[];
    nextPageToken?: string;
  }> {
    try {
      const params: any = {
        limit: options.limit || 50,
        ...(options.pageToken && { pageToken: options.pageToken }),
        ...(options.phoneNumber && { phoneNumber: options.phoneNumber }),
        ...(options.startTime && { startTime: options.startTime.toISOString() }),
        ...(options.endTime && { endTime: options.endTime.toISOString() })
      };

      const response = await this.makeRequest(tokenId, {
        method: 'GET',
        url: '/threads',
        params
      });

      const threads = this.parseThreads(response.data.threads || []);
      
      return {
        threads,
        nextPageToken: response.data.nextPageToken
      };
    } catch (error) {
      logger.error('Failed to get threads', {
        tokenId,
        options,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Send a text message
   */
  async sendMessage(tokenId: string, options: SendMessageOptions): Promise<GoogleVoiceMessage> {
    try {
      const payload: any = {
        to: this.normalizePhoneNumber(options.to),
        text: options.text,
        ...(options.from && { from: options.from })
      };

      // Handle attachments for MMS
      if (options.attachments && options.attachments.length > 0) {
        payload.attachments = options.attachments.map(att => ({
          data: att.data.toString('base64'),
          filename: att.filename,
          mimeType: att.mimeType
        }));
      }

      const response = await this.makeRequest(tokenId, {
        method: 'POST',
        url: '/messages/send',
        data: payload
      });

      const sentMessage = this.parseMessage(response.data);
      
      logger.info('Successfully sent message via Google Voice', {
        tokenId,
        to: options.to,
        messageId: sentMessage.id,
        hasAttachments: !!options.attachments?.length
      });

      return sentMessage;
    } catch (error) {
      logger.error('Failed to send message', {
        tokenId,
        to: options.to,
        textLength: options.text.length,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Mark messages as read
   */
  async markMessagesRead(tokenId: string, messageIds: string[]): Promise<void> {
    try {
      await this.makeRequest(tokenId, {
        method: 'POST',
        url: '/messages/markRead',
        data: { messageIds }
      });

      logger.info('Successfully marked messages as read', {
        tokenId,
        messageCount: messageIds.length
      });
    } catch (error) {
      logger.error('Failed to mark messages as read', {
        tokenId,
        messageIds,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Archive conversation thread
   */
  async archiveThread(tokenId: string, threadId: string): Promise<void> {
    try {
      await this.makeRequest(tokenId, {
        method: 'POST',
        url: `/threads/${threadId}/archive`
      });

      logger.info('Successfully archived thread', { tokenId, threadId });
    } catch (error) {
      logger.error('Failed to archive thread', {
        tokenId,
        threadId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get call history
   */
  async getCalls(tokenId: string, options: MessageListOptions = {}): Promise<{
    calls: GoogleVoiceCall[];
    nextPageToken?: string;
  }> {
    try {
      const params: any = {
        limit: options.limit || 50,
        ...(options.pageToken && { pageToken: options.pageToken }),
        ...(options.phoneNumber && { phoneNumber: options.phoneNumber }),
        ...(options.startTime && { startTime: options.startTime.toISOString() }),
        ...(options.endTime && { endTime: options.endTime.toISOString() })
      };

      const response = await this.makeRequest(tokenId, {
        method: 'GET',
        url: '/calls',
        params
      });

      const calls = this.parseCalls(response.data.calls || []);
      
      return {
        calls,
        nextPageToken: response.data.nextPageToken
      };
    } catch (error) {
      logger.error('Failed to get calls', {
        tokenId,
        options,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get contacts from Google Voice
   */
  async getContacts(tokenId: string): Promise<GoogleVoiceContact[]> {
    try {
      const response = await this.makeRequest(tokenId, {
        method: 'GET',
        url: '/contacts'
      });

      return this.parseContacts(response.data.contacts || []);
    } catch (error) {
      logger.error('Failed to get contacts', {
        tokenId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Search messages by text content
   */
  async searchMessages(tokenId: string, query: string, options: MessageListOptions = {}): Promise<{
    messages: GoogleVoiceMessage[];
    nextPageToken?: string;
  }> {
    try {
      const params: any = {
        q: query,
        limit: options.limit || 50,
        ...(options.pageToken && { pageToken: options.pageToken }),
        ...(options.startTime && { startTime: options.startTime.toISOString() }),
        ...(options.endTime && { endTime: options.endTime.toISOString() })
      };

      const response = await this.makeRequest(tokenId, {
        method: 'GET',
        url: '/messages/search',
        params
      });

      const messages = this.parseMessages(response.data.messages || []);
      
      return {
        messages,
        nextPageToken: response.data.nextPageToken
      };
    } catch (error) {
      logger.error('Failed to search messages', {
        tokenId,
        query,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get rate limit status for an endpoint
   */
  async getRateLimitStatus(tokenId: string, endpoint: string): Promise<RateLimitInfo | null> {
    try {
      const knex = DatabaseService.getInstance();
      const row = await knex('google_api_rate_limits')
        .where({ tokenId, endpoint })
        .where('windowEnd', '>', new Date())
        .orderBy('windowEnd', 'desc')
        .first();

      if (!row) return null;

      return {
        endpoint: row.endpoint,
        requestCount: row.requestCount,
        quotaLimit: row.quotaLimit,
        quotaRemaining: row.quotaRemaining,
        resetTime: new Date(row.quotaResetAt),
        isThrottled: row.isThrottled
      };
    } catch (error) {
      logger.error('Failed to get rate limit status', {
        tokenId,
        endpoint,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  }

  // Private helper methods

  private async makeRequest(tokenId: string, config: AxiosRequestConfig, correlationId?: string): Promise<any> {
    // Execute request through circuit breaker
    return await this.circuitBreaker.execute(
      async () => {
        // Get valid access token
        const accessToken = await this.authService.getValidAccessToken(tokenId);
        
        // Add authorization header
        config.headers = {
          ...config.headers,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        };

        // Track rate limiting
        const endpoint = config.url || '';
        await this.trackRateLimit(tokenId, endpoint);

        return this.httpClient.request(config);
      },
      {
        correlationId,
        timeout: config.timeout || 30000,
      }
    );
  }

  private async handleRequestInterceptor(config: InternalAxiosRequestConfig): Promise<InternalAxiosRequestConfig> {
    // Add common headers
    config.headers = config.headers || {} as any;
    config.headers['User-Agent'] = 'PlumbingCRM/1.0';
    config.headers['Accept'] = 'application/json';

    return config;
  }

  private handleResponseInterceptor(response: any): any {
    // Track successful request
    this.updateRateLimitFromResponse(response);
    return response;
  }

  private async handleErrorInterceptor(error: any): Promise<any> {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const message = error.response?.data?.error?.message || error.message;

      // Handle rate limiting
      if (status === 429) {
        await this.handleRateLimit(error);
      }
      
      // Handle authentication errors
      if (status === 401) {
        logger.warn('Google API authentication error - token may need refresh', {
          url: error.config?.url,
          message
        });
      }

      // Enhance error with more context
      const enhancedError = new Error(`Google Voice API Error: ${message}`);
      (enhancedError as any).status = status;
      (enhancedError as any).originalError = error;
      
      throw enhancedError;
    }

    throw error;
  }

  private async trackRateLimit(tokenId: string, endpoint: string): Promise<void> {
    try {
      const knex = DatabaseService.getInstance();
      const windowStart = new Date();
      const windowEnd = new Date(windowStart.getTime() + 60 * 60 * 1000); // 1 hour window

      await knex('google_api_rate_limits')
        .insert({
          id: `${tokenId}-${endpoint}-${Date.now()}`,
          tokenId,
          endpoint,
          requestCount: 1,
          windowStart,
          windowEnd,
          quotaLimit: 1000, // Default quota - adjust based on Google's limits
          quotaRemaining: 999,
          createdAt: new Date(),
          updatedAt: new Date()
        })
        .onConflict(['tokenId', 'endpoint', 'windowStart'])
        .merge({
          requestCount: knex.raw('request_count + 1'),
          quotaRemaining: knex.raw('quota_remaining - 1'),
          updatedAt: new Date()
        });
    } catch (error) {
      // Don't let rate limit tracking failures break the request
      logger.warn('Failed to track rate limit', { tokenId, endpoint, error });
    }
  }

  private updateRateLimitFromResponse(response: any): void {
    // Extract rate limit info from response headers if available
    const headers = response.headers;
    if (headers['x-ratelimit-remaining']) {
      // Update rate limit cache
      const endpoint = response.config.url;
      this.rateLimitCache.set(endpoint, {
        endpoint,
        requestCount: parseInt(headers['x-ratelimit-used'] || '0'),
        quotaLimit: parseInt(headers['x-ratelimit-limit'] || '1000'),
        quotaRemaining: parseInt(headers['x-ratelimit-remaining'] || '999'),
        resetTime: new Date(parseInt(headers['x-ratelimit-reset'] || '0') * 1000),
        isThrottled: false
      });
    }
  }

  private async handleRateLimit(error: any): Promise<void> {
    const retryAfter = error.response?.headers['retry-after'];
    if (retryAfter) {
      const delayMs = parseInt(retryAfter) * 1000;
      logger.warn('Rate limited by Google Voice API', {
        retryAfterSeconds: retryAfter,
        url: error.config?.url
      });

      // Mark as throttled in database
      // Implementation would update rate limit record
    }
  }

  private parseMessages(messagesData: any[]): GoogleVoiceMessage[] {
    return messagesData.map(data => this.parseMessage(data));
  }

  private parseMessage(data: any): GoogleVoiceMessage {
    return {
      id: data.id,
      threadId: data.threadId || data.thread?.id,
      text: data.text || data.content || '',
      timestamp: data.timestamp || data.time || new Date().toISOString(),
      phoneNumber: this.normalizePhoneNumber(data.phoneNumber || data.from || data.to),
      direction: data.direction || (data.isIncoming ? 'inbound' : 'outbound'),
      type: data.type || 'sms',
      status: data.isRead ? 'read' : 'unread',
      attachments: this.parseAttachments(data.attachments || []),
      metadata: data.metadata || {}
    };
  }

  private parseThreads(threadsData: any[]): GoogleVoiceThread[] {
    return threadsData.map(data => ({
      id: data.id,
      phoneNumber: this.normalizePhoneNumber(data.phoneNumber),
      participantCount: data.participantCount || 2,
      messageCount: data.messageCount || 0,
      lastMessageTime: data.lastMessageTime,
      lastMessageText: data.lastMessageText || '',
      isRead: data.isRead || false,
      isArchived: data.isArchived || false,
      isSpam: data.isSpam || false,
      metadata: data.metadata || {}
    }));
  }

  private parseCalls(callsData: any[]): GoogleVoiceCall[] {
    return callsData.map(data => ({
      id: data.id,
      phoneNumber: this.normalizePhoneNumber(data.phoneNumber),
      direction: data.direction || 'inbound',
      duration: data.duration || 0,
      status: data.status || 'missed',
      timestamp: data.timestamp,
      transcription: data.transcription,
      recordingUrl: data.recordingUrl,
      metadata: data.metadata || {}
    }));
  }

  private parseContacts(contactsData: any[]): GoogleVoiceContact[] {
    return contactsData.map(data => ({
      phoneNumber: this.normalizePhoneNumber(data.phoneNumber),
      name: data.name,
      organization: data.organization,
      email: data.email,
      photoUrl: data.photoUrl,
      lastContactTime: data.lastContactTime,
      contactFrequency: data.contactFrequency || 0,
      metadata: data.metadata || {}
    }));
  }

  private parseAttachments(attachmentsData: any[]): GoogleVoiceMessage['attachments'] {
    return attachmentsData.map((att: any) => ({
      url: att.url,
      mimeType: att.mimeType || att.contentType,
      filename: att.filename || att.name,
      size: att.size
    }));
  }

  private normalizePhoneNumber(phoneNumber: string): string {
    // Remove all non-digit characters
    const digits = phoneNumber.replace(/\D/g, '');
    
    // Add country code if missing (assume US)
    if (digits.length === 10) {
      return `+1${digits}`;
    } else if (digits.length === 11 && digits.startsWith('1')) {
      return `+${digits}`;
    }
    
    return `+${digits}`;
  }

  /**
   * Get circuit breaker status for monitoring
   */
  getCircuitBreakerStatus() {
    return this.circuitBreaker.getStatus();
  }

  /**
   * Reset circuit breaker (for emergency recovery)
   */
  resetCircuitBreaker(reason = 'Manual reset') {
    this.circuitBreaker.reset(reason);
    logger.info('Google Voice API circuit breaker reset', { reason });
  }
}