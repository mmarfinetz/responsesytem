import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { app } from '../app';
import { DatabaseService } from '../services/DatabaseService';
import { ClaudeAIService } from '../services/ClaudeAIService';
import { NotificationService } from '../services/NotificationService';
import { DynamicPricingEngine } from '../services/DynamicPricingEngine';
import { EmergencyRoutingService } from '../services/EmergencyRoutingService';
import { ConversationSyncService } from '../services/ConversationSyncService';
import { WarrantyManagementService } from '../services/WarrantyManagementService';
import { PredictiveMaintenanceService } from '../services/PredictiveMaintenanceService';

// Mock external services
jest.mock('../services/ClaudeAIService');
jest.mock('../services/NotificationService');

const MockedClaudeAIService = ClaudeAIService as jest.MockedClass<typeof ClaudeAIService>;
const MockedNotificationService = NotificationService as jest.MockedClass<typeof NotificationService>;

describe('Advanced Integration Test Suite', () => {
  let db: DatabaseService;
  let authToken: string;
  let dispatcherToken: string;
  let technicianToken: string;
  let adminToken: string;

  beforeAll(async () => {
    // Initialize database with production-like setup
    db = new DatabaseService();
    await db.connect();
    
    const knex = await db.getKnex();
    await knex.migrate.latest();
    
    // Create comprehensive test users for different roles
    const adminResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@plumbingcompany.com',
        password: 'admin123'
      });
    adminToken = adminResponse.body.token;

    const dispatcherResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'dispatcher@plumbingcompany.com',
        password: 'dispatcher123'
      });
    dispatcherToken = dispatcherResponse.body.token;

    const techResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'technician@plumbingcompany.com',
        password: 'tech123'
      });
    technicianToken = techResponse.body.token;

    authToken = adminToken;
  });

  afterAll(async () => {
    await db.disconnect();
  });

  beforeEach(async () => {
    // Clean test data comprehensively
    const knex = await db.getKnex();
    const tables = [
      'warranty_claims', 'maintenance_schedules', 'job_materials', 
      'quote_line_items', 'quotes', 'job_status_history', 'jobs',
      'messages', 'conversations', 'emergency_alerts', 'customers',
      'ai_performance_logs', 'system_metrics'
    ];
    
    for (const table of tables) {
      await knex(table).delete();
    }

    // Setup comprehensive mocks for AI service
    MockedClaudeAIService.prototype.generateResponse.mockResolvedValue({
      response: 'Professional AI response based on context',
      confidence: 0.92,
      requiresHumanReview: false,
      suggestedActions: ['analyze_situation', 'provide_estimate'],
      context: {
        serviceType: 'general_inquiry',
        urgencyLevel: 'normal',
        customerSentiment: 'neutral'
      },
      metadata: {
        processingTime: 850,
        tokenCount: 245,
        model: 'claude-3-sonnet'
      }
    });

    MockedNotificationService.prototype.sendSMS.mockResolvedValue(true);
    MockedNotificationService.prototype.sendEmail.mockResolvedValue(true);
    MockedNotificationService.prototype.sendPushNotification.mockResolvedValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Multi-Channel Communication Flow Testing', () => {
    it('should handle complex multi-channel customer interaction across 24 hours', async () => {
      // Phase 1: Initial SMS contact
      const initialContact = {
        text: 'Hello, I have a water leak in my basement. Can someone help?',
        phoneNumber: '+15551234567',
        timestamp: new Date().toISOString(),
        type: 'sms',
        direction: 'inbound'
      };

      const smsResponse = await request(app)
        .post('/webhooks/google-voice')
        .send({
          message: initialContact,
          eventType: 'message_received'
        });

      expect(smsResponse.status).toBe(200);
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify customer and conversation creation
      const customerResponse = await request(app)
        .get('/api/customers')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ phone: '+15551234567' });

      expect(customerResponse.body.customers).toHaveLength(1);
      const customerId = customerResponse.body.customers[0].id;

      // Phase 2: Follow-up voice call (2 hours later)
      const voiceCall = {
        text: 'Follow-up call transcript',
        phoneNumber: '+15551234567',
        timestamp: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        type: 'voice_call',
        direction: 'inbound',
        duration: 240,
        transcription: 'I called earlier about the basement leak. It\'s getting worse and I need urgent help.',
        callerId: 'John Smith'
      };

      await request(app)
        .post('/webhooks/google-voice')
        .send({
          message: voiceCall,
          eventType: 'call_received'
        });

      // Phase 3: Email with photos (4 hours later)
      const emailWithAttachments = await request(app)
        .post('/api/conversations/email-received')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          from: 'john.smith@email.com',
          subject: 'Basement Leak - Photos Attached',
          body: 'As discussed on the phone, here are photos of the basement leak situation.',
          receivedAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
          attachments: [
            { type: 'image', filename: 'leak1.jpg', size: 1024000 },
            { type: 'image', filename: 'leak2.jpg', size: 856000 }
          ]
        });

      expect(emailWithAttachments.status).toBe(200);

      // Phase 4: Create emergency job and assign technician
      const emergencyJobResponse = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          customerId,
          type: 'emergency_repair',
          serviceType: 'water_leak',
          description: 'Basement water leak - urgent repair needed',
          priority: 'emergency',
          scheduledDate: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
          estimatedDuration: 180,
          assignedTechnicianId: 'tech_001',
          status: 'assigned'
        });

      expect(emergencyJobResponse.status).toBe(201);
      const jobId = emergencyJobResponse.body.id;

      // Phase 5: Technician arrival notification (6 hours later)
      const arrivalUpdate = await request(app)
        .patch(`/api/jobs/${jobId}/status`)
        .set('Authorization', `Bearer ${technicianToken}`)
        .send({
          status: 'in_progress',
          statusNotes: 'Technician arrived on site, assessing situation',
          location: {
            latitude: 40.7128,
            longitude: -74.0060,
            accuracy: 10
          },
          arrivalTime: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
        });

      expect(arrivalUpdate.status).toBe(200);

      // Phase 6: Work completion and payment (8 hours later)
      const completionResponse = await request(app)
        .patch(`/api/jobs/${jobId}/complete`)
        .set('Authorization', `Bearer ${technicianToken}`)
        .send({
          completedAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
          workPerformed: 'Repaired burst pipe, replaced damaged section, tested system',
          materialsUsed: [
            { name: 'Copper pipe section', quantity: 2, cost: 45.00 },
            { name: 'Pipe fittings', quantity: 4, cost: 28.00 },
            { name: 'Pipe sealant', quantity: 1, cost: 15.00 }
          ],
          laborHours: 3,
          customerSignature: 'digital_signature_hash_123',
          warrantyPeriod: 24,
          totalCost: 320.00,
          photos: [
            { type: 'before', filename: 'before_repair.jpg' },
            { type: 'after', filename: 'after_repair.jpg' }
          ]
        });

      expect(completionResponse.status).toBe(200);

      // Phase 7: Follow-up satisfaction survey (24 hours later)
      const followUpSurvey = await request(app)
        .post('/api/customer-feedback')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          customerId,
          jobId,
          feedbackType: 'satisfaction_survey',
          responses: {
            overallSatisfaction: 5,
            technicianProfessionalism: 5,
            workQuality: 5,
            timeliness: 4,
            communication: 5,
            wouldRecommend: true,
            comments: 'Excellent service! Very professional and thorough work.'
          },
          submittedAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        });

      expect(followUpSurvey.status).toBe(201);

      // Comprehensive verification of the entire flow
      const conversationHistory = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ customerId });

      expect(conversationHistory.body.conversations).toHaveLength(1);
      const conversation = conversationHistory.body.conversations[0];
      
      expect(conversation.channels).toContain('sms');
      expect(conversation.channels).toContain('voice');
      expect(conversation.channels).toContain('email');
      expect(conversation.totalMessages).toBeGreaterThanOrEqual(3);

      // Verify customer journey metrics
      const customerJourney = await request(app)
        .get(`/api/customers/${customerId}/journey`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(customerJourney.body.stages).toEqual(
        expect.arrayContaining([
          'initial_contact', 'follow_up', 'job_created', 
          'service_completed', 'feedback_received'
        ])
      );
      expect(customerJourney.body.totalRevenue).toBe(320.00);
      expect(customerJourney.body.satisfactionScore).toBe(4.8);

      // Verify warranty was created
      const warrantyResponse = await request(app)
        .get('/api/warranties')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ customerId, jobId });

      expect(warrantyResponse.body.warranties).toHaveLength(1);
      expect(warrantyResponse.body.warranties[0].warrantyPeriodMonths).toBe(24);
      expect(warrantyResponse.body.warranties[0].status).toBe('active');
    }, 90000);

    it('should handle customer with multiple properties and service history', async () => {
      // Create customer with comprehensive property portfolio
      const customerResponse = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Sarah Johnson',
          phone: '+15559876543',
          email: 'sarah.johnson@email.com',
          customerType: 'property_manager',
          properties: [
            {
              address: '123 Main Street',
              city: 'Downtown',
              state: 'TX',
              zipCode: '78701',
              type: 'office_building',
              isPrimary: true,
              squareFootage: 5000,
              constructionYear: 1995,
              floors: 3
            },
            {
              address: '456 Oak Avenue',
              city: 'Suburbs',
              state: 'TX',
              zipCode: '78702',
              type: 'apartment_complex',
              isPrimary: false,
              units: 24,
              constructionYear: 2010
            },
            {
              address: '789 Pine Drive',
              city: 'Westside',
              state: 'TX',
              zipCode: '78703',
              type: 'retail_space',
              isPrimary: false,
              squareFootage: 2500,
              constructionYear: 2018
            }
          ],
          serviceAgreement: {
            type: 'maintenance_contract',
            startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
            endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            discountRate: 0.15,
            priority: 'high'
          }
        });

      expect(customerResponse.status).toBe(201);
      const customerId = customerResponse.body.id;

      // Create service history for each property
      const properties = customerResponse.body.properties;
      
      // Property 1: Recent HVAC service
      const hvacJobResponse = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          customerId,
          type: 'maintenance',
          serviceType: 'hvac_service',
          description: 'Quarterly HVAC maintenance - Office Building',
          propertyId: properties[0].id,
          status: 'completed',
          completedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          totalCost: 350.00,
          discountApplied: 52.50,
          finalCost: 297.50,
          customerRating: 5,
          warrantyPeriodMonths: 6
        });

      expect(hvacJobResponse.status).toBe(201);

      // Property 2: Plumbing repair
      const plumbingJobResponse = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          customerId,
          type: 'service',
          serviceType: 'pipe_repair',
          description: 'Unit 12 kitchen sink leak repair',
          propertyId: properties[1].id,
          status: 'completed',
          completedAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
          totalCost: 180.00,
          discountApplied: 27.00,
          finalCost: 153.00,
          customerRating: 4,
          warrantyPeriodMonths: 12
        });

      expect(plumbingJobResponse.status).toBe(201);

      // New service request for Property 3
      const newServiceMessage = {
        text: 'Hi Sarah Johnson here. Need plumbing service at my retail space on Pine Drive. Water pressure issues in the restroom.',
        phoneNumber: '+15559876543',
        timestamp: new Date().toISOString(),
        type: 'sms',
        direction: 'inbound'
      };

      const messageResponse = await request(app)
        .post('/webhooks/google-voice')
        .send({
          message: newServiceMessage,
          eventType: 'message_received'
        });

      expect(messageResponse.status).toBe(200);
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Verify customer recognition and property context
      const conversationResponse = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ customerId });

      expect(conversationResponse.body.conversations.length).toBeGreaterThan(0);
      const conversation = conversationResponse.body.conversations[0];
      
      // AI should recognize returning customer and property context
      const aiResponse = await request(app)
        .post('/api/ai/generate-response')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          conversationId: conversation.id,
          context: {
            customerType: 'returning',
            propertyCount: 3,
            serviceHistory: [
              { type: 'hvac_service', date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() },
              { type: 'pipe_repair', date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString() }
            ],
            currentProperty: {
              address: '789 Pine Drive',
              type: 'retail_space'
            },
            serviceContract: true
          }
        });

      expect(aiResponse.status).toBe(200);
      expect(aiResponse.body.response).toContain('Pine Drive');
      expect(aiResponse.body.context.customerHistory).toBeTruthy();

      // Create job with property-specific context
      const newJobResponse = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          customerId,
          conversationId: conversation.id,
          type: 'service',
          serviceType: 'water_pressure',
          description: 'Water pressure issues in retail space restroom',
          propertyId: properties[2].id,
          priority: 'high', // Due to commercial property
          scheduledDate: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
          estimatedDuration: 120,
          contractDiscount: 0.15,
          status: 'scheduled'
        });

      expect(newJobResponse.status).toBe(201);

      // Verify service history tracking by property
      const serviceHistoryResponse = await request(app)
        .get(`/api/customers/${customerId}/service-history`)
        .set('Authorization', `Bearer ${authToken}`)
        .query({ groupBy: 'property' });

      expect(serviceHistoryResponse.status).toBe(200);
      expect(serviceHistoryResponse.body.properties).toHaveLength(3);
      
      const mainStreetProperty = serviceHistoryResponse.body.properties.find(
        (p: any) => p.address === '123 Main Street'
      );
      expect(mainStreetProperty.services).toHaveLength(1);
      expect(mainStreetProperty.services[0].serviceType).toBe('hvac_service');

      const pineProperty = serviceHistoryResponse.body.properties.find(
        (p: any) => p.address === '789 Pine Drive'
      );
      expect(pineProperty.services).toHaveLength(1);
      expect(pineProperty.services[0].status).toBe('scheduled');
    }, 60000);
  });

  describe('Advanced Emergency Response Scenarios', () => {
    it('should handle complex emergency with multiple service types and coordination', async () => {
      // Scenario: Major water main break affecting multiple customers
      const emergencyCustomers = [
        { name: 'Restaurant Owner', phone: '+15551111111', type: 'commercial' },
        { name: 'Apartment Manager', phone: '+15552222222', type: 'residential' },
        { name: 'School Principal', phone: '+15553333333', type: 'institutional' }
      ];

      // Create customers
      const customerIds: string[] = [];
      for (const customer of emergencyCustomers) {
        const response = await request(app)
          .post('/api/customers')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: customer.name,
            phone: customer.phone,
            customerType: customer.type,
            address: `${Math.floor(Math.random() * 999)} Emergency St`,
            city: 'Crisis City',
            state: 'TX',
            zipCode: '12345'
          });
        customerIds.push(response.body.id);
      }

      // Simulate simultaneous emergency calls
      const emergencyMessages = [
        {
          text: 'EMERGENCY! Water main burst in front of my restaurant! Flooding the kitchen!',
          phoneNumber: '+15551111111',
          severity: 'critical',
          businessImpact: 'high'
        },
        {
          text: 'Help! Water is flooding our apartment building basement. Multiple units affected!',
          phoneNumber: '+15552222222',
          severity: 'high',
          businessImpact: 'medium'
        },
        {
          text: 'We have no water at the school and 500 students are here. Need immediate help!',
          phoneNumber: '+15553333333',
          severity: 'high',
          businessImpact: 'high'
        }
      ];

      // Send all emergency messages simultaneously
      const emergencyPromises = emergencyMessages.map(emergency =>
        request(app)
          .post('/webhooks/google-voice')
          .send({
            message: {
              ...emergency,
              timestamp: new Date().toISOString(),
              type: 'sms',
              direction: 'inbound'
            },
            eventType: 'message_received'
          })
      );

      const responses = await Promise.all(emergencyPromises);
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Wait for emergency processing
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Verify emergency alerts were created with proper prioritization
      const alertsResponse = await request(app)
        .get('/api/emergency/alerts')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ status: 'active', sortBy: 'priority', order: 'desc' });

      expect(alertsResponse.status).toBe(200);
      expect(alertsResponse.body.alerts).toHaveLength(3);

      // Verify proper prioritization (restaurant and school should be highest priority)
      const alerts = alertsResponse.body.alerts;
      const highPriorityAlerts = alerts.filter((alert: any) => alert.severity === 'critical' || alert.businessImpact === 'high');
      expect(highPriorityAlerts.length).toBeGreaterThanOrEqual(2);

      // Create coordinated emergency response
      const emergencyCoordinator = await request(app)
        .post('/api/emergency/coordination')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          incidentType: 'water_main_break',
          affectedAlerts: alerts.map((alert: any) => alert.id),
          coordinationLevel: 'multi_customer',
          responseTeam: [
            { role: 'lead_technician', technicianId: 'tech_001' },
            { role: 'support_technician', technicianId: 'tech_002' },
            { role: 'emergency_coordinator', technicianId: 'supervisor_001' }
          ],
          estimatedDuration: 360, // 6 hours
          requiredEquipment: ['excavator', 'pipe_repair_kit', 'water_pump']
        });

      expect(emergencyCoordinator.status).toBe(201);
      const coordinationId = emergencyCoordinator.body.id;

      // Create jobs for each affected customer
      const jobResponses = await Promise.all(
        customerIds.map((customerId, index) =>
          request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${dispatcherToken}`)
            .send({
              customerId,
              type: 'emergency_repair',
              serviceType: 'water_main_repair',
              description: `Water main break response - ${emergencyCustomers[index].name}`,
              priority: 'emergency',
              coordinationId,
              scheduledDate: new Date().toISOString(),
              estimatedDuration: 240,
              assignedTechnicianId: index === 0 ? 'tech_001' : 'tech_002',
              status: 'assigned'
            })
        )
      );

      jobResponses.forEach(response => {
        expect(response.status).toBe(201);
      });

      // Simulate coordinated response updates
      const coordinationUpdates = [
        {
          status: 'water_shut_off',
          message: 'Water supply shut off to affected area',
          timestamp: new Date(Date.now() + 30 * 60 * 1000)
        },
        {
          status: 'excavation_started',
          message: 'Excavation of damaged pipe section begun',
          timestamp: new Date(Date.now() + 60 * 60 * 1000)
        },
        {
          status: 'pipe_replaced',
          message: 'New pipe section installed',
          timestamp: new Date(Date.now() + 180 * 60 * 1000)
        },
        {
          status: 'water_restored',
          message: 'Water service restored to all affected properties',
          timestamp: new Date(Date.now() + 240 * 60 * 1000)
        }
      ];

      for (const update of coordinationUpdates) {
        const updateResponse = await request(app)
          .patch(`/api/emergency/coordination/${coordinationId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send(update);

        expect(updateResponse.status).toBe(200);
      }

      // Verify all customers received coordinated updates
      for (let i = 0; i < customerIds.length; i++) {
        const conversationResponse = await request(app)
          .get('/api/conversations')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ customerId: customerIds[i] });

        const conversation = conversationResponse.body.conversations[0];
        const messagesResponse = await request(app)
          .get(`/api/conversations/${conversation.id}/messages`)
          .set('Authorization', `Bearer ${authToken}`);

        const outboundMessages = messagesResponse.body.messages.filter(
          (msg: any) => msg.direction === 'outbound'
        );
        
        // Should receive at least 3 status updates
        expect(outboundMessages.length).toBeGreaterThanOrEqual(3);
        
        // Should include final completion message
        const completionMessage = outboundMessages.find(
          (msg: any) => msg.text.includes('water service restored')
        );
        expect(completionMessage).toBeDefined();
      }

      // Verify emergency metrics and response time
      const metricsResponse = await request(app)
        .get('/api/analytics/emergency-metrics')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ incidentId: coordinationId });

      expect(metricsResponse.status).toBe(200);
      expect(metricsResponse.body.totalResponseTime).toBeLessThan(300000); // 5 minutes
      expect(metricsResponse.body.customersAffected).toBe(3);
      expect(metricsResponse.body.coordinationEfficiency).toBeGreaterThan(0.85);
    }, 120000);
  });

  describe('AI Quality and Performance Validation', () => {
    it('should maintain AI response quality under various complexity scenarios', async () => {
      const complexScenarios = [
        {
          name: 'Technical Terminology',
          input: 'My water heater\'s anode rod needs replacement and the temperature relief valve is leaking. Also the dip tube might be broken.',
          expectedKeywords: ['anode rod', 'temperature relief valve', 'dip tube'],
          expectedActions: ['schedule_inspection', 'request_model_number']
        },
        {
          name: 'Emotional Customer',
          input: 'I\'m so frustrated! This is the third time this month my toilet is overflowing and I have guests coming tonight!',
          expectedSentiment: 'frustrated',
          expectedActions: ['empathize', 'prioritize_service', 'offer_temporary_solution']
        },
        {
          name: 'Multi-Issue Complex',
          input: 'We have several problems: kitchen sink won\'t drain, bathroom faucet drips, and the water pressure upstairs is terrible.',
          expectedIssues: ['drain_blockage', 'faucet_leak', 'water_pressure'],
          expectedActions: ['comprehensive_assessment', 'prioritize_issues']
        },
        {
          name: 'Commercial Emergency',
          input: 'This is the manager of Downtown Restaurant. Our main water line burst and we\'re flooding. We need to stay open for lunch service.',
          expectedUrgency: 'critical',
          expectedBusinessContext: true,
          expectedActions: ['emergency_dispatch', 'temporary_solution']
        }
      ];

      for (const scenario of complexScenarios) {
        // Create conversation for each scenario
        const customerResponse = await request(app)
          .post('/api/customers')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: `${scenario.name} Customer`,
            phone: `+1555${Math.random().toString().slice(2, 9)}`,
            email: `${scenario.name.toLowerCase().replace(' ', '.')}@test.com`
          });

        const conversationResponse = await request(app)
          .post('/api/conversations')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            customerId: customerResponse.body.id,
            phoneNumber: customerResponse.body.phone,
            priority: 'normal'
          });

        const conversationId = conversationResponse.body.id;

        // Generate AI response
        const aiResponse = await request(app)
          .post('/api/ai/generate-response')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            conversationId,
            messageText: scenario.input,
            context: {
              scenario: scenario.name,
              requiresAnalysis: true
            }
          });

        expect(aiResponse.status).toBe(200);
        expect(aiResponse.body.confidence).toBeGreaterThan(0.8);
        
        // Validate response quality based on scenario
        if (scenario.expectedKeywords) {
          scenario.expectedKeywords.forEach(keyword => {
            expect(aiResponse.body.response.toLowerCase()).toContain(keyword.toLowerCase());
          });
        }

        if (scenario.expectedActions) {
          scenario.expectedActions.forEach(action => {
            expect(aiResponse.body.suggestedActions).toContain(action);
          });
        }

        if (scenario.expectedSentiment) {
          expect(aiResponse.body.context.customerSentiment).toBe(scenario.expectedSentiment);
        }

        if (scenario.expectedUrgency) {
          expect(aiResponse.body.context.urgencyLevel).toBe(scenario.expectedUrgency);
        }

        // Verify response time is acceptable
        expect(aiResponse.body.metadata.processingTime).toBeLessThan(3000); // Under 3 seconds
        
        // Log performance metrics
        await request(app)
          .post('/api/ai/performance-log')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            scenario: scenario.name,
            responseTime: aiResponse.body.metadata.processingTime,
            confidence: aiResponse.body.confidence,
            tokenCount: aiResponse.body.metadata.tokenCount,
            qualityScore: aiResponse.body.confidence * 100
          });
      }

      // Verify overall AI performance metrics
      const performanceResponse = await request(app)
        .get('/api/ai/performance-metrics')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ timeframe: 'test_session' });

      expect(performanceResponse.status).toBe(200);
      expect(performanceResponse.body.averageConfidence).toBeGreaterThan(0.85);
      expect(performanceResponse.body.averageResponseTime).toBeLessThan(2500);
      expect(performanceResponse.body.successRate).toBe(1.0);
    }, 120000);
  });

  describe('Business Logic Validation', () => {
    it('should handle complex scheduling optimization with multiple constraints', async () => {
      // Create multiple customers with different scheduling needs
      const customers = await Promise.all([
        { name: 'Early Bird Customer', preference: 'morning', flexibility: 'low' },
        { name: 'Flexible Customer', preference: 'any', flexibility: 'high' },
        { name: 'Evening Customer', preference: 'evening', flexibility: 'medium' },
        { name: 'Emergency Customer', preference: 'immediate', flexibility: 'none' }
      ].map(async (customer, index) => {
        const response = await request(app)
          .post('/api/customers')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: customer.name,
            phone: `+1555000${index.toString().padStart(4, '0')}`,
            email: `customer${index}@test.com`,
            schedulingPreferences: {
              preferredTimeOfDay: customer.preference,
              flexibility: customer.flexibility,
              advanceNotice: customer.flexibility === 'low' ? 48 : 24,
              weekendAvailable: customer.flexibility !== 'none'
            }
          });
        return { ...customer, id: response.body.id };
      }));

      // Create multiple technicians with different skills and availability
      const technicians = await Promise.all([
        { id: 'tech_specialist', skills: ['water_heater', 'emergency'], shift: 'day' },
        { id: 'tech_general', skills: ['general_plumbing', 'drain_cleaning'], shift: 'day' },
        { id: 'tech_evening', skills: ['general_plumbing', 'emergency'], shift: 'evening' },
        { id: 'tech_oncall', skills: ['emergency', 'water_heater'], shift: 'oncall' }
      ].map(async (tech) => {
        const response = await request(app)
          .post('/api/technicians')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            id: tech.id,
            name: `Technician ${tech.id}`,
            skills: tech.skills,
            shiftSchedule: tech.shift,
            availability: {
              monday: tech.shift === 'evening' ? ['17:00', '01:00'] : ['08:00', '17:00'],
              tuesday: tech.shift === 'evening' ? ['17:00', '01:00'] : ['08:00', '17:00'],
              wednesday: tech.shift === 'evening' ? ['17:00', '01:00'] : ['08:00', '17:00'],
              thursday: tech.shift === 'evening' ? ['17:00', '01:00'] : ['08:00', '17:00'],
              friday: tech.shift === 'evening' ? ['17:00', '01:00'] : ['08:00', '17:00'],
              oncall: tech.shift === 'oncall'
            }
          });
        return { ...tech, ...response.body };
      }));

      // Create jobs with different priorities and service types
      const jobRequests = [
        {
          customerId: customers[0].id,
          serviceType: 'drain_cleaning',
          priority: 'normal',
          preferredDate: new Date(Date.now() + 48 * 60 * 60 * 1000),
          estimatedDuration: 90
        },
        {
          customerId: customers[1].id,
          serviceType: 'water_heater',
          priority: 'high',
          preferredDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
          estimatedDuration: 180
        },
        {
          customerId: customers[2].id,
          serviceType: 'general_plumbing',
          priority: 'normal',
          preferredDate: new Date(Date.now() + 72 * 60 * 60 * 1000),
          estimatedDuration: 120
        },
        {
          customerId: customers[3].id,
          serviceType: 'emergency',
          priority: 'emergency',
          preferredDate: new Date(Date.now() + 2 * 60 * 60 * 1000),
          estimatedDuration: 240
        }
      ];

      // Request schedule optimization
      const optimizationResponse = await request(app)
        .post('/api/scheduling/optimize')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          jobRequests,
          optimizationCriteria: {
            prioritizeEmergencies: true,
            respectCustomerPreferences: true,
            minimizeTravelTime: true,
            balanceWorkload: true,
            maximizeRevenue: false
          },
          timeWindow: {
            start: new Date().toISOString(),
            end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
          }
        });

      expect(optimizationResponse.status).toBe(200);
      expect(optimizationResponse.body.scheduledJobs).toHaveLength(4);

      const scheduledJobs = optimizationResponse.body.scheduledJobs;

      // Verify emergency job was prioritized
      const emergencyJob = scheduledJobs.find((job: any) => job.priority === 'emergency');
      expect(emergencyJob).toBeDefined();
      expect(emergencyJob.assignedTechnicianId).toBe('tech_oncall');
      expect(new Date(emergencyJob.scheduledDate).getTime()).toBeLessThan(
        new Date(Date.now() + 4 * 60 * 60 * 1000).getTime()
      );

      // Verify skill matching
      const waterHeaterJob = scheduledJobs.find((job: any) => job.serviceType === 'water_heater');
      expect(waterHeaterJob.assignedTechnicianId).toBeOneOf(['tech_specialist', 'tech_oncall']);

      // Verify customer preferences were respected
      const morningCustomerJob = scheduledJobs.find((job: any) => job.customerId === customers[0].id);
      const scheduledHour = new Date(morningCustomerJob.scheduledDate).getHours();
      expect(scheduledHour).toBeGreaterThanOrEqual(8);
      expect(scheduledHour).toBeLessThan(12);

      // Create all jobs and verify they were scheduled correctly
      const createdJobs = await Promise.all(
        scheduledJobs.map((job: any) =>
          request(app)
            .post('/api/jobs')
            .set('Authorization', `Bearer ${dispatcherToken}`)
            .send({
              customerId: job.customerId,
              type: job.priority === 'emergency' ? 'emergency_repair' : 'service',
              serviceType: job.serviceType,
              description: `Optimized scheduling - ${job.serviceType}`,
              priority: job.priority,
              scheduledDate: job.scheduledDate,
              estimatedDuration: job.estimatedDuration,
              assignedTechnicianId: job.assignedTechnicianId,
              status: 'scheduled',
              optimizationScore: job.optimizationScore
            })
        )
      );

      createdJobs.forEach(response => {
        expect(response.status).toBe(201);
      });

      // Verify schedule optimization metrics
      const scheduleMetrics = await request(app)
        .get('/api/scheduling/metrics')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({
          startDate: new Date().toISOString(),
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        });

      expect(scheduleMetrics.status).toBe(200);
      expect(scheduleMetrics.body.utilizationRate).toBeGreaterThan(0.8);
      expect(scheduleMetrics.body.customerSatisfactionScore).toBeGreaterThan(4.0);
      expect(scheduleMetrics.body.emergencyResponseTime).toBeLessThan(2 * 60 * 60 * 1000); // 2 hours
    }, 150000);
  });
});