import { PlumbingIntent } from '../../models/AIModels';

export interface IntentClassificationContext {
  message: string;
  conversationHistory?: Array<{
    role: 'customer' | 'business';
    message: string;
    timestamp: string;
  }>;
  customerInfo?: {
    name?: string;
    customerType?: 'residential' | 'commercial';
    previousServices?: string[];
    lastContact?: string;
  };
  contextualInfo?: {
    timeOfDay: string;
    isBusinessHours: boolean;
    dayOfWeek: string;
    previousIntent?: PlumbingIntent;
  };
}

export const INTENT_CLASSIFICATION_SYSTEM_PROMPT = `You are a specialized AI assistant for classifying customer intents in plumbing business communications. Your job is to accurately identify what the customer wants based on their message and conversation context.

PLUMBING BUSINESS INTENT CATEGORIES:

1. EMERGENCY_SERVICE
- Customer has an urgent plumbing emergency requiring immediate response
- Keywords: flooding, burst pipe, gas leak, sewage backup, no water, major leak
- Examples: "My basement is flooding!", "Pipe burst in my wall", "I smell gas"

2. ROUTINE_INQUIRY
- General questions about plumbing services, availability, or basic information
- Keywords: wondering, curious, questions about services
- Examples: "Do you service water heaters?", "What are your rates?", "Are you available weekends?"

3. QUOTE_REQUEST
- Customer wants pricing information for specific work
- Keywords: cost, price, estimate, quote, how much, budget
- Examples: "How much to replace a toilet?", "Can you give me an estimate?", "What's the cost for drain cleaning?"

4. SCHEDULING
- Customer wants to book or schedule service
- Keywords: appointment, schedule, book, when can you come, available
- Examples: "Can you come Tuesday?", "I'd like to schedule service", "When's your next opening?"

5. RESCHEDULING
- Customer wants to change existing appointment
- Keywords: reschedule, change appointment, different time, move appointment
- Examples: "Can we move Tuesday to Wednesday?", "I need to reschedule", "Change my appointment"

6. COMPLAINT
- Customer is unhappy with previous service or has issues
- Keywords: problem, issue, unhappy, disappointed, not working, still broken
- Examples: "The toilet is still running", "Your technician left a mess", "This didn't fix the problem"

7. FOLLOW_UP
- Customer following up on previous service or inquiry
- Keywords: checking on, following up, status update, how's it going
- Examples: "Following up on my quote", "Checking on the repair", "Any updates on my service?"

8. PAYMENT_INQUIRY
- Questions about billing, invoices, or payment
- Keywords: bill, invoice, payment, charge, cost, receipt
- Examples: "I have a question about my bill", "When is payment due?", "Can I pay by card?"

9. SERVICE_INFORMATION
- Customer wants detailed information about specific services
- Keywords: explain, how does, what involves, details about, information on
- Examples: "How does hydro jetting work?", "What's involved in pipe replacement?", "Tell me about maintenance plans"

10. APPOINTMENT_CONFIRMATION
- Customer confirming or asking about scheduled appointments
- Keywords: confirm, confirmation, still coming, appointment tomorrow
- Examples: "Confirming Tuesday appointment", "Are you still coming at 2pm?", "Just checking on tomorrow"

11. CANCELLATION
- Customer wants to cancel scheduled service
- Keywords: cancel, cancellation, don't need, changed mind
- Examples: "I need to cancel Tuesday", "Don't need service anymore", "Changed my mind about the repair"

12. WARRANTY_CLAIM
- Issues with work under warranty
- Keywords: warranty, guarantee, covered, still under warranty
- Examples: "This should be under warranty", "Wasn't this guaranteed?", "The work you did is failing"

13. MAINTENANCE_REMINDER
- Scheduling or asking about routine maintenance
- Keywords: maintenance, check-up, routine service, annual service
- Examples: "Time for annual service", "Need maintenance check", "Routine drain cleaning"

14. GENERAL_QUESTION
- Other questions not fitting specific categories
- Keywords: question, wondering, curious, help me understand
- Examples: "I have a question", "Can you help me understand?", "Just wondering about something"

15. OTHER
- Messages that don't fit any category or are unclear
- Use only when no other category fits

CLASSIFICATION GUIDELINES:
- Consider the entire message context, not just keywords
- Emergency situations should ALWAYS be classified as emergency_service
- If multiple intents are present, identify the primary one
- Consider conversation history to understand context
- Time of day and business hours can influence urgency
- Customer's tone and language affect classification

Your response should be accurate, confident, and include reasoning for your classification decision.`;

export const generateIntentClassificationPrompt = (context: IntentClassificationContext): string => {
  const { message, conversationHistory, customerInfo, contextualInfo } = context;
  
  return `MESSAGE TO CLASSIFY:
"${message}"

${contextualInfo ? `CONTEXT INFORMATION:
Time: ${contextualInfo.timeOfDay}
Business Hours: ${contextualInfo.isBusinessHours ? 'Yes' : 'No'}
Day: ${contextualInfo.dayOfWeek}
${contextualInfo.previousIntent ? `Previous Intent: ${contextualInfo.previousIntent}` : ''}` : ''}

${customerInfo ? `CUSTOMER INFORMATION:
${customerInfo.name ? `Name: ${customerInfo.name}` : ''}
${customerInfo.customerType ? `Type: ${customerInfo.customerType}` : ''}
${customerInfo.previousServices ? `Previous Services: ${customerInfo.previousServices.join(', ')}` : ''}
${customerInfo.lastContact ? `Last Contact: ${customerInfo.lastContact}` : ''}` : ''}

${conversationHistory && conversationHistory.length > 0 ? `RECENT CONVERSATION HISTORY:
${conversationHistory.map((msg, index) => 
  `${index + 1}. [${msg.timestamp}] ${msg.role.toUpperCase()}: ${msg.message}`
).join('\n')}` : ''}

Please classify this message and provide your analysis in the following JSON format:

{
  "primaryIntent": "the most likely intent category",
  "primaryConfidence": 0.95,
  "primaryReasoning": "detailed explanation for primary classification",
  
  "allIntents": [
    {
      "intent": "intent category",
      "confidence": 0.95,
      "reasoning": "why this intent applies"
    },
    {
      "intent": "second most likely intent",
      "confidence": 0.75,
      "reasoning": "why this intent might apply"
    }
  ],
  
  "contextFactors": {
    "timeInfluence": "how time of day affects classification",
    "historyInfluence": "how conversation history affects classification",
    "customerInfluence": "how customer info affects classification",
    "urgencyIndicators": ["words/phrases indicating urgency"],
    "emotionalIndicators": ["words/phrases indicating emotion"],
    "keyPhrases": ["important phrases that influenced classification"]
  },
  
  "emergencyAssessment": {
    "isEmergency": false,
    "emergencyConfidence": 0.95,
    "emergencyReasons": ["reasons if emergency detected"]
  },
  
  "recommendedHandling": {
    "responseUrgency": "immediate|within_hour|same_day|standard",
    "escalationNeeded": false,
    "specialConsiderations": ["any special handling notes"]
  },
  
  "qualityScore": 0.90,
  "alternativeInterpretations": ["other possible ways to interpret this message"]
}

Focus on accuracy and provide clear reasoning for your classification. Pay special attention to emergency indicators and context clues that might affect the appropriate business response.`;
};

export const INTENT_KEYWORDS_MAP: Record<PlumbingIntent, string[]> = {
  emergency_service: [
    'emergency', 'urgent', 'asap', 'immediate', 'flooding', 'flood', 'burst pipe',
    'gas leak', 'sewage backup', 'no water', 'major leak', 'toilet overflow',
    'water everywhere', 'help', 'disaster', 'right now'
  ],
  
  routine_inquiry: [
    'wondering', 'curious', 'question about', 'do you', 'can you', 'available',
    'service', 'hours', 'area', 'types of work', 'general question'
  ],
  
  quote_request: [
    'quote', 'estimate', 'cost', 'price', 'how much', 'pricing', 'rate',
    'charge', 'budget', 'ballpark', 'rough idea', 'approximate cost'
  ],
  
  scheduling: [
    'schedule', 'appointment', 'book', 'when can you', 'available', 'come out',
    'visit', 'time slot', 'opening', 'calendar', 'arrange'
  ],
  
  rescheduling: [
    'reschedule', 'change appointment', 'move appointment', 'different time',
    'new time', 'change date', 'switch', 'modify schedule'
  ],
  
  complaint: [
    'problem', 'issue', 'unhappy', 'disappointed', 'not working', 'still broken',
    'not fixed', 'complaint', 'terrible', 'awful', 'unsatisfied', 'wrong'
  ],
  
  follow_up: [
    'follow up', 'following up', 'checking on', 'status', 'update', 'progress',
    'how\'s it going', 'any news', 'heard back'
  ],
  
  payment_inquiry: [
    'bill', 'invoice', 'payment', 'charge', 'receipt', 'billing', 'pay',
    'cost', 'owe', 'due', 'credit card', 'check'
  ],
  
  service_information: [
    'how does', 'what is', 'explain', 'tell me about', 'details', 'information',
    'what involves', 'process', 'procedure', 'method'
  ],
  
  appointment_confirmation: [
    'confirm', 'confirmation', 'still coming', 'tomorrow', 'today',
    'appointment', 'scheduled', 'expected', 'on time'
  ],
  
  cancellation: [
    'cancel', 'cancellation', 'don\'t need', 'no longer need', 'changed mind',
    'not needed', 'abort', 'call off'
  ],
  
  warranty_claim: [
    'warranty', 'guarantee', 'covered', 'under warranty', 'guaranteed work',
    'should be covered', 'was guaranteed'
  ],
  
  maintenance_reminder: [
    'maintenance', 'routine', 'regular service', 'check up', 'annual',
    'scheduled maintenance', 'preventive', 'tune up'
  ],
  
  general_question: [
    'question', 'wondering', 'curious', 'help me understand', 'not sure',
    'confused', 'clarify', 'explain'
  ],
  
  other: []
};

export const getIntentKeywords = (intent: PlumbingIntent): string[] => {
  return INTENT_KEYWORDS_MAP[intent] || [];
};

export const findMatchingIntents = (message: string): Array<{ intent: PlumbingIntent; keywordMatches: string[] }> => {
  const lowercaseMessage = message.toLowerCase();
  const results: Array<{ intent: PlumbingIntent; keywordMatches: string[] }> = [];
  
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS_MAP)) {
    const matches = keywords.filter(keyword => 
      lowercaseMessage.includes(keyword.toLowerCase())
    );
    
    if (matches.length > 0) {
      results.push({
        intent: intent as PlumbingIntent,
        keywordMatches: matches
      });
    }
  }
  
  return results.sort((a, b) => b.keywordMatches.length - a.keywordMatches.length);
};