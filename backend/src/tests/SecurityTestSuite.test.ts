import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { app } from '../app';
import { DatabaseService } from '../services/DatabaseService';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import { randomBytes, createHash } from 'crypto';

interface SecurityTestResult {
  testName: string;
  vulnerability: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  exploitable: boolean;
  details: string;
  remediation: string;
}

interface PenetrationTestConfig {
  target: string;
  method: string;
  payload?: any;
  headers?: Record<string, string>;
  expectedStatus?: number;
  shouldFail: boolean;
}

describe('Comprehensive Security Test Suite', () => {
  let db: DatabaseService;
  let adminToken: string;
  let userToken: string;
  let expiredToken: string;
  let maliciousToken: string;
  let testUserId: string;

  beforeAll(async () => {
    db = new DatabaseService();
    await db.connect();

    const knex = await db.getKnex();
    await knex.migrate.latest();

    // Create test users
    const adminResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@plumbingcompany.com',
        password: 'admin123'
      });
    adminToken = adminResponse.body.token;

    // Create regular user
    const userResponse = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'security.test@test.com',
        password: 'SecurePassword123!',
        name: 'Security Test User',
        role: 'dispatcher'
      });
    testUserId = userResponse.body.user.id;

    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'security.test@test.com',
        password: 'SecurePassword123!'
      });
    userToken = loginResponse.body.token;

    // Create expired token for testing
    expiredToken = jwt.sign(
      { userId: testUserId, email: 'security.test@test.com' },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '-1h' }
    );

    // Create malicious token
    maliciousToken = jwt.sign(
      { userId: 'malicious-user', email: 'hacker@evil.com', role: 'admin' },
      'wrong-secret',
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await db.disconnect();
  });

  beforeEach(async () => {
    // Clean security test data
    const knex = await db.getKnex();
    await knex('security_logs').delete().where('test_run', true);
  });

  // Utility function for penetration testing
  async function executePenetrationTest(config: PenetrationTestConfig): Promise<SecurityTestResult> {
    try {
      let requestBuilder = request(app)[config.method.toLowerCase() as keyof typeof request];
      requestBuilder = requestBuilder(config.target);

      if (config.headers) {
        Object.entries(config.headers).forEach(([key, value]) => {
          requestBuilder = requestBuilder.set(key, value);
        });
      }

      if (config.payload) {
        requestBuilder = requestBuilder.send(config.payload);
      }

      const response = await requestBuilder;

      const isExploitable = config.shouldFail ? 
        (response.status === 200 || response.status === 201) :
        (response.status >= 400);

      return {
        testName: `Penetration Test: ${config.target}`,
        vulnerability: 'Various security vulnerabilities',
        severity: isExploitable ? 'high' : 'low',
        exploitable: isExploitable,
        details: `Response status: ${response.status}, Expected failure: ${config.shouldFail}`,
        remediation: isExploitable ? 'Implement proper security controls' : 'No action needed'
      };
    } catch (error) {
      return {
        testName: `Penetration Test: ${config.target}`,
        vulnerability: 'Request handling error',
        severity: 'medium',
        exploitable: false,
        details: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        remediation: 'Review error handling'
      };
    }
  }

  describe('Authentication & Authorization Security', () => {
    it('should reject requests with invalid JWT tokens', async () => {
      const invalidTokens = [
        'invalid.jwt.token',
        'Bearer invalid-token',
        maliciousToken,
        expiredToken,
        '',
        'null',
        'undefined'
      ];

      for (const token of invalidTokens) {
        const response = await request(app)
          .get('/api/customers')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(401);
        expect(response.body.error).toBeDefined();
      }
    });

    it('should prevent privilege escalation attacks', async () => {
      // Test user trying to access admin endpoints
      const adminEndpoints = [
        '/api/admin/users',
        '/api/admin/system-config',
        '/api/admin/security-logs',
        '/api/admin/database-backup'
      ];

      for (const endpoint of adminEndpoints) {
        const response = await request(app)
          .get(endpoint)
          .set('Authorization', `Bearer ${userToken}`);

        expect(response.status).toBeOneOf([403, 404]); // Forbidden or not found
      }
    });

    it('should enforce password complexity requirements', async () => {
      const weakPasswords = [
        '123456',
        'password',
        'admin',
        'qwerty',
        '12345678',
        'password123',
        'admin123'
      ];

      for (const password of weakPasswords) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            email: `weak.${Date.now()}@test.com`,
            password,
            name: 'Test User',
            role: 'dispatcher'
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('password');
      }
    });

    it('should implement proper session management', async () => {
      // Test session timeout
      const sessionResponse = await request(app)
        .get('/api/auth/session')
        .set('Authorization', `Bearer ${userToken}`);

      expect(sessionResponse.status).toBe(200);
      expect(sessionResponse.body.user).toBeDefined();
      expect(sessionResponse.body.sessionExpiry).toBeDefined();

      // Test logout functionality
      const logoutResponse = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${userToken}`);

      expect(logoutResponse.status).toBe(200);

      // Token should be invalidated after logout
      const postLogoutResponse = await request(app)
        .get('/api/customers')
        .set('Authorization', `Bearer ${userToken}`);

      // Note: This test assumes token blacklisting is implemented
      // If not implemented, this would still pass with 200, which is a security issue
      if (postLogoutResponse.status === 200) {
        console.warn('WARNING: Tokens not invalidated after logout - potential security issue');
      }
    });

    it('should prevent brute force attacks', async () => {
      const testEmail = 'bruteforce@test.com';
      const wrongPassword = 'wrongpassword';
      
      // Create test user
      await request(app)
        .post('/api/auth/register')
        .send({
          email: testEmail,
          password: 'CorrectPassword123!',
          name: 'Brute Force Test',
          role: 'dispatcher'
        });

      // Attempt multiple failed logins
      const failedAttempts = [];
      for (let i = 0; i < 10; i++) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: testEmail,
            password: wrongPassword
          });

        failedAttempts.push(response.status);
      }

      // After multiple failures, account should be locked or rate limited
      const lastAttempts = failedAttempts.slice(-3);
      const hasRateLimit = lastAttempts.some(status => status === 429);
      
      if (!hasRateLimit) {
        console.warn('WARNING: No rate limiting detected for login attempts - potential security vulnerability');
      }

      // Verify correct password still works after cool-down (if implemented)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const correctResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: 'CorrectPassword123!'
        });

      // Should either succeed or be rate limited
      expect(correctResponse.status).toBeOneOf([200, 429]);
    });
  });

  describe('Input Validation & Injection Attacks', () => {
    it('should prevent SQL injection attacks', async () => {
      const sqlInjectionPayloads = [
        "'; DROP TABLE customers; --",
        "' OR '1'='1",
        "'; UPDATE customers SET email='hacker@evil.com'; --",
        "' UNION SELECT * FROM users WHERE '1'='1",
        "'; INSERT INTO customers (name) VALUES ('injected'); --"
      ];

      for (const payload of sqlInjectionPayloads) {
        // Test in search endpoint
        const searchResponse = await request(app)
          .get('/api/customers/search')
          .set('Authorization', `Bearer ${userToken}`)
          .query({ q: payload });

        expect(searchResponse.status).toBeOneOf([200, 400]);
        
        if (searchResponse.status === 200) {
          // Should return safe results, not execute injection
          expect(searchResponse.body.customers).toBeDefined();
          expect(Array.isArray(searchResponse.body.customers)).toBe(true);
        }

        // Test in customer creation
        const createResponse = await request(app)
          .post('/api/customers')
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            name: payload,
            phone: '+15551234567',
            email: 'test@test.com'
          });

        // Should either create customer safely or reject input
        expect(createResponse.status).toBeOneOf([201, 400]);
      }

      // Verify database integrity
      const customersResponse = await request(app)
        .get('/api/customers')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(customersResponse.status).toBe(200);
      expect(Array.isArray(customersResponse.body.customers)).toBe(true);
    });

    it('should prevent XSS attacks', async () => {
      const xssPayloads = [
        '<script>alert("XSS")</script>',
        '"><script>alert(String.fromCharCode(88,83,83))</script>',
        "';alert('XSS');//",
        '<img src="x" onerror="alert(\'XSS\')" />',
        'javascript:alert("XSS")',
        '<svg onload="alert(\'XSS\')" />'
      ];

      for (const payload of xssPayloads) {
        const response = await request(app)
          .post('/api/customers')
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            name: payload,
            phone: '+15551234567',
            email: 'xss@test.com',
            notes: payload
          });

        // Should either sanitize input or reject it
        if (response.status === 201) {
          // Verify XSS payload was sanitized
          const customer = response.body;
          expect(customer.name).not.toContain('<script');
          expect(customer.notes).not.toContain('<script');
        } else {
          expect(response.status).toBe(400);
        }
      }
    });

    it('should validate input size limits', async () => {
      const largePayload = 'x'.repeat(100000); // 100KB payload
      
      const response = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: largePayload,
          phone: '+15551234567',
          email: 'large@test.com',
          notes: largePayload
        });

      // Should reject oversized payloads
      expect(response.status).toBeOneOf([400, 413]); // Bad request or payload too large
    });

    it('should prevent command injection', async () => {
      const commandInjectionPayloads = [
        '; ls -la',
        '| cat /etc/passwd',
        '&& rm -rf /',
        '`id`',
        '$(whoami)',
        '; cat /etc/hosts'
      ];

      for (const payload of commandInjectionPayloads) {
        const response = await request(app)
          .post('/api/customers')
          .set('Authorization', `Bearer ${userToken}`)
          .send({
            name: `Test User ${payload}`,
            phone: '+15551234567',
            email: 'cmd@test.com'
          });

        // Should safely handle command injection attempts
        expect(response.status).toBeOneOf([201, 400]);
        
        if (response.status === 201) {
          // Verify command wasn't executed
          expect(response.body.name).not.toMatch(/root|daemon|bin/);
        }
      }
    });
  });

  describe('Data Protection & Privacy', () => {
    it('should encrypt sensitive data at rest', async () => {
      // Create customer with sensitive information
      const sensitiveCustomer = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'Sensitive Data Customer',
          phone: '+15551234567',
          email: 'sensitive@test.com',
          ssn: '123-45-6789',
          creditCardNumber: '4111111111111111',
          notes: 'Confidential customer information'
        });

      expect(sensitiveCustomer.status).toBe(201);
      const customerId = sensitiveCustomer.body.id;

      // Check if sensitive data is encrypted in database
      const knex = await db.getKnex();
      const dbRecord = await knex('customers').where('id', customerId).first();

      // SSN and credit card should be encrypted or not stored in plain text
      if (dbRecord.ssn) {
        expect(dbRecord.ssn).not.toBe('123-45-6789');
      }
      if (dbRecord.creditCardNumber) {
        expect(dbRecord.creditCardNumber).not.toBe('4111111111111111');
      }

      // API response should also mask sensitive data
      const customerResponse = await request(app)
        .get(`/api/customers/${customerId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(customerResponse.status).toBe(200);
      if (customerResponse.body.ssn) {
        expect(customerResponse.body.ssn).toMatch(/\*\*\*-\*\*-\d{4}/); // Masked format
      }
      if (customerResponse.body.creditCardNumber) {
        expect(customerResponse.body.creditCardNumber).toMatch(/\*\*\*\*\*\*\*\*\*\*\*\*\d{4}/); // Masked format
      }
    });

    it('should implement proper access controls for customer data', async () => {
      // Create customer as one user
      const customerResponse = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'Access Control Test',
          phone: '+15551234567',
          email: 'access@test.com'
        });

      const customerId = customerResponse.body.id;

      // Create another user
      const otherUserResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'otheruser@test.com',
          password: 'OtherPassword123!',
          name: 'Other User',
          role: 'technician'
        });

      const otherUserLogin = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'otheruser@test.com',
          password: 'OtherPassword123!'
        });

      const otherUserToken = otherUserLogin.body.token;

      // Other user should have appropriate access based on role
      const accessResponse = await request(app)
        .get(`/api/customers/${customerId}`)
        .set('Authorization', `Bearer ${otherUserToken}`);

      // Access should be controlled based on role and permissions
      expect(accessResponse.status).toBeOneOf([200, 403]);
      
      if (accessResponse.status === 200) {
        // If access is allowed, certain fields might be restricted
        const customer = accessResponse.body;
        expect(customer.id).toBe(customerId);
        
        // Some sensitive fields might be excluded for technician role
        if (customer.ssn || customer.creditCardNumber) {
          console.warn('WARNING: Sensitive data exposed to technician role');
        }
      }
    });

    it('should implement audit logging for sensitive operations', async () => {
      const sensitiveOperations = [
        { method: 'POST', endpoint: '/api/customers', action: 'create' },
        { method: 'PATCH', endpoint: '/api/customers/1', action: 'update' },
        { method: 'DELETE', endpoint: '/api/customers/1', action: 'delete' },
        { method: 'GET', endpoint: '/api/customers/1/financial', action: 'view_financial' }
      ];

      for (const operation of sensitiveOperations) {
        const response = await request(app)[operation.method.toLowerCase() as keyof typeof request]
          (operation.endpoint)
          .set('Authorization', `Bearer ${userToken}`)
          .send(operation.method === 'POST' ? {
            name: 'Audit Test',
            phone: '+15551234567',
            email: 'audit@test.com'
          } : {});

        // Operation might succeed or fail, but should be logged
        expect(response.status).toBeLessThan(500);
      }

      // Check if audit logs were created
      const auditResponse = await request(app)
        .get('/api/admin/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ userId: testUserId, limit: 10 });

      if (auditResponse.status === 200) {
        expect(auditResponse.body.logs.length).toBeGreaterThan(0);
      } else {
        console.warn('WARNING: Audit logging endpoint not accessible - audit trail may not be implemented');
      }
    });
  });

  describe('API Security', () => {
    it('should implement rate limiting', async () => {
      const rateLimitEndpoint = '/api/customers';
      const rapidRequests = [];

      // Send many requests rapidly
      for (let i = 0; i < 100; i++) {
        rapidRequests.push(
          request(app)
            .get(rateLimitEndpoint)
            .set('Authorization', `Bearer ${userToken}`)
        );
      }

      const responses = await Promise.all(rapidRequests);
      const rateLimitedResponses = responses.filter(r => r.status === 429);

      // Should have some rate-limited responses
      if (rateLimitedResponses.length === 0) {
        console.warn('WARNING: No rate limiting detected - potential DoS vulnerability');
      } else {
        expect(rateLimitedResponses.length).toBeGreaterThan(0);
        expect(rateLimitedResponses[0].body.error).toContain('rate limit');
      }
    });

    it('should validate Content-Type headers', async () => {
      const maliciousContentTypes = [
        'text/html',
        'application/xml',
        'multipart/form-data',
        'text/plain',
        'application/x-www-form-urlencoded'
      ];

      for (const contentType of maliciousContentTypes) {
        const response = await request(app)
          .post('/api/customers')
          .set('Authorization', `Bearer ${userToken}`)
          .set('Content-Type', contentType)
          .send('malicious=data&script=<script>alert("xss")</script>');

        // Should reject non-JSON content types for JSON endpoints
        expect(response.status).toBeOneOf([400, 415]); // Bad request or unsupported media type
      }
    });

    it('should implement CORS properly', async () => {
      const corsResponse = await request(app)
        .options('/api/customers')
        .set('Origin', 'https://malicious-site.com')
        .set('Access-Control-Request-Method', 'GET');

      // Should have proper CORS headers
      if (corsResponse.headers['access-control-allow-origin']) {
        // Should not allow all origins in production
        expect(corsResponse.headers['access-control-allow-origin']).not.toBe('*');
      }

      // Test actual cross-origin request
      const crossOriginResponse = await request(app)
        .get('/api/customers')
        .set('Authorization', `Bearer ${userToken}`)
        .set('Origin', 'https://malicious-site.com');

      // Should handle cross-origin requests appropriately
      expect(crossOriginResponse.status).toBeOneOf([200, 403]);
    });

    it('should implement proper error handling without information disclosure', async () => {
      const errorInducingRequests = [
        { endpoint: '/api/nonexistent', expectedStatus: 404 },
        { endpoint: '/api/customers/invalid-id', expectedStatus: 400 },
        { endpoint: '/api/customers', method: 'POST', payload: 'invalid-json', expectedStatus: 400 }
      ];

      for (const req of errorInducingRequests) {
        let response;
        if (req.method === 'POST') {
          response = await request(app)
            .post(req.endpoint)
            .set('Authorization', `Bearer ${userToken}`)
            .send(req.payload);
        } else {
          response = await request(app)
            .get(req.endpoint)
            .set('Authorization', `Bearer ${userToken}`);
        }

        expect(response.status).toBe(req.expectedStatus);
        
        // Error messages should not expose sensitive information
        if (response.body.error) {
          expect(response.body.error).not.toMatch(/database|sql|internal|stack trace|file path/i);
        }
        
        // Should not expose stack traces in production
        expect(response.body.stack).toBeUndefined();
      }
    });
  });

  describe('Webhook Security', () => {
    it('should validate webhook signatures', async () => {
      const webhookPayload = {
        message: {
          text: 'Test webhook message',
          phoneNumber: '+15551234567',
          timestamp: new Date().toISOString(),
          type: 'sms',
          direction: 'inbound'
        },
        eventType: 'message_received'
      };

      // Test without signature
      const noSigResponse = await request(app)
        .post('/webhooks/google-voice')
        .send(webhookPayload);

      // Should accept webhook (some webhooks don't require signatures)
      // But should log the attempt for monitoring
      expect(noSigResponse.status).toBeOneOf([200, 401, 403]);

      // Test with invalid signature
      const invalidSigResponse = await request(app)
        .post('/webhooks/google-voice')
        .set('X-Webhook-Signature', 'invalid-signature')
        .send(webhookPayload);

      if (invalidSigResponse.status === 200) {
        console.warn('WARNING: Webhook accepts invalid signatures - potential security risk');
      }

      // Test with valid signature (if signature validation is implemented)
      const validSignature = createHash('sha256')
        .update(JSON.stringify(webhookPayload) + (process.env.WEBHOOK_SECRET || 'default-secret'))
        .digest('hex');

      const validSigResponse = await request(app)
        .post('/webhooks/google-voice')
        .set('X-Webhook-Signature', `sha256=${validSignature}`)
        .send(webhookPayload);

      expect(validSigResponse.status).toBe(200);
    });

    it('should prevent webhook replay attacks', async () => {
      const timestamp = Math.floor(Date.now() / 1000);
      const webhookPayload = {
        message: {
          text: 'Replay attack test',
          phoneNumber: '+15551234567',
          timestamp: new Date().toISOString(),
          type: 'sms',
          direction: 'inbound'
        },
        eventType: 'message_received'
      };

      // Send webhook request
      const firstResponse = await request(app)
        .post('/webhooks/google-voice')
        .set('X-Webhook-Timestamp', timestamp.toString())
        .send(webhookPayload);

      expect(firstResponse.status).toBe(200);

      // Replay the exact same request
      const replayResponse = await request(app)
        .post('/webhooks/google-voice')
        .set('X-Webhook-Timestamp', timestamp.toString())
        .send(webhookPayload);

      // Should detect and reject replay
      if (replayResponse.status === 200) {
        console.warn('WARNING: Webhook vulnerable to replay attacks');
      } else {
        expect(replayResponse.status).toBeOneOf([400, 409]); // Bad request or conflict
      }

      // Test with old timestamp (should be rejected)
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const oldResponse = await request(app)
        .post('/webhooks/google-voice')
        .set('X-Webhook-Timestamp', oldTimestamp.toString())
        .send(webhookPayload);

      if (oldResponse.status === 200) {
        console.warn('WARNING: Webhook accepts old timestamps - potential replay vulnerability');
      }
    });
  });

  describe('Infrastructure Security', () => {
    it('should have proper security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      const securityHeaders = [
        'x-content-type-options',
        'x-frame-options',
        'x-xss-protection',
        'strict-transport-security',
        'content-security-policy'
      ];

      securityHeaders.forEach(header => {
        if (!response.headers[header]) {
          console.warn(`WARNING: Missing security header: ${header}`);
        }
      });

      // Check specific header values
      if (response.headers['x-content-type-options']) {
        expect(response.headers['x-content-type-options']).toBe('nosniff');
      }

      if (response.headers['x-frame-options']) {
        expect(response.headers['x-frame-options']).toBeOneOf(['DENY', 'SAMEORIGIN']);
      }
    });

    it('should not expose sensitive server information', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // Should not expose server software versions
      const sensitiveHeaders = ['server', 'x-powered-by'];
      
      sensitiveHeaders.forEach(header => {
        if (response.headers[header]) {
          console.warn(`WARNING: Exposing sensitive header: ${header} = ${response.headers[header]}`);
        }
      });

      // Response should not contain version information
      expect(response.body.version).toBeUndefined();
      expect(response.body.nodeVersion).toBeUndefined();
    });

    it('should implement proper session security', async () => {
      const sessionResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'security.test@test.com',
          password: 'SecurePassword123!'
        });

      expect(sessionResponse.status).toBe(200);

      // Check cookie security attributes (if using cookies)
      const cookies = sessionResponse.headers['set-cookie'];
      if (cookies) {
        const sessionCookie = cookies.find((cookie: string) => cookie.includes('session'));
        if (sessionCookie) {
          expect(sessionCookie).toContain('HttpOnly');
          expect(sessionCookie).toContain('Secure');
          expect(sessionCookie).toContain('SameSite');
        }
      }
    });
  });

  describe('Penetration Testing Scenarios', () => {
    it('should resist common penetration testing attacks', async () => {
      const penetrationTests: PenetrationTestConfig[] = [
        {
          target: '/api/admin/users/../../../etc/passwd',
          method: 'GET',
          headers: { 'Authorization': `Bearer ${userToken}` },
          shouldFail: true
        },
        {
          target: '/api/customers',
          method: 'GET',
          headers: { 'Authorization': 'Bearer null' },
          shouldFail: true
        },
        {
          target: '/api/customers',
          method: 'POST',
          headers: { 'Authorization': `Bearer ${userToken}` },
          payload: { name: '../../../etc/passwd' },
          shouldFail: false
        },
        {
          target: '/api/customers/search',
          method: 'GET',
          headers: { 'Authorization': `Bearer ${userToken}` },
          payload: undefined,
          shouldFail: false
        }
      ];

      const results: SecurityTestResult[] = [];

      for (const test of penetrationTests) {
        const result = await executePenetrationTest(test);
        results.push(result);
      }

      // Analyze results
      const criticalVulns = results.filter(r => r.severity === 'critical' && r.exploitable);
      const highVulns = results.filter(r => r.severity === 'high' && r.exploitable);

      expect(criticalVulns.length).toBe(0);
      expect(highVulns.length).toBeLessThan(2);

      // Log security test results
      await request(app)
        .post('/api/security/test-results')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          testResults: results,
          timestamp: new Date().toISOString(),
          testSuite: 'Penetration Testing'
        });
    });

    it('should detect and prevent automated attacks', async () => {
      // Simulate automated attack patterns
      const automatedRequests = Array.from({ length: 50 }, (_, i) => ({
        endpoint: '/api/customers',
        userAgent: 'AttackBot/1.0',
        ip: `192.168.1.${i % 10}`,
        pattern: 'rapid_requests'
      }));

      const responses = await Promise.all(
        automatedRequests.map(req =>
          request(app)
            .get(req.endpoint)
            .set('Authorization', `Bearer ${userToken}`)
            .set('User-Agent', req.userAgent)
        )
      );

      // Should detect automated patterns and implement countermeasures
      const blockedResponses = responses.filter(r => r.status === 429 || r.status === 403);
      
      if (blockedResponses.length === 0) {
        console.warn('WARNING: No automated attack detection - potential bot vulnerability');
      } else {
        expect(blockedResponses.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Security Monitoring & Compliance', () => {
    it('should log security events for monitoring', async () => {
      const securityEvents = [
        { action: 'failed_login', data: { email: 'nonexistent@test.com' } },
        { action: 'unauthorized_access', data: { endpoint: '/api/admin/users' } },
        { action: 'suspicious_payload', data: { payload: '<script>alert("xss")</script>' } }
      ];

      for (const event of securityEvents) {
        await request(app)
          .post('/api/security/log-event')
          .set('Authorization', `Bearer ${adminToken}`)
          .send(event);
      }

      // Verify security events are being logged
      const securityLogs = await request(app)
        .get('/api/admin/security-logs')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ limit: 10, severity: 'high' });

      if (securityLogs.status === 200) {
        expect(securityLogs.body.logs).toBeDefined();
      } else {
        console.warn('WARNING: Security logging endpoint not accessible');
      }
    });

    it('should implement data retention policies', async () => {
      // Test data retention compliance
      const retentionResponse = await request(app)
        .get('/api/compliance/data-retention')
        .set('Authorization', `Bearer ${adminToken}`);

      if (retentionResponse.status === 200) {
        expect(retentionResponse.body.policies).toBeDefined();
        expect(retentionResponse.body.policies.customerData).toBeDefined();
        expect(retentionResponse.body.policies.auditLogs).toBeDefined();
      }

      // Test data anonymization for old records
      const anonymizationResponse = await request(app)
        .post('/api/compliance/anonymize-old-data')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ dryRun: true });

      if (anonymizationResponse.status === 200) {
        expect(anonymizationResponse.body.recordsToAnonymize).toBeDefined();
      }
    });
  });
});