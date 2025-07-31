import { PlumbingIntent, CustomerSentiment, UrgencyLevel } from '../../models/AIModels';
import { ServiceType } from '../../../../shared/types';

export interface ResponseGenerationContext {
  intent: PlumbingIntent;
  urgencyLevel: UrgencyLevel;
  customerSentiment: CustomerSentiment;
  serviceType?: ServiceType;
  isEmergency: boolean;
  
  businessInfo: {
    name: string;
    phone: string;
    email: string;
    address: string;
    serviceArea: string;
    businessHours: string;
    emergencyAvailable: boolean;
    afterHoursContact?: string;
  };
  
  customerInfo?: {
    name?: string;
    firstName?: string;
    customerType?: 'residential' | 'commercial';
    previousServices?: string[];
    preferredContactMethod?: 'call' | 'text' | 'email';
    isVIPCustomer?: boolean;
  };
  
  conversationContext: {
    customerMessage: string;
    previousMessages?: Array<{
      role: 'customer' | 'business';
      message: string;
      timestamp: string;
    }>;
    isFirstContact: boolean;
    timeOfDay: string;
    isBusinessHours: boolean;
    dayOfWeek: string;
  };
  
  extractedInfo?: {
    serviceAddress?: string;
    preferredTimes?: string[];
    budgetMentioned?: boolean;
    budgetRange?: string;
    problemDescription?: string;
    symptoms?: string[];
    accessInstructions?: string;
  };
  
  businessRules?: {
    emergencyResponseTime: number; // minutes
    standardResponseTime: number; // hours
    includeEmergencyInfo: boolean;
    includePricingGuidelines: boolean;
    requireQuoteForWork: boolean;
    schedulingAdvanceNotice: number; // days
  };
}

export const RESPONSE_GENERATION_SYSTEM_PROMPT = `You are a professional customer service representative for a plumbing company. Your role is to generate appropriate, helpful, and professional responses to customer communications that reflect the company's expertise and commitment to excellent service.

COMPANY CHARACTERISTICS:
- Professional, reliable plumbing contractor
- Family-owned business with strong community ties
- Expert technicians with proper licensing and insurance
- 24/7 emergency service availability
- Transparent pricing and honest communication
- Focus on customer satisfaction and long-term relationships

RESPONSE GUIDELINES:

TONE AND STYLE:
- Professional yet friendly and approachable
- Empathetic to customer concerns and problems
- Confident in company abilities without being boastful
- Clear and easy to understand (avoid technical jargon)
- Reassuring and solution-focused
- Respectful of customer's time and situation

EMERGENCY RESPONSES:
- Acknowledge urgency immediately
- Provide clear next steps and timeline
- Include emergency contact information
- Reassure customer help is coming
- Ask clarifying questions if needed for safety
- Mention any immediate safety precautions if applicable

ROUTINE SERVICE RESPONSES:
- Thank customer for contacting the company
- Address their specific question or concern
- Provide helpful information without overwhelming
- Include relevant business information (hours, contact)
- Suggest next steps (scheduling, quote, etc.)
- End with invitation for follow-up questions

PRICING AND QUOTES:
- Be transparent about pricing approach
- Explain factors that affect pricing
- Offer to provide detailed estimate after assessment
- Mention any guarantees or warranties
- Clarify what's included in quoted work
- Provide payment options if applicable

SCHEDULING RESPONSES:
- Confirm availability and provide options
- Explain what customer should expect
- Include preparation instructions if needed
- Provide technician arrival window
- Include contact information for day-of-service
- Mention any equipment or access requirements

COMPLAINT HANDLING:
- Acknowledge the customer's concern immediately
- Apologize for any inconvenience (without admitting fault)
- Explain how the issue will be resolved
- Provide timeline for resolution
- Offer direct contact for follow-up
- Thank customer for bringing issue to attention

INFORMATION TO INCLUDE:
- Company name and contact information when relevant
- Business hours and emergency availability
- Service area coverage
- Licensing and insurance status
- Warranty information when applicable
- Payment options and policies
- Safety recommendations when appropriate

AVOID:
- Technical jargon that customers won't understand
- Overpromising or guaranteeing outcomes before assessment
- Discussing specific pricing without knowing job details
- Making commitments about scheduling without checking availability
- Dismissing or minimizing customer concerns
- Using generic or template-sounding language`;

export const generateResponsePrompt = (context: ResponseGenerationContext): string => {
  const { 
    intent, 
    urgencyLevel, 
    customerSentiment, 
    serviceType, 
    isEmergency,
    businessInfo, 
    customerInfo, 
    conversationContext, 
    extractedInfo,
    businessRules 
  } = context;

  return `BUSINESS INFORMATION:
Company: ${businessInfo.name}
Phone: ${businessInfo.phone}
Email: ${businessInfo.email}
Address: ${businessInfo.address}
Service Area: ${businessInfo.serviceArea}
Business Hours: ${businessInfo.businessHours}
Emergency Service: ${businessInfo.emergencyAvailable ? 'Available 24/7' : 'Business hours only'}
${businessInfo.afterHoursContact ? `After Hours: ${businessInfo.afterHoursContact}` : ''}

CUSTOMER INFORMATION:
${customerInfo?.name ? `Name: ${customerInfo.name}` : ''}
${customerInfo?.customerType ? `Type: ${customerInfo.customerType}` : ''}
${customerInfo?.previousServices ? `Previous Services: ${customerInfo.previousServices.join(', ')}` : ''}
${customerInfo?.preferredContactMethod ? `Preferred Contact: ${customerInfo.preferredContactMethod}` : ''}
${customerInfo?.isVIPCustomer ? 'VIP Customer: Yes' : ''}

CONVERSATION CONTEXT:
Customer Message: "${conversationContext.customerMessage}"
Time: ${conversationContext.timeOfDay} (${conversationContext.dayOfWeek})
Business Hours: ${conversationContext.isBusinessHours ? 'Yes' : 'No'}
First Contact: ${conversationContext.isFirstContact ? 'Yes' : 'No'}

${conversationContext.previousMessages && conversationContext.previousMessages.length > 0 ? `RECENT CONVERSATION:
${conversationContext.previousMessages.map((msg, index) => 
  `${index + 1}. ${msg.role.toUpperCase()}: ${msg.message}`
).join('\n')}` : ''}

ANALYSIS RESULTS:
Intent: ${intent}
Urgency Level: ${urgencyLevel}
Customer Sentiment: ${customerSentiment}
${serviceType ? `Service Type: ${serviceType}` : ''}
Emergency: ${isEmergency ? 'Yes' : 'No'}

${extractedInfo ? `EXTRACTED INFORMATION:
${extractedInfo.serviceAddress ? `Address: ${extractedInfo.serviceAddress}` : ''}
${extractedInfo.preferredTimes ? `Preferred Times: ${extractedInfo.preferredTimes.join(', ')}` : ''}
${extractedInfo.budgetMentioned ? `Budget Mentioned: ${extractedInfo.budgetRange || 'Yes'}` : ''}
${extractedInfo.problemDescription ? `Problem: ${extractedInfo.problemDescription}` : ''}
${extractedInfo.symptoms ? `Symptoms: ${extractedInfo.symptoms.join(', ')}` : ''}
${extractedInfo.accessInstructions ? `Access: ${extractedInfo.accessInstructions}` : ''}` : ''}

${businessRules ? `BUSINESS RULES:
Emergency Response Time: ${businessRules.emergencyResponseTime} minutes
Standard Response Time: ${businessRules.standardResponseTime} hours
Include Emergency Info: ${businessRules.includeEmergencyInfo ? 'Yes' : 'No'}
Include Pricing Guidelines: ${businessRules.includePricingGuidelines ? 'Yes' : 'No'}
Require Quote for Work: ${businessRules.requireQuoteForWork ? 'Yes' : 'No'}
Scheduling Notice: ${businessRules.schedulingAdvanceNotice} days` : ''}

Please generate an appropriate response and provide your analysis in the following JSON format:

{
  "primaryResponse": "the main response message",
  "responseType": "immediate|informational|scheduling|emergency|quote|follow_up",
  "tone": "professional|empathetic|urgent|friendly|formal",
  "confidence": 0.90,
  
  "alternativeResponses": [
    {
      "response": "alternative response option",
      "tone": "different tone approach",
      "reasoning": "why this alternative might be better"
    }
  ],
  
  "responseFeatures": {
    "acknowledgement": "how customer concern is acknowledged",
    "mainMessage": "core information being communicated",
    "nextSteps": "what happens next or what customer should do",
    "businessInfo": "relevant business information included",
    "personalTouch": "personalization elements added"
  },
  
  "businessRulesApplied": [
    "list of business rules incorporated into response"
  ],
  
  "suggestedFollowUp": {
    "timing": "when to follow up (if applicable)",
    "method": "call|text|email",
    "purpose": "reason for follow-up"
  },
  
  "qualityAssessment": {
    "appropriatenessScore": 0.95,
    "professionalismScore": 0.90,
    "helpfulnessScore": 0.85,
    "clarityScore": 0.92,
    "overallScore": 0.90
  },
  
  "reviewRecommendation": {
    "needsReview": false,
    "reviewReason": "reason if review needed",
    "riskFactors": ["any potential issues to review"]
  },
  
  "additionalConsiderations": [
    "any special considerations or notes for this response"
  ]
}

Generate a response that is professional, helpful, and appropriate for the customer's situation and sentiment. Ensure the response addresses their specific needs while representing the company's values and capabilities effectively.`;
};

// Response Templates by Intent Type
export const RESPONSE_TEMPLATES = {
  emergency_service: {
    immediate: `Thank you for contacting {businessName}. I understand you have an emergency plumbing situation and we're here to help immediately. 

We have {emergencyAvailabilityText}. {emergencyResponseTimeText}

Please call us directly at {businessPhone} so we can dispatch a technician right away. If this is a gas leak or poses immediate safety risk, please also contact your gas company and emergency services.

We'll get someone to you as soon as possible to resolve this situation.`,
    
    afterHours: `Thank you for contacting {businessName}. I understand you have an emergency plumbing situation. 

Since this is after our regular business hours, please call our emergency line at {emergencyPhone} to speak directly with our on-call technician who can assist you immediately.

{emergencyAvailable ? 'We provide 24/7 emergency service' : 'Emergency service is available with additional after-hours charges'}. 

If this involves a gas leak or immediate safety concern, please also contact your gas company and emergency services.`
  },

  quote_request: {
    standard: `Thank you for contacting {businessName} regarding {serviceType ? serviceType : 'your plumbing needs'}. 

We'd be happy to provide you with a detailed estimate. Our quotes include:
- Thorough assessment of the work needed
- Transparent pricing with no hidden fees
- Quality parts and professional workmanship
- {warrantyInfo ? warrantyInfo : 'Warranty coverage on our work'}

To provide an accurate estimate, we'd need to schedule a brief consultation at your property. We can typically schedule assessments within {schedulingNotice} days.

Would you prefer to schedule over the phone at {businessPhone} or would you like me to have someone call you back?`,
    
    withPricing: `Thank you for reaching out about {serviceType}. 

While every job is unique and requires proper assessment, I can share that {serviceType} typically ranges from {priceRange}. The final price depends on factors like:
- Specific equipment and materials needed
- Accessibility and complexity of the work
- Any additional repairs discovered during service

We provide free, no-obligation estimates and all our quotes include {warrantyInfo}. We can schedule an assessment at your convenience.

Would you like to schedule a time for our technician to provide a detailed estimate?`
  },

  scheduling: {
    standard: `Thank you for wanting to schedule service with {businessName}.

We have availability {availabilityInfo} and can typically schedule service within {schedulingNotice}. Our technicians provide a specific arrival window and will call ahead to confirm.

For scheduling, please call us at {businessPhone} or let me know:
- Your preferred date and time
- The service address
- A brief description of the work needed
- Your contact information

Our office hours are {businessHours} for scheduling regular appointments.`,
    
    emergency: `I understand you need immediate service. For emergency scheduling, please call us directly at {businessPhone} so we can dispatch a technician right away.

Our emergency response time is typically {emergencyResponseTime} minutes, and we'll provide updates on the technician's arrival.

If this is a safety emergency involving gas or flooding, please also contact appropriate emergency services while we're en route.`
  },

  complaint: {
    standard: `Thank you for bringing this to our attention, and I sincerely apologize for any inconvenience you've experienced.

At {businessName}, customer satisfaction is our top priority, and it's clear we didn't meet your expectations. I want to make this right immediately.

I'm going to have our service manager contact you within {responseTimeHours} hours to:
- Understand exactly what happened
- Schedule a return visit if needed (at no charge)
- Ensure the issue is completely resolved

Please call us directly at {businessPhone} if you need immediate assistance. We value your business and the opportunity to earn back your trust.`,
    
    warranty: `I apologize that you're experiencing issues with work that should be covered under our warranty.

At {businessName}, we stand behind our work 100%. This appears to be a warranty situation, which means:
- No charge for the return visit
- No charge for parts or labor if it's warranty-related
- Priority scheduling to resolve this quickly

I'll have our service manager call you within 2 hours to schedule an immediate return visit. We'll make this right at no cost to you.

For urgent warranty issues, please call {businessPhone} directly.`
  }
};

export const generateTemplateResponse = (
  intent: PlumbingIntent, 
  context: ResponseGenerationContext,
  templateType: string = 'standard'
): string => {
  const templates = RESPONSE_TEMPLATES[intent as keyof typeof RESPONSE_TEMPLATES];
  if (!templates) return '';
  
  const template = templates[templateType as keyof typeof templates] || templates['standard' as keyof typeof templates];
  if (!template) return '';
  
  // Replace template variables
  return (template as string)
    .replace(/{businessName}/g, context.businessInfo.name)
    .replace(/{businessPhone}/g, context.businessInfo.phone)
    .replace(/{businessHours}/g, context.businessInfo.businessHours)
    .replace(/{emergencyAvailable}/g, context.businessInfo.emergencyAvailable.toString())
    .replace(/{emergencyPhone}/g, context.businessInfo.afterHoursContact || context.businessInfo.phone)
    .replace(/{serviceType}/g, context.serviceType || 'your plumbing service')
    .replace(/{customerName}/g, context.customerInfo?.firstName || 'valued customer')
    .replace(/{emergencyResponseTime}/g, context.businessRules?.emergencyResponseTime?.toString() || '30')
    .replace(/{schedulingNotice}/g, context.businessRules?.schedulingAdvanceNotice?.toString() || '1-2')
    .replace(/{responseTimeHours}/g, context.businessRules?.standardResponseTime?.toString() || '4');
};