import { DatabaseService } from './DatabaseService';
import { EmergencyKeywordModel, ServiceTypePatternModel, EmergencyKeyword, ServiceTypePattern } from '../models/WebhookModels';
import { logger } from '../utils/logger';

export interface MessageClassification {
  isEmergency: boolean;
  emergencyLevel: 'low' | 'medium' | 'high' | 'critical';
  serviceType?: string;
  estimatedPriority: 'low' | 'medium' | 'high' | 'emergency';
  matchedKeywords: EmergencyKeyword[];
  matchedPatterns: ServiceTypePattern[];
  businessHours: boolean;
  requiresImmediate: boolean;
  confidence: number;
  extractedInfo: {
    urgentWords: string[];
    timeReferences: string[];
    locationReferences: string[];
    serviceTypeWords: string[];
    customerSentiment: 'positive' | 'negative' | 'neutral' | 'frustrated' | 'urgent';
  };
  suggestedActions: string[];
  estimatedResponseTime: number; // minutes
}

export interface BusinessRule {
  id: string;
  name: string;
  condition: (context: any) => boolean;
  action: (context: any) => any;
  priority: number;
}

interface GeographicInfo {
  isInServiceArea: boolean;
  zone?: string;
  estimatedTravelTime?: number;
  nearestTechnician?: string;
}

export class BusinessRulesService {
  private emergencyKeywordModel: EmergencyKeywordModel;
  private serviceTypePatternModel: ServiceTypePatternModel;
  private emergencyKeywords: EmergencyKeyword[] = [];
  private servicePatterns: ServiceTypePattern[] = [];
  private lastCacheUpdate: Date = new Date(0);
  private cacheIntervalMs = 5 * 60 * 1000; // 5 minutes

  // Business hours configuration
  private readonly businessHours = {
    monday: { start: 7, end: 18 },
    tuesday: { start: 7, end: 18 },
    wednesday: { start: 7, end: 18 },
    thursday: { start: 7, end: 18 },
    friday: { start: 7, end: 18 },
    saturday: { start: 8, end: 16 },
    sunday: { start: 10, end: 14 } // Limited Sunday hours
  };

  // Emergency response time thresholds (in minutes)
  private readonly emergencyResponseTimes = {
    critical: 30,    // Gas leaks, flooding
    high: 60,        // Burst pipes, no water
    medium: 120,     // Drain backups, toilet issues
    low: 240         // General maintenance
  };

  constructor(private db: DatabaseService) {
    this.emergencyKeywordModel = new EmergencyKeywordModel(db);
    this.serviceTypePatternModel = new ServiceTypePatternModel(db);
    this.loadRulesCache();
  }

  /**
   * Load emergency keywords and service patterns into memory cache
   */
  private async loadRulesCache(): Promise<void> {
    try {
      const now = new Date();
      if (now.getTime() - this.lastCacheUpdate.getTime() < this.cacheIntervalMs) {
        return; // Cache is still fresh
      }

      this.emergencyKeywords = await this.emergencyKeywordModel.findAll();
      this.servicePatterns = await this.serviceTypePatternModel.findAll();
      this.lastCacheUpdate = now;

      logger.info('Loaded business rules cache', {
        emergencyKeywords: this.emergencyKeywords.length,
        servicePatterns: this.servicePatterns.length
      });
    } catch (error) {
      logger.error('Failed to load business rules cache', { error });
      throw error;
    }
  }

  /**
   * Classify a message for priority and emergency status
   */
  async classifyMessage(
    messageText: string,
    customerPhone?: string,
    timestamp?: Date,
    additionalContext?: any
  ): Promise<MessageClassification> {
    try {
      await this.loadRulesCache();
      
      const text = messageText.toLowerCase();
      const now = timestamp || new Date();
      
      // Extract basic information
      const extractedInfo = this.extractMessageInfo(text);
      
      // Check for emergency keywords
      const matchedKeywords = this.findMatchingEmergencyKeywords(text);
      
      // Check for service type patterns
      const matchedPatterns = this.findMatchingServicePatterns(text);
      
      // Determine emergency status
      const isEmergency = matchedKeywords.length > 0 || this.hasEmergencyIndicators(text);
      const emergencyLevel = this.determineEmergencyLevel(matchedKeywords, extractedInfo);
      
      // Check business hours
      const businessHours = this.isBusinessHours(now);
      
      // Calculate priority
      const estimatedPriority = this.calculatePriority(
        isEmergency,
        emergencyLevel,
        businessHours,
        extractedInfo.customerSentiment,
        matchedKeywords,
        matchedPatterns
      );
      
      // Determine if immediate response is required
      const requiresImmediate = this.requiresImmediateResponse(
        isEmergency,
        emergencyLevel,
        businessHours,
        extractedInfo
      );
      
      // Calculate confidence score
      const confidence = this.calculateConfidence(matchedKeywords, matchedPatterns, extractedInfo);
      
      // Generate suggested actions
      const suggestedActions = this.generateSuggestedActions(
        isEmergency,
        emergencyLevel,
        matchedKeywords,
        matchedPatterns,
        businessHours
      );
      
      // Estimate response time
      const estimatedResponseTime = this.estimateResponseTime(
        estimatedPriority,
        businessHours,
        isEmergency
      );
      
      const result: MessageClassification = {
        isEmergency,
        emergencyLevel,
        serviceType: this.determineServiceType(matchedPatterns),
        estimatedPriority,
        matchedKeywords,
        matchedPatterns,
        businessHours,
        requiresImmediate,
        confidence,
        extractedInfo,
        suggestedActions,
        estimatedResponseTime
      };

      // Update match counts for matched keywords and patterns
      await this.updateMatchCounts(matchedKeywords, matchedPatterns);

      logger.info('Message classified', {
        isEmergency,
        emergencyLevel,
        estimatedPriority,
        matchedKeywords: matchedKeywords.length,
        matchedPatterns: matchedPatterns.length,
        confidence
      });

      return result;
    } catch (error) {
      logger.error('Failed to classify message', { messageText, error });
      throw error;
    }
  }

  /**
   * Extract key information from message text
   */
  private extractMessageInfo(text: string): MessageClassification['extractedInfo'] {
    const urgentWords = this.extractUrgentWords(text);
    const timeReferences = this.extractTimeReferences(text);
    const locationReferences = this.extractLocationReferences(text);
    const serviceTypeWords = this.extractServiceTypeWords(text);
    const customerSentiment = this.analyzeSentiment(text);

    return {
      urgentWords,
      timeReferences,
      locationReferences,
      serviceTypeWords,
      customerSentiment
    };
  }

  /**
   * Find emergency keywords that match the message
   */
  private findMatchingEmergencyKeywords(text: string): EmergencyKeyword[] {
    return this.emergencyKeywords.filter(keyword => {
      if (keyword.pattern) {
        try {
          const regex = new RegExp(keyword.pattern, 'i');
          return regex.test(text);
        } catch (error) {
          logger.warn('Invalid regex pattern in emergency keyword', { 
            keywordId: keyword.id, 
            pattern: keyword.pattern 
          });
          return text.includes(keyword.keyword.toLowerCase());
        }
      }
      return text.includes(keyword.keyword.toLowerCase());
    });
  }

  /**
   * Find service type patterns that match the message
   */
  private findMatchingServicePatterns(text: string): ServiceTypePattern[] {
    return this.servicePatterns.filter(pattern => {
      try {
        const regex = new RegExp(pattern.pattern, 'i');
        return regex.test(text);
      } catch (error) {
        logger.warn('Invalid regex pattern in service type pattern', { 
          patternId: pattern.id, 
          pattern: pattern.pattern 
        });
        return false;
      }
    });
  }

  /**
   * Check for general emergency indicators beyond keywords
   */
  private hasEmergencyIndicators(text: string): boolean {
    const emergencyIndicators = [
      'emergency', 'urgent', 'asap', 'help', 'immediately', 'right now',
      'flooding', 'leaking', 'burst', 'broken', 'not working', 'stopped working',
      'gas smell', 'sewage', 'backup', 'overflow', 'no water', 'no heat'
    ];

    return emergencyIndicators.some(indicator => text.includes(indicator));
  }

  /**
   * Determine emergency level based on matched keywords and context
   */
  private determineEmergencyLevel(
    keywords: EmergencyKeyword[],
    extractedInfo: MessageClassification['extractedInfo']
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (keywords.length === 0) return 'low';

    // Find highest severity keyword
    const severities = keywords.map(k => k.severity);
    if (severities.includes('critical')) return 'critical';
    if (severities.includes('high')) return 'high';
    if (severities.includes('medium')) return 'medium';
    return 'low';
  }

  /**
   * Calculate overall priority for the message
   */
  private calculatePriority(
    isEmergency: boolean,
    emergencyLevel: string,
    businessHours: boolean,
    sentiment: string,
    keywords: EmergencyKeyword[],
    patterns: ServiceTypePattern[]
  ): 'low' | 'medium' | 'high' | 'emergency' {
    if (isEmergency && emergencyLevel === 'critical') return 'emergency';
    if (isEmergency && emergencyLevel === 'high') return 'emergency';
    if (isEmergency && emergencyLevel === 'medium') return 'high';
    
    if (!businessHours && isEmergency) return 'emergency';
    if (sentiment === 'frustrated' || sentiment === 'urgent') return 'high';
    
    // Check for high-priority service types
    const highPriorityServices = ['water_heater', 'main_line', 'gas_line'];
    if (patterns.some(p => highPriorityServices.includes(p.serviceType))) return 'high';
    
    if (businessHours && isEmergency) return 'high';
    if (patterns.length > 0) return 'medium';
    
    return 'low';
  }

  /**
   * Determine if immediate response is required
   */
  private requiresImmediateResponse(
    isEmergency: boolean,
    emergencyLevel: string,
    businessHours: boolean,
    extractedInfo: MessageClassification['extractedInfo']
  ): boolean {
    if (emergencyLevel === 'critical') return true;
    if (isEmergency && !businessHours) return true;
    if (extractedInfo.customerSentiment === 'urgent') return true;
    
    const immediateWords = ['flooding', 'gas', 'leak', 'burst', 'emergency'];
    return immediateWords.some(word => 
      extractedInfo.urgentWords.some(urgent => urgent.includes(word))
    );
  }

  /**
   * Calculate confidence score for the classification
   */
  private calculateConfidence(
    keywords: EmergencyKeyword[],
    patterns: ServiceTypePattern[],
    extractedInfo: MessageClassification['extractedInfo']
  ): number {
    let confidence = 50; // Base confidence

    // Boost confidence for keyword matches
    confidence += keywords.length * 15;
    
    // Boost confidence for pattern matches
    confidence += patterns.reduce((sum, pattern) => sum + (pattern.confidence / 10), 0);
    
    // Boost confidence for clear urgent indicators
    confidence += extractedInfo.urgentWords.length * 5;
    
    // Boost confidence for time/location references
    confidence += extractedInfo.timeReferences.length * 3;
    confidence += extractedInfo.locationReferences.length * 3;

    return Math.min(100, Math.max(0, confidence));
  }

  /**
   * Generate suggested actions based on classification
   */
  private generateSuggestedActions(
    isEmergency: boolean,
    emergencyLevel: string,
    keywords: EmergencyKeyword[],
    patterns: ServiceTypePattern[],
    businessHours: boolean
  ): string[] {
    const actions: string[] = [];

    if (isEmergency) {
      actions.push('IMMEDIATE_CALLBACK_REQUIRED');
      
      if (emergencyLevel === 'critical') {
        actions.push('DISPATCH_EMERGENCY_TECHNICIAN');
        actions.push('NOTIFY_MANAGEMENT');
      }
      
      if (!businessHours) {
        actions.push('AFTER_HOURS_EMERGENCY_PROTOCOL');
      }
    }

    // Add keyword-specific actions
    keywords.forEach(keyword => {
      actions.push(...keyword.actions);
    });

    // Add pattern-specific actions
    if (patterns.length > 0) {
      actions.push('GENERATE_SERVICE_QUOTE');
      actions.push('CHECK_TECHNICIAN_AVAILABILITY');
    }

    if (!isEmergency && businessHours) {
      actions.push('SCHEDULE_CALLBACK_NEXT_BUSINESS_DAY');
    }

    return [...new Set(actions)]; // Remove duplicates
  }

  /**
   * Estimate response time based on priority and context
   */
  private estimateResponseTime(
    priority: string,
    businessHours: boolean,
    isEmergency: boolean
  ): number {
    if (priority === 'emergency') {
      return businessHours ? 15 : 30; // Faster during business hours
    }
    
    const baseTime = this.emergencyResponseTimes[priority as keyof typeof this.emergencyResponseTimes] || 240;
    
    // Adjust for business hours
    if (!businessHours && !isEmergency) {
      return baseTime * 2; // Slower response outside business hours
    }
    
    return baseTime;
  }

  /**
   * Determine service type from matched patterns
   */
  private determineServiceType(patterns: ServiceTypePattern[]): string | undefined {
    if (patterns.length === 0) return undefined;
    
    // Return the pattern with highest confidence
    return patterns.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    ).serviceType;
  }

  /**
   * Check if current time is within business hours
   */
  private isBusinessHours(timestamp: Date): boolean {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = dayNames[timestamp.getDay()] as keyof typeof this.businessHours;
    const hours = this.businessHours[dayName];
    
    if (!hours) return false;
    
    const currentHour = timestamp.getHours();
    return currentHour >= hours.start && currentHour < hours.end;
  }

  /**
   * Extract urgent/priority words from text
   */
  private extractUrgentWords(text: string): string[] {
    const urgentPatterns = [
      /emergency/gi, /urgent/gi, /asap/gi, /immediately/gi, /right now/gi,
      /help/gi, /flooding/gi, /burst/gi, /leaking/gi, /broken/gi,
      /not working/gi, /stopped working/gi, /overflow/gi, /backup/gi
    ];

    const matches: string[] = [];
    urgentPatterns.forEach(pattern => {
      const found = text.match(pattern);
      if (found) matches.push(...found.map(m => m.toLowerCase()));
    });

    return [...new Set(matches)];
  }

  /**
   * Extract time references from text
   */
  private extractTimeReferences(text: string): string[] {
    const timePatterns = [
      /\b(now|today|tonight|tomorrow|this\s+morning|this\s+afternoon|this\s+evening)\b/gi,
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
      /\b\d{1,2}:\d{2}\s*(am|pm)?\b/gi,
      /\b(morning|afternoon|evening|night)\b/gi
    ];

    const matches: string[] = [];
    timePatterns.forEach(pattern => {
      const found = text.match(pattern);
      if (found) matches.push(...found.map(m => m.toLowerCase()));
    });

    return [...new Set(matches)];
  }

  /**
   * Extract location references from text
   */
  private extractLocationReferences(text: string): string[] {
    const locationPatterns = [
      /\b(kitchen|bathroom|basement|garage|attic|upstairs|downstairs)\b/gi,
      /\b(sink|toilet|shower|bathtub|water\s+heater|dishwasher|washing\s+machine)\b/gi,
      /\b(main\s+line|sewer\s+line|water\s+line|gas\s+line)\b/gi,
      /\b(outside|yard|driveway|street)\b/gi
    ];

    const matches: string[] = [];
    locationPatterns.forEach(pattern => {
      const found = text.match(pattern);
      if (found) matches.push(...found.map(m => m.toLowerCase()));
    });

    return [...new Set(matches)];
  }

  /**
   * Extract service type related words
   */
  private extractServiceTypeWords(text: string): string[] {
    const servicePatterns = [
      /\b(drain|clog|block|backup)\b/gi,
      /\b(leak|drip|pipe|burst|broken)\b/gi,
      /\b(water\s+heater|hot\s+water|no\s+hot\s+water)\b/gi,
      /\b(toilet|sink|faucet|shower|tub)\b/gi,
      /\b(sewer|septic|pump|pressure)\b/gi
    ];

    const matches: string[] = [];
    servicePatterns.forEach(pattern => {
      const found = text.match(pattern);
      if (found) matches.push(...found.map(m => m.toLowerCase()));
    });

    return [...new Set(matches)];
  }

  /**
   * Analyze customer sentiment from text
   */
  private analyzeSentiment(text: string): 'positive' | 'negative' | 'neutral' | 'frustrated' | 'urgent' {
    const frustratedWords = ['frustrated', 'angry', 'mad', 'upset', 'terrible', 'horrible', 'awful'];
    const urgentWords = ['urgent', 'emergency', 'asap', 'immediately', 'help', 'desperate'];
    const negativeWords = ['broken', 'not working', 'problem', 'issue', 'trouble', 'wrong'];
    const positiveWords = ['please', 'thank', 'appreciate', 'great', 'good', 'excellent'];

    const textLower = text.toLowerCase();
    
    if (urgentWords.some(word => textLower.includes(word))) return 'urgent';
    if (frustratedWords.some(word => textLower.includes(word))) return 'frustrated';
    if (negativeWords.some(word => textLower.includes(word))) return 'negative';
    if (positiveWords.some(word => textLower.includes(word))) return 'positive';
    
    return 'neutral';
  }

  /**
   * Update match counts for keywords and patterns
   */
  private async updateMatchCounts(
    keywords: EmergencyKeyword[],
    patterns: ServiceTypePattern[]
  ): Promise<void> {
    try {
      // Update keyword match counts
      await Promise.all(
        keywords.map(keyword => this.emergencyKeywordModel.incrementMatchCount(keyword.id))
      );

      // Update pattern match counts
      await Promise.all(
        patterns.map(pattern => this.serviceTypePatternModel.incrementMatchCount(pattern.id))
      );
    } catch (error) {
      logger.error('Failed to update match counts', { error });
      // Don't throw - this is non-critical
    }
  }

  /**
   * Evaluate geographic context for service area and routing
   */
  async evaluateGeographicContext(
    customerAddress?: string,
    customerPhone?: string
  ): Promise<GeographicInfo> {
    // This would integrate with geographic data/APIs
    // For now, return basic structure
    return {
      isInServiceArea: true,
      zone: 'Zone-A',
      estimatedTravelTime: 30,
      nearestTechnician: 'tech-001'
    };
  }

  /**
   * Get business hours for a specific date
   */
  getBusinessHoursForDate(date: Date): { start: number; end: number } | null {
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayName = dayNames[date.getDay()] as keyof typeof this.businessHours;
    return this.businessHours[dayName] || null;
  }

  /**
   * Force refresh of rules cache
   */
  async refreshCache(): Promise<void> {
    this.lastCacheUpdate = new Date(0); // Force refresh
    await this.loadRulesCache();
  }
}