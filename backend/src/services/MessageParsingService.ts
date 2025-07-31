import { DatabaseService } from './DatabaseService';
import { logger } from '../utils/logger';
import { MessageParsingResult, MessageParsingResultModel } from '../models/ConversationModels';

// Parsing configuration and patterns
export interface ParsingConfiguration {
  version: string;
  emergencyKeywords: Array<{
    keyword: string;
    pattern: RegExp;
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: string;
  }>;
  serviceTypePatterns: Array<{
    serviceType: string;
    patterns: RegExp[];
    confidence: number;
    keywords: string[];
  }>;
  addressPatterns: RegExp[];
  phonePatterns: RegExp[];
  emailPatterns: RegExp[];
  timePatterns: Array<{
    type: 'specific' | 'range' | 'asap' | 'flexible';
    pattern: RegExp;
  }>;
  sentimentIndicators: {
    positive: string[];
    negative: string[];
    frustrated: string[];
    urgent: string[];
  };
  businessIndicators: {
    business: string[];
    propertyManager: string[];
    emergencyContact: string[];
  };
}

export interface ExtractedInformation {
  customerName?: string;
  alternatePhoneNumbers?: string[];
  emailAddresses?: string[];
  addresses?: Array<{
    fullAddress: string;
    confidence: number;
    type: 'service' | 'billing' | 'mailing';
  }>;
  serviceTypes?: Array<{
    type: string;
    confidence: number;
    keywords: string[];
  }>;
  urgencyLevel: 'low' | 'medium' | 'high' | 'emergency';
  emergencyKeywords?: string[];
  urgencyIndicators?: Array<{
    keyword: string;
    context: string;
    confidence: number;
  }>;
  schedulingRequests?: Array<{
    type: 'specific' | 'range' | 'asap' | 'flexible';
    dateTime?: Date;
    timeRange?: { start: string; end: string };
    dayOfWeek?: string;
    notes?: string;
  }>;
  problemDescription?: string;
  problemKeywords?: string[];
  symptoms?: string[];
  sentiment: 'positive' | 'neutral' | 'negative' | 'frustrated' | 'urgent';
  communicationStyle: 'formal' | 'casual' | 'brief' | 'detailed';
  isBusinessCustomer: boolean;
  isPropertyManager: boolean;
  isEmergencyContact: boolean;
  isFollowUp: boolean;
  referencesJobId?: string;
  referencesQuoteId?: string;
  messageQuality: 'clear' | 'unclear' | 'incomplete' | 'garbled';
  requiresHumanReview: boolean;
  confidenceScore: number;
}

export class MessageParsingService {
  private parsingResultModel: MessageParsingResultModel;
  private config: ParsingConfiguration;

  constructor(private db: DatabaseService) {
    this.parsingResultModel = new MessageParsingResultModel(db);
    this.config = this.loadParsingConfiguration();
  }

  /**
   * Parse a message and extract relevant information
   */
  async parseMessage(messageId: string, content: string): Promise<MessageParsingResult> {
    const startTime = Date.now();
    
    try {
      logger.debug('Starting message parsing', { messageId, contentLength: content.length });

      // Extract information using multiple parsing strategies
      const extractedInfo = await this.extractInformation(content);
      
      // Calculate processing time
      const processingTimeMs = Date.now() - startTime;
      
      // Create parsing result record
      const parsingResult = await this.parsingResultModel.create({
        messageId,
        parsingVersion: this.config.version,
        parsingTimestamp: new Date(),
        extractedInfo,
        processingTimeMs
      });

      logger.info('Message parsing completed', {
        messageId,
        processingTimeMs,
        urgencyLevel: extractedInfo.urgencyLevel,
        confidenceScore: extractedInfo.confidenceScore,
        serviceTypesFound: extractedInfo.serviceTypes?.length || 0
      });

      return parsingResult;

    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      
      logger.error('Message parsing failed', {
        messageId,
        processingTimeMs,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      // Create parsing result with error information
      const parsingResult = await this.parsingResultModel.create({
        messageId,
        parsingVersion: this.config.version,
        parsingTimestamp: new Date(),
        extractedInfo: {
          urgencyLevel: 'medium',
          sentiment: 'neutral',
          communicationStyle: 'casual',
          isBusinessCustomer: false,
          isPropertyManager: false,
          isEmergencyContact: false,
          isFollowUp: false,
          messageQuality: 'unclear',
          requiresHumanReview: true,
          confidenceScore: 0
        },
        parsingErrors: [{
          error: error instanceof Error ? error.message : 'Unknown parsing error',
          field: 'general',
          context: 'Message parsing failed'
        }],
        processingTimeMs
      });

      return parsingResult;
    }
  }

  /**
   * Extract comprehensive information from message content
   */
  private async extractInformation(content: string): Promise<ExtractedInformation> {
    const lowerContent = content.toLowerCase();
    const extractedInfo: ExtractedInformation = {
      urgencyLevel: 'medium',
      sentiment: 'neutral',
      communicationStyle: 'casual',
      isBusinessCustomer: false,
      isPropertyManager: false,
      isEmergencyContact: false,
      isFollowUp: false,
      messageQuality: 'clear',
      requiresHumanReview: false,
      confidenceScore: 0.8
    };

    // Extract customer name
    extractedInfo.customerName = this.extractCustomerName(content);

    // Extract contact information
    extractedInfo.alternatePhoneNumbers = this.extractPhoneNumbers(content);
    extractedInfo.emailAddresses = this.extractEmailAddresses(content);

    // Extract addresses
    extractedInfo.addresses = this.extractAddresses(content);

    // Extract service types
    extractedInfo.serviceTypes = this.extractServiceTypes(content);

    // Analyze urgency
    const urgencyAnalysis = this.analyzeUrgency(content);
    extractedInfo.urgencyLevel = urgencyAnalysis.level;
    extractedInfo.emergencyKeywords = urgencyAnalysis.keywords;
    extractedInfo.urgencyIndicators = urgencyAnalysis.indicators;

    // Extract scheduling information
    extractedInfo.schedulingRequests = this.extractSchedulingRequests(content);

    // Extract problem description
    const problemAnalysis = this.analyzeProblem(content);
    extractedInfo.problemDescription = problemAnalysis.description;
    extractedInfo.problemKeywords = problemAnalysis.keywords;
    extractedInfo.symptoms = problemAnalysis.symptoms;

    // Analyze sentiment
    extractedInfo.sentiment = this.analyzeSentiment(content);

    // Determine communication style
    extractedInfo.communicationStyle = this.determineCommunicationStyle(content);

    // Business classification
    const businessAnalysis = this.classifyBusiness(content);
    extractedInfo.isBusinessCustomer = businessAnalysis.isBusiness;
    extractedInfo.isPropertyManager = businessAnalysis.isPropertyManager;
    extractedInfo.isEmergencyContact = businessAnalysis.isEmergencyContact;

    // Follow-up detection
    extractedInfo.isFollowUp = this.detectFollowUp(content);
    extractedInfo.referencesJobId = this.extractJobReference(content);
    extractedInfo.referencesQuoteId = this.extractQuoteReference(content);

    // Message quality assessment
    extractedInfo.messageQuality = this.assessMessageQuality(content);
    extractedInfo.requiresHumanReview = this.shouldRequireHumanReview(extractedInfo);

    // Calculate final confidence score
    extractedInfo.confidenceScore = this.calculateConfidenceScore(extractedInfo, content);

    return extractedInfo;
  }

  /**
   * Extract customer name from message content
   */
  private extractCustomerName(content: string): string | undefined {
    // Pattern for "This is [Name]" or "My name is [Name]"
    const namePatterns = [
      /(?:this is|my name is|i'?m)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i,
      /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:here|calling)/i,
      /from\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i
    ];

    for (const pattern of namePatterns) {
      const match = content.match(pattern);
      if (match) {
        const name = match[1].trim();
        // Filter out common words that aren't names
        const commonWords = ['calling', 'here', 'there', 'today', 'tomorrow', 'about', 'regarding'];
        if (!commonWords.includes(name.toLowerCase()) && name.length > 1) {
          return name;
        }
      }
    }

    return undefined;
  }

  /**
   * Extract phone numbers from content
   */
  private extractPhoneNumbers(content: string): string[] {
    const phoneNumbers: string[] = [];
    
    for (const pattern of this.config.phonePatterns) {
      const matches = content.match(new RegExp(pattern, 'g'));
      if (matches) {
        phoneNumbers.push(...matches);
      }
    }

    return [...new Set(phoneNumbers)]; // Remove duplicates
  }

  /**
   * Extract email addresses from content
   */
  private extractEmailAddresses(content: string): string[] {
    const emails: string[] = [];
    
    for (const pattern of this.config.emailPatterns) {
      const matches = content.match(new RegExp(pattern, 'g'));
      if (matches) {
        emails.push(...matches);
      }
    }

    return [...new Set(emails)]; // Remove duplicates
  }

  /**
   * Extract addresses from content
   */
  private extractAddresses(content: string): Array<{
    fullAddress: string;
    confidence: number;
    type: 'service' | 'billing' | 'mailing';
  }> {
    const addresses: Array<{
      fullAddress: string;
      confidence: number;
      type: 'service' | 'billing' | 'mailing';
    }> = [];

    for (const pattern of this.config.addressPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        for (const match of matches) {
          let type: 'service' | 'billing' | 'mailing' = 'service';
          
          // Determine address type based on context
          const lowerContent = content.toLowerCase();
          if (lowerContent.includes('billing') || lowerContent.includes('bill')) {
            type = 'billing';
          } else if (lowerContent.includes('mail') || lowerContent.includes('send')) {
            type = 'mailing';
          }

          addresses.push({
            fullAddress: match.trim(),
            confidence: 0.8,
            type
          });
        }
      }
    }

    return addresses;
  }

  /**
   * Extract service types from content
   */
  private extractServiceTypes(content: string): Array<{
    type: string;
    confidence: number;
    keywords: string[];
  }> {
    const serviceTypes: Array<{
      type: string;
      confidence: number;
      keywords: string[];
    }> = [];

    const lowerContent = content.toLowerCase();

    for (const servicePattern of this.config.serviceTypePatterns) {
      const matchedKeywords: string[] = [];
      let hasMatch = false;

      for (const pattern of servicePattern.patterns) {
        if (pattern.test(lowerContent)) {
          hasMatch = true;
          // Extract the actual matched words
          const matches = lowerContent.match(pattern);
          if (matches) {
            matchedKeywords.push(...matches);
          }
        }
      }

      if (hasMatch) {
        serviceTypes.push({
          type: servicePattern.serviceType,
          confidence: servicePattern.confidence / 100,
          keywords: [...new Set([...matchedKeywords, ...servicePattern.keywords.filter(k => lowerContent.includes(k))])]
        });
      }
    }

    return serviceTypes;
  }

  /**
   * Analyze urgency level and extract urgency indicators
   */
  private analyzeUrgency(content: string): {
    level: 'low' | 'medium' | 'high' | 'emergency';
    keywords: string[];
    indicators: Array<{
      keyword: string;
      context: string;
      confidence: number;
    }>;
  } {
    const lowerContent = content.toLowerCase();
    const foundKeywords: string[] = [];
    const indicators: Array<{
      keyword: string;
      context: string;
      confidence: number;
    }> = [];

    let maxSeverity: 'low' | 'medium' | 'high' | 'critical' = 'low';

    for (const emergencyKeyword of this.config.emergencyKeywords) {
      if (emergencyKeyword.pattern.test(lowerContent)) {
        foundKeywords.push(emergencyKeyword.keyword);
        
        // Extract context around the keyword
        const match = lowerContent.match(emergencyKeyword.pattern);
        if (match) {
          const index = lowerContent.indexOf(match[0]);
          const start = Math.max(0, index - 20);
          const end = Math.min(lowerContent.length, index + match[0].length + 20);
          const context = content.substring(start, end);

          indicators.push({
            keyword: emergencyKeyword.keyword,
            context: context.trim(),
            confidence: 0.9
          });
        }

        // Update max severity
        const severityLevel = ['low', 'medium', 'high', 'critical'].indexOf(emergencyKeyword.severity);
        const currentLevel = ['low', 'medium', 'high', 'critical'].indexOf(maxSeverity);
        if (severityLevel > currentLevel) {
          maxSeverity = emergencyKeyword.severity;
        }
      }
    }

    // Map severity to urgency level
    let urgencyLevel: 'low' | 'medium' | 'high' | 'emergency' = 'medium';
    if (maxSeverity === 'critical') {
      urgencyLevel = 'emergency';
    } else if (maxSeverity === 'high') {
      urgencyLevel = 'high';
    } else if (maxSeverity === 'medium') {
      urgencyLevel = 'medium';
    } else {
      urgencyLevel = 'low';
    }

    return {
      level: urgencyLevel,
      keywords: foundKeywords,
      indicators
    };
  }

  /**
   * Extract scheduling requests from content
   */
  private extractSchedulingRequests(content: string): Array<{
    type: 'specific' | 'range' | 'asap' | 'flexible';
    dateTime?: Date;
    timeRange?: { start: string; end: string };
    dayOfWeek?: string;
    notes?: string;
  }> {
    const schedulingRequests: Array<{
      type: 'specific' | 'range' | 'asap' | 'flexible';
      dateTime?: Date;
      timeRange?: { start: string; end: string };
      dayOfWeek?: string;
      notes?: string;
    }> = [];

    const lowerContent = content.toLowerCase();

    for (const timePattern of this.config.timePatterns) {
      const matches = content.match(timePattern.pattern);
      if (matches) {
        for (const match of matches) {
          const request: any = {
            type: timePattern.type,
            notes: match
          };

          // Try to parse specific dates/times
          if (timePattern.type === 'specific') {
            const dateTime = this.parseDateTime(match);
            if (dateTime) {
              request.dateTime = dateTime;
            }
          }

          // Extract time ranges
          if (timePattern.type === 'range') {
            const timeRange = this.parseTimeRange(match);
            if (timeRange) {
              request.timeRange = timeRange;
            }
          }

          // Extract day of week
          const dayMatch = match.match(/(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i);
          if (dayMatch) {
            request.dayOfWeek = dayMatch[1].toLowerCase();
          }

          schedulingRequests.push(request);
        }
      }
    }

    return schedulingRequests;
  }

  /**
   * Analyze problem description and extract keywords
   */
  private analyzeProblem(content: string): {
    description?: string;
    keywords: string[];
    symptoms: string[];
  } {
    const lowerContent = content.toLowerCase();
    const keywords: string[] = [];
    const symptoms: string[] = [];

    // Problem keywords
    const problemKeywords = [
      'broken', 'not working', 'stopped', 'failed', 'blocked', 'clogged',
      'leaking', 'dripping', 'running', 'overflowing', 'backing up',
      'no water', 'low pressure', 'slow drain', 'noise', 'smell'
    ];

    for (const keyword of problemKeywords) {
      if (lowerContent.includes(keyword)) {
        keywords.push(keyword);
      }
    }

    // Symptom patterns
    const symptomPatterns = [
      /water\s+(?:is\s+)?(?:coming\s+)?(?:out\s+of|from|everywhere)/,
      /(?:can't|cannot)\s+(?:flush|turn\s+on|get\s+water)/,
      /(?:no|low)\s+(?:water\s+)?pressure/,
      /(?:slow|backed\s+up)\s+drain/,
      /(?:strange|weird|loud)\s+(?:noise|sound)/,
      /(?:bad|foul|sewer)\s+smell/
    ];

    for (const pattern of symptomPatterns) {
      const match = lowerContent.match(pattern);
      if (match) {
        symptoms.push(match[0]);
      }
    }

    // Extract problem description (usually the main content)
    let description = content;
    if (content.length > 200) {
      // Try to find the main problem statement
      const sentences = content.split(/[.!?]+/);
      for (const sentence of sentences) {
        if (sentence.length > 20 && problemKeywords.some(k => sentence.toLowerCase().includes(k))) {
          description = sentence.trim();
          break;
        }
      }
    }

    return {
      description,
      keywords,
      symptoms
    };
  }

  /**
   * Analyze message sentiment
   */
  private analyzeSentiment(content: string): 'positive' | 'neutral' | 'negative' | 'frustrated' | 'urgent' {
    const lowerContent = content.toLowerCase();

    // Check for frustrated indicators
    if (this.config.sentimentIndicators.frustrated.some(indicator => lowerContent.includes(indicator))) {
      return 'frustrated';
    }

    // Check for urgent indicators
    if (this.config.sentimentIndicators.urgent.some(indicator => lowerContent.includes(indicator))) {
      return 'urgent';
    }

    // Check for negative indicators
    if (this.config.sentimentIndicators.negative.some(indicator => lowerContent.includes(indicator))) {
      return 'negative';
    }

    // Check for positive indicators
    if (this.config.sentimentIndicators.positive.some(indicator => lowerContent.includes(indicator))) {
      return 'positive';
    }

    return 'neutral';
  }

  /**
   * Determine communication style
   */
  private determineCommunicationStyle(content: string): 'formal' | 'casual' | 'brief' | 'detailed' {
    const lowerContent = content.toLowerCase();

    // Brief messages (< 50 characters or very direct)
    if (content.length < 50 || /^(yes|no|ok|thanks?|help)$/i.test(content.trim())) {
      return 'brief';
    }

    // Formal indicators
    const formalIndicators = ['dear', 'sincerely', 'respectfully', 'please', 'would you', 'could you'];
    if (formalIndicators.some(indicator => lowerContent.includes(indicator))) {
      return 'formal';
    }

    // Detailed messages (> 200 characters with structure)
    if (content.length > 200 && (content.includes('\n') || content.split('.').length > 3)) {
      return 'detailed';
    }

    return 'casual';
  }

  /**
   * Classify business type
   */
  private classifyBusiness(content: string): {
    isBusiness: boolean;
    isPropertyManager: boolean;
    isEmergencyContact: boolean;
  } {
    const lowerContent = content.toLowerCase();

    const isBusiness = this.config.businessIndicators.business.some(indicator => 
      lowerContent.includes(indicator)
    );

    const isPropertyManager = this.config.businessIndicators.propertyManager.some(indicator => 
      lowerContent.includes(indicator)
    );

    const isEmergencyContact = this.config.businessIndicators.emergencyContact.some(indicator => 
      lowerContent.includes(indicator)
    );

    return {
      isBusiness,
      isPropertyManager,
      isEmergencyContact
    };
  }

  /**
   * Detect if message is a follow-up
   */
  private detectFollowUp(content: string): boolean {
    const lowerContent = content.toLowerCase();
    const followUpIndicators = [
      'follow up', 'followup', 'update', 'status', 'still waiting',
      'any update', 'what about', 'regarding', 'about my', 'my issue',
      'previously', 'earlier', 'before', 'last time'
    ];

    return followUpIndicators.some(indicator => lowerContent.includes(indicator));
  }

  /**
   * Extract job ID references
   */
  private extractJobReference(content: string): string | undefined {
    const jobPatterns = [
      /job\s*#?\s*(\w+)/i,
      /reference\s*#?\s*(\w+)/i,
      /ticket\s*#?\s*(\w+)/i
    ];

    for (const pattern of jobPatterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return undefined;
  }

  /**
   * Extract quote ID references
   */
  private extractQuoteReference(content: string): string | undefined {
    const quotePatterns = [
      /quote\s*#?\s*(\w+)/i,
      /estimate\s*#?\s*(\w+)/i,
      /proposal\s*#?\s*(\w+)/i
    ];

    for (const pattern of quotePatterns) {
      const match = content.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return undefined;
  }

  /**
   * Assess message quality
   */
  private assessMessageQuality(content: string): 'clear' | 'unclear' | 'incomplete' | 'garbled' {
    // Very short messages
    if (content.length < 10) {
      return 'incomplete';
    }

    // Messages with lots of typos or unclear text
    const typoIndicators = content.match(/[aeiou]{3,}|[bcdfghjklmnpqrstvwxyz]{4,}/gi);
    if (typoIndicators && typoIndicators.length > 2) {
      return 'garbled';
    }

    // Messages that seem incomplete
    const incompleteIndicators = [
      /\.\.\.$/, // Ends with ...
      /^(um|uh|well)\s/i, // Starts with filler words
      /\b(and|but|so)\s*$/i // Ends with conjunction
    ];

    if (incompleteIndicators.some(pattern => pattern.test(content))) {
      return 'incomplete';
    }

    // Messages without clear problem description
    const problemKeywords = ['broken', 'not working', 'need', 'help', 'issue', 'problem'];
    if (!problemKeywords.some(keyword => content.toLowerCase().includes(keyword))) {
      return 'unclear';
    }

    return 'clear';
  }

  /**
   * Determine if human review is required
   */
  private shouldRequireHumanReview(extractedInfo: ExtractedInformation): boolean {
    // Always require review for emergencies
    if (extractedInfo.urgencyLevel === 'emergency') {
      return true;
    }

    // Require review for unclear or garbled messages
    if (['unclear', 'garbled'].includes(extractedInfo.messageQuality)) {
      return true;
    }

    // Require review for very low confidence
    if (extractedInfo.confidenceScore < 0.5) {
      return true;
    }

    // Require review for frustrated customers
    if (extractedInfo.sentiment === 'frustrated') {
      return true;
    }

    return false;
  }

  /**
   * Calculate overall confidence score
   */
  private calculateConfidenceScore(extractedInfo: ExtractedInformation, content: string): number {
    let score = 0.5; // Base score

    // Boost for clear message quality
    if (extractedInfo.messageQuality === 'clear') {
      score += 0.2;
    } else if (extractedInfo.messageQuality === 'unclear') {
      score -= 0.1;
    } else if (extractedInfo.messageQuality === 'garbled') {
      score -= 0.3;
    }

    // Boost for identified service types
    if (extractedInfo.serviceTypes && extractedInfo.serviceTypes.length > 0) {
      score += 0.2;
    }

    // Boost for extracted addresses
    if (extractedInfo.addresses && extractedInfo.addresses.length > 0) {
      score += 0.1;
    }

    // Penalty for requiring human review
    if (extractedInfo.requiresHumanReview) {
      score -= 0.2;
    }

    // Boost for detailed communication
    if (extractedInfo.communicationStyle === 'detailed') {
      score += 0.1;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Parse date/time from text
   */
  private parseDateTime(text: string): Date | undefined {
    // This would implement more sophisticated date/time parsing
    // For now, return undefined
    return undefined;
  }

  /**
   * Parse time range from text
   */
  private parseTimeRange(text: string): { start: string; end: string } | undefined {
    const rangePattern = /(\d{1,2}:\d{2})\s*(?:to|-|until)\s*(\d{1,2}:\d{2})/i;
    const match = text.match(rangePattern);
    
    if (match) {
      return {
        start: match[1],
        end: match[2]
      };
    }

    return undefined;
  }

  /**
   * Load parsing configuration
   */
  private loadParsingConfiguration(): ParsingConfiguration {
    return {
      version: '1.0.0',
      emergencyKeywords: [
        {
          keyword: 'flooding',
          pattern: /\b(flood|flooding|water everywhere|basement flood)\b/i,
          severity: 'critical',
          category: 'flooding'
        },
        {
          keyword: 'gas leak',
          pattern: /\b(gas leak|smell gas|gas odor|propane leak)\b/i,
          severity: 'critical',
          category: 'gas_leak'
        },
        {
          keyword: 'no water',
          pattern: /\b(no water|water shut off|no pressure|main line)\b/i,
          severity: 'high',
          category: 'no_water'
        },
        {
          keyword: 'burst pipe',
          pattern: /\b(burst pipe|pipe burst|broken pipe|pipe leak)\b/i,
          severity: 'high',
          category: 'burst_pipe'
        },
        {
          keyword: 'backup',
          pattern: /\b(sewer backup|drain backup|toilet backup|overflow)\b/i,
          severity: 'high',
          category: 'backup'
        },
        {
          keyword: 'emergency',
          pattern: /\b(emergency|urgent|asap|help|crisis)\b/i,
          severity: 'high',
          category: 'general'
        }
      ],
      serviceTypePatterns: [
        {
          serviceType: 'drain_cleaning',
          patterns: [/\b(drain|clog|slow drain|backup|snake)\b/i],
          confidence: 85,
          keywords: ['drain', 'clog', 'backup', 'snake']
        },
        {
          serviceType: 'water_heater',
          patterns: [/\b(water heater|hot water|no hot water|heater)\b/i],
          confidence: 90,
          keywords: ['water heater', 'hot water', 'heater']
        },
        {
          serviceType: 'toilet_repair',
          patterns: [/\b(toilet|running|flush|tank|bowl)\b/i],
          confidence: 80,
          keywords: ['toilet', 'flush', 'tank', 'bowl']
        },
        {
          serviceType: 'faucet_repair',
          patterns: [/\b(faucet|tap|drip|leak|handle)\b/i],
          confidence: 75,
          keywords: ['faucet', 'tap', 'drip', 'leak']
        },
        {
          serviceType: 'pipe_repair',
          patterns: [/\b(pipe|piping|burst|broken pipe|leak)\b/i],
          confidence: 85,
          keywords: ['pipe', 'piping', 'burst', 'leak']
        }
      ],
      addressPatterns: [
        /\b\d+\s+[A-Za-z0-9\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Circle|Cir|Court|Ct)\b/gi,
        /\b\d+\s+[A-Za-z0-9\s]+,\s*[A-Za-z\s]+,\s*[A-Z]{2}\s+\d{5}/gi
      ],
      phonePatterns: [
        /\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g
      ],
      emailPatterns: [
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
      ],
      timePatterns: [
        {
          type: 'asap',
          pattern: /\b(asap|as soon as possible|right away|immediately|urgent|emergency)\b/i
        },
        {
          type: 'specific',
          pattern: /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}:\d{2})\b/i
        },
        {
          type: 'range',
          pattern: /\b(\d{1,2}:\d{2})\s*(?:to|-|until)\s*(\d{1,2}:\d{2})\b/i
        },
        {
          type: 'flexible',
          pattern: /\b(anytime|flexible|whenever|any time)\b/i
        }
      ],
      sentimentIndicators: {
        positive: ['thank', 'appreciate', 'great', 'excellent', 'good', 'pleased'],
        negative: ['terrible', 'awful', 'bad', 'worst', 'horrible', 'hate'],
        frustrated: ['frustrated', 'annoyed', 'fed up', 'ridiculous', 'unacceptable'],
        urgent: ['urgent', 'emergency', 'asap', 'immediate', 'crisis', 'desperate']
      },
      businessIndicators: {
        business: ['company', 'business', 'office', 'store', 'restaurant', 'shop'],
        propertyManager: ['property manager', 'landlord', 'tenant', 'rental', 'property management'],
        emergencyContact: ['emergency contact', 'on behalf of', 'calling for', 'representing']
      }
    };
  }
}

export default MessageParsingService;