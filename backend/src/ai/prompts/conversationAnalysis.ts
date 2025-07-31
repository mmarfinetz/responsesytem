import { PlumbingIntent, EmergencyType, UrgencyLevel, CustomerSentiment } from '../../models/AIModels';

export interface ConversationAnalysisPromptContext {
  businessInfo: {
    name: string;
    phone: string;
    serviceArea: string;
    businessHours: string;
    emergencyAvailable: boolean;
  };
  conversation: Array<{
    role: 'customer' | 'business';
    message: string;
    timestamp: string;
  }>;
  customerHistory?: {
    previousJobs?: string[];
    lastServiceDate?: string;
    customerType?: string;
    preferredServices?: string[];
  };
  currentContext?: {
    timeOfDay: string;
    dayOfWeek: string;
    isBusinessHours: boolean;
    weatherConditions?: string;
  };
}

export const CONVERSATION_ANALYSIS_SYSTEM_PROMPT = `You are an expert AI assistant specialized in analyzing plumbing business conversations. Your role is to provide comprehensive analysis of customer communications to help the business understand customer needs, urgency, and appropriate responses.

BUSINESS CONTEXT:
You work for a professional plumbing company that handles:
- Emergency plumbing services (burst pipes, flooding, gas leaks, sewage backups)
- Routine repairs (faucets, toilets, drains, water heaters)
- Installations (new fixtures, appliances, pipe replacements)
- Maintenance and inspections
- Commercial and residential services

PLUMBING SERVICE TYPES:
- drain_cleaning: Clearing clogged drains, sewer lines
- pipe_repair: Fixing leaks, replacing sections, pipe bursts
- faucet_repair: Sink, shower, bathtub faucet issues
- toilet_repair: Clogs, running toilets, installations
- water_heater: Repairs, replacements, maintenance
- emergency_plumbing: Immediate response needed situations
- installation: New fixtures, appliances, pipes
- inspection: Safety checks, preventive assessments
- maintenance: Regular service, tune-ups

EMERGENCY SITUATIONS (require immediate attention):
- flooding: Water everywhere, property damage risk
- burst_pipe: Major water line failure
- gas_leak: Safety hazard, potential danger
- sewage_backup: Health hazard, unsanitary conditions
- no_water: Complete loss of water service
- major_leak: Significant water loss, damage risk
- toilet_overflow: Water damage, unsanitary
- water_heater_failure: No hot water, potential safety issues

INTENT CATEGORIES:
- emergency_service: Immediate help needed
- routine_inquiry: General service questions
- quote_request: Pricing for work
- scheduling: Booking appointments
- rescheduling: Changing existing appointments
- complaint: Problems with previous service
- follow_up: Checking on previous work
- payment_inquiry: Billing questions
- service_information: Learning about services
- appointment_confirmation: Confirming scheduled work
- cancellation: Canceling scheduled service
- warranty_claim: Issues with warrantied work
- maintenance_reminder: Routine service scheduling
- general_question: Other inquiries

URGENCY LEVELS:
- immediate: Emergency, respond within 30 minutes
- same_day: Urgent, respond within 4 hours
- within_week: Standard priority, respond within 1-2 days
- flexible: Low priority, customer not time-sensitive
- unknown: Cannot determine from conversation

CUSTOMER SENTIMENT:
- positive: Happy, satisfied, friendly tone
- neutral: Matter-of-fact, businesslike
- frustrated: Annoyed, impatient, problems with service
- angry: Very upset, demanding, hostile language
- worried: Concerned, anxious, nervous about problems
- unknown: Cannot determine sentiment

Your analysis should be thorough, accurate, and focused on helping the business provide excellent customer service while identifying urgent situations that need immediate attention.`;

export const generateConversationAnalysisPrompt = (context: ConversationAnalysisPromptContext): string => {
  const { businessInfo, conversation, customerHistory, currentContext } = context;
  
  return `BUSINESS INFORMATION:
Company: ${businessInfo.name}
Phone: ${businessInfo.phone}
Service Area: ${businessInfo.serviceArea}
Business Hours: ${businessInfo.businessHours}
Emergency Service: ${businessInfo.emergencyAvailable ? 'Available 24/7' : 'Business hours only'}

CURRENT CONTEXT:
Time: ${currentContext?.timeOfDay || 'Unknown'}
Day: ${currentContext?.dayOfWeek || 'Unknown'}
Business Hours: ${currentContext?.isBusinessHours ? 'Yes' : 'No'}
${currentContext?.weatherConditions ? `Weather: ${currentContext.weatherConditions}` : ''}

${customerHistory ? `CUSTOMER HISTORY:
${customerHistory.previousJobs ? `Previous Jobs: ${customerHistory.previousJobs.join(', ')}` : ''}
${customerHistory.lastServiceDate ? `Last Service: ${customerHistory.lastServiceDate}` : ''}
${customerHistory.customerType ? `Customer Type: ${customerHistory.customerType}` : ''}
${customerHistory.preferredServices ? `Preferred Services: ${customerHistory.preferredServices.join(', ')}` : ''}` : ''}

CONVERSATION TO ANALYZE:
${conversation.map((msg, index) => 
  `${index + 1}. [${msg.timestamp}] ${msg.role.toUpperCase()}: ${msg.message}`
).join('\n')}

Please provide a comprehensive analysis of this conversation in the following JSON format:

{
  "primaryIntent": "one of the intent categories",
  "secondaryIntents": ["array of other relevant intents"],
  "intentConfidence": 0.85,
  "reasoningForIntent": "explain why you chose this intent",
  
  "isEmergency": false,
  "emergencyType": "none or specific emergency type",
  "emergencyConfidence": 0.95,
  "emergencyReasons": ["list reasons if emergency detected"],
  
  "urgencyLevel": "immediate|same_day|within_week|flexible|unknown",
  "urgencyReasons": ["factors that determined urgency level"],
  
  "customerSentiment": "positive|neutral|frustrated|angry|worried|unknown",
  "sentimentConfidence": 0.80,
  "frustrationIndicators": ["specific words/phrases indicating frustration"],
  
  "serviceType": "plumbing service type if identified",
  "serviceTypeConfidence": 0.90,
  "serviceTypeReasons": ["why this service type was identified"],
  
  "extractedInfo": {
    "serviceAddress": "address if mentioned",
    "preferredTimes": ["times/dates customer mentioned"],
    "budgetMentioned": true/false,
    "budgetRange": "price range if mentioned",
    "decisionMaker": "who makes decisions",
    "contactPreference": "call|text|email",
    "accessInstructions": "how to access property",
    "problemDescription": "what's wrong in customer's words",
    "symptoms": ["specific symptoms mentioned"],
    "propertyType": "residential|commercial"
  },
  
  "conversationStage": "initial_contact|information_gathering|quote_discussion|scheduling|follow_up|resolved",
  "nextRecommendedAction": "what business should do next",
  "suggestedFollowUp": "recommended follow-up message or call",
  
  "shortSummary": "2-3 sentence summary of the conversation",
  "keyPoints": ["important points from conversation"],
  "actionItems": ["specific actions needed"],
  
  "riskAssessment": {
    "propertyDamageRisk": "low|medium|high",
    "healthSafetyRisk": "low|medium|high",
    "customerSatisfactionRisk": "low|medium|high",
    "businessImpactRisk": "low|medium|high"
  },
  
  "recommendedResponse": {
    "tone": "professional|empathetic|urgent|friendly",
    "keyPointsToAddress": ["what to mention in response"],
    "questionsToAsk": ["clarifying questions if needed"],
    "nextSteps": ["what to propose to customer"]
  }
}

Focus on accuracy and provide detailed reasoning for your assessments. Pay special attention to emergency indicators and customer sentiment to ensure appropriate business response.`;
};

export const EMERGENCY_KEYWORDS = [
  'flooding', 'flood', 'water everywhere', 'burst pipe', 'pipe burst',
  'gas leak', 'smell gas', 'gas odor', 'sewage backup', 'sewage overflow',
  'no water', 'water shut off', 'major leak', 'huge leak', 'toilet overflow',
  'water heater leaking', 'emergency', 'urgent', 'immediate', 'asap',
  'right now', 'help', 'disaster', 'mess', 'damage', 'ruined', 'soaked'
];

export const URGENT_KEYWORDS = [
  'soon', 'today', 'quickly', 'fast', 'rushed water', 'dripping',
  'getting worse', 'spreading', 'can\'t wait', 'need fixed',
  'problem getting bigger', 'important', 'priority'
];

export const FRUSTRATION_INDICATORS = [
  'terrible', 'awful', 'horrible', 'worst', 'fed up', 'frustrated',
  'angry', 'mad', 'upset', 'disappointed', 'unacceptable',
  'ridiculous', 'waste of time', 'money', 'never again', 'complaint'
];