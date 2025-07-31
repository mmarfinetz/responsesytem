import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { app } from '../app';
import { DatabaseService } from '../services/DatabaseService';
import { EmergencyRoutingService } from '../services/EmergencyRoutingService';
import { NotificationService } from '../services/NotificationService';
import { ClaudeAIService } from '../services/ClaudeAIService';
import { ConversationManagerService } from '../services/ConversationManagerService';

// Mock external services
jest.mock('../services/ClaudeAIService');
jest.mock('../services/NotificationService');

const MockedClaudeAIService = ClaudeAIService as jest.MockedClass<typeof ClaudeAIService>;
const MockedNotificationService = NotificationService as jest.MockedClass<typeof NotificationService>;

describe('Emergency Response Integration Tests', () => {
  let db: DatabaseService;
  let emergencyService: EmergencyRoutingService;
  let conversationService: ConversationManagerService;
  let authToken: string;
  let testCustomerId: string;
  let testTechnicianId: string;

  beforeAll(async () => {
    // Initialize database service with test configuration
    db = new DatabaseService();
    await db.connect();

    // Run migrations
    const knex = await db.getKnex();
    await knex.migrate.latest();

    // Create test user and get auth token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@plumbingcompany.com',
        password: 'admin123'
      });

    authToken = loginResponse.body.token;

    // Create test customer and technician
    const customerResponse = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Emergency Test Customer',
        phone: '+15551234567',
        email: 'emergency@test.com',
        address: '123 Emergency St',
        city: 'Emergency City',
        state: 'TX',
        zipCode: '12345'
      });

    testCustomerId = customerResponse.body.id;

    // Get available technician ID
    const techResponse = await request(app)
      .get('/api/users?role=technician')
      .set('Authorization', `Bearer ${authToken}`);
    
    testTechnicianId = techResponse.body.users[0]?.id || 'tech_001';
  });

  afterAll(async () => {
    await db.disconnect();
  });

  beforeEach(async () => {
    // Clear test data
    const knex = await db.getKnex();
    await knex('emergency_alerts').delete();
    await knex('messages').delete();
    await knex('conversations').delete();
    await knex('jobs').delete();

    // Initialize services
    emergencyService = new EmergencyRoutingService(db);
    conversationService = new ConversationManagerService(db);

    // Setup mocks
    MockedClaudeAIService.prototype.generateResponse.mockResolvedValue({
      response: 'I understand this is an emergency. Our technician will be dispatched immediately.',
      confidence: 0.95,
      requiresHumanReview: false,
      suggestedActions: ['dispatch_technician', 'create_emergency_job'],
      context: {
        urgencyLevel: 'emergency',
        serviceType: 'toilet_overflow',
        estimatedSeverity: 'high'
      }
    });

    MockedNotificationService.prototype.sendSMS.mockResolvedValue(true);
    MockedNotificationService.prototype.sendPushNotification.mockResolvedValue(true);
  });

  afterEach(async () => {
    jest.clearAllMocks();
  });

  describe('Complete Emergency Response Workflow', () => {
    it('should handle complete emergency workflow from message to technician assignment', async () => {
      const emergencyMessage = {
        text: 'HELP! My toilet is overflowing everywhere and water is flooding my bathroom! This is an emergency!',
        phoneNumber: '+15551234567',
        timestamp: new Date().toISOString(),
        type: 'sms',
        direction: 'inbound'
      };

      // Step 1: Receive emergency message via webhook
      const webhookResponse = await request(app)
        .post('/webhooks/google-voice')
        .send({
          message: emergencyMessage,
          eventType: 'message_received'
        });

      expect(webhookResponse.status).toBe(200);

      // Step 2: Verify message was processed and conversation created
      const conversationsResponse = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ phoneNumber: '+15551234567' });

      expect(conversationsResponse.status).toBe(200);
      expect(conversationsResponse.body.conversations).toHaveLength(1);

      const conversationId = conversationsResponse.body.conversations[0].id;

      // Step 3: Verify emergency was detected and classified
      const conversationDetails = await request(app)
        .get(`/api/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(conversationDetails.body.priority).toBe('emergency');
      expect(conversationDetails.body.messages).toHaveLength(1);
      expect(conversationDetails.body.messages[0].containsEmergencyKeywords).toBe(true);

      // Step 4: Verify emergency alert was created
      const alertsResponse = await request(app)
        .get('/api/emergency/alerts')
        .set('Authorization', `Bearer ${authToken}`);

      expect(alertsResponse.status).toBe(200);
      expect(alertsResponse.body.alerts).toHaveLength(1);
      expect(alertsResponse.body.alerts[0].severity).toBe('high');
      expect(alertsResponse.body.alerts[0].status).toBe('active');

      // Step 5: Generate AI response
      const aiResponse = await request(app)
        .post('/api/ai/generate-response')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          conversationId,
          context: {
            emergencyLevel: 'high',
            serviceType: 'toilet_overflow'
          }
        });

      expect(aiResponse.status).toBe(200);
      expect(aiResponse.body.response).toContain('emergency');
      expect(aiResponse.body.suggestedActions).toContain('dispatch_technician');

      // Step 6: Create emergency job
      const jobResponse = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          customerId: testCustomerId,
          conversationId,
          type: 'emergency_repair',
          priority: 'emergency',
          serviceType: 'toilet_overflow',
          description: 'Emergency toilet overflow causing flooding',
          scheduledDate: new Date().toISOString(),
          estimatedDuration: 120,
          assignedTechnicianId: testTechnicianId
        });

      expect(jobResponse.status).toBe(201);
      expect(jobResponse.body.priority).toBe('emergency');
      expect(jobResponse.body.status).toBe('assigned');

      // Step 7: Send response to customer
      const messageResponse = await request(app)
        .post(`/api/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          text: aiResponse.body.response,
          direction: 'outbound',
          type: 'sms'
        });

      expect(messageResponse.status).toBe(201);

      // Step 8: Verify technician notification was sent
      expect(MockedNotificationService.prototype.sendPushNotification).toHaveBeenCalledWith(
        testTechnicianId,
        expect.objectContaining({
          title: 'Emergency Job Assigned',
          body: expect.stringContaining('toilet overflow'),
          data: expect.objectContaining({
            jobId: jobResponse.body.id,
            priority: 'emergency'
          })
        })
      );

      // Step 9: Verify customer SMS was sent
      expect(MockedNotificationService.prototype.sendSMS).toHaveBeenCalledWith(
        '+15551234567',
        expect.stringContaining('emergency')
      );

      // Step 10: Verify response time metrics
      const metricsResponse = await request(app)
        .get('/api/analytics/emergency-metrics')
        .set('Authorization', `Bearer ${authToken}`);

      expect(metricsResponse.status).toBe(200);
      expect(metricsResponse.body.averageResponseTime).toBeLessThan(120000); // Less than 2 minutes
    }, 30000);

    it('should handle multiple concurrent emergencies with proper prioritization', async () => {
      const emergencies = [
        {
          text: 'Water main burst in basement! Flooding everywhere!',
          phoneNumber: '+15551111111',
          severity: 'critical'
        },
        {
          text: 'Toilet overflowing upstairs, need help ASAP',
          phoneNumber: '+15552222222',
          severity: 'high'
        },
        {
          text: 'Sink is leaking badly, urgent repair needed',
          phoneNumber: '+15553333333',
          severity: 'medium'
        }
      ];

      // Send all emergency messages simultaneously
      const webhookPromises = emergencies.map(emergency =>
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

      const webhookResponses = await Promise.all(webhookPromises);
      webhookResponses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify all alerts were created with correct prioritization
      const alertsResponse = await request(app)
        .get('/api/emergency/alerts')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ status: 'active' });

      expect(alertsResponse.status).toBe(200);
      expect(alertsResponse.body.alerts).toHaveLength(3);

      // Verify proper prioritization
      const sortedAlerts = alertsResponse.body.alerts.sort((a: any, b: any) => 
        b.priorityScore - a.priorityScore
      );

      expect(sortedAlerts[0].severity).toBe('critical'); // Water main burst
      expect(sortedAlerts[1].severity).toBe('high');     // Toilet overflow
      expect(sortedAlerts[2].severity).toBe('medium');   // Sink leak

      // Verify technician assignment follows priority
      const jobsResponse = await request(app)
        .get('/api/jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ priority: 'emergency', status: 'assigned' });

      expect(jobsResponse.status).toBe(200);
      expect(jobsResponse.body.jobs.length).toBeGreaterThan(0);

      // Highest priority job should be assigned first
      const priorityJob = jobsResponse.body.jobs.find((job: any) => 
        job.description.includes('Water main burst')
      );
      expect(priorityJob).toBeDefined();
      expect(priorityJob.assignedTechnicianId).toBeTruthy();
    }, 45000);

    it('should handle after-hours emergency routing correctly', async () => {
      // Mock current time to be after business hours (e.g., 11 PM)
      const afterHoursTime = new Date();
      afterHoursTime.setHours(23, 0, 0, 0);
      
      jest.spyOn(Date, 'now').mockReturnValue(afterHoursTime.getTime());

      const emergencyMessage = {
        text: 'Emergency! Pipes burst and flooding basement at 2 AM!',
        phoneNumber: '+15554444444',
        timestamp: afterHoursTime.toISOString(),
        type: 'sms',
        direction: 'inbound'
      };

      // Send emergency message
      const webhookResponse = await request(app)
        .post('/webhooks/google-voice')
        .send({
          message: emergencyMessage,
          eventType: 'message_received'
        });

      expect(webhookResponse.status).toBe(200);

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify after-hours emergency procedures were followed
      const alertsResponse = await request(app)
        .get('/api/emergency/alerts')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ afterHours: true });

      expect(alertsResponse.status).toBe(200);
      expect(alertsResponse.body.alerts).toHaveLength(1);
      
      const alert = alertsResponse.body.alerts[0];
      expect(alert.isAfterHours).toBe(true);
      expect(alert.escalationLevel).toBeGreaterThan(0);

      // Verify on-call technician was notified
      expect(MockedNotificationService.prototype.sendPushNotification).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          title: 'After-Hours Emergency',
          urgency: 'high'
        })
      );

      // Verify customer received after-hours acknowledgment
      expect(MockedNotificationService.prototype.sendSMS).toHaveBeenCalledWith(
        '+15554444444',
        expect.stringMatching(/after.?hours.*emergency/i)
      );

      // Restore Date.now
      jest.restoreAllMocks();
    }, 30000);
  });

  describe('Emergency Classification Accuracy', () => {
    it('should correctly classify different types of plumbing emergencies', async () => {
      const emergencyScenarios = [
        {
          message: 'Water main broke and flooding entire basement!',
          expectedSeverity: 'critical',
          expectedServiceType: 'water_main_repair',
          expectedResponseTime: 30 // minutes
        },
        {
          message: 'Gas smell from water heater, might be dangerous',
          expectedSeverity: 'critical',
          expectedServiceType: 'gas_leak',
          expectedResponseTime: 15 // minutes
        },
        {
          message: 'Toilet overflowing and water going everywhere',
          expectedSeverity: 'high',
          expectedServiceType: 'toilet_overflow',
          expectedResponseTime: 60 // minutes
        },
        {
          message: 'No hot water and it\'s freezing cold outside',
          expectedSeverity: 'medium',
          expectedServiceType: 'water_heater_repair',
          expectedResponseTime: 120 // minutes
        }
      ];

      for (const scenario of emergencyScenarios) {
        // Send emergency message
        const webhookResponse = await request(app)
          .post('/webhooks/google-voice')
          .send({
            message: {
              text: scenario.message,
              phoneNumber: `+1555${Math.random().toString().slice(2, 9)}`,
              timestamp: new Date().toISOString(),
              type: 'sms',
              direction: 'inbound'
            },
            eventType: 'message_received'
          });

        expect(webhookResponse.status).toBe(200);

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Verify classification
        const alertsResponse = await request(app)
          .get('/api/emergency/alerts')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ 
            status: 'active',
            limit: 1,
            orderBy: 'createdAt',
            order: 'desc'
          });

        expect(alertsResponse.status).toBe(200);
        expect(alertsResponse.body.alerts).toHaveLength(1);

        const alert = alertsResponse.body.alerts[0];
        expect(alert.severity).toBe(scenario.expectedSeverity);
        expect(alert.serviceType).toBe(scenario.expectedServiceType);
        expect(alert.maxResponseTimeMinutes).toBeLessThanOrEqual(scenario.expectedResponseTime);

        // Clean up for next iteration
        const knex = await db.getKnex();
        await knex('emergency_alerts').delete();
        await knex('conversations').delete();
        await knex('messages').delete();
      }
    });

    it('should handle false positive emergency detection', async () => {
      const nonEmergencyMessages = [
        'Can you give me a quote for drain cleaning next week?',
        'Thank you for the great service yesterday!',
        'What are your business hours?',
        'I need to schedule a routine maintenance check'
      ];

      for (const message of nonEmergencyMessages) {
        const webhookResponse = await request(app)
          .post('/webhooks/google-voice')
          .send({
            message: {
              text: message,
              phoneNumber: `+1555${Math.random().toString().slice(2, 9)}`,
              timestamp: new Date().toISOString(),
              type: 'sms',
              direction: 'inbound'
            },
            eventType: 'message_received'
          });

        expect(webhookResponse.status).toBe(200);
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify no emergency alerts were created
      const alertsResponse = await request(app)
        .get('/api/emergency/alerts')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ status: 'active' });

      expect(alertsResponse.status).toBe(200);
      expect(alertsResponse.body.alerts).toHaveLength(0);

      // Verify conversations were created but with normal priority
      const conversationsResponse = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ priority: 'normal' });

      expect(conversationsResponse.status).toBe(200);
      expect(conversationsResponse.body.conversations.length).toBeGreaterThan(0);
    });
  });

  describe('Performance and Reliability', () => {
    it('should meet emergency response time requirements', async () => {
      const startTime = Date.now();

      const emergencyMessage = {
        text: 'URGENT! Basement flooding from broken pipe!',
        phoneNumber: '+15555555555',
        timestamp: new Date().toISOString(),
        type: 'sms',
        direction: 'inbound'
      };

      // Send emergency message
      const webhookResponse = await request(app)
        .post('/webhooks/google-voice')
        .send({
          message: emergencyMessage,
          eventType: 'message_received'
        });

      expect(webhookResponse.status).toBe(200);

      // Wait for complete processing
      let processingComplete = false;
      let attempts = 0;
      const maxAttempts = 30; // 30 seconds max

      while (!processingComplete && attempts < maxAttempts) {
        const alertsResponse = await request(app)
          .get('/api/emergency/alerts')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ status: 'active' });

        if (alertsResponse.body.alerts.length > 0) {
          const alert = alertsResponse.body.alerts[0];
          if (alert.status === 'active' && alert.assignedTechnicianId) {
            processingComplete = true;
            break;
          }
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        attempts++;
      }

      const endTime = Date.now();
      const totalResponseTime = endTime - startTime;

      // Performance assertions
      expect(processingComplete).toBe(true);
      expect(totalResponseTime).toBeLessThan(120000); // Less than 2 minutes
      expect(totalResponseTime).toBeLessThan(60000);  // Preferably less than 1 minute

      // Verify response time was logged
      const metricsResponse = await request(app)
        .get('/api/analytics/performance-metrics')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ metric: 'emergency_response_time' });

      expect(metricsResponse.status).toBe(200);
      expect(metricsResponse.body.metrics).toBeDefined();
    }, 60000);

    it('should handle system load during emergency surge', async () => {
      // Simulate 10 concurrent emergencies
      const concurrentEmergencies = Array.from({ length: 10 }, (_, i) => ({
        text: `Emergency #${i + 1}: Water leak in apartment ${i + 1}!`,
        phoneNumber: `+1555${String(i).padStart(7, '0')}`,
        timestamp: new Date().toISOString(),
        type: 'sms',
        direction: 'inbound'
      }));

      const startTime = Date.now();

      // Send all emergencies simultaneously
      const webhookPromises = concurrentEmergencies.map(emergency =>
        request(app)
          .post('/webhooks/google-voice')
          .send({
            message: emergency,
            eventType: 'message_received'
          })
      );

      const responses = await Promise.all(webhookPromises);
      
      // All should be accepted
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 5000));

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Verify all emergencies were processed
      const alertsResponse = await request(app)
        .get('/api/emergency/alerts')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ status: 'active' });

      expect(alertsResponse.status).toBe(200);
      expect(alertsResponse.body.alerts).toHaveLength(10);

      // Performance under load
      expect(totalTime).toBeLessThan(300000); // Less than 5 minutes for all
      
      // Average processing time per emergency should still be reasonable
      const averageTime = totalTime / 10;
      expect(averageTime).toBeLessThan(30000); // Less than 30 seconds average
    }, 120000);
  });
});