import { DatabaseService } from './DatabaseService';
import { logger } from '../utils/logger';
import { Customer } from '../../shared/types';

export interface AdvancedMatchOptions {
  phoneNumber?: string;
  email?: string;
  name?: string;
  address?: string;
  city?: string;
  zipCode?: string;
  businessName?: string;
  enableFuzzyMatching?: boolean;
  similarityThreshold?: number;
  maxResults?: number;
  includeInactive?: boolean;
  boostFactors?: BoostFactors;
}

export interface BoostFactors {
  phoneMatch?: number;
  emailMatch?: number;
  nameMatch?: number;
  addressMatch?: number;
  businessMatch?: number;
  recentActivity?: number;
  highValue?: number;
}

export interface MatchCandidate {
  customer: Customer;
  matchScore: number;
  matchReasons: MatchReason[];
  confidence: number;
  similarityBreakdown: SimilarityBreakdown;
  riskFactors: RiskFactor[];
  recommendedAction: 'merge' | 'link' | 'separate' | 'review';
}

export interface MatchReason {
  field: string;
  similarity: number;
  exact: boolean;
  weight: number;
  evidence: string;
}

export interface SimilarityBreakdown {
  phoneScore: number;
  emailScore: number;
  nameScore: number;
  addressScore: number;
  businessScore: number;
  behavioralScore: number;
  temporalScore: number;
}

export interface RiskFactor {
  type: 'potential_duplicate' | 'data_conflict' | 'suspicious_pattern' | 'low_confidence';
  severity: 'low' | 'medium' | 'high';
  description: string;
  impact: string;
}

export interface CustomerRelationship {
  id: string;
  primaryCustomerId: string;
  relatedCustomerId: string;
  relationshipType: 'family' | 'business' | 'property_manager' | 'tenant' | 'spouse' | 'employee' | 'contact';
  confidence: number;
  establishedDate: Date;
  evidence: RelationshipEvidence[];
  isActive: boolean;
}

export interface RelationshipEvidence {
  type: 'shared_address' | 'shared_phone' | 'shared_property' | 'similar_name' | 'communication_pattern' | 'business_connection';
  strength: number;
  details: string;
  discoveredDate: Date;
}

export interface DeduplicationCandidate {
  customer1: Customer;
  customer2: Customer;
  mergeScore: number;
  conflictFields: ConflictField[];
  proposedResolution: MergeProposal;
  riskAssessment: DeduplicationRisk;
}

export interface ConflictField {
  fieldName: string;
  value1: any;
  value2: any;
  importance: 'critical' | 'high' | 'medium' | 'low';
  resolutionStrategy: 'keep_newer' | 'keep_more_complete' | 'manual_review' | 'combine';
  confidence: number;
}

export interface MergeProposal {
  primaryCustomer: Customer;
  fieldsToUpdate: Record<string, any>;
  dataToMigrate: MigrationPlan[];
  backupRequired: boolean;
  manualReviewRequired: boolean;
}

export interface MigrationPlan {
  table: string;
  recordCount: number;
  strategy: 'update_reference' | 'merge_records' | 'preserve_both';
  potentialConflicts: string[];
}

interface DeduplicationRisk {
  overallRisk: 'low' | 'medium' | 'high';
  dataLossRisk: number;
  businessImpactRisk: number;
  reversibilityScore: number; // 0-1, how easily the merge can be undone
  recommendations: string[];
}

export class AdvancedCustomerMatchingService {
  private readonly defaultSimilarityThreshold = 0.7;
  private readonly defaultMaxResults = 10;
  private readonly fuzzyMatchingWeights = {
    phone: 0.25,
    email: 0.2,
    name: 0.2,
    address: 0.15,
    business: 0.1,
    behavioral: 0.05,
    temporal: 0.05
  };

  constructor(private db: DatabaseService) {}

  /**
   * Advanced multi-vector customer matching
   */
  async findMatches(options: AdvancedMatchOptions): Promise<MatchCandidate[]> {
    try {
      const startTime = Date.now();
      
      logger.info('Starting advanced customer matching', {
        hasPhone: !!options.phoneNumber,
        hasEmail: !!options.email,
        hasName: !!options.name,
        fuzzyEnabled: options.enableFuzzyMatching
      });

      // 1. Get potential candidates using broad search
      const candidates = await this.getCandidateCustomers(options);
      
      if (candidates.length === 0) {
        return [];
      }

      // 2. Calculate similarity scores for each candidate
      const scoredCandidates = await Promise.all(
        candidates.map(customer => this.calculateMatchScore(customer, options))
      );

      // 3. Filter by similarity threshold
      const threshold = options.similarityThreshold || this.defaultSimilarityThreshold;
      const filteredCandidates = scoredCandidates.filter(
        candidate => candidate.matchScore >= threshold
      );

      // 4. Sort by match score (highest first)
      filteredCandidates.sort((a, b) => b.matchScore - a.matchScore);

      // 5. Limit results
      const maxResults = options.maxResults || this.defaultMaxResults;
      const results = filteredCandidates.slice(0, maxResults);

      const processingTime = Date.now() - startTime;
      
      logger.info('Advanced customer matching completed', {
        candidatesFound: candidates.length,
        matchesFound: results.length,
        processingTimeMs: processingTime
      });

      return results;

    } catch (error) {
      logger.error('Advanced customer matching failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Detect and analyze customer relationships
   */
  async detectRelationships(customerId: string): Promise<CustomerRelationship[]> {
    try {
      const knex = await this.db.getKnex();
      
      // Get the target customer
      const customer = await knex('customers').where('id', customerId).first();
      if (!customer) {
        throw new Error('Customer not found');
      }

      const relationships: CustomerRelationship[] = [];

      // 1. Find customers with shared addresses
      if (customer.address) {
        const sharedAddressCustomers = await knex('customers')
          .where('address', customer.address)
          .where('id', '!=', customerId)
          .where('isActive', true);

        for (const relatedCustomer of sharedAddressCustomers) {
          const relationship = await this.analyzeAddressRelationship(customer, relatedCustomer);
          if (relationship) {
            relationships.push(relationship);
          }
        }
      }

      // 2. Find customers with shared phone numbers
      if (customer.phone || customer.alternatePhone) {
        const phones = [customer.phone, customer.alternatePhone].filter(Boolean);
        
        for (const phone of phones) {
          const sharedPhoneCustomers = await knex('customers')
            .where(function() {
              this.where('phone', phone).orWhere('alternatePhone', phone);
            })
            .where('id', '!=', customerId)
            .where('isActive', true);

          for (const relatedCustomer of sharedPhoneCustomers) {
            const relationship = await this.analyzePhoneRelationship(customer, relatedCustomer);
            if (relationship) {
              relationships.push(relationship);
            }
          }
        }
      }

      // 3. Find customers with similar names (potential family members)
      if (customer.lastName) {
        const similarNameCustomers = await knex('customers')
          .where('lastName', customer.lastName)
          .where('id', '!=', customerId)
          .where('isActive', true);

        for (const relatedCustomer of similarNameCustomers) {
          const relationship = await this.analyzeNameRelationship(customer, relatedCustomer);
          if (relationship) {
            relationships.push(relationship);
          }
        }
      }

      // 4. Find business relationships
      if (customer.businessName) {
        const businessCustomers = await knex('customers')
          .where('businessName', customer.businessName)
          .where('id', '!=', customerId)
          .where('isActive', true);

        for (const relatedCustomer of businessCustomers) {
          const relationship = await this.analyzeBusinessRelationship(customer, relatedCustomer);
          if (relationship) {
            relationships.push(relationship);
          }
        }
      }

      // 5. Analyze communication patterns
      const communicationRelationships = await this.analyzeCommunicationPatterns(customer);
      relationships.push(...communicationRelationships);

      // 6. Remove duplicates and merge similar relationships
      const uniqueRelationships = this.deduplicateRelationships(relationships);

      logger.info('Relationship detection completed', {
        customerId,
        relationshipsFound: uniqueRelationships.length
      });

      return uniqueRelationships;

    } catch (error) {
      logger.error('Relationship detection failed', {
        customerId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Find potential duplicate customers for deduplication
   */
  async findDuplicates(options?: {
    similarityThreshold?: number;
    includeResolved?: boolean;
    focusCustomerId?: string;
  }): Promise<DeduplicationCandidate[]> {
    try {
      const threshold = options?.similarityThreshold || 0.85; // Higher threshold for duplicates
      const knex = await this.db.getKnex();

      logger.info('Starting duplicate detection', { threshold });

      // Get all active customers (or specific customer if focused)
      let query = knex('customers').where('isActive', true);
      
      if (options?.focusCustomerId) {
        query = query.where('id', options.focusCustomerId);
      }

      const customers = await query;
      const duplicateCandidates: DeduplicationCandidate[] = [];

      // Compare each customer with others
      for (let i = 0; i < customers.length; i++) {
        const customer1 = customers[i];
        
        // Find potential matches for this customer
        const matches = await this.findMatches({
          phoneNumber: customer1.phone,
          email: customer1.email,
          name: `${customer1.firstName} ${customer1.lastName}`,
          address: customer1.address,
          businessName: customer1.businessName,
          enableFuzzyMatching: true,
          similarityThreshold: threshold,
          maxResults: 20
        });

        for (const match of matches) {
          const customer2 = match.customer;
          
          // Skip if same customer or already processed this pair
          if (customer1.id === customer2.id) continue;
          
          // Skip if this pair was already analyzed (avoid duplicates)
          const alreadyAnalyzed = duplicateCandidates.some(candidate => 
            (candidate.customer1.id === customer1.id && candidate.customer2.id === customer2.id) ||
            (candidate.customer1.id === customer2.id && candidate.customer2.id === customer1.id)
          );
          
          if (alreadyAnalyzed) continue;

          // Analyze this potential duplicate pair
          const duplicateCandidate = await this.analyzeDuplicateCandidate(customer1, customer2, match);
          
          if (duplicateCandidate.mergeScore >= threshold) {
            duplicateCandidates.push(duplicateCandidate);
          }
        }
      }

      // Sort by merge score (highest first)
      duplicateCandidates.sort((a, b) => b.mergeScore - a.mergeScore);

      logger.info('Duplicate detection completed', {
        candidatesFound: duplicateCandidates.length
      });

      return duplicateCandidates;

    } catch (error) {
      logger.error('Duplicate detection failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Execute customer merge with conflict resolution
   */
  async mergeCustomers(
    mergeProposal: MergeProposal,
    overrides?: Record<string, any>
  ): Promise<{
    success: boolean;
    mergedCustomerId: string;
    backupId?: string;
    conflicts?: ConflictField[];
    warnings?: string[];
  }> {
    
    const knex = await this.db.getKnex();
    const transaction = await knex.transaction();
    
    try {
      const primaryCustomer = mergeProposal.primaryCustomer;
      let backupId: string | undefined;
      const warnings: string[] = [];

      // 1. Create backup if required
      if (mergeProposal.backupRequired) {
        backupId = await this.createCustomerBackup(primaryCustomer, transaction);
      }

      // 2. Apply field updates with overrides
      const finalUpdates = { ...mergeProposal.fieldsToUpdate, ...overrides };
      
      if (Object.keys(finalUpdates).length > 0) {
        await transaction('customers')
          .where('id', primaryCustomer.id)
          .update({
            ...finalUpdates,
            updatedAt: new Date()
          });
      }

      // 3. Execute data migration
      for (const migration of mergeProposal.dataToMigrate) {
        await this.executeMigration(migration, primaryCustomer.id, transaction);
      }

      // 4. Handle remaining conflicts
      const unresolvedConflicts = await this.handleRemainingConflicts(
        mergeProposal,
        overrides,
        transaction
      );

      // 5. Update audit trail
      await this.logCustomerMerge(mergeProposal, finalUpdates, transaction);

      await transaction.commit();

      logger.info('Customer merge completed successfully', {
        primaryCustomerId: primaryCustomer.id,
        backupId,
        fieldsUpdated: Object.keys(finalUpdates).length,
        migrationsExecuted: mergeProposal.dataToMigrate.length
      });

      return {
        success: true,
        mergedCustomerId: primaryCustomer.id,
        backupId,
        conflicts: unresolvedConflicts,
        warnings
      };

    } catch (error) {
      await transaction.rollback();
      
      logger.error('Customer merge failed', {
        primaryCustomerId: mergeProposal.primaryCustomer.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      return {
        success: false,
        mergedCustomerId: mergeProposal.primaryCustomer.id,
        conflicts: [],
        warnings: ['Merge operation failed and was rolled back']
      };
    }
  }

  // Private helper methods

  private async getCandidateCustomers(options: AdvancedMatchOptions): Promise<Customer[]> {
    const knex = await this.db.getKnex();
    let query = knex('customers');

    if (!options.includeInactive) {
      query = query.where('isActive', true);
    }

    // Build OR conditions for broad matching
    query = query.where(function() {
      let hasCondition = false;

      if (options.phoneNumber) {
        this.where('phone', options.phoneNumber)
            .orWhere('alternatePhone', options.phoneNumber);
        hasCondition = true;
      }

      if (options.email) {
        if (hasCondition) this.orWhere('email', 'like', `%${options.email}%`);
        else this.where('email', 'like', `%${options.email}%`);
        hasCondition = true;
      }

      if (options.name) {
        const nameParts = options.name.split(' ');
        if (nameParts.length >= 2) {
          const firstName = nameParts[0];
          const lastName = nameParts[nameParts.length - 1];
          
          if (hasCondition) {
            this.orWhere(function() {
              this.where('firstName', 'like', `%${firstName}%`)
                  .where('lastName', 'like', `%${lastName}%`);
            });
          } else {
            this.where('firstName', 'like', `%${firstName}%`)
                .where('lastName', 'like', `%${lastName}%`);
          }
          hasCondition = true;
        }
      }

      if (options.address) {
        if (hasCondition) this.orWhere('address', 'like', `%${options.address}%`);
        else this.where('address', 'like', `%${options.address}%`);
        hasCondition = true;
      }

      if (options.businessName) {
        if (hasCondition) this.orWhere('businessName', 'like', `%${options.businessName}%`);
        else this.where('businessName', 'like', `%${options.businessName}%`);
        hasCondition = true;
      }

      // If no conditions were added, match all (shouldn't happen in practice)
      if (!hasCondition) {
        this.where('id', '!=', '');
      }
    });

    return await query.limit(1000); // Reasonable limit for processing
  }

  private async calculateMatchScore(
    customer: Customer,
    options: AdvancedMatchOptions
  ): Promise<MatchCandidate> {
    
    const matchReasons: MatchReason[] = [];
    const similarityBreakdown: SimilarityBreakdown = {
      phoneScore: 0,
      emailScore: 0,
      nameScore: 0,
      addressScore: 0,
      businessScore: 0,
      behavioralScore: 0,
      temporalScore: 0
    };

    // Calculate phone similarity
    if (options.phoneNumber) {
      const phoneScore = this.calculatePhoneSimilarity(options.phoneNumber, customer);
      similarityBreakdown.phoneScore = phoneScore;
      
      if (phoneScore > 0) {
        matchReasons.push({
          field: 'phone',
          similarity: phoneScore,
          exact: phoneScore === 1.0,
          weight: this.fuzzyMatchingWeights.phone,
          evidence: `Phone: ${options.phoneNumber} matches ${customer.phone || customer.alternatePhone}`
        });
      }
    }

    // Calculate email similarity
    if (options.email && customer.email) {
      const emailScore = this.calculateEmailSimilarity(options.email, customer.email);
      similarityBreakdown.emailScore = emailScore;
      
      if (emailScore > 0) {
        matchReasons.push({
          field: 'email',
          similarity: emailScore,
          exact: emailScore === 1.0,
          weight: this.fuzzyMatchingWeights.email,
          evidence: `Email: ${options.email} matches ${customer.email}`
        });
      }
    }

    // Calculate name similarity
    if (options.name) {
      const nameScore = this.calculateNameSimilarity(options.name, customer);
      similarityBreakdown.nameScore = nameScore;
      
      if (nameScore > 0) {
        matchReasons.push({
          field: 'name',
          similarity: nameScore,
          exact: nameScore === 1.0,
          weight: this.fuzzyMatchingWeights.name,
          evidence: `Name: ${options.name} matches ${customer.firstName} ${customer.lastName}`
        });
      }
    }

    // Calculate address similarity
    if (options.address && customer.address) {
      const addressScore = this.calculateAddressSimilarity(options.address, customer.address);
      similarityBreakdown.addressScore = addressScore;
      
      if (addressScore > 0) {
        matchReasons.push({
          field: 'address',
          similarity: addressScore,
          exact: addressScore === 1.0,
          weight: this.fuzzyMatchingWeights.address,
          evidence: `Address: ${options.address} matches ${customer.address}`
        });
      }
    }

    // Calculate business similarity
    if (options.businessName && customer.businessName) {
      const businessScore = this.calculateBusinessSimilarity(options.businessName, customer.businessName);
      similarityBreakdown.businessScore = businessScore;
      
      if (businessScore > 0) {
        matchReasons.push({
          field: 'business',
          similarity: businessScore,
          exact: businessScore === 1.0,
          weight: this.fuzzyMatchingWeights.business,
          evidence: `Business: ${options.businessName} matches ${customer.businessName}`
        });
      }
    }

    // Calculate behavioral similarity (based on service history, preferences, etc.)
    similarityBreakdown.behavioralScore = await this.calculateBehavioralSimilarity(customer, options);

    // Calculate temporal similarity (recent activity, timing patterns)
    similarityBreakdown.temporalScore = await this.calculateTemporalSimilarity(customer, options);

    // Calculate overall match score
    const matchScore = 
      similarityBreakdown.phoneScore * this.fuzzyMatchingWeights.phone +
      similarityBreakdown.emailScore * this.fuzzyMatchingWeights.email +
      similarityBreakdown.nameScore * this.fuzzyMatchingWeights.name +
      similarityBreakdown.addressScore * this.fuzzyMatchingWeights.address +
      similarityBreakdown.businessScore * this.fuzzyMatchingWeights.business +
      similarityBreakdown.behavioralScore * this.fuzzyMatchingWeights.behavioral +
      similarityBreakdown.temporalScore * this.fuzzyMatchingWeights.temporal;

    // Apply boost factors if provided
    let boostedScore = matchScore;
    if (options.boostFactors) {
      boostedScore = this.applyBoostFactors(matchScore, similarityBreakdown, options.boostFactors);
    }

    // Calculate confidence based on evidence strength
    const confidence = this.calculateMatchConfidence(matchReasons, similarityBreakdown);

    // Identify risk factors
    const riskFactors = this.identifyRiskFactors(customer, matchReasons, similarityBreakdown);

    // Determine recommended action
    const recommendedAction = this.determineRecommendedAction(boostedScore, confidence, riskFactors);

    return {
      customer,
      matchScore: Math.min(1.0, boostedScore),
      matchReasons,
      confidence,
      similarityBreakdown,
      riskFactors,
      recommendedAction
    };
  }

  // String similarity calculation methods
  private calculatePhoneSimilarity(phone1: string, customer: Customer): number {
    const normalizePhone = (phone: string) => phone.replace(/\D/g, '');
    
    const normalized1 = normalizePhone(phone1);
    const normalized2 = normalizePhone(customer.phone || '');
    const normalizedAlt = normalizePhone(customer.alternatePhone || '');

    if (normalized1 === normalized2 || normalized1 === normalizedAlt) {
      return 1.0;
    }

    // Check for partial matches (last 7 digits for US numbers)
    if (normalized1.length >= 7 && normalized2.length >= 7) {
      const last7_1 = normalized1.slice(-7);
      const last7_2 = normalized2.slice(-7);
      if (last7_1 === last7_2) {
        return 0.9;
      }
    }

    if (normalized1.length >= 7 && normalizedAlt.length >= 7) {
      const last7_1 = normalized1.slice(-7);
      const last7_alt = normalizedAlt.slice(-7);
      if (last7_1 === last7_alt) {
        return 0.9;
      }
    }

    return 0;
  }

  private calculateEmailSimilarity(email1: string, email2: string): number {
    if (email1.toLowerCase() === email2.toLowerCase()) {
      return 1.0;
    }

    // Check if one email contains the other (for variations like john@domain vs john.doe@domain)
    const lower1 = email1.toLowerCase();
    const lower2 = email2.toLowerCase();
    
    if (lower1.includes(lower2) || lower2.includes(lower1)) {
      return 0.8;
    }

    // Check domain similarity
    const domain1 = email1.split('@')[1]?.toLowerCase();
    const domain2 = email2.split('@')[1]?.toLowerCase();
    
    if (domain1 && domain2 && domain1 === domain2) {
      // Same domain, check username similarity
      const user1 = email1.split('@')[0]?.toLowerCase();
      const user2 = email2.split('@')[0]?.toLowerCase();
      
      return this.calculateStringSimilarity(user1, user2) * 0.7; // Reduced score for same domain
    }

    return 0;
  }

  private calculateNameSimilarity(searchName: string, customer: Customer): number {
    const fullName = `${customer.firstName} ${customer.lastName}`.toLowerCase();
    const searchLower = searchName.toLowerCase();

    if (fullName === searchLower) {
      return 1.0;
    }

    // Check for exact first/last name matches
    const searchParts = searchLower.split(' ');
    const customerParts = fullName.split(' ');

    let exactMatches = 0;
    let partialMatches = 0;

    for (const searchPart of searchParts) {
      for (const customerPart of customerParts) {
        if (searchPart === customerPart) {
          exactMatches++;
          break;
        } else if (searchPart.includes(customerPart) || customerPart.includes(searchPart)) {
          partialMatches++;
        }
      }
    }

    const totalParts = Math.max(searchParts.length, customerParts.length);
    const exactScore = exactMatches / totalParts;
    const partialScore = partialMatches / totalParts * 0.7;

    return Math.min(1.0, exactScore + partialScore);
  }

  private calculateAddressSimilarity(address1: string, address2: string): number {
    const normalize = (addr: string) => addr.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    
    const norm1 = normalize(address1);
    const norm2 = normalize(address2);

    if (norm1 === norm2) {
      return 1.0;
    }

    // Check for substring matches
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      return 0.8;
    }

    // Use Levenshtein distance for fuzzy matching
    return this.calculateStringSimilarity(norm1, norm2);
  }

  private calculateBusinessSimilarity(business1: string, business2: string): number {
    const normalize = (name: string) => name.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    
    const norm1 = normalize(business1);
    const norm2 = normalize(business2);

    if (norm1 === norm2) {
      return 1.0;
    }

    return this.calculateStringSimilarity(norm1, norm2);
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    // Simple Levenshtein distance implementation
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) {
      matrix[0][i] = i;
    }

    for (let j = 0; j <= str2.length; j++) {
      matrix[j][0] = j;
    }

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }

    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1.0;
    
    return (maxLength - matrix[str2.length][str1.length]) / maxLength;
  }

  private async calculateBehavioralSimilarity(customer: Customer, options: AdvancedMatchOptions): Promise<number> {
    // This would analyze service history, preferences, communication patterns, etc.
    // For now, return a placeholder score
    return 0.5;
  }

  private async calculateTemporalSimilarity(customer: Customer, options: AdvancedMatchOptions): Promise<number> {
    // This would analyze timing patterns, recent activity, etc.
    // For now, return a placeholder score
    return 0.5;
  }

  private applyBoostFactors(
    baseScore: number,
    breakdown: SimilarityBreakdown,
    boostFactors: BoostFactors
  ): number {
    let boostedScore = baseScore;

    if (boostFactors.phoneMatch && breakdown.phoneScore > 0.8) {
      boostedScore += boostFactors.phoneMatch;
    }

    if (boostFactors.emailMatch && breakdown.emailScore > 0.8) {
      boostedScore += boostFactors.emailMatch;
    }

    if (boostFactors.nameMatch && breakdown.nameScore > 0.8) {
      boostedScore += boostFactors.nameMatch;
    }

    if (boostFactors.addressMatch && breakdown.addressScore > 0.8) {
      boostedScore += boostFactors.addressMatch;
    }

    if (boostFactors.businessMatch && breakdown.businessScore > 0.8) {
      boostedScore += boostFactors.businessMatch;
    }

    return boostedScore;
  }

  private calculateMatchConfidence(
    matchReasons: MatchReason[],
    similarityBreakdown: SimilarityBreakdown
  ): number {
    if (matchReasons.length === 0) {
      return 0.1;
    }

    // Higher confidence for exact matches and multiple evidence points
    const exactMatches = matchReasons.filter(r => r.exact).length;
    const totalMatches = matchReasons.length;
    
    let confidence = 0.5; // Base confidence
    confidence += (exactMatches / totalMatches) * 0.3; // Boost for exact matches
    confidence += Math.min(totalMatches / 5, 0.2); // Boost for multiple evidence points
    
    return Math.min(1.0, confidence);
  }

  private identifyRiskFactors(
    customer: Customer,
    matchReasons: MatchReason[],
    similarityBreakdown: SimilarityBreakdown
  ): RiskFactor[] {
    const risks: RiskFactor[] = [];

    // Check for potential duplicates
    if (similarityBreakdown.phoneScore > 0.9 && similarityBreakdown.nameScore > 0.8) {
      risks.push({
        type: 'potential_duplicate',
        severity: 'high',
        description: 'High similarity across multiple fields suggests potential duplicate',
        impact: 'May need deduplication review'
      });
    }

    // Check for data conflicts
    if (matchReasons.some(r => r.similarity > 0.5 && r.similarity < 0.9)) {
      risks.push({
        type: 'data_conflict',
        severity: 'medium',
        description: 'Partial matches may indicate data quality issues',
        impact: 'May require data verification'
      });
    }

    // Check for low confidence matches
    const avgConfidence = matchReasons.reduce((sum, r) => sum + r.similarity, 0) / matchReasons.length;
    if (avgConfidence < 0.7) {
      risks.push({
        type: 'low_confidence',
        severity: 'low',
        description: 'Match confidence is below recommended threshold',
        impact: 'May need manual verification'
      });
    }

    return risks;
  }

  private determineRecommendedAction(
    matchScore: number,
    confidence: number,
    riskFactors: RiskFactor[]
  ): 'merge' | 'link' | 'separate' | 'review' {
    
    const highRiskFactors = riskFactors.filter(r => r.severity === 'high').length;
    
    if (matchScore > 0.9 && confidence > 0.8 && highRiskFactors === 0) {
      return 'merge';
    } else if (matchScore > 0.7 && confidence > 0.6) {
      return 'link';
    } else if (matchScore < 0.4) {
      return 'separate';
    } else {
      return 'review';
    }
  }

  // Relationship analysis methods (simplified implementations)
  private async analyzeAddressRelationship(customer1: Customer, customer2: Customer): Promise<CustomerRelationship | null> {
    // Implementation would analyze shared address relationships
    return null; // Placeholder
  }

  private async analyzePhoneRelationship(customer1: Customer, customer2: Customer): Promise<CustomerRelationship | null> {
    // Implementation would analyze shared phone relationships
    return null; // Placeholder
  }

  private async analyzeNameRelationship(customer1: Customer, customer2: Customer): Promise<CustomerRelationship | null> {
    // Implementation would analyze name-based relationships (family, etc.)
    return null; // Placeholder
  }

  private async analyzeBusinessRelationship(customer1: Customer, customer2: Customer): Promise<CustomerRelationship | null> {
    // Implementation would analyze business relationships
    return null; // Placeholder
  }

  private async analyzeCommunicationPatterns(customer: Customer): Promise<CustomerRelationship[]> {
    // Implementation would analyze communication patterns for relationships
    return []; // Placeholder
  }

  private deduplicateRelationships(relationships: CustomerRelationship[]): CustomerRelationship[] {
    // Implementation would remove duplicate relationships
    return relationships; // Placeholder
  }

  private async analyzeDuplicateCandidate(
    customer1: Customer,
    customer2: Customer,
    matchCandidate: MatchCandidate
  ): Promise<DeduplicationCandidate> {
    // Implementation would analyze potential duplicates and create merge proposals
    return {
      customer1,
      customer2,
      mergeScore: matchCandidate.matchScore,
      conflictFields: [],
      proposedResolution: {
        primaryCustomer: customer1,
        fieldsToUpdate: {},
        dataToMigrate: [],
        backupRequired: true,
        manualReviewRequired: true
      },
      riskAssessment: {
        overallRisk: 'medium',
        dataLossRisk: 0.2,
        businessImpactRisk: 0.3,
        reversibilityScore: 0.8,
        recommendations: ['Manual review recommended']
      }
    };
  }

  // Merge execution methods (simplified implementations)
  private async createCustomerBackup(customer: Customer, transaction: any): Promise<string> {
    // Implementation would create customer backup
    return 'backup_' + Date.now();
  }

  private async executeMigration(migration: MigrationPlan, customerId: string, transaction: any): Promise<void> {
    // Implementation would execute data migration
  }

  private async handleRemainingConflicts(
    proposal: MergeProposal,
    overrides: Record<string, any> | undefined,
    transaction: any
  ): Promise<ConflictField[]> {
    // Implementation would handle remaining conflicts
    return [];
  }

  private async logCustomerMerge(
    proposal: MergeProposal,
    updates: Record<string, any>,
    transaction: any
  ): Promise<void> {
    // Implementation would log merge operation for audit trail
  }
}

export default AdvancedCustomerMatchingService;