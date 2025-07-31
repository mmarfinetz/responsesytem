import { DatabaseService } from './DatabaseService';
import { logger } from '../utils/logger';
import { Customer, Conversation, Message } from '../../../shared/types';

export interface CustomerMatchOptions {
  phoneNumber: string;
  name?: string;
  email?: string;
  fuzzyMatch?: boolean;
  createIfNotFound?: boolean;
  confidence?: number;
}

export interface CustomerMatchResult {
  customer: Customer | null;
  matchType: 'exact' | 'fuzzy' | 'created' | 'none';
  confidence: number;
  alternativeMatches?: Customer[];
  reasoning: string;
}

export interface ConversationThreadOptions {
  customerId: string;
  phoneNumber: string;
  platform: 'google_voice' | 'sms' | 'email' | 'web_chat';
  threadId?: string;
  messageContent?: string;
  priority?: 'low' | 'medium' | 'high' | 'emergency';
}

export interface ConversationThreadResult {
  conversation: Conversation;
  isNew: boolean;
  mergedConversations?: string[];
  reasoning: string;
}

export class CustomerMatchingService {
  constructor(private db: DatabaseService) {}

  /**
   * Find or create customer based on phone number and optional additional info
   */
  async matchCustomer(options: CustomerMatchOptions): Promise<CustomerMatchResult> {
    try {
      const knex = DatabaseService.getInstance();
      const normalizedPhone = this.normalizePhoneNumber(options.phoneNumber);

      // Step 1: Exact phone number match
      const exactMatch = await this.findExactPhoneMatch(normalizedPhone);
      if (exactMatch) {
        return {
          customer: exactMatch,
          matchType: 'exact',
          confidence: 1.0,
          reasoning: 'Exact phone number match found'
        };
      }

      // Step 2: Check alternate phone numbers
      const alternateMatch = await this.findAlternatePhoneMatch(normalizedPhone);
      if (alternateMatch) {
        return {
          customer: alternateMatch,
          matchType: 'exact',
          confidence: 0.95,
          reasoning: 'Match found using alternate phone number'
        };
      }

      // Step 3: Fuzzy matching if enabled
      if (options.fuzzyMatch && (options.name || options.email)) {
        const fuzzyResult = await this.performFuzzyMatching(options);
        if (fuzzyResult.customer && fuzzyResult.confidence >= (options.confidence || 0.8)) {
          return fuzzyResult;
        }
      }

      // Step 4: Create new customer if requested
      if (options.createIfNotFound) {
        const newCustomer = await this.createCustomerFromPhone(options);
        return {
          customer: newCustomer,
          matchType: 'created',
          confidence: 1.0,
          reasoning: 'New customer created from phone number'
        };
      }

      // No match found
      return {
        customer: null,
        matchType: 'none',
        confidence: 0,
        reasoning: 'No matching customer found'
      };

    } catch (error) {
      logger.error('Customer matching failed', {
        phoneNumber: options.phoneNumber,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Enhanced customer matching with property address consideration
   */
  async matchCustomerWithProperty(
    options: CustomerMatchOptions & { address?: string; city?: string; zipCode?: string }
  ): Promise<CustomerMatchResult> {
    try {
      // First try standard customer matching
      const basicMatch = await this.matchCustomer(options);
      
      if (basicMatch.customer && basicMatch.matchType === 'exact') {
        return basicMatch;
      }

      // If we have address info and no exact match, check property records
      if (options.address && (options.city || options.zipCode)) {
        const propertyMatch = await this.findCustomerByProperty(options);
        if (propertyMatch) {
          return {
            customer: propertyMatch,
            matchType: 'exact',
            confidence: 0.9,
            reasoning: 'Customer matched via property address'
          };
        }
      }

      return basicMatch;

    } catch (error) {
      logger.error('Enhanced customer matching failed', {
        phoneNumber: options.phoneNumber,
        address: options.address,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Find or create conversation thread
   */
  async findOrCreateConversationThread(options: ConversationThreadOptions): Promise<ConversationThreadResult> {
    try {
      const knex = DatabaseService.getInstance();
      const normalizedPhone = this.normalizePhoneNumber(options.phoneNumber);

      // Step 1: Look for existing active conversation
      const existingConversation = await this.findActiveConversation(options.customerId, normalizedPhone, options.platform);
      
      if (existingConversation) {
        // Update last message time
        await knex('conversations')
          .where('id', existingConversation.id)
          .update({
            lastMessageAt: new Date(),
            updatedAt: new Date()
          });

        return {
          conversation: existingConversation,
          isNew: false,
          reasoning: 'Found existing active conversation'
        };
      }

      // Step 2: Look for recent inactive conversations that should be resumed
      const recentConversation = await this.findRecentInactiveConversation(options.customerId, normalizedPhone);
      
      if (recentConversation && this.shouldResumeConversation(recentConversation, options.messageContent)) {
        // Reactivate the conversation
        await knex('conversations')
          .where('id', recentConversation.id)
          .update({
            status: 'active',
            lastMessageAt: new Date(),
            updatedAt: new Date()
          });

        const reactivatedConversation = await knex('conversations')
          .where('id', recentConversation.id)
          .first();

        return {
          conversation: reactivatedConversation,
          isNew: false,
          reasoning: 'Reactivated recent conversation'
        };
      }

      // Step 3: Check for conversation merging opportunities
      const mergeResult = await this.checkForConversationMerging(options.customerId, normalizedPhone);
      
      if (mergeResult.shouldMerge && mergeResult.targetConversation) {
        await this.mergeConversations(mergeResult.conversationsToMerge, mergeResult.targetConversation.id);
        
        return {
          conversation: mergeResult.targetConversation,
          isNew: false,
          mergedConversations: mergeResult.conversationsToMerge,
          reasoning: 'Merged duplicate conversations'
        };
      }

      // Step 4: Create new conversation
      const newConversation = await this.createNewConversation(options);
      
      return {
        conversation: newConversation,
        isNew: true,
        reasoning: 'Created new conversation thread'
      };

    } catch (error) {
      logger.error('Conversation threading failed', {
        customerId: options.customerId,
        phoneNumber: options.phoneNumber,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Analyze conversation context for better threading
   */
  async analyzeConversationContext(
    conversationId: string,
    newMessageContent: string
  ): Promise<{
    isFollowUp: boolean;
    relatedJobId?: string;
    suggestedPriority: 'low' | 'medium' | 'high' | 'emergency';
    tags: string[];
    emergencyKeywords: string[];
  }> {
    try {
      const knex = DatabaseService.getInstance();
      
      // Get recent messages from conversation
      const recentMessages = await knex('messages')
        .where('conversationId', conversationId)
        .orderBy('sentAt', 'desc')
        .limit(10);

      // Analyze message patterns
      const isFollowUp = this.detectFollowUpPattern(recentMessages, newMessageContent);
      const relatedJobId = await this.findRelatedJob(conversationId, newMessageContent);
      const suggestedPriority = this.determinePriority(newMessageContent, recentMessages);
      const tags = this.extractTags(newMessageContent);
      const emergencyKeywords = this.detectEmergencyKeywords(newMessageContent);

      return {
        isFollowUp,
        relatedJobId,
        suggestedPriority,
        tags,
        emergencyKeywords
      };

    } catch (error) {
      logger.error('Conversation context analysis failed', {
        conversationId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      // Return safe defaults
      return {
        isFollowUp: false,
        suggestedPriority: 'medium',
        tags: [],
        emergencyKeywords: []
      };
    }
  }

  // Private helper methods

  private async findExactPhoneMatch(normalizedPhone: string): Promise<Customer | null> {
    const knex = DatabaseService.getInstance();
    const customer = await knex('customers')
      .where('phone', normalizedPhone)
      .where('isActive', true)
      .first();

    return customer || null;
  }

  private async findAlternatePhoneMatch(normalizedPhone: string): Promise<Customer | null> {
    const knex = DatabaseService.getInstance();
    const customer = await knex('customers')
      .where('alternatePhone', normalizedPhone)
      .where('isActive', true)
      .first();

    return customer || null;
  }

  private async performFuzzyMatching(options: CustomerMatchOptions): Promise<CustomerMatchResult> {
    const knex = DatabaseService.getInstance();
    const alternativeMatches: Customer[] = [];

    // Name-based fuzzy matching
    if (options.name) {
      const nameTokens = options.name.toLowerCase().split(' ');
      const firstName = nameTokens[0];
      const lastName = nameTokens[nameTokens.length - 1];

      const nameMatches = await knex('customers')
        .where('isActive', true)
        .where(function(this: any) {
          this.where('firstName', 'like', `%${firstName}%`)
            .orWhere('lastName', 'like', `%${lastName}%`);
        })
        .limit(5);

      alternativeMatches.push(...nameMatches);
    }

    // Email-based matching
    if (options.email) {
      const emailMatches = await knex('customers')
        .where('email', 'like', `%${options.email}%`)
        .where('isActive', true)
        .limit(3);

      alternativeMatches.push(...emailMatches);
    }

    // Calculate confidence scores and return best match
    if (alternativeMatches.length > 0) {
      const scoredMatches = alternativeMatches.map(customer => ({
        customer,
        confidence: this.calculateMatchConfidence(customer, options)
      }));

      scoredMatches.sort((a, b) => b.confidence - a.confidence);
      const bestMatch = scoredMatches[0];

      if (bestMatch.confidence >= 0.7) {
        return {
          customer: bestMatch.customer,
          matchType: 'fuzzy',
          confidence: bestMatch.confidence,
          alternativeMatches: scoredMatches.slice(1, 4).map(m => m.customer),
          reasoning: `Fuzzy match based on ${options.name ? 'name' : 'email'} similarity`
        };
      }
    }

    return {
      customer: null,
      matchType: 'none',
      confidence: 0,
      alternativeMatches,
      reasoning: 'No fuzzy matches found above confidence threshold'
    };
  }

  private calculateMatchConfidence(customer: Customer, options: CustomerMatchOptions): number {
    let confidence = 0;
    let factors = 0;

    // Name similarity
    if (options.name) {
      const fullName = `${customer.firstName} ${customer.lastName}`.toLowerCase();
      const searchName = options.name.toLowerCase();
      
      if (fullName === searchName) {
        confidence += 0.5;
      } else if (fullName.includes(searchName) || searchName.includes(fullName)) {
        confidence += 0.3;
      } else {
        // Check individual name components
        const nameTokens = searchName.split(' ');
        let nameMatches = 0;
        
        for (const token of nameTokens) {
          if (fullName.includes(token)) {
            nameMatches++;
          }
        }
        
        confidence += (nameMatches / nameTokens.length) * 0.4;
      }
      factors++;
    }

    // Email similarity
    if (options.email && customer.email) {
      if (customer.email.toLowerCase() === options.email.toLowerCase()) {
        confidence += 0.5;
      } else if (customer.email.toLowerCase().includes(options.email.toLowerCase())) {
        confidence += 0.3;
      }
      factors++;
    }

    return factors > 0 ? confidence / factors : 0;
  }

  private async findCustomerByProperty(
    options: CustomerMatchOptions & { address?: string; city?: string; zipCode?: string }
  ): Promise<Customer | null> {
    const knex = DatabaseService.getInstance();
    
    const query = knex('customers')
      .join('properties', 'customers.id', 'properties.customerId')
      .where('customers.isActive', true)
      .where('properties.isActive', true);

    if (options.address) {
      query.where('properties.address', 'like', `%${options.address}%`);
    }
    
    if (options.city) {
      query.where('properties.city', 'like', `%${options.city}%`);
    }
    
    if (options.zipCode) {
      query.where('properties.zipCode', options.zipCode);
    }

    const result = await query.first();
    return result || null;
  }

  private async createCustomerFromPhone(options: CustomerMatchOptions): Promise<Customer> {
    const knex = DatabaseService.getInstance();
    const customerId = this.generateId();
    
    // Try to extract name from options or use default
    const nameParts = options.name ? options.name.split(' ') : ['Unknown', 'Customer'];
    const firstName = nameParts[0] || 'Unknown';
    const lastName = nameParts.slice(1).join(' ') || 'Customer';

    const newCustomer: Omit<Customer, 'createdAt' | 'updatedAt'> = {
      id: customerId,
      firstName,
      lastName,
      email: options.email,
      phone: this.normalizePhoneNumber(options.phoneNumber),
      isActive: true,
      businessName: undefined,
      contactTitle: undefined,
      alternatePhone: undefined,
      address: undefined,
      city: undefined,
      state: undefined,
      zipCode: undefined,
      notes: 'Customer created automatically from Google Voice message',
      accessInstructions: undefined,
      emergencyServiceApproved: false,
      creditLimit: undefined,
      creditStatus: 'good',
      customerType: 'residential',
      preferences: undefined,
      latitude: undefined,
      longitude: undefined,
      loyaltyPoints: 0,
      lastServiceDate: undefined
    };

    await knex('customers').insert({
      ...newCustomer,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    logger.info('Created new customer from phone number', {
      customerId,
      phone: options.phoneNumber,
      name: options.name
    });

    return {
      ...newCustomer,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  private async findActiveConversation(
    customerId: string, 
    phoneNumber: string, 
    platform: string
  ): Promise<Conversation | null> {
    const knex = DatabaseService.getInstance();
    
    const conversation = await knex('conversations')
      .where('customerId', customerId)
      .where('phoneNumber', phoneNumber)
      .where('platform', platform)
      .where('status', 'active')
      .orderBy('lastMessageAt', 'desc')
      .first();

    return conversation || null;
  }

  private async findRecentInactiveConversation(
    customerId: string, 
    phoneNumber: string
  ): Promise<Conversation | null> {
    const knex = DatabaseService.getInstance();
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const conversation = await knex('conversations')
      .where('customerId', customerId)
      .where('phoneNumber', phoneNumber)
      .where('status', 'resolved')
      .where('lastMessageAt', '>', oneDayAgo)
      .orderBy('lastMessageAt', 'desc')
      .first();

    return conversation || null;
  }

  private shouldResumeConversation(conversation: Conversation, messageContent?: string): boolean {
    // Resume if it's within 24 hours and contains follow-up indicators
    const timeSinceLastMessage = Date.now() - new Date(conversation.lastMessageAt).getTime();
    const isRecent = timeSinceLastMessage < (24 * 60 * 60 * 1000); // 24 hours

    if (!isRecent) return false;

    // Check for follow-up keywords
    if (messageContent) {
      const followUpKeywords = [
        'follow up', 'followup', 'update', 'still', 'yet', 'same issue',
        'problem', 'not fixed', 'still broken', 'again', 'back'
      ];
      
      const lowerContent = messageContent.toLowerCase();
      return followUpKeywords.some(keyword => lowerContent.includes(keyword));
    }

    return true; // Resume recent conversations by default
  }

  private async checkForConversationMerging(
    customerId: string, 
    phoneNumber: string
  ): Promise<{
    shouldMerge: boolean;
    targetConversation?: Conversation;
    conversationsToMerge: string[];
  }> {
    const knex = DatabaseService.getInstance();
    
    // Find multiple conversations with same customer/phone in last 7 days
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const duplicateConversations = await knex('conversations')
      .where('customerId', customerId)
      .where('phoneNumber', phoneNumber)
      .where('createdAt', '>', weekAgo)
      .orderBy('lastMessageAt', 'desc');

    if (duplicateConversations.length > 1) {
      return {
        shouldMerge: true,
        targetConversation: duplicateConversations[0],
        conversationsToMerge: duplicateConversations.slice(1).map((c: any) => c.id)
      };
    }

    return {
      shouldMerge: false,
      conversationsToMerge: []
    };
  }

  private async mergeConversations(conversationIds: string[], targetId: string): Promise<void> {
    const knex = DatabaseService.getInstance();
    
    // Move all messages to target conversation
    await knex('messages')
      .whereIn('conversationId', conversationIds)
      .update({ conversationId: targetId });

    // Move AI responses
    await knex('ai_responses')
      .whereIn('conversationId', conversationIds)
      .update({ conversationId: targetId });

    // Archive old conversations
    await knex('conversations')
      .whereIn('id', conversationIds)
      .update({ 
        status: 'archived',
        updatedAt: new Date()
      });

    logger.info('Merged conversations', {
      targetId,
      mergedIds: conversationIds
    });
  }

  private async createNewConversation(options: ConversationThreadOptions): Promise<Conversation> {
    const knex = DatabaseService.getInstance();
    const conversationId = this.generateId();
    
    const priority = options.priority || this.determinePriorityFromMessage(options.messageContent);
    const isEmergency = priority === 'emergency';

    const newConversation = {
      id: conversationId,
      customerId: options.customerId,
      phoneNumber: this.normalizePhoneNumber(options.phoneNumber),
      platform: options.platform,
      status: 'active',
      priority,
      lastMessageAt: new Date(),
      googleThreadId: options.threadId,
      channel: options.platform === 'google_voice' ? 'sms' : options.platform,
      isEmergency,
      originalPhoneNumber: options.phoneNumber,
      followUpRequired: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await knex('conversations').insert(newConversation);

    logger.info('Created new conversation thread', {
      conversationId,
      customerId: options.customerId,
      platform: options.platform,
      priority
    });

    return newConversation as Conversation;
  }

  private detectFollowUpPattern(recentMessages: any[], newContent: string): boolean {
    if (recentMessages.length === 0) return false;

    const followUpKeywords = [
      'follow up', 'followup', 'update', 'status', 'still waiting',
      'any update', 'what about', 'regarding', 'about my', 'my issue'
    ];

    const lowerContent = newContent.toLowerCase();
    return followUpKeywords.some(keyword => lowerContent.includes(keyword));
  }

  private async findRelatedJob(conversationId: string, messageContent: string): Promise<string | undefined> {
    const knex = DatabaseService.getInstance();
    
    // Look for jobs related to this conversation
    const jobs = await knex('jobs')
      .where('conversationId', conversationId)
      .whereIn('status', ['quoted', 'approved', 'scheduled', 'in_progress'])
      .orderBy('createdAt', 'desc');

    if (jobs.length > 0) {
      return jobs[0].id;
    }

    // Try to find jobs by matching keywords
    const serviceKeywords = this.extractServiceKeywords(messageContent);
    if (serviceKeywords.length > 0) {
      const conversation = await knex('conversations').where('id', conversationId).first();
      if (conversation) {
        const relatedJobs = await knex('jobs')
          .where('customerId', conversation.customerId)
          .whereIn('status', ['quoted', 'approved', 'scheduled', 'in_progress'])
          .limit(1);

        return relatedJobs[0]?.id;
      }
    }

    return undefined;
  }

  private determinePriority(messageContent: string, recentMessages: any[]): 'low' | 'medium' | 'high' | 'emergency' {
    const lowerContent = messageContent.toLowerCase();

    // Emergency keywords
    const emergencyKeywords = [
      'emergency', 'urgent', 'flooding', 'burst pipe', 'no water',
      'sewage backup', 'gas leak', 'water everywhere', 'help asap'
    ];

    if (emergencyKeywords.some(keyword => lowerContent.includes(keyword))) {
      return 'emergency';
    }

    // High priority keywords
    const highPriorityKeywords = [
      'asap', 'today', 'right away', 'immediately', 'cannot wait',
      'broken', 'not working', 'stopped working'
    ];

    if (highPriorityKeywords.some(keyword => lowerContent.includes(keyword))) {
      return 'high';
    }

    // Check if it's a follow-up to high priority conversation
    const hasRecentHighPriority = recentMessages.some(msg => 
      msg.extractedInfo?.priority === 'high' || msg.extractedInfo?.priority === 'emergency'
    );

    if (hasRecentHighPriority) {
      return 'high';
    }

    return 'medium';
  }

  private determinePriorityFromMessage(messageContent?: string): 'low' | 'medium' | 'high' | 'emergency' {
    if (!messageContent) return 'medium';
    return this.determinePriority(messageContent, []);
  }

  private extractTags(messageContent: string): string[] {
    const tags: string[] = [];
    const lowerContent = messageContent.toLowerCase();

    // Service type tags
    const serviceTypes = [
      'drain', 'faucet', 'toilet', 'pipe', 'water heater', 'sink',
      'shower', 'bathtub', 'garbage disposal', 'sump pump'
    ];

    serviceTypes.forEach(service => {
      if (lowerContent.includes(service)) {
        tags.push(service.replace(' ', '_'));
      }
    });

    // Problem type tags
    const problemTypes = [
      'leak', 'clog', 'backup', 'broken', 'repair', 'install', 'replace'
    ];

    problemTypes.forEach(problem => {
      if (lowerContent.includes(problem)) {
        tags.push(problem);
      }
    });

    return tags;
  }

  private detectEmergencyKeywords(messageContent: string): string[] {
    const emergencyKeywords = [
      'emergency', 'urgent', 'flooding', 'burst pipe', 'no water',
      'sewage backup', 'gas leak', 'water everywhere', 'help asap'
    ];

    const lowerContent = messageContent.toLowerCase();
    return emergencyKeywords.filter(keyword => lowerContent.includes(keyword));
  }

  private extractServiceKeywords(messageContent: string): string[] {
    const serviceKeywords = [
      'plumbing', 'drain', 'faucet', 'toilet', 'pipe', 'water heater',
      'sink', 'shower', 'bathtub', 'leak', 'clog', 'repair', 'install'
    ];

    const lowerContent = messageContent.toLowerCase();
    return serviceKeywords.filter(keyword => lowerContent.includes(keyword));
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

  private generateId(): string {
    return `cust_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

export default CustomerMatchingService;