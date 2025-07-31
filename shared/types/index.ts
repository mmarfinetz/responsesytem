// Shared TypeScript types for plumbing business AI system

export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  notes?: string;
  isActive: boolean;
  // Enhanced fields
  businessName?: string;
  contactTitle?: string;
  alternatePhone?: string;
  accessInstructions?: string;
  emergencyServiceApproved: boolean;
  creditLimit?: number;
  creditStatus: 'good' | 'hold' | 'cod_only';
  customerType: 'residential' | 'commercial' | 'property_manager';
  preferences?: Record<string, any>;
  latitude?: number;
  longitude?: number;
  loyaltyPoints: number;
  lastServiceDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Property {
  id: string;
  customerId: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  propertyType: 'residential' | 'commercial' | 'industrial';
  notes?: string;
  isActive: boolean;
  // Enhanced fields
  yearBuilt?: number;
  squareFootage?: number;
  bathrooms?: number;
  floors?: number;
  hasBasement: boolean;
  hasCrawlspace: boolean;
  hasAttic: boolean;
  waterHeaterType?: 'gas' | 'electric' | 'tankless' | 'solar' | 'hybrid';
  waterHeaterAge?: number;
  pipeType?: 'copper' | 'pvc' | 'pex' | 'galvanized' | 'mixed';
  septicSystem: boolean;
  accessInstructions?: string;
  equipmentInfo?: Record<string, any>;
  latitude?: number;
  longitude?: number;
  requiresPermits: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Conversation {
  id: string;
  customerId?: string;
  phoneNumber: string;
  platform: 'google_voice' | 'sms' | 'email' | 'web_chat';
  status: 'active' | 'resolved' | 'archived';
  priority: 'low' | 'medium' | 'high' | 'emergency';
  summary?: string;
  lastMessageAt: Date;
  // Enhanced fields
  assignedTo?: string;
  channel: 'voice' | 'sms' | 'email' | 'web_chat' | 'in_person';
  isEmergency: boolean;
  firstResponseAt?: Date;
  resolvedAt?: Date;
  responseTimeMinutes?: number;
  routingInfo?: Record<string, any>;
  originalPhoneNumber?: string;
  followUpRequired: boolean;
  followUpAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  direction: 'inbound' | 'outbound';
  content: string;
  messageType: 'text' | 'voice' | 'image' | 'video' | 'file';
  platform: 'google_voice' | 'sms' | 'email' | 'web_chat';
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  metadata?: Record<string, any>;
  sentAt: Date;
  // Enhanced fields
  originalContent?: string;
  attachments?: Record<string, any>;
  containsEmergencyKeywords: boolean;
  extractedInfo?: Record<string, any>;
  sentimentScore?: number;
  requiresHumanReview: boolean;
  processedBy?: string;
  processingTimeSeconds?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Job {
  id: string;
  customerId: string;
  propertyId?: string;
  conversationId?: string;
  title: string;
  description: string;
  serviceType: ServiceType;
  status: JobStatus;
  priority: 'low' | 'medium' | 'high' | 'emergency';
  scheduledAt?: Date;
  completedAt?: Date;
  estimatedDuration?: number; // in minutes
  actualDuration?: number; // in minutes
  notes?: string;
  // Enhanced fields
  assignedTechnician?: string;
  backupTechnician?: string;
  serviceCategory: 'emergency' | 'repair' | 'installation' | 'maintenance' | 'inspection' | 'consultation';
  requiresPermit: boolean;
  permitNumber?: string;
  permitAppliedAt?: Date;
  permitApprovedAt?: Date;
  requiredTools?: Record<string, any>;
  requiredParts?: Record<string, any>;
  travelDistance?: number;
  travelTime?: number;
  safetyNotes?: string;
  customerRequests?: string;
  accessType?: 'key' | 'lockbox' | 'customer_present' | 'gate_code' | 'other';
  followUpScheduled: boolean;
  followUpDate?: Date;
  beforePhotos?: Record<string, any>;
  afterPhotos?: Record<string, any>;
  customerSatisfactionRating?: number;
  customerFeedback?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type ServiceType = 
  | 'drain_cleaning'
  | 'pipe_repair'
  | 'faucet_repair'
  | 'toilet_repair'
  | 'water_heater'
  | 'emergency_plumbing'
  | 'installation'
  | 'inspection'
  | 'maintenance'
  | 'other';

export type JobStatus = 
  | 'inquiry'
  | 'quoted'
  | 'approved'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'on_hold';

export interface Quote {
  id: string;
  jobId: string;
  quoteNumber: string;
  status: 'draft' | 'sent' | 'approved' | 'rejected' | 'expired';
  subtotal: number;
  tax: number;
  total: number;
  validUntil: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuoteLineItem {
  id: string;
  quoteId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  itemType: 'labor' | 'parts' | 'materials' | 'fee';
  createdAt: Date;
}

export interface AIResponse {
  id: string;
  conversationId: string;
  messageId?: string;
  prompt: string;
  response: string;
  model: string;
  tokens: number;
  confidence?: number;
  intent?: string;
  entities?: Record<string, any>;
  approved: boolean;
  edited: boolean;
  finalResponse?: string;
  // Enhanced fields
  contextData?: Record<string, any>;
  editedResponse?: string;
  editedBy?: string;
  editedAt?: Date;
  markedForTraining: boolean;
  responseQuality?: 'excellent' | 'good' | 'fair' | 'poor';
  improvementNotes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Webhook {
  id: string;
  source: 'google_voice' | 'google_calendar' | 'stripe' | 'other';
  event: string;
  payload: Record<string, any>;
  processed: boolean;
  processedAt?: Date;
  error?: string;
  retryCount: number;
  createdAt: Date;
}

// API Request/Response types
export interface CreateCustomerRequest {
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  notes?: string;
}

export interface UpdateCustomerRequest extends Partial<CreateCustomerRequest> {
  isActive?: boolean;
}

export interface CreateJobRequest {
  customerId: string;
  propertyId?: string;
  conversationId?: string;
  title: string;
  description: string;
  serviceType: ServiceType;
  priority?: 'low' | 'medium' | 'high' | 'emergency';
  scheduledAt?: Date;
  estimatedDuration?: number;
  notes?: string;
}

export interface UpdateJobRequest extends Partial<CreateJobRequest> {
  status?: JobStatus;
  completedAt?: Date;
  actualDuration?: number;
}

export interface CreateQuoteRequest {
  jobId: string;
  validUntil: Date;
  notes?: string;
  lineItems: {
    description: string;
    quantity: number;
    unitPrice: number;
    itemType: 'labor' | 'parts' | 'materials' | 'fee';
  }[];
}

export interface GenerateAIResponseRequest {
  conversationId: string;
  messageContent: string;
  context?: {
    customerInfo?: Partial<Customer>;
    jobHistory?: Partial<Job>[];
    currentJob?: Partial<Job>;
    businessHours?: boolean;
    isEmergency?: boolean;
  };
}

export interface GenerateAIResponseResponse {
  response: string;
  intent: string;
  confidence: number;
  entities: Record<string, any>;
  suggestedActions: string[];
  followUpQuestions: string[];
}

// Analytics types
export interface BusinessMetrics {
  totalCustomers: number;
  activeJobs: number;
  pendingQuotes: number;
  monthlyRevenue: number;
  customerSatisfaction: number;
  averageResponseTime: number; // in minutes
  jobCompletionRate: number;
  conversionRate: number; // quotes to jobs
}

export interface ConversationMetrics {
  totalConversations: number;
  averageResponseTime: number;
  resolutionRate: number;
  customerSatisfactionScore: number;
  topIntents: Array<{ intent: string; count: number }>;
  busyHours: Array<{ hour: number; count: number }>;
}

// Google Voice API types
export interface GoogleVoiceMessage {
  id: string;
  threadId: string;
  text: string;
  timestamp: string;
  phoneNumber: string;
  direction: 'inbound' | 'outbound';
  type: 'sms' | 'mms' | 'voicemail';
  attachments?: Array<{
    url: string;
    mimeType: string;
    filename: string;
  }>;
}

export interface GoogleVoiceWebhookPayload {
  eventType: 'message.received' | 'message.sent' | 'call.received' | 'call.ended';
  timestamp: string;
  data: GoogleVoiceMessage | GoogleVoiceCall;
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
}

// Claude AI types
export interface ClaudeConversationContext {
  businessInfo: {
    name: string;
    phone: string;
    email: string;
    address: string;
    serviceArea: string;
    businessHours: string;
    emergencyAvailable: boolean;
  };
  customerInfo?: Partial<Customer>;
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>;
  currentJob?: Partial<Job>;
  recentJobs?: Partial<Job>[];
  serviceTypes: ServiceType[];
  pricingGuidelines?: Record<ServiceType, { min: number; max: number }>;
}

// Error types
export interface APIError {
  code: string;
  message: string;
  details?: any;
  timestamp: Date;
  path: string;
}

// Pagination types
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// Filter types
export interface CustomerFilters extends PaginationParams {
  isActive?: boolean;
  city?: string;
  state?: string;
  hasJobs?: boolean;
}

export interface JobFilters extends PaginationParams {
  status?: JobStatus;
  serviceType?: ServiceType;
  priority?: string;
  customerId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface ConversationFilters extends PaginationParams {
  status?: string;
  platform?: string;
  priority?: string;
  customerId?: string;
  hasUnread?: boolean;
}

// Business rules types
export interface BusinessHours {
  monday: { open: string; close: string; closed?: boolean };
  tuesday: { open: string; close: string; closed?: boolean };
  wednesday: { open: string; close: string; closed?: boolean };
  thursday: { open: string; close: string; closed?: boolean };
  friday: { open: string; close: string; closed?: boolean };
  saturday: { open: string; close: string; closed?: boolean };
  sunday: { open: string; close: string; closed?: boolean };
}

export interface ServiceAreaConfig {
  centerLatitude: number;
  centerLongitude: number;
  radiusMiles: number;
  emergencyRadiusMiles?: number;
  allowedZipCodes?: string[];
  excludedZipCodes?: string[];
}

export interface PricingRule {
  serviceType: ServiceType;
  basePrice: number;
  hourlyRate?: number;
  emergencyMultiplier?: number;
  afterHoursMultiplier?: number;
  minimumCharge?: number;
  travelFee?: number;
}

// ============================================================================
// NEW ENTITY TYPES
// ============================================================================

export interface Staff {
  id: string;
  userId: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: 'lead_technician' | 'technician' | 'apprentice' | 'dispatcher' | 'office_manager' | 'owner';
  status: 'active' | 'inactive' | 'on_leave' | 'terminated';
  hireDate: Date;
  terminationDate?: Date;
  certifications?: Record<string, any>;
  specialties?: Record<string, any>;
  serviceAreas?: Record<string, any>;
  onCallAvailable: boolean;
  emergencyTechnician: boolean;
  hourlyRate?: number;
  emergencyRate?: number;
  maxJobsPerDay: number;
  workSchedule?: Record<string, any>;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceHistory {
  id: string;
  customerId: string;
  propertyId: string;
  jobId: string;
  technician: string;
  serviceDate: Date;
  serviceType: ServiceType;
  workPerformed: string;
  partsUsed?: Record<string, any>;
  equipmentServiced?: Record<string, any>;
  laborHours: number;
  totalCost: number;
  warrantyCovered: boolean;
  recommendations?: string;
  beforeCondition?: Record<string, any>;
  afterCondition?: Record<string, any>;
  serviceOutcome: 'completed' | 'partial' | 'referred' | 'postponed';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Warranty {
  id: string;
  customerId: string;
  propertyId: string;
  serviceHistoryId: string;
  warrantyNumber: string;
  warrantyType: 'parts' | 'labor' | 'full_service';
  description: string;
  startDate: Date;
  endDate: Date;
  durationMonths: number;
  status: 'active' | 'expired' | 'claimed' | 'voided';
  termsAndConditions?: Record<string, any>;
  warrantyValue?: number;
  transferable: boolean;
  claimInstructions?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WarrantyClaim {
  id: string;
  warrantyId: string;
  customerId: string;
  jobId?: string;
  claimDate: Date;
  issueDescription: string;
  claimType: 'parts_failure' | 'labor_issue' | 'service_callback';
  status: 'submitted' | 'under_review' | 'approved' | 'denied' | 'completed';
  reviewedBy?: string;
  reviewedAt?: Date;
  reviewNotes?: string;
  claimAmount: number;
  coverageApproved: boolean;
  resolutionNotes?: string;
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface MaintenanceSchedule {
  id: string;
  customerId: string;
  propertyId: string;
  name: string;
  description: string;
  serviceType: 'drain_cleaning' | 'pipe_inspection' | 'water_heater_maintenance' | 'sump_pump_check' | 'general_inspection' | 'grease_trap_cleaning' | 'other';
  frequency: 'monthly' | 'quarterly' | 'semi_annual' | 'annual';
  nextServiceDate: Date;
  lastServiceDate?: Date;
  estimatedDuration: number;
  estimatedCost?: number;
  autoSchedule: boolean;
  advanceNotificationDays: number;
  status: 'active' | 'paused' | 'cancelled';
  preferredTechnician?: string;
  serviceNotes?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface BusinessConfig {
  id: string;
  key: string;
  value: Record<string, any>;
  description?: string;
  category: 'business_info' | 'service_hours' | 'pricing' | 'service_area' | 'emergency_settings' | 'ai_settings' | 'notification_settings' | 'integration_settings';
  isActive: boolean;
  lastModifiedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLog {
  id: string;
  tableName: string;
  recordId: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  changedBy?: string;
  changedAt: Date;
  changeReason?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Equipment {
  id: string;
  propertyId: string;
  equipmentType: 'water_heater' | 'sump_pump' | 'water_softener' | 'garbage_disposal' | 'toilet' | 'faucet' | 'shower' | 'bathtub' | 'laundry_connection' | 'dishwasher_connection' | 'other';
  brand?: string;
  model?: string;
  serialNumber?: string;
  installationDate?: Date;
  warrantyExpiration?: Date;
  ageYears?: number;
  condition: 'excellent' | 'good' | 'fair' | 'poor' | 'needs_replacement';
  location?: string;
  specifications?: Record<string, any>;
  maintenanceNotes?: string;
  lastServiceDate?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface EmergencyRouting {
  id: string;
  name: string;
  description?: string;
  conditions: Record<string, any>;
  primaryTechnician?: string;
  backupTechnician?: string;
  notificationList?: Record<string, any>;
  responseTimeMinutes: number;
  emergencyRate?: number;
  autoAssign: boolean;
  isActive: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

// Enhanced User interface to match staff management
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'technician' | 'dispatcher' | 'readonly';
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// ENHANCED REQUEST/RESPONSE TYPES
// ============================================================================

export interface CreateStaffRequest {
  userId: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: Staff['role'];
  hireDate: Date;
  certifications?: Record<string, any>;
  specialties?: Record<string, any>;
  serviceAreas?: Record<string, any>;
  onCallAvailable?: boolean;
  emergencyTechnician?: boolean;
  hourlyRate?: number;
  emergencyRate?: number;
  maxJobsPerDay?: number;
  workSchedule?: Record<string, any>;
  notes?: string;
}

export interface CreateMaintenanceScheduleRequest {
  customerId: string;
  propertyId: string;
  name: string;
  description: string;
  serviceType: MaintenanceSchedule['serviceType'];
  frequency: MaintenanceSchedule['frequency'];
  nextServiceDate: Date;
  estimatedDuration?: number;
  estimatedCost?: number;
  autoSchedule?: boolean;
  advanceNotificationDays?: number;
  preferredTechnician?: string;
  serviceNotes?: Record<string, any>;
}

export interface CreateWarrantyRequest {
  customerId: string;
  propertyId: string;
  serviceHistoryId: string;
  warrantyType: Warranty['warrantyType'];
  description: string;
  startDate: Date;
  durationMonths: number;
  termsAndConditions?: Record<string, any>;
  warrantyValue?: number;
  transferable?: boolean;
  claimInstructions?: string;
}

export interface CreateEquipmentRequest {
  propertyId: string;
  equipmentType: Equipment['equipmentType'];
  brand?: string;
  model?: string;
  serialNumber?: string;
  installationDate?: Date;
  warrantyExpiration?: Date;
  condition?: Equipment['condition'];
  location?: string;
  specifications?: Record<string, any>;
  maintenanceNotes?: string;
}

// ============================================================================
// ENHANCED ANALYTICS TYPES
// ============================================================================

export interface StaffPerformanceMetrics {
  staffId: string;
  staffName: string;
  jobsCompleted: number;
  averageJobDuration: number;
  customerSatisfactionAverage: number;
  revenue: number;
  utilizationRate: number;
  responseTime: number;
  warrantyClaims: number;
}

export interface ServiceTypeMetrics {
  serviceType: ServiceType;
  jobCount: number;
  averageCost: number;
  averageDuration: number;
  customerSatisfaction: number;
  warrantyClaimRate: number;
  conversionRate: number;
}

export interface GeographicMetrics {
  zipCode: string;
  customerCount: number;
  jobCount: number;
  revenue: number;
  averageResponseTime: number;
  serviceTypes: Array<{ type: ServiceType; count: number }>;
}

export interface WarrantyMetrics {
  totalActiveWarranties: number;
  expiringWarranties: number;
  warrantyClaims: number;
  claimRate: number;
  averageClaimAmount: number;
  topClaimReasons: Array<{ reason: string; count: number }>;
}