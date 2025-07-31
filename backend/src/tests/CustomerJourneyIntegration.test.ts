import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { app } from '../app';
import { DatabaseService } from '../services/DatabaseService';
import { ClaudeAIService } from '../services/ClaudeAIService';
import { NotificationService } from '../services/NotificationService';
import { DynamicPricingEngine } from '../services/DynamicPricingEngine';

// Mock external services
jest.mock('../services/ClaudeAIService');
jest.mock('../services/NotificationService');
jest.mock('../services/DynamicPricingEngine');

const MockedClaudeAIService = ClaudeAIService as jest.MockedClass<typeof ClaudeAIService>;
const MockedNotificationService = NotificationService as jest.MockedClass<typeof NotificationService>;
const MockedDynamicPricingEngine = DynamicPricingEngine as jest.MockedClass<typeof DynamicPricingEngine>;

describe('Customer Journey Integration Tests', () => {
  let db: DatabaseService;
  let authToken: string;
  let dispatcherToken: string;
  let technicianToken: string;

  beforeAll(async () => {
    // Initialize database service with test configuration
    db = new DatabaseService();
    await db.connect();

    // Run migrations
    const knex = await db.getKnex();
    await knex.migrate.latest();

    // Get auth tokens for different roles
    const adminLogin = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@plumbingcompany.com',
        password: 'admin123'
      });
    authToken = adminLogin.body.token;

    const dispatcherLogin = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'dispatcher@plumbingcompany.com',
        password: 'dispatcher123'
      });
    dispatcherToken = dispatcherLogin.body.token;

    const techLogin = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'tech@plumbingcompany.com',
        password: 'tech123'
      });
    technicianToken = techLogin.body.token;
  });

  afterAll(async () => {
    await db.disconnect();
  });

  beforeEach(async () => {
    // Clear test data
    const knex = await db.getKnex();
    await knex('warranty_claims').delete();
    await knex('job_materials').delete();
    await knex('quote_line_items').delete();
    await knex('quotes').delete();
    await knex('job_status_history').delete();
    await knex('jobs').delete();
    await knex('messages').delete();
    await knex('conversations').delete();
    await knex('customers').delete();

    // Setup mocks
    MockedClaudeAIService.prototype.generateResponse.mockResolvedValue({
      response: 'Thank you for contacting us! I can help you with your plumbing needs. What specific service are you looking for?',
      confidence: 0.9,
      requiresHumanReview: false,
      suggestedActions: ['request_service_details', 'schedule_estimate'],
      context: {
        serviceType: 'general_inquiry',
        urgencyLevel: 'normal'
      }
    });

    MockedDynamicPricingEngine.prototype.calculatePrice.mockResolvedValue({
      basePrice: 150.00,
      adjustedPrice: 135.00,
      discountApplied: 10.00,
      factors: {
        timeOfDay: 1.0,
        seasonality: 0.95,
        customerHistory: 0.9,
        demandLevel: 1.0
      },
      explanation: 'Returning customer discount applied'
    });

    MockedNotificationService.prototype.sendSMS.mockResolvedValue(true);
    MockedNotificationService.prototype.sendEmail.mockResolvedValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Complete New Customer Journey', () => {
    it('should handle complete customer journey from inquiry to job completion', async () => {
      // Step 1: New customer initial contact
      const initialMessage = {
        text: 'Hi, I need help with a leaky faucet in my kitchen. Can you give me an estimate?',
        phoneNumber: '+15551234567',
        timestamp: new Date().toISOString(),
        type: 'sms',
        direction: 'inbound'
      };

      // Receive initial message via webhook
      const webhookResponse = await request(app)
        .post('/webhooks/google-voice')
        .send({
          message: initialMessage,
          eventType: 'message_received'
        });

      expect(webhookResponse.status).toBe(200);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 2: Verify customer was created automatically
      const customerResponse = await request(app)
        .get('/api/customers')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ phone: '+15551234567' });

      expect(customerResponse.status).toBe(200);
      expect(customerResponse.body.customers).toHaveLength(1);
      
      const customerId = customerResponse.body.customers[0].id;
      const newCustomer = customerResponse.body.customers[0];
      
      expect(newCustomer.phone).toBe('+15551234567');
      expect(newCustomer.status).toBe('active');
      expect(newCustomer.source).toBe('inbound_message');

      // Step 3: Verify conversation was created
      const conversationResponse = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ customerId });

      expect(conversationResponse.status).toBe(200);
      expect(conversationResponse.body.conversations).toHaveLength(1);
      
      const conversationId = conversationResponse.body.conversations[0].id;

      // Step 4: Generate AI response for service inquiry
      const aiResponse = await request(app)
        .post('/api/ai/generate-response')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          conversationId,
          context: {
            customerType: 'new',
            serviceType: 'faucet_repair',
            urgencyLevel: 'normal'
          }
        });

      expect(aiResponse.status).toBe(200);
      expect(aiResponse.body.response).toContain('plumbing');
      expect(aiResponse.body.suggestedActions).toContain('schedule_estimate');

      // Step 5: Send response to customer
      const responseMessage = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          text: aiResponse.body.response + ' Would you like to schedule an estimate visit?',
          direction: 'outbound',
          type: 'sms'
        });

      expect(responseMessage.status).toBe(201);

      // Step 6: Customer confirms they want an estimate
      const confirmationWebhook = await request(app)
        .post('/webhooks/google-voice')
        .send({
          message: {
            text: 'Yes, I would like to schedule an estimate. I\'m available tomorrow afternoon.',
            phoneNumber: '+15551234567',
            timestamp: new Date().toISOString(),
            type: 'sms',
            direction: 'inbound'
          },
          eventType: 'message_received'
        });

      expect(confirmationWebhook.status).toBe(200);

      // Step 7: Create estimate job
      const estimateDate = new Date();
      estimateDate.setDate(estimateDate.getDate() + 1);
      estimateDate.setHours(14, 0, 0, 0);

      const jobResponse = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          customerId,
          conversationId,
          type: 'estimate',
          serviceType: 'faucet_repair',
          description: 'Kitchen faucet leak repair estimate',
          priority: 'normal',
          scheduledDate: estimateDate.toISOString(),
          estimatedDuration: 60,
          status: 'scheduled'
        });

      expect(jobResponse.status).toBe(201);
      expect(jobResponse.body.type).toBe('estimate');
      expect(jobResponse.body.status).toBe('scheduled');
      
      const jobId = jobResponse.body.id;

      // Step 8: Assign technician to estimate
      const assignResponse = await request(app)
        .patch(`/api/jobs/${jobId}/assign`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          technicianId: 'tech_001'
        });

      expect(assignResponse.status).toBe(200);

      // Step 9: Technician completes estimate and creates quote
      const quoteResponse = await request(app)
        .post('/api/quotes')
        .set('Authorization', `Bearer ${technicianToken}`)
        .send({
          customerId,
          jobId,
          description: 'Kitchen faucet leak repair',
          validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          lineItems: [
            {
              description: 'Replace kitchen faucet cartridge',
              quantity: 1,
              unitPrice: 45.00,
              category: 'parts'
            },
            {
              description: 'Labor - faucet repair',
              quantity: 1,
              unitPrice: 90.00,
              category: 'labor'
            }
          ]
        });

      expect(quoteResponse.status).toBe(201);
      expect(quoteResponse.body.totalAmount).toBe(135.00);
      expect(quoteResponse.body.status).toBe('pending');
      
      const quoteId = quoteResponse.body.id;

      // Step 10: Send quote to customer
      const quoteMessage = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${technicianToken}`)
        .send({
          text: `Thank you for letting us inspect your faucet. We can repair it for $135.00 (parts: $45, labor: $90). This quote is valid for 7 days. Would you like to proceed?`,
          direction: 'outbound',
          type: 'sms',
          attachments: [{
            type: 'quote',
            quoteId: quoteId
          }]
        });

      expect(quoteMessage.status).toBe(201);

      // Step 11: Customer approves quote
      const approvalWebhook = await request(app)
        .post('/webhooks/google-voice')
        .send({
          message: {
            text: 'Yes, please go ahead with the repair. When can you schedule it?',
            phoneNumber: '+15551234567',
            timestamp: new Date().toISOString(),
            type: 'sms',
            direction: 'inbound'
          },
          eventType: 'message_received'
        });

      expect(approvalWebhook.status).toBe(200);

      // Step 12: Approve quote
      const quoteApproval = await request(app)
        .patch(`/api/quotes/${quoteId}/approve`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          approvedAt: new Date().toISOString(),
          customerNotes: 'Customer approved via SMS'
        });

      expect(quoteApproval.status).toBe(200);

      // Step 13: Create service job
      const serviceDate = new Date();
      serviceDate.setDate(serviceDate.getDate() + 2);
      serviceDate.setHours(10, 0, 0, 0);

      const serviceJobResponse = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          customerId,
          conversationId,
          quoteId,
          type: 'service',
          serviceType: 'faucet_repair',
          description: 'Kitchen faucet cartridge replacement',
          priority: 'normal',
          scheduledDate: serviceDate.toISOString(),
          estimatedDuration: 90,
          assignedTechnicianId: 'tech_001',
          status: 'scheduled'
        });

      expect(serviceJobResponse.status).toBe(201);
      const serviceJobId = serviceJobResponse.body.id;

      // Step 14: Technician completes job
      const jobCompletion = await request(app)
        .patch(`/api/jobs/${serviceJobId}/complete`)
        .set('Authorization', `Bearer ${technicianToken}`)
        .send({
          completedAt: new Date().toISOString(),
          workPerformed: 'Replaced kitchen faucet cartridge, tested for leaks',
          materialsUsed: [
            {
              name: 'Faucet cartridge',
              quantity: 1,
              cost: 45.00
            }
          ],
          customerSignature: 'digital_signature_hash',
          warrantyPeriod: 12 // months
        });

      expect(jobCompletion.status).toBe(200);

      // Step 15: Verify warranty was created
      const warrantyResponse = await request(app)
        .get('/api/warranties')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ customerId, jobId: serviceJobId });

      expect(warrantyResponse.status).toBe(200);
      expect(warrantyResponse.body.warranties).toHaveLength(1);
      expect(warrantyResponse.body.warranties[0].warrantyPeriodMonths).toBe(12);

      // Step 16: Send completion confirmation to customer
      const completionMessage = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${technicianToken}`)
        .send({
          text: 'Your faucet repair is complete! The work is covered by a 12-month warranty. Thank you for choosing our service!',
          direction: 'outbound',
          type: 'sms'
        });

      expect(completionMessage.status).toBe(201);

      // Step 17: Verify follow-up is scheduled
      const followUpResponse = await request(app)
        .get('/api/follow-ups')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ customerId });

      expect(followUpResponse.status).toBe(200);
      expect(followUpResponse.body.followUps.length).toBeGreaterThan(0);

      // Verify customer journey completion metrics
      const customerJourneyResponse = await request(app)
        .get(`/api/customers/${customerId}/journey`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(customerJourneyResponse.status).toBe(200);
      expect(customerJourneyResponse.body.stages).toContain('inquiry');
      expect(customerJourneyResponse.body.stages).toContain('estimate');
      expect(customerJourneyResponse.body.stages).toContain('quote_approved');
      expect(customerJourneyResponse.body.stages).toContain('service_completed');
      expect(customerJourneyResponse.body.totalRevenue).toBe(135.00);
      expect(customerJourneyResponse.body.satisfactionScore).toBeGreaterThan(0);
    }, 60000);

    it('should handle customer journey with multiple properties', async () => {
      // Create customer with multiple properties
      const customerResponse = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Multi Property Owner',
          phone: '+15559876543',
          email: 'multiowner@test.com',
          properties: [
            {
              address: '123 Main St',
              city: 'Plumbing City',
              state: 'TX',
              zipCode: '12345',
              type: 'residential',
              isPrimary: true
            },
            {
              address: '456 Oak Ave',
              city: 'Plumbing City',
              state: 'TX',
              zipCode: '12345',
              type: 'rental',
              isPrimary: false
            }
          ]
        });

      expect(customerResponse.status).toBe(201);
      const customerId = customerResponse.body.id;

      // Service request for first property
      const firstPropertyMessage = {
        text: 'I need drain cleaning at my main house - 123 Main St',
        phoneNumber: '+15559876543',
        timestamp: new Date().toISOString(),
        type: 'sms',
        direction: 'inbound'
      };

      const firstWebhook = await request(app)
        .post('/webhooks/google-voice')
        .send({
          message: firstPropertyMessage,
          eventType: 'message_received'
        });

      expect(firstWebhook.status).toBe(200);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Create job for first property
      const firstJobResponse = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          customerId,
          type: 'service',
          serviceType: 'drain_cleaning',
          description: 'Drain cleaning at 123 Main St',
          property: {
            address: '123 Main St',
            city: 'Plumbing City',
            state: 'TX',
            zipCode: '12345'
          },
          scheduledDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          estimatedDuration: 120,
          status: 'scheduled'
        });

      expect(firstJobResponse.status).toBe(201);

      // Service request for second property (a week later)
      const secondPropertyMessage = {
        text: 'Now I need plumbing work at my rental property - 456 Oak Ave. Different issue.',
        phoneNumber: '+15559876543',
        timestamp: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        type: 'sms',
        direction: 'inbound'
      };

      const secondWebhook = await request(app)
        .post('/webhooks/google-voice')
        .send({
          message: secondPropertyMessage,
          eventType: 'message_received'
        });

      expect(secondWebhook.status).toBe(200);

      // Verify customer recognition and property differentiation
      const conversationsResponse = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ customerId });

      expect(conversationsResponse.status).toBe(200);
      expect(conversationsResponse.body.conversations.length).toBeGreaterThanOrEqual(2);

      // Verify system tracks service history by property
      const serviceHistoryResponse = await request(app)
        .get(`/api/customers/${customerId}/service-history`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(serviceHistoryResponse.status).toBe(200);
      expect(serviceHistoryResponse.body.properties).toHaveLength(2);
      expect(serviceHistoryResponse.body.properties[0].address).toBe('123 Main St');
      expect(serviceHistoryResponse.body.properties[1].address).toBe('456 Oak Ave');
    }, 45000);
  });

  describe('Returning Customer Journey', () => {
    it('should handle returning customer with service history', async () => {
      // Create existing customer with service history
      const customerResponse = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Returning Customer',
          phone: '+15551111111',
          email: 'returning@test.com',
          address: '789 Return St',
          city: 'Loyalty City',
          state: 'TX',
          zipCode: '54321',
          status: 'active',
          firstServiceDate: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(), // 6 months ago
          totalServices: 3,
          totalRevenue: 425.00,
          averageRating: 4.8,
          lastServiceDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() // 1 month ago
        });

      expect(customerResponse.status).toBe(201);
      const customerId = customerResponse.body.id;

      // Add previous job history
      const previousJobResponse = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          customerId,
          type: 'service',
          serviceType: 'water_heater_repair',
          description: 'Water heater maintenance - 6 months ago',
          status: 'completed',
          completedAt: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
          totalCost: 175.00,
          customerRating: 5
        });

      expect(previousJobResponse.status).toBe(201);

      // Returning customer contacts for follow-up issue
      const returnMessage = {
        text: 'Hi, you serviced my water heater 6 months ago. It\'s making noise again. Same address on Return St.',
        phoneNumber: '+15551111111',
        timestamp: new Date().toISOString(),
        type: 'sms',
        direction: 'inbound'
      };

      const webhookResponse = await request(app)
        .post('/webhooks/google-voice')
        .send({
          message: returnMessage,
          eventType: 'message_received'
        });

      expect(webhookResponse.status).toBe(200);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify customer was recognized (not duplicate created)
      const customerCheck = await request(app)
        .get('/api/customers')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ phone: '+15551111111' });

      expect(customerCheck.status).toBe(200);
      expect(customerCheck.body.customers).toHaveLength(1);
      expect(customerCheck.body.customers[0].id).toBe(customerId);

      // Generate AI response with customer history context
      const conversationResponse = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ customerId });

      const conversationId = conversationResponse.body.conversations[0].id;

      const aiResponse = await request(app)
        .post('/api/ai/generate-response')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          conversationId,
          context: {
            customerType: 'returning',
            serviceHistory: [
              {
                serviceType: 'water_heater_repair',
                date: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString(),
                rating: 5
              }
            ],
            currentIssue: 'water_heater_noise'
          }
        });

      expect(aiResponse.status).toBe(200);
      expect(aiResponse.body.response).toContain('water heater');
      expect(aiResponse.body.context.customerHistory).toBeTruthy();

      // Check if returning customer discount was applied
      expect(MockedDynamicPricingEngine.prototype.calculatePrice).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceType: 'water_heater_repair',
          customerHistory: expect.objectContaining({
            isReturning: true,
            totalServices: 3,
            averageRating: 4.8
          })
        })
      );

      // Verify pricing reflects customer loyalty
      const pricingResult = await MockedDynamicPricingEngine.prototype.calculatePrice(
        expect.any(Object)
      );
      
      // Mock should show discount applied
      expect(pricingResult).toEqual(expect.objectContaining({
        discountApplied: 10.00,
        explanation: 'Returning customer discount applied'
      }));
    }, 30000);

    it('should handle warranty claims for returning customers', async () => {
      // Create customer with recent service under warranty
      const customerResponse = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Warranty Customer',
          phone: '+15552222222',
          email: 'warranty@test.com',
          address: '123 Warranty Lane'
        });

      const customerId = customerResponse.body.id;

      // Create completed job with warranty
      const warrantyJobResponse = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          customerId,
          type: 'service',
          serviceType: 'pipe_repair',
          description: 'Kitchen pipe leak repair',
          status: 'completed',
          completedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 1 month ago
          totalCost: 200.00,
          warrantyPeriodMonths: 12
        });

      const jobId = warrantyJobResponse.body.id;

      // Create warranty record
      const warrantyResponse = await request(app)
        .post('/api/warranties')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          customerId,
          jobId,
          warrantyType: 'parts_and_labor',
          warrantyPeriodMonths: 12,
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          expiryDate: new Date(Date.now() + 11 * 30 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'active'
        });

      expect(warrantyResponse.status).toBe(201);
      const warrantyId = warrantyResponse.body.id;

      // Customer reports issue with previous repair
      const warrantyClaimMessage = {
        text: 'The pipe you fixed last month is leaking again in the same spot. This should be under warranty.',
        phoneNumber: '+15552222222',
        timestamp: new Date().toISOString(),
        type: 'sms',
        direction: 'inbound'
      };

      const webhookResponse = await request(app)
        .post('/webhooks/google-voice')
        .send({
          message: warrantyClaimMessage,
          eventType: 'message_received'
        });

      expect(webhookResponse.status).toBe(200);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Generate AI response that recognizes warranty situation
      const conversationResponse = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ customerId });

      const conversationId = conversationResponse.body.conversations[0].id;

      const aiResponse = await request(app)
        .post('/api/ai/generate-response')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          conversationId,
          context: {
            potentialWarrantyClaim: true,
            previousJobId: jobId,
            serviceType: 'pipe_repair'
          }
        });

      expect(aiResponse.status).toBe(200);
      expect(aiResponse.body.suggestedActions).toContain('create_warranty_claim');

      // Create warranty claim
      const claimResponse = await request(app)
        .post('/api/warranty-claims')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          warrantyId,
          customerId,
          originalJobId: jobId,
          claimDescription: 'Same pipe location leaking again',
          claimType: 'repair_failure',
          reportedAt: new Date().toISOString(),
          status: 'submitted'
        });

      expect(claimResponse.status).toBe(201);
      expect(claimResponse.body.status).toBe('submitted');

      // Verify warranty claim creates priority service job
      const warrantyJobsResponse = await request(app)
        .get('/api/jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ 
          customerId,
          type: 'warranty_service',
          status: 'scheduled'
        });

      expect(warrantyJobsResponse.status).toBe(200);
      expect(warrantyJobsResponse.body.jobs.length).toBeGreaterThan(0);
      expect(warrantyJobsResponse.body.jobs[0].priority).toBe('high');
      expect(warrantyJobsResponse.body.jobs[0].cost).toBe(0); // Warranty work is free
    }, 45000);
  });

  describe('Customer Communication Preferences', () => {
    it('should respect customer communication preferences across channels', async () => {
      // Create customer with specific communication preferences
      const customerResponse = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Preference Customer',
          phone: '+15553333333',
          email: 'preferences@test.com',
          communicationPreferences: {
            preferredChannel: 'email',
            smsEnabled: false,
            emailEnabled: true,
            callsEnabled: true,
            schedulingReminders: true,
            marketingMessages: false,
            appointmentConfirmations: 'email',
            serviceUpdates: 'email',
            invoiceDelivery: 'email'
          }
        });

      expect(customerResponse.status).toBe(201);
      const customerId = customerResponse.body.id;

      // Create a job that requires customer communication
      const jobResponse = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          customerId,
          type: 'service',
          serviceType: 'drain_cleaning',
          description: 'Bathroom drain cleaning',
          scheduledDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          status: 'scheduled'
        });

      const jobId = jobResponse.body.id;

      // Send appointment confirmation
      const confirmationResponse = await request(app)
        .post('/api/notifications/appointment-confirmation')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          jobId,
          customerId
        });

      expect(confirmationResponse.status).toBe(200);

      // Verify email was sent (not SMS) according to preferences
      expect(MockedNotificationService.prototype.sendEmail).toHaveBeenCalledWith(
        'preferences@test.com',
        expect.objectContaining({
          subject: expect.stringContaining('Appointment Confirmation'),
          type: 'appointment_confirmation'
        })
      );

      // Verify SMS was NOT sent due to preferences
      expect(MockedNotificationService.prototype.sendSMS).not.toHaveBeenCalled();

      // Update job status and send service update
      const statusUpdateResponse = await request(app)
        .patch(`/api/jobs/${jobId}/status`)
        .set('Authorization', `Bearer ${technicianToken}`)
        .send({
          status: 'in_progress',
          statusNotes: 'Technician arrived and starting work'
        });

      expect(statusUpdateResponse.status).toBe(200);

      // Verify service update respects preferences
      await new Promise(resolve => setTimeout(resolve, 500));

      expect(MockedNotificationService.prototype.sendEmail).toHaveBeenCalledWith(
        'preferences@test.com',
        expect.objectContaining({
          subject: expect.stringContaining('Service Update'),
          type: 'service_update'
        })
      );
    }, 30000);
  });

  describe('Multi-Channel Customer Support', () => {
    it('should maintain conversation continuity across multiple channels', async () => {
      const customerId = 'multi_channel_customer';

      // Create customer
      const customerResponse = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Multi Channel Customer',
          phone: '+15554444444',
          email: 'multichannel@test.com'
        });

      expect(customerResponse.status).toBe(201);

      // Start conversation via SMS
      const smsMessage = {
        text: 'I need help with my garbage disposal',
        phoneNumber: '+15554444444',
        timestamp: new Date().toISOString(),
        type: 'sms',
        direction: 'inbound'
      };

      await request(app)
        .post('/webhooks/google-voice')
        .send({
          message: smsMessage,
          eventType: 'message_received'
        });

      // Customer calls with follow-up
      const voiceMessage = {
        text: 'Follow-up call about garbage disposal - transcript',
        phoneNumber: '+15554444444',
        timestamp: new Date(Date.now() + 30000).toISOString(),
        type: 'voice_call',
        direction: 'inbound',
        duration: 180,
        transcription: 'I called about the disposal issue I texted about. When can someone come out?'
      };

      await request(app)
        .post('/webhooks/google-voice')
        .send({
          message: voiceMessage,
          eventType: 'call_received'
        });

      // Customer sends email
      const emailMessage = await request(app)
        .post('/api/conversations/email-received')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          from: 'multichannel@test.com',
          subject: 'Follow-up: Garbage Disposal Service',
          body: 'This is regarding the garbage disposal I mentioned in my text and call. I can provide photos if needed.',
          receivedAt: new Date(Date.now() + 60000).toISOString()
        });

      expect(emailMessage.status).toBe(200);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify all communications are threaded together
      const conversationResponse = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ phone: '+15554444444' });

      expect(conversationResponse.status).toBe(200);
      expect(conversationResponse.body.conversations).toHaveLength(1);

      const conversation = conversationResponse.body.conversations[0];
      expect(conversation.channels).toContain('sms');
      expect(conversation.channels).toContain('voice');
      expect(conversation.channels).toContain('email');

      // Get conversation details
      const detailsResponse = await request(app)
        .get(`/api/conversations/${conversation.id}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(detailsResponse.status).toBe(200);
      expect(detailsResponse.body.messages).toHaveLength(3);

      // Verify messages are properly sequenced
      const messages = detailsResponse.body.messages.sort((a: any, b: any) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      expect(messages[0].type).toBe('sms');
      expect(messages[1].type).toBe('voice_call');
      expect(messages[2].type).toBe('email');

      // Verify context is maintained across channels
      expect(detailsResponse.body.context.serviceType).toBe('garbage_disposal');
      expect(detailsResponse.body.context.channelCount).toBe(3);
    }, 45000);
  });
});