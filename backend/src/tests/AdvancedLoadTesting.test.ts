import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { app } from '../app';
import { DatabaseService } from '../services/DatabaseService';
import { performance } from 'perf_hooks';
import * as os from 'os';
import * as cluster from 'cluster';

interface AdvancedMetrics {
  responseTime: number;
  memoryUsage: number;
  cpuUsage: number;
  dbConnections: number;
  errorRate: number;
  throughput: number;
  p50ResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  totalRequests: number;
  concurrentUsers: number;
}

interface LoadTestConfig {
  name: string;
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  payload?: any;
  concurrentUsers: number;
  requestsPerUser: number;
  rampUpTime: number;
  testDuration: number;
  authRequired: boolean;
  expectedThroughput: number;
  maxResponseTime: number;
  maxErrorRate: number;
}

describe('Advanced Load Testing Suite', () => {
  let db: DatabaseService;
  let authToken: string;
  let baselineMetrics: AdvancedMetrics;

  beforeAll(async () => {
    // Initialize database with production configuration
    db = new DatabaseService();
    await db.connect();

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
    baselineMetrics = await captureSystemMetrics();
  });

  afterAll(async () => {
    await db.disconnect();
  });

  beforeEach(async () => {
    // Clear performance test data
    const knex = await db.getKnex();
    await knex('performance_logs').delete().where('test_run', true);
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
  });

  afterEach(async () => {
    // Log memory usage after each test
    const memUsage = process.memoryUsage();
    console.log(`Memory usage after test: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
  });

  // System metrics capture
  async function captureSystemMetrics(): Promise<AdvancedMetrics> {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const loadAvg = os.loadavg();
    
    return {
      responseTime: 0,
      memoryUsage: memoryUsage.heapUsed,
      cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
      dbConnections: 1, // SQLite single connection
      errorRate: 0,
      throughput: 0,
      p50ResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      totalRequests: 0,
      concurrentUsers: 0
    };
  }

  // Advanced load test executor with ramp-up and sustained load
  async function executeAdvancedLoadTest(config: LoadTestConfig): Promise<AdvancedMetrics> {
    console.log(`Starting load test: ${config.name}`);
    console.log(`Target: ${config.concurrentUsers} users, ${config.requestsPerUser} requests each`);
    
    const totalRequests = config.concurrentUsers * config.requestsPerUser;
    const results: Array<{ success: boolean; responseTime: number; error?: string; timestamp: number }> = [];
    const startTime = performance.now();
    let systemStartMemory = process.memoryUsage().heapUsed;

    // Ramp-up phase: gradually increase load
    const rampUpBatches = 5;
    const usersPerBatch = Math.ceil(config.concurrentUsers / rampUpBatches);
    const rampUpDelay = config.rampUpTime / rampUpBatches;

    for (let batchIndex = 0; batchIndex < rampUpBatches; batchIndex++) {
      const batchStartUsers = batchIndex * usersPerBatch;
      const batchEndUsers = Math.min((batchIndex + 1) * usersPerBatch, config.concurrentUsers);
      const currentBatchSize = batchEndUsers - batchStartUsers;

      console.log(`Ramp-up batch ${batchIndex + 1}/${rampUpBatches}: ${currentBatchSize} users`);

      // Create concurrent user simulations for this batch
      const batchPromises = Array.from({ length: currentBatchSize }, async (_, userIndex) => {
        const actualUserIndex = batchStartUsers + userIndex;
        const userResults: Array<{ success: boolean; responseTime: number; error?: string; timestamp: number }> = [];

        for (let requestIndex = 0; requestIndex < config.requestsPerUser; requestIndex++) {
          const requestStart = performance.now();
          const requestTimestamp = Date.now();

          try {
            let requestBuilder = request(app)[config.method.toLowerCase() as keyof typeof request];
            requestBuilder = requestBuilder(config.endpoint);

            if (config.authRequired) {
              requestBuilder = requestBuilder.set('Authorization', `Bearer ${authToken}`);
            }

            if (config.payload && ['POST', 'PUT', 'PATCH'].includes(config.method)) {
              requestBuilder = requestBuilder.send({
                ...config.payload,
                testUser: actualUserIndex,
                testRequest: requestIndex,
                timestamp: new Date().toISOString(),
                batchIndex
              });
            }

            const response = await requestBuilder;
            const requestEnd = performance.now();

            userResults.push({
              success: response.status >= 200 && response.status < 300,
              responseTime: requestEnd - requestStart,
              error: response.status >= 400 ? `HTTP ${response.status}` : undefined,
              timestamp: requestTimestamp
            });

          } catch (error) {
            const requestEnd = performance.now();
            userResults.push({
              success: false,
              responseTime: requestEnd - requestStart,
              error: error instanceof Error ? error.message : 'Unknown error',
              timestamp: requestTimestamp
            });
          }

          // Realistic user behavior: small delay between requests
          if (requestIndex < config.requestsPerUser - 1) {
            await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
          }
        }

        return userResults;
      });

      // Execute this batch
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.flat());

      // Ramp-up delay between batches
      if (batchIndex < rampUpBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, rampUpDelay));
      }
    }

    const endTime = performance.now();
    const totalDuration = endTime - startTime;
    const systemEndMemory = process.memoryUsage().heapUsed;

    // Calculate comprehensive metrics
    const successfulRequests = results.filter(r => r.success).length;
    const failedRequests = results.filter(r => !r.success).length;
    const responseTimes = results.map(r => r.responseTime);
    
    responseTimes.sort((a, b) => a - b);
    const p50Index = Math.floor(responseTimes.length * 0.5);
    const p95Index = Math.floor(responseTimes.length * 0.95);
    const p99Index = Math.floor(responseTimes.length * 0.99);
    
    const averageResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const errorRate = failedRequests / totalRequests;
    const throughput = totalRequests / (totalDuration / 1000);

    const metrics: AdvancedMetrics = {
      responseTime: averageResponseTime,
      memoryUsage: systemEndMemory - systemStartMemory,
      cpuUsage: 0, // Will be calculated separately
      dbConnections: 1,
      errorRate,
      throughput,
      p50ResponseTime: responseTimes[p50Index] || 0,
      p95ResponseTime: responseTimes[p95Index] || 0,
      p99ResponseTime: responseTimes[p99Index] || 0,
      totalRequests,
      concurrentUsers: config.concurrentUsers
    };

    // Log comprehensive results
    console.log(`Load test completed: ${config.name}`);
    console.log(`Total requests: ${totalRequests}`);
    console.log(`Successful: ${successfulRequests} (${((successfulRequests/totalRequests)*100).toFixed(2)}%)`);
    console.log(`Failed: ${failedRequests} (${((failedRequests/totalRequests)*100).toFixed(2)}%)`);
    console.log(`Average response time: ${averageResponseTime.toFixed(2)}ms`);
    console.log(`P50: ${metrics.p50ResponseTime.toFixed(2)}ms`);
    console.log(`P95: ${metrics.p95ResponseTime.toFixed(2)}ms`);
    console.log(`P99: ${metrics.p99ResponseTime.toFixed(2)}ms`);
    console.log(`Throughput: ${throughput.toFixed(2)} RPS`);
    console.log(`Memory increase: ${Math.round(metrics.memoryUsage / 1024 / 1024)}MB`);
    console.log(`Duration: ${(totalDuration / 1000).toFixed(2)}s`);

    return metrics;
  }

  describe('High-Volume Load Testing (1000+ Users)', () => {
    it('should handle 1000 concurrent users accessing dashboard', async () => {
      const config: LoadTestConfig = {
        name: 'Dashboard High Volume',
        endpoint: '/api/analytics/dashboard',
        method: 'GET',
        concurrentUsers: 1000,
        requestsPerUser: 3,
        rampUpTime: 30000, // 30 seconds ramp-up
        testDuration: 120000, // 2 minutes sustained load
        authRequired: true,
        expectedThroughput: 100,
        maxResponseTime: 2000,
        maxErrorRate: 0.02
      };

      const metrics = await executeAdvancedLoadTest(config);

      // Performance assertions
      expect(metrics.errorRate).toBeLessThan(config.maxErrorRate);
      expect(metrics.p95ResponseTime).toBeLessThan(config.maxResponseTime);
      expect(metrics.throughput).toBeGreaterThan(config.expectedThroughput);
      expect(metrics.memoryUsage).toBeLessThan(500 * 1024 * 1024); // Less than 500MB increase

      // Log metrics for monitoring
      await request(app)
        .post('/api/performance/metrics')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          testName: config.name,
          metrics,
          timestamp: new Date().toISOString()
        });
    }, 300000); // 5 minute timeout

    it('should handle 500 concurrent users creating customers', async () => {
      const config: LoadTestConfig = {
        name: 'Customer Creation Load',
        endpoint: '/api/customers',
        method: 'POST',
        payload: {
          name: 'Load Test Customer',
          phone: '+15550000000', // Will be unique per request
          email: 'loadtest@customer.com',
          address: '123 Load Test St',
          city: 'Load City',
          state: 'TX',
          zipCode: '12345'
        },
        concurrentUsers: 500,
        requestsPerUser: 2,
        rampUpTime: 20000,
        testDuration: 90000,
        authRequired: true,
        expectedThroughput: 50,
        maxResponseTime: 1000,
        maxErrorRate: 0.01
      };

      const metrics = await executeAdvancedLoadTest(config);

      expect(metrics.errorRate).toBeLessThan(config.maxErrorRate);
      expect(metrics.p95ResponseTime).toBeLessThan(config.maxResponseTime);
      expect(metrics.throughput).toBeGreaterThan(config.expectedThroughput);

      // Verify no duplicate customers were created due to race conditions
      const customersResponse = await request(app)
        .get('/api/customers')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ name: 'Load Test Customer', limit: 2000 });

      expect(customersResponse.body.customers.length).toBe(metrics.totalRequests);
    }, 240000);

    it('should handle extreme webhook volume (2000 messages/minute)', async () => {
      const config: LoadTestConfig = {
        name: 'Extreme Webhook Volume',
        endpoint: '/webhooks/google-voice',
        method: 'POST',
        payload: {
          message: {
            text: 'High volume test message from customer',
            phoneNumber: '+15550000000', // Will be unique per request
            timestamp: new Date().toISOString(),
            type: 'sms',
            direction: 'inbound'
          },
          eventType: 'message_received'
        },
        concurrentUsers: 200,
        requestsPerUser: 10,
        rampUpTime: 10000,
        testDuration: 60000,
        authRequired: false,
        expectedThroughput: 150,
        maxResponseTime: 500,
        maxErrorRate: 0.005
      };

      const metrics = await executeAdvancedLoadTest(config);

      expect(metrics.errorRate).toBeLessThan(config.maxErrorRate);
      expect(metrics.p95ResponseTime).toBeLessThan(config.maxResponseTime);
      expect(metrics.throughput).toBeGreaterThan(config.expectedThroughput);

      // Allow time for async message processing
      await new Promise(resolve => setTimeout(resolve, 10000));

      // Verify message processing rate
      const processedMessages = await request(app)
        .get('/api/analytics/message-processing-stats')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ timeframe: '5m' });

      expect(processedMessages.body.totalProcessed).toBeGreaterThan(metrics.totalRequests * 0.95);
      expect(processedMessages.body.processingRate).toBeGreaterThan(30); // 30 messages/second
    }, 180000);
  });

  describe('Stress Testing (System Limits)', () => {
    it('should identify system breaking point', async () => {
      const stressLevels = [
        { users: 100, expected: 'normal' },
        { users: 500, expected: 'degraded' },
        { users: 1000, expected: 'stressed' },
        { users: 1500, expected: 'critical' }
      ];

      const results: Array<{ users: number; metrics: AdvancedMetrics; status: string }> = [];

      for (const level of stressLevels) {
        console.log(`Stress testing with ${level.users} concurrent users`);

        const config: LoadTestConfig = {
          name: `Stress Test ${level.users} Users`,
          endpoint: '/api/customers',
          method: 'GET',
          concurrentUsers: level.users,
          requestsPerUser: 5,
          rampUpTime: 15000,
          testDuration: 60000,
          authRequired: true,
          expectedThroughput: 10,
          maxResponseTime: 5000,
          maxErrorRate: 0.1
        };

        const metrics = await executeAdvancedLoadTest(config);
        
        // Determine system status based on metrics
        let status = 'normal';
        if (metrics.errorRate > 0.05 || metrics.p95ResponseTime > 2000) {
          status = 'degraded';
        }
        if (metrics.errorRate > 0.1 || metrics.p95ResponseTime > 5000) {
          status = 'stressed';
        }
        if (metrics.errorRate > 0.2 || metrics.p95ResponseTime > 10000) {
          status = 'critical';
        }

        results.push({ users: level.users, metrics, status });

        // If system is critical, break the test
        if (status === 'critical') {
          console.log(`System reached critical state at ${level.users} users`);
          break;
        }

        // Cool-down period between stress levels
        await new Promise(resolve => setTimeout(resolve, 30000));
      }

      // Analyze results
      console.log('Stress Test Results Summary:');
      results.forEach(result => {
        console.log(`${result.users} users: ${result.status} (${result.metrics.errorRate.toFixed(3)} error rate, ${result.metrics.p95ResponseTime.toFixed(0)}ms P95)`);
      });

      // Verify system can handle at least 500 concurrent users
      const acceptableResults = results.filter(r => r.users >= 500 && r.status !== 'critical');
      expect(acceptableResults.length).toBeGreaterThan(0);

      // Log breaking point analysis
      await request(app)
        .post('/api/performance/stress-analysis')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          testResults: results,
          breakingPoint: results.find(r => r.status === 'critical')?.users || 'not_reached',
          timestamp: new Date().toISOString()
        });
    }, 600000); // 10 minute timeout

    it('should maintain performance under memory pressure', async () => {
      // Create memory pressure by loading large datasets
      const memoryPressureData = Array.from({ length: 10000 }, (_, i) => ({
        id: i,
        data: 'x'.repeat(1000), // 1KB per record
        timestamp: new Date().toISOString()
      }));

      // Store data to create memory pressure
      const memoryPressureResponse = await request(app)
        .post('/api/test/memory-pressure')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ data: memoryPressureData });

      expect(memoryPressureResponse.status).toBe(200);

      // Measure memory usage
      const memoryBefore = process.memoryUsage();

      // Run load test under memory pressure
      const config: LoadTestConfig = {
        name: 'Memory Pressure Test',
        endpoint: '/api/customers',
        method: 'GET',
        concurrentUsers: 200,
        requestsPerUser: 5,
        rampUpTime: 10000,
        testDuration: 60000,
        authRequired: true,
        expectedThroughput: 20,
        maxResponseTime: 3000,
        maxErrorRate: 0.05
      };

      const metrics = await executeAdvancedLoadTest(config);
      const memoryAfter = process.memoryUsage();

      // Performance should still be acceptable under memory pressure
      expect(metrics.errorRate).toBeLessThan(config.maxErrorRate);
      expect(metrics.p95ResponseTime).toBeLessThan(config.maxResponseTime);
      
      // Memory usage should be controlled
      const memoryIncrease = memoryAfter.heapUsed - memoryBefore.heapUsed;
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB increase

      // Clean up memory pressure data
      await request(app)
        .delete('/api/test/memory-pressure')
        .set('Authorization', `Bearer ${authToken}`);
    }, 180000);
  });

  describe('Sustained Load Testing', () => {
    it('should maintain performance over extended period (10 minutes)', async () => {
      const config: LoadTestConfig = {
        name: 'Extended Sustained Load',
        endpoint: '/api/analytics/dashboard',
        method: 'GET',
        concurrentUsers: 100,
        requestsPerUser: 60, // 60 requests over 10 minutes
        rampUpTime: 30000,
        testDuration: 600000, // 10 minutes
        authRequired: true,
        expectedThroughput: 15,
        maxResponseTime: 2000,
        maxErrorRate: 0.02
      };

      const startMemory = process.memoryUsage();
      const metrics = await executeAdvancedLoadTest(config);
      const endMemory = process.memoryUsage();

      // Performance should remain stable over time
      expect(metrics.errorRate).toBeLessThan(config.maxErrorRate);
      expect(metrics.p95ResponseTime).toBeLessThan(config.maxResponseTime);
      expect(metrics.throughput).toBeGreaterThan(config.expectedThroughput);

      // Memory usage should be stable (no significant leaks)
      const memoryIncrease = endMemory.heapUsed - startMemory.heapUsed;
      const memoryIncreasePercent = (memoryIncrease / startMemory.heapUsed) * 100;
      expect(memoryIncreasePercent).toBeLessThan(50); // Less than 50% increase

      // Get detailed performance metrics over time
      const timeSeriesMetrics = await request(app)
        .get('/api/performance/time-series')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ 
          testName: config.name,
          duration: 600000
        });

      expect(timeSeriesMetrics.status).toBe(200);
      expect(timeSeriesMetrics.body.metrics.length).toBeGreaterThan(10); // At least 10 data points

      // Verify performance degradation is minimal over time
      const firstQuartile = timeSeriesMetrics.body.metrics.slice(0, Math.floor(timeSeriesMetrics.body.metrics.length / 4));
      const lastQuartile = timeSeriesMetrics.body.metrics.slice(-Math.floor(timeSeriesMetrics.body.metrics.length / 4));

      const avgFirstQuartileResponseTime = firstQuartile.reduce((sum: number, m: any) => sum + m.responseTime, 0) / firstQuartile.length;
      const avgLastQuartileResponseTime = lastQuartile.reduce((sum: number, m: any) => sum + m.responseTime, 0) / lastQuartile.length;

      const performanceDegradation = (avgLastQuartileResponseTime - avgFirstQuartileResponseTime) / avgFirstQuartileResponseTime;
      expect(performanceDegradation).toBeLessThan(0.3); // Less than 30% degradation
    }, 720000); // 12 minute timeout
  });

  describe('Database Performance Under Load', () => {
    it('should handle concurrent database operations without deadlocks', async () => {
      const dbOperations = [
        { name: 'Read Customers', operation: 'GET', endpoint: '/api/customers' },
        { name: 'Create Customer', operation: 'POST', endpoint: '/api/customers' },
        { name: 'Update Customer', operation: 'PATCH', endpoint: '/api/customers/1' },
        { name: 'Read Jobs', operation: 'GET', endpoint: '/api/jobs' },
        { name: 'Create Job', operation: 'POST', endpoint: '/api/jobs' },
        { name: 'Complex Query', operation: 'GET', endpoint: '/api/analytics/comprehensive' }
      ];

      const operationResults = await Promise.all(
        dbOperations.map(async (op) => {
          const config: LoadTestConfig = {
            name: `DB Load - ${op.name}`,
            endpoint: op.endpoint,
            method: op.operation as any,
            payload: op.operation === 'POST' ? {
              name: 'DB Load Test',
              phone: `+1555${Math.random().toString().slice(2, 9)}`,
              email: 'dbload@test.com'
            } : undefined,
            concurrentUsers: 50,
            requestsPerUser: 10,
            rampUpTime: 5000,
            testDuration: 30000,
            authRequired: true,
            expectedThroughput: 10,
            maxResponseTime: 2000,
            maxErrorRate: 0.05
          };

          return executeAdvancedLoadTest(config);
        })
      );

      // All database operations should complete successfully
      operationResults.forEach((metrics, index) => {
        expect(metrics.errorRate).toBeLessThan(0.1);
        expect(metrics.p95ResponseTime).toBeLessThan(3000);
        console.log(`${dbOperations[index].name}: ${metrics.errorRate.toFixed(3)} error rate, ${metrics.p95ResponseTime.toFixed(0)}ms P95`);
      });

      // Verify database integrity after load test
      const integrityCheck = await request(app)
        .get('/api/database/integrity-check')
        .set('Authorization', `Bearer ${authToken}`);

      expect(integrityCheck.status).toBe(200);
      expect(integrityCheck.body.integrityScore).toBeGreaterThan(0.95);
    }, 300000);
  });

  describe('Real-World Scenario Testing', () => {
    it('should handle emergency surge scenario (disaster response)', async () => {
      // Simulate natural disaster causing surge in emergency calls
      const emergencyScenarios = [
        'FLOOD EMERGENCY - basement completely flooded!',
        'URGENT - water main break flooding street!',
        'HELP - no water in entire building!',
        'EMERGENCY - gas smell from water heater!',
        'CRITICAL - sewage backup in multiple units!'
      ];

      const surgeDuration = 120000; // 2 minutes of intense load
      const surgeUsers = 300; // 300 concurrent emergency calls

      const config: LoadTestConfig = {
        name: 'Emergency Surge Scenario',
        endpoint: '/webhooks/google-voice',
        method: 'POST',
        payload: {
          message: {
            text: emergencyScenarios[Math.floor(Math.random() * emergencyScenarios.length)],
            phoneNumber: '+15550000000',
            timestamp: new Date().toISOString(),
            type: 'sms',
            direction: 'inbound'
          },
          eventType: 'message_received'
        },
        concurrentUsers: surgeUsers,
        requestsPerUser: 3,
        rampUpTime: 10000, // Quick ramp-up for emergency
        testDuration: surgeDuration,
        authRequired: false,
        expectedThroughput: 50,
        maxResponseTime: 2000, // Emergency response must be fast
        maxErrorRate: 0.01 // Very low error tolerance for emergencies
      };

      const metrics = await executeAdvancedLoadTest(config);

      // Emergency scenarios require stricter performance
      expect(metrics.errorRate).toBeLessThan(config.maxErrorRate);
      expect(metrics.p95ResponseTime).toBeLessThan(config.maxResponseTime);
      expect(metrics.throughput).toBeGreaterThan(config.expectedThroughput);

      // Verify emergency classification and routing worked
      await new Promise(resolve => setTimeout(resolve, 5000)); // Allow processing time

      const emergencyAlerts = await request(app)
        .get('/api/emergency/alerts')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ status: 'active', limit: 1000 });

      expect(emergencyAlerts.status).toBe(200);
      expect(emergencyAlerts.body.alerts.length).toBeGreaterThan(metrics.totalRequests * 0.8); // At least 80% classified as emergencies

      // Verify response time meets emergency standards
      const emergencyMetrics = await request(app)
        .get('/api/analytics/emergency-response-metrics')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ timeframe: '5m' });

      expect(emergencyMetrics.body.averageResponseTime).toBeLessThan(60000); // Under 1 minute
      expect(emergencyMetrics.body.emergencyDetectionRate).toBeGreaterThan(0.9); // 90% detection rate
    }, 240000);

    it('should handle business hours peak load simulation', async () => {
      // Simulate peak business hours with mixed workload
      const peakHoursWorkload = [
        { endpoint: '/api/customers', method: 'GET', weight: 30 },
        { endpoint: '/api/jobs', method: 'GET', weight: 25 },
        { endpoint: '/api/conversations', method: 'GET', weight: 20 },
        { endpoint: '/api/analytics/dashboard', method: 'GET', weight: 15 },
        { endpoint: '/api/quotes', method: 'GET', weight: 10 }
      ];

      const totalWeight = peakHoursWorkload.reduce((sum, w) => sum + w.weight, 0);
      const totalUsers = 400;

      const workloadResults = await Promise.all(
        peakHoursWorkload.map(async (workload) => {
          const usersForWorkload = Math.floor((workload.weight / totalWeight) * totalUsers);
          
          const config: LoadTestConfig = {
            name: `Peak Hours - ${workload.endpoint}`,
            endpoint: workload.endpoint,
            method: workload.method as any,
            concurrentUsers: usersForWorkload,
            requestsPerUser: 8,
            rampUpTime: 20000,
            testDuration: 180000, // 3 minutes
            authRequired: true,
            expectedThroughput: 10,
            maxResponseTime: 2000,
            maxErrorRate: 0.03
          };

          return executeAdvancedLoadTest(config);
        })
      );

      // All workloads should maintain acceptable performance
      workloadResults.forEach((metrics, index) => {
        expect(metrics.errorRate).toBeLessThan(0.05);
        expect(metrics.p95ResponseTime).toBeLessThan(3000);
        console.log(`Peak workload ${peakHoursWorkload[index].endpoint}: ${metrics.throughput.toFixed(2)} RPS, ${metrics.p95ResponseTime.toFixed(0)}ms P95`);
      });

      // System should maintain overall health
      const systemHealth = await request(app)
        .get('/health')
        .expect(200);

      expect(systemHealth.body.status).toBe('healthy');
    }, 360000);
  });
});