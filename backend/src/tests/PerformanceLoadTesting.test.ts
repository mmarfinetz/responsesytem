import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { app } from '../app';
import { DatabaseService } from '../services/DatabaseService';
import { performance } from 'perf_hooks';

interface PerformanceMetrics {
  responseTime: number;
  memoryUsage: number;
  cpuUsage?: number;
  dbConnections: number;
  errorRate: number;
  throughput: number;
}

interface LoadTestResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  requestsPerSecond: number;
  errors: string[];
}

describe('Performance and Load Testing Suite', () => {
  let db: DatabaseService;
  let authToken: string;
  let baselineMetrics: PerformanceMetrics;

  beforeAll(async () => {
    // Initialize database
    db = new DatabaseService();
    await db.connect();

    // Run migrations
    const knex = await db.getKnex();
    await knex.migrate.latest();

    // Get authentication token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@plumbingcompany.com',
        password: 'admin123'
      });

    authToken = loginResponse.body.token;

    // Establish baseline metrics
    baselineMetrics = await captureMetrics();
  });

  afterAll(async () => {
    await db.disconnect();
  });

  beforeEach(async () => {
    // Clear performance-related test data
    const knex = await db.getKnex();
    await knex('performance_logs').delete().where('test_run', true);
  });

  // Utility function to capture system metrics
  async function captureMetrics(): Promise<PerformanceMetrics> {
    const memoryUsage = process.memoryUsage();
    const knex = await db.getKnex();
    
    // Get database connection count
    const dbStats = await knex.raw('PRAGMA database_list');
    
    return {
      responseTime: 0,
      memoryUsage: memoryUsage.heapUsed,
      dbConnections: 1, // SQLite doesn't have connection pooling like PostgreSQL
      errorRate: 0,
      throughput: 0
    };
  }

  // Utility function for concurrent request testing
  async function executeLoadTest(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH',
    payload: any,
    concurrentUsers: number,
    requestsPerUser: number,
    authRequired: boolean = true
  ): Promise<LoadTestResult> {
    const totalRequests = concurrentUsers * requestsPerUser;
    const results: Array<{ success: boolean; responseTime: number; error?: string }> = [];
    const startTime = performance.now();

    // Create concurrent user simulations
    const userPromises = Array.from({ length: concurrentUsers }, async (_, userIndex) => {
      const userResults: Array<{ success: boolean; responseTime: number; error?: string }> = [];

      for (let requestIndex = 0; requestIndex < requestsPerUser; requestIndex++) {
        const requestStart = performance.now();
        
        try {
          let requestBuilder = request(app)[method.toLowerCase() as 'get' | 'post' | 'put' | 'patch'](endpoint);
          
          if (authRequired) {
            requestBuilder = requestBuilder.set('Authorization', `Bearer ${authToken}`);
          }
          
          if (payload && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            requestBuilder = requestBuilder.send({
              ...payload,
              testUser: userIndex,
              testRequest: requestIndex,
              timestamp: new Date().toISOString()
            });
          }

          const response = await requestBuilder;
          const requestEnd = performance.now();
          
          userResults.push({
            success: response.status >= 200 && response.status < 300,
            responseTime: requestEnd - requestStart,
            error: response.status >= 400 ? `HTTP ${response.status}` : undefined
          });
        } catch (error) {
          const requestEnd = performance.now();
          userResults.push({
            success: false,
            responseTime: requestEnd - requestStart,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }

        // Small delay between requests from same user to simulate realistic usage
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      return userResults;
    });

    // Execute all user simulations concurrently
    const allUserResults = await Promise.all(userPromises);
    const flatResults = allUserResults.flat();
    
    const endTime = performance.now();
    const totalDuration = endTime - startTime;

    // Calculate metrics
    const successfulRequests = flatResults.filter(r => r.success).length;
    const failedRequests = flatResults.filter(r => !r.success).length;
    const responseTimes = flatResults.map(r => r.responseTime);
    const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    
    responseTimes.sort((a, b) => a - b);
    const p95Index = Math.floor(responseTimes.length * 0.95);
    const p99Index = Math.floor(responseTimes.length * 0.99);
    
    return {
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime,
      p95ResponseTime: responseTimes[p95Index] || 0,
      p99ResponseTime: responseTimes[p99Index] || 0,
      requestsPerSecond: totalRequests / (totalDuration / 1000),
      errors: flatResults.filter(r => r.error).map(r => r.error!).slice(0, 10) // First 10 errors
    };
  }

  describe('API Performance Benchmarks', () => {
    it('should meet response time requirements for core endpoints', async () => {
      const endpoints = [
        { path: '/api/customers', method: 'GET' as const, name: 'List Customers' },
        { path: '/api/conversations', method: 'GET' as const, name: 'List Conversations' },
        { path: '/api/jobs', method: 'GET' as const, name: 'List Jobs' },
        { path: '/api/quotes', method: 'GET' as const, name: 'List Quotes' },
        { path: '/health', method: 'GET' as const, name: 'Health Check', auth: false }
      ];

      for (const endpoint of endpoints) {
        const startTime = performance.now();
        
        let requestBuilder = request(app)[endpoint.method.toLowerCase() as 'get'](endpoint.path);
        if (endpoint.auth !== false) {
          requestBuilder = requestBuilder.set('Authorization', `Bearer ${authToken}`);
        }
        
        const response = await requestBuilder;
        const endTime = performance.now();
        const responseTime = endTime - startTime;

        // Performance assertions
        expect(response.status).toBeLessThan(400);
        expect(responseTime).toBeLessThan(200); // Less than 200ms for 95th percentile
        
        console.log(`${endpoint.name}: ${responseTime.toFixed(2)}ms`);
      }
    }, 30000);

    it('should handle customer search with acceptable performance', async () => {
      // Create test customers for search
      const testCustomers = Array.from({ length: 100 }, (_, i) => ({
        name: `Test Customer ${i}`,
        phone: `+1555${String(i).padStart(7, '0')}`,
        email: `test${i}@customer.com`,
        address: `${i} Test Street`,
        city: 'Test City',
        state: 'TX',
        zipCode: '12345'
      }));

      // Create customers in batches to avoid overwhelming the system
      const batchSize = 10;
      for (let i = 0; i < testCustomers.length; i += batchSize) {
        const batch = testCustomers.slice(i, i + batchSize);
        await Promise.all(
          batch.map(customer =>
            request(app)
              .post('/api/customers')
              .set('Authorization', `Bearer ${authToken}`)
              .send(customer)
          )
        );
      }

      // Performance test various search scenarios
      const searchScenarios = [
        { query: 'Test Customer 50', expectedResults: 1, name: 'Exact Name Search' },
        { query: '+15550000050', expectedResults: 1, name: 'Phone Search' },
        { query: 'test50@customer.com', expectedResults: 1, name: 'Email Search' },
        { query: 'Test', expectedResults: 100, name: 'Partial Name Search' },
        { query: '50 Test Street', expectedResults: 1, name: 'Address Search' }
      ];

      for (const scenario of searchScenarios) {
        const startTime = performance.now();
        
        const response = await request(app)
          .get('/api/customers/search')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ q: scenario.query, limit: 20 });
        
        const endTime = performance.now();
        const responseTime = endTime - startTime;

        expect(response.status).toBe(200);
        expect(responseTime).toBeLessThan(500); // Search should be under 500ms
        
        console.log(`${scenario.name}: ${responseTime.toFixed(2)}ms, found ${response.body.customers.length} results`);
      }
    }, 60000);

    it('should handle AI response generation within time limits', async () => {
      // Create test conversation
      const customerResponse = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'AI Test Customer',
          phone: '+15559999999',
          email: 'ai@test.com'
        });

      const conversationResponse = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          customerId: customerResponse.body.id,
          phoneNumber: '+15559999999',
          priority: 'normal'
        });

      const conversationId = conversationResponse.body.id;

      // Test AI response generation performance
      const aiScenarios = [
        {
          context: { serviceType: 'general_inquiry', urgencyLevel: 'normal' },
          name: 'General Inquiry'
        },
        {
          context: { serviceType: 'emergency', urgencyLevel: 'high' },
          name: 'Emergency Response'
        },
        {
          context: { serviceType: 'quote_request', urgencyLevel: 'normal' },
          name: 'Quote Request'
        }
      ];

      for (const scenario of aiScenarios) {
        const startTime = performance.now();
        
        const response = await request(app)
          .post('/api/ai/generate-response')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            conversationId,
            context: scenario.context
          });
        
        const endTime = performance.now();
        const responseTime = endTime - startTime;

        expect(response.status).toBe(200);
        expect(responseTime).toBeLessThan(2000); // AI responses should be under 2 seconds
        expect(response.body.response).toBeTruthy();
        
        console.log(`AI ${scenario.name}: ${responseTime.toFixed(2)}ms`);
      }
    }, 45000);
  });

  describe('Load Testing', () => {
    it('should handle 100 concurrent users viewing dashboard', async () => {
      const result = await executeLoadTest(
        '/api/analytics/dashboard',
        'GET',
        null,
        100, // concurrent users
        5    // requests per user
      );

      // Load test assertions
      expect(result.successfulRequests).toBeGreaterThan(result.totalRequests * 0.95); // 95% success rate
      expect(result.averageResponseTime).toBeLessThan(1000); // Average under 1 second
      expect(result.p95ResponseTime).toBeLessThan(2000); // 95th percentile under 2 seconds
      expect(result.requestsPerSecond).toBeGreaterThan(10); // At least 10 RPS throughput

      console.log('Dashboard Load Test Results:', {
        totalRequests: result.totalRequests,
        successRate: `${((result.successfulRequests / result.totalRequests) * 100).toFixed(2)}%`,
        avgResponseTime: `${result.averageResponseTime.toFixed(2)}ms`,
        p95ResponseTime: `${result.p95ResponseTime.toFixed(2)}ms`,
        throughput: `${result.requestsPerSecond.toFixed(2)} RPS`
      });
    }, 120000);

    it('should handle concurrent customer creation without conflicts', async () => {
      const result = await executeLoadTest(
        '/api/customers',
        'POST',
        {
          name: 'Load Test Customer',
          phone: '+15550000000', // Will be modified per request
          email: 'loadtest@customer.com'
        },
        50, // concurrent users
        2   // requests per user
      );

      // Verify all customers were created successfully
      expect(result.successfulRequests).toBe(result.totalRequests);
      expect(result.failedRequests).toBe(0);
      expect(result.averageResponseTime).toBeLessThan(500);

      // Verify no duplicate customers were created
      const customersResponse = await request(app)
        .get('/api/customers')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ name: 'Load Test Customer', limit: 200 });

      expect(customersResponse.body.customers.length).toBe(result.totalRequests);

      console.log('Customer Creation Load Test Results:', {
        customersCreated: result.successfulRequests,
        avgResponseTime: `${result.averageResponseTime.toFixed(2)}ms`,
        throughput: `${result.requestsPerSecond.toFixed(2)} RPS`
      });
    }, 90000);

    it('should handle high volume of webhook messages', async () => {
      // Simulate high volume of incoming messages
      const messageVolume = 1000;
      const concurrency = 50;
      const messagesPerBatch = messageVolume / concurrency;

      const result = await executeLoadTest(
        '/webhooks/google-voice',
        'POST',
        {
          message: {
            text: 'Load test message from customer',
            phoneNumber: '+15550000000', // Will be modified per request
            timestamp: new Date().toISOString(),
            type: 'sms',
            direction: 'inbound'
          },
          eventType: 'message_received'
        },
        concurrency,
        messagesPerBatch,
        false // webhook doesn't require auth
      );

      // Webhook processing assertions
      expect(result.successfulRequests).toBeGreaterThan(result.totalRequests * 0.98); // 98% success rate
      expect(result.averageResponseTime).toBeLessThan(100); // Webhooks should be fast
      expect(result.requestsPerSecond).toBeGreaterThan(50); // High throughput

      // Verify messages were processed correctly
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for async processing

      const conversationsResponse = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ limit: messageVolume });

      expect(conversationsResponse.body.conversations.length).toBeGreaterThan(messageVolume * 0.9);

      console.log('Webhook Load Test Results:', {
        messagesProcessed: result.successfulRequests,
        avgResponseTime: `${result.averageResponseTime.toFixed(2)}ms`,
        throughput: `${result.requestsPerSecond.toFixed(2)} RPS`,
        conversationsCreated: conversationsResponse.body.conversations.length
      });
    }, 180000);

    it('should maintain performance under memory pressure', async () => {
      // Create memory pressure by loading large datasets
      const largeDataSets = [
        { endpoint: '/api/customers', size: 1000, name: 'Customers' },
        { endpoint: '/api/jobs', size: 500, name: 'Jobs' },
        { endpoint: '/api/conversations', size: 200, name: 'Conversations' }
      ];

      const initialMemory = process.memoryUsage();

      for (const dataset of largeDataSets) {
        const result = await executeLoadTest(
          dataset.endpoint,
          'GET',
          null,
          20, // concurrent users
          5   // requests per user
        );

        expect(result.averageResponseTime).toBeLessThan(1000);
        expect(result.successfulRequests / result.totalRequests).toBeGreaterThan(0.95);

        console.log(`${dataset.name} under memory pressure: ${result.averageResponseTime.toFixed(2)}ms avg`);
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreasePercent = (memoryIncrease / initialMemory.heapUsed) * 100;

      // Memory increase should be reasonable
      expect(memoryIncreasePercent).toBeLessThan(200); // Less than 200% increase

      console.log(`Memory usage increased by ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB (${memoryIncreasePercent.toFixed(2)}%)`);
    }, 120000);
  });

  describe('Database Performance', () => {
    it('should handle complex queries efficiently', async () => {
      // Create test data for complex queries
      await createLargeTestDataset();

      const complexQueries = [
        {
          name: 'Customer Search with Filters',
          test: () => request(app)
            .get('/api/customers')
            .set('Authorization', `Bearer ${authToken}`)
            .query({
              city: 'Test City',
              state: 'TX',
              status: 'active',
              hasJobs: true,
              sortBy: 'totalRevenue',
              order: 'desc',
              limit: 50
            })
        },
        {
          name: 'Jobs with Customer and Quote Data',
          test: () => request(app)
            .get('/api/jobs')
            .set('Authorization', `Bearer ${authToken}`)
            .query({
              status: 'completed',
              include: 'customer,quote,technician',
              dateFrom: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
              dateTo: new Date().toISOString(),
              limit: 100
            })
        },
        {
          name: 'Analytics Dashboard Data',
          test: () => request(app)
            .get('/api/analytics/comprehensive')
            .set('Authorization', `Bearer ${authToken}`)
            .query({
              period: '30days',
              includeCharts: true,
              includeMetrics: true
            })
        }
      ];

      for (const query of complexQueries) {
        const startTime = performance.now();
        const response = await query.test();
        const endTime = performance.now();
        const queryTime = endTime - startTime;

        expect(response.status).toBe(200);
        expect(queryTime).toBeLessThan(1000); // Complex queries under 1 second

        console.log(`${query.name}: ${queryTime.toFixed(2)}ms`);
      }
    }, 60000);

    it('should handle concurrent database operations without deadlocks', async () => {
      const concurrentOperations = 50;
      const operations = Array.from({ length: concurrentOperations }, async (_, i) => {
        // Mix of read and write operations
        const operations = [
          // Read operations
          () => request(app)
            .get('/api/customers')
            .set('Authorization', `Bearer ${authToken}`)
            .query({ limit: 10, offset: i * 10 }),
          
          // Write operations
          () => request(app)
            .post('/api/customers')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              name: `Concurrent Customer ${i}`,
              phone: `+1555${String(i).padStart(7, '0')}`,
              email: `concurrent${i}@test.com`
            }),
          
          // Update operations
          () => request(app)
            .get('/api/customers')
            .set('Authorization', `Bearer ${authToken}`)
            .query({ limit: 1 })
            .then(resp => {
              if (resp.body.customers.length > 0) {
                return request(app)
                  .patch(`/api/customers/${resp.body.customers[0].id}`)
                  .set('Authorization', `Bearer ${authToken}`)
                  .send({ notes: `Updated by concurrent test ${i}` });
              }
              return Promise.resolve({ status: 200 });
            })
        ];

        // Randomly select operation type
        const operation = operations[Math.floor(Math.random() * operations.length)];
        return operation();
      });

      const startTime = performance.now();
      const results = await Promise.allSettled(operations);
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      // Check for deadlocks or failures
      const successful = results.filter(r => r.status === 'fulfilled' && 
        (r.value as any).status >= 200 && (r.value as any).status < 300).length;
      const failed = results.length - successful;

      expect(failed).toBeLessThan(results.length * 0.05); // Less than 5% failure rate
      expect(totalTime).toBeLessThan(30000); // Complete within 30 seconds

      console.log(`Concurrent DB Operations: ${successful}/${results.length} successful in ${totalTime.toFixed(2)}ms`);
    }, 60000);
  });

  describe('Real-time Performance', () => {
    it('should handle real-time updates efficiently', async () => {
      // This would test WebSocket performance in a real implementation
      // For now, we'll test the polling-based updates
      
      const startTime = performance.now();
      
      // Simulate real-time scenario: multiple status updates
      const statusUpdates = Array.from({ length: 20 }, async (_, i) => {
        // Create job
        const jobResponse = await request(app)
          .post('/api/jobs')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            customerId: 'test_customer_realtime',
            type: 'service',
            serviceType: 'pipe_repair',
            description: `Real-time test job ${i}`,
            status: 'scheduled',
            priority: 'normal'
          });

        if (jobResponse.status !== 201) return null;

        // Update status multiple times
        const statuses = ['assigned', 'in_progress', 'completed'];
        for (const status of statuses) {
          await request(app)
            .patch(`/api/jobs/${jobResponse.body.id}/status`)
            .set('Authorization', `Bearer ${authToken}`)
            .send({ status });
          
          // Small delay to simulate real-time progression
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        return jobResponse.body.id;
      });

      const jobIds = (await Promise.all(statusUpdates)).filter(Boolean);
      const endTime = performance.now();
      const totalTime = endTime - startTime;

      expect(jobIds.length).toBeGreaterThan(15); // Most should succeed
      expect(totalTime).toBeLessThan(20000); // Complete within 20 seconds

      console.log(`Real-time Updates: ${jobIds.length} jobs processed in ${totalTime.toFixed(2)}ms`);
    }, 30000);
  });

  // Utility function to create large test dataset
  async function createLargeTestDataset(): Promise<void> {
    const customerCount = 200;
    const jobsPerCustomer = 5;

    console.log('Creating large test dataset...');

    // Create customers in batches
    const batchSize = 20;
    for (let i = 0; i < customerCount; i += batchSize) {
      const customerBatch = Array.from({ length: Math.min(batchSize, customerCount - i) }, (_, j) => {
        const customerIndex = i + j;
        return request(app)
          .post('/api/customers')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: `Performance Test Customer ${customerIndex}`,
            phone: `+1555${String(customerIndex).padStart(7, '0')}`,
            email: `perf${customerIndex}@test.com`,
            address: `${customerIndex} Performance St`,
            city: 'Test City',
            state: 'TX',
            zipCode: '12345',
            status: 'active'
          });
      });

      await Promise.all(customerBatch);
    }

    console.log(`Created ${customerCount} test customers`);
  }
});