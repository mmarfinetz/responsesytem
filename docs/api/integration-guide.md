# API Integration Guide

## Integration Overview

This guide provides comprehensive instructions for integrating with the Plumbing Business AI Platform API. It covers common integration patterns, best practices, and real-world examples.

## Table of Contents

1. [Integration Patterns](#integration-patterns)
2. [Authentication & Security](#authentication--security)
3. [Common Use Cases](#common-use-cases)
4. [Webhook Integration](#webhook-integration)
5. [Error Handling & Resilience](#error-handling--resilience)
6. [Performance Optimization](#performance-optimization)
7. [Testing & Debugging](#testing--debugging)
8. [Production Deployment](#production-deployment)

## Integration Patterns

### 1. Customer Portal Integration

Build a customer-facing portal that allows customers to request services, track jobs, and communicate with your team.

```javascript
// Customer Portal Integration Example
class CustomerPortal {
  constructor(apiClient) {
    this.api = apiClient;
  }

  async createServiceRequest(customerData, serviceDetails) {
    try {
      // 1. Create or find customer
      let customer = await this.findCustomerByPhone(customerData.phone);
      if (!customer) {
        customer = await this.api.customers.create(customerData);
      }

      // 2. Create conversation for the request
      const conversation = await this.api.conversations.create({
        customerId: customer.id,
        phoneNumber: customerData.phone,
        priority: serviceDetails.urgency || 'normal'
      });

      // 3. Generate AI response for initial acknowledgment
      const aiResponse = await this.api.ai.generateResponse({
        conversationId: conversation.id,
        context: {
          serviceType: serviceDetails.type,
          urgencyLevel: serviceDetails.urgency,
          customerType: customer.totalServices > 0 ? 'returning' : 'new'
        }
      });

      // 4. Create job if it's a direct service request
      const job = await this.api.jobs.create({
        customerId: customer.id,
        conversationId: conversation.id,
        type: 'service',
        serviceType: serviceDetails.type,
        description: serviceDetails.description,
        priority: serviceDetails.urgency,
        preferredDate: serviceDetails.preferredDate
      });

      return {
        customer,
        conversation,
        job,
        aiResponse: aiResponse.response
      };

    } catch (error) {
      console.error('Service request creation failed:', error);
      throw new Error('Failed to create service request. Please try again.');
    }
  }

  async getCustomerJobs(customerId) {
    const jobs = await this.api.jobs.list({
      customerId,
      include: 'technician,quote',
      sortBy: 'scheduledDate',
      order: 'desc'
    });

    return jobs.map(job => ({
      id: job.id,
      type: job.type,
      description: job.description,
      status: job.status,
      scheduledDate: job.scheduledDate,
      technician: job.technician?.name,
      quote: job.quote?.totalAmount
    }));
  }

  async trackJobStatus(jobId) {
    const job = await this.api.jobs.get(jobId, {
      include: 'statusHistory,technician'
    });

    return {
      currentStatus: job.status,
      statusHistory: job.statusHistory,
      technician: job.technician,
      estimatedArrival: job.estimatedArrival,
      updates: job.statusHistory.map(update => ({
        status: update.status,
        timestamp: update.createdAt,
        notes: update.notes
      }))
    };
  }
}
```

### 2. Mobile App Integration

Integrate with a mobile app for technicians to manage jobs, update statuses, and capture work completion data.

```javascript
// Mobile App Integration Example
class TechnicianMobileApp {
  constructor(apiClient, technicianId) {
    this.api = apiClient;
    this.technicianId = technicianId;
  }

  async getTodaysJobs() {
    const today = new Date().toISOString().split('T')[0];
    
    const jobs = await this.api.jobs.list({
      assignedTechnicianId: this.technicianId,
      dateFrom: `${today}T00:00:00Z`,
      dateTo: `${today}T23:59:59Z`,
      include: 'customer,property',
      sortBy: 'scheduledDate',
      order: 'asc'
    });

    return jobs.map(job => ({
      id: job.id,
      customer: {
        name: job.customer.name,
        phone: job.customer.phone,
        address: job.customer.address
      },
      serviceType: job.serviceType,
      description: job.description,
      scheduledTime: job.scheduledDate,
      estimatedDuration: job.estimatedDuration,
      priority: job.priority,
      status: job.status
    }));
  }

  async updateJobStatus(jobId, status, location, notes) {
    try {
      const update = {
        status,
        statusNotes: notes,
        updatedAt: new Date().toISOString()
      };

      if (location) {
        update.location = {
          latitude: location.lat,
          longitude: location.lng,
          accuracy: location.accuracy,
          timestamp: new Date().toISOString()
        };
      }

      // Add specific fields based on status
      switch (status) {
        case 'en_route':
          update.departureTime = new Date().toISOString();
          break;
        case 'arrived':
          update.arrivalTime = new Date().toISOString();
          break;
        case 'in_progress':
          update.workStartTime = new Date().toISOString();
          break;
      }

      const updatedJob = await this.api.jobs.updateStatus(jobId, update);
      
      // Send customer notification for key status changes
      if (['en_route', 'arrived', 'in_progress', 'completed'].includes(status)) {
        await this.sendCustomerNotification(updatedJob, status);
      }

      return updatedJob;

    } catch (error) {
      console.error('Failed to update job status:', error);
      throw error;
    }
  }

  async completeJob(jobId, completionData) {
    try {
      // 1. Upload photos if provided
      const photoUrls = [];
      if (completionData.photos && completionData.photos.length > 0) {
        for (const photo of completionData.photos) {
          const uploadResult = await this.api.files.upload(photo);
          photoUrls.push(uploadResult.url);
        }
      }

      // 2. Complete the job
      const completion = await this.api.jobs.complete(jobId, {
        completedAt: new Date().toISOString(),
        workPerformed: completionData.workDescription,
        materialsUsed: completionData.materials,
        laborHours: completionData.laborHours,
        customerSignature: completionData.signature,
        photos: photoUrls,
        warrantyPeriod: completionData.warrantyMonths,
        customerNotes: completionData.customerNotes,
        technicianNotes: completionData.internalNotes
      });

      // 3. Generate invoice if applicable
      if (completionData.generateInvoice) {
        await this.api.invoices.create({
          jobId: jobId,
          customerId: completion.customerId,
          lineItems: this.calculateInvoiceItems(completion),
          dueDate: this.calculateDueDate()
        });
      }

      return completion;

    } catch (error) {
      console.error('Failed to complete job:', error);
      throw error;
    }
  }

  async sendCustomerNotification(job, status) {
    const statusMessages = {
      en_route: `Your technician is on the way to ${job.customer.address}. Estimated arrival in ${job.estimatedTravelTime} minutes.`,
      arrived: `Your technician has arrived at ${job.customer.address} and will begin work shortly.`,
      in_progress: `Work has begun on your ${job.serviceType}. We'll update you when complete.`,
      completed: `Your service has been completed! Thank you for choosing our services.`
    };

    await this.api.notifications.send({
      customerId: job.customerId,
      type: 'job_status_update',
      message: statusMessages[status],
      channels: ['sms', 'email'],
      jobId: job.id
    });
  }
}
```

### 3. Third-Party System Integration

Integrate with existing business systems like accounting software, CRM, or dispatch systems.

```javascript
// Third-Party Integration Example
class QuickBooksIntegration {
  constructor(apiClient, quickbooksClient) {
    this.api = apiClient;
    this.qb = quickbooksClient;
    this.setupWebhooks();
  }

  setupWebhooks() {
    // Listen for job completion events
    this.api.webhooks.subscribe('job.completed', async (event) => {
      await this.syncCompletedJobToQuickBooks(event.data);
    });

    // Listen for customer creation events
    this.api.webhooks.subscribe('customer.created', async (event) => {
      await this.syncCustomerToQuickBooks(event.data);
    });
  }

  async syncCompletedJobToQuickBooks(jobData) {
    try {
      // 1. Get full job details
      const job = await this.api.jobs.get(jobData.jobId, {
        include: 'customer,materials,quote'
      });

      // 2. Create or update customer in QuickBooks
      let qbCustomer = await this.findOrCreateQBCustomer(job.customer);

      // 3. Create invoice in QuickBooks
      const invoice = await this.qb.invoices.create({
        customer: qbCustomer.id,
        invoiceDate: job.completedAt,
        dueDate: this.calculateDueDate(job.completedAt),
        lineItems: this.convertJobToLineItems(job),
        customFields: {
          jobId: job.id,
          technicianId: job.assignedTechnicianId,
          serviceType: job.serviceType
        }
      });

      // 4. Update job with QuickBooks invoice ID
      await this.api.jobs.update(job.id, {
        quickbooksInvoiceId: invoice.id,
        invoiceStatus: 'sent'
      });

      console.log(`Job ${job.id} synced to QuickBooks as invoice ${invoice.id}`);

    } catch (error) {
      console.error('Failed to sync job to QuickBooks:', error);
      
      // Log error for manual review
      await this.api.integrations.logError({
        type: 'quickbooks_sync_error',
        jobId: jobData.jobId,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  async syncCustomerToQuickBooks(customerData) {
    try {
      const customer = await this.api.customers.get(customerData.customerId);
      
      const qbCustomer = await this.qb.customers.create({
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        billingAddress: {
          line1: customer.address,
          city: customer.city,
          state: customer.state,
          postalCode: customer.zipCode
        },
        customFields: {
          plumbingAICustomerId: customer.id,
          customerType: customer.customerType
        }
      });

      // Update customer with QuickBooks ID
      await this.api.customers.update(customer.id, {
        quickbooksCustomerId: qbCustomer.id
      });

    } catch (error) {
      console.error('Failed to sync customer to QuickBooks:', error);
    }
  }

  async bidirectionalSync() {
    // Sync payments from QuickBooks back to the platform
    const recentPayments = await this.qb.payments.list({
      dateFrom: this.getLastSyncDate(),
      dateTo: new Date().toISOString()
    });

    for (const payment of recentPayments) {
      if (payment.customFields?.plumbingAIJobId) {
        await this.api.jobs.recordPayment(payment.customFields.plumbingAIJobId, {
          amount: payment.amount,
          method: payment.method,
          paidAt: payment.paymentDate,
          quickbooksPaymentId: payment.id
        });
      }
    }
  }
}
```

## Authentication & Security

### JWT Token Management

```javascript
class APITokenManager {
  constructor(apiBaseUrl, credentials) {
    this.baseUrl = apiBaseUrl;
    this.credentials = credentials;
    this.token = null;
    this.tokenExpiry = null;
  }

  async getValidToken() {
    if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.token;
    }

    await this.refreshToken();
    return this.token;
  }

  async refreshToken() {
    try {
      const response = await fetch(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.credentials)
      });

      if (!response.ok) {
        throw new Error(`Authentication failed: ${response.statusText}`);
      }

      const data = await response.json();
      this.token = data.token;
      
      // Parse JWT to get expiry (in production, use a proper JWT library)
      const payload = JSON.parse(atob(data.token.split('.')[1]));
      this.tokenExpiry = payload.exp * 1000; // Convert to milliseconds

    } catch (error) {
      console.error('Token refresh failed:', error);
      throw error;
    }
  }

  async makeAuthenticatedRequest(url, options = {}) {
    const token = await this.getValidToken();
    
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
  }
}
```

### Security Best Practices

```javascript
class SecureAPIClient {
  constructor(config) {
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      timeout: 30000,
      rateLimitBuffer: 100, // ms buffer between requests
      ...config
    };
    
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.lastRequestTime = 0;
  }

  async makeSecureRequest(endpoint, options = {}) {
    // Add request to queue to handle rate limiting
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ endpoint, options, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const { endpoint, options, resolve, reject } = this.requestQueue.shift();
      
      try {
        // Rate limiting: ensure minimum time between requests
        const timeSinceLastRequest = Date.now() - this.lastRequestTime;
        if (timeSinceLastRequest < this.config.rateLimitBuffer) {
          await this.sleep(this.config.rateLimitBuffer - timeSinceLastRequest);
        }

        const result = await this.executeRequest(endpoint, options);
        this.lastRequestTime = Date.now();
        resolve(result);

      } catch (error) {
        reject(error);
      }
    }

    this.isProcessingQueue = false;
  }

  async executeRequest(endpoint, options, attempt = 1) {
    try {
      // Set timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

      const response = await fetch(endpoint, {
        ...options,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = parseInt(response.headers.get('retry-after') || '1');
        await this.sleep(retryAfter * 1000);
        
        if (attempt < this.config.maxRetries) {
          return this.executeRequest(endpoint, options, attempt + 1);
        }
      }

      // Handle server errors with retry
      if (response.status >= 500 && attempt < this.config.maxRetries) {
        await this.sleep(this.config.retryDelay * Math.pow(2, attempt - 1));
        return this.executeRequest(endpoint, options, attempt + 1);
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new APIError(response.status, errorData.error?.message || response.statusText, errorData);
      }

      return await response.json();

    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      
      if (attempt < this.config.maxRetries && this.isRetryableError(error)) {
        await this.sleep(this.config.retryDelay * Math.pow(2, attempt - 1));
        return this.executeRequest(endpoint, options, attempt + 1);
      }
      
      throw error;
    }
  }

  isRetryableError(error) {
    return error.code === 'ECONNRESET' || 
           error.code === 'ETIMEDOUT' || 
           error.code === 'ENOTFOUND';
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

class APIError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.details = details;
  }
}
```

## Common Use Cases

### 1. Emergency Response Integration

```javascript
class EmergencyResponseSystem {
  constructor(apiClient) {
    this.api = apiClient;
    this.setupEmergencyHandling();
  }

  setupEmergencyHandling() {
    // Monitor for emergency keywords in incoming messages
    this.api.webhooks.subscribe('conversation.message_received', async (event) => {
      const classification = await this.api.ai.classifyMessage({
        messageText: event.data.messageText,
        customerContext: { customerId: event.data.customerId }
      });

      if (classification.urgencyLevel === 'emergency') {
        await this.handleEmergencyMessage(event.data, classification);
      }
    });
  }

  async handleEmergencyMessage(messageData, classification) {
    try {
      // 1. Create emergency alert
      const alert = await this.api.emergency.createAlert({
        type: classification.serviceType,
        severity: this.mapUrgencyToSeverity(classification.urgencyLevel),
        customerId: messageData.customerId,
        description: messageData.messageText,
        reportedAt: messageData.timestamp,
        location: await this.getCustomerLocation(messageData.customerId)
      });

      // 2. Find available emergency technician
      const technician = await this.findEmergencyTechnician(alert);
      
      if (technician) {
        // 3. Dispatch technician
        const dispatch = await this.api.emergency.dispatch({
          alertId: alert.id,
          technicianId: technician.id,
          estimatedArrival: this.calculateArrivalTime(technician, alert.location)
        });

        // 4. Create emergency job
        const job = await this.api.jobs.create({
          customerId: messageData.customerId,
          type: 'emergency_repair',
          serviceType: classification.serviceType,
          description: `Emergency: ${messageData.messageText}`,
          priority: 'emergency',
          assignedTechnicianId: technician.id,
          status: 'assigned',
          alertId: alert.id
        });

        // 5. Send immediate response to customer
        await this.sendEmergencyResponse(messageData, dispatch, job);

        // 6. Notify management for critical emergencies
        if (alert.severity === 'critical') {
          await this.notifyManagement(alert, job);
        }

      } else {
        // No technicians available - escalate
        await this.escalateEmergency(alert, messageData);
      }

    } catch (error) {
      console.error('Emergency handling failed:', error);
      await this.api.emergency.logError({
        alertId: alert?.id,
        error: error.message,
        messageData,
        timestamp: new Date().toISOString()
      });
    }
  }

  async findEmergencyTechnician(alert) {
    const technicians = await this.api.technicians.findAvailable({
      emergencyQualified: true,
      skills: [alert.type],
      location: alert.location,
      maxDistance: 50, // miles
      availability: 'immediate'
    });

    // Sort by proximity and emergency experience
    return technicians.sort((a, b) => {
      const distanceScore = a.distance - b.distance;
      const experienceScore = (b.emergencyJobs || 0) - (a.emergencyJobs || 0);
      return distanceScore + (experienceScore * 0.1);
    })[0];
  }

  async sendEmergencyResponse(messageData, dispatch, job) {
    const response = await this.api.ai.generateResponse({
      conversationId: messageData.conversationId,
      context: {
        emergencyResponse: true,
        dispatchInfo: dispatch,
        estimatedArrival: dispatch.estimatedArrival,
        technicianName: dispatch.technician.name,
        serviceType: job.serviceType
      },
      customInstructions: 'Provide urgent, reassuring response with specific arrival time and technician details'
    });

    await this.api.conversations.sendMessage({
      conversationId: messageData.conversationId,
      text: response.response,
      type: 'emergency_response',
      direction: 'outbound'
    });

    // Also send SMS for immediate notification
    await this.api.notifications.sendSMS({
      phoneNumber: messageData.phoneNumber,
      message: `EMERGENCY RESPONSE: ${response.response}`,
      jobId: job.id,
      priority: 'high'
    });
  }
}
```

### 2. Intelligent Scheduling System

```javascript
class IntelligentScheduler {
  constructor(apiClient) {
    this.api = apiClient;
  }

  async optimizeWeeklySchedule(startDate, endDate) {
    try {
      // 1. Get all pending jobs
      const pendingJobs = await this.api.jobs.list({
        status: 'scheduled',
        dateFrom: startDate,
        dateTo: endDate,
        include: 'customer'
      });

      // 2. Get technician availability
      const technicians = await this.api.technicians.list({
        active: true,
        include: 'skills,schedule'
      });

      // 3. Optimize schedule
      const optimization = await this.api.scheduling.optimize({
        jobs: pendingJobs,
        technicians: technicians,
        criteria: {
          minimizeTravelTime: true,
          balanceWorkload: true,
          respectSkillRequirements: true,
          maximizeRevenue: true,
          customerPreferences: true
        },
        constraints: {
          maxJobsPerDay: 8,
          maxTravelTimePerJob: 45, // minutes
          breakTime: 60, // minutes per day
          overtimeLimit: 2 // hours per day
        }
      });

      // 4. Apply optimized schedule
      const results = await this.applyScheduleOptimization(optimization);
      
      return {
        optimizedJobs: results.jobs,
        efficiencyGain: optimization.efficiencyGain,
        revenueIncrease: optimization.revenueIncrease,
        customerSatisfactionScore: optimization.customerSatisfactionScore
      };

    } catch (error) {
      console.error('Schedule optimization failed:', error);
      throw error;
    }
  }

  async handleScheduleConflict(jobId, conflictType) {
    const job = await this.api.jobs.get(jobId, { include: 'customer,technician' });
    
    switch (conflictType) {
      case 'technician_unavailable':
        return await this.reassignTechnician(job);
      
      case 'customer_reschedule':
        return await this.findAlternativeSlots(job);
      
      case 'emergency_priority':
        return await this.accommodateEmergency(job);
      
      default:
        throw new Error(`Unknown conflict type: ${conflictType}`);
    }
  }

  async reassignTechnician(job) {
    // Find alternative technicians
    const alternatives = await this.api.technicians.findAvailable({
      date: job.scheduledDate,
      skills: [job.serviceType],
      location: job.customer.coordinates,
      duration: job.estimatedDuration
    });

    if (alternatives.length === 0) {
      return await this.findAlternativeSlots(job);
    }

    // Select best alternative based on multiple factors
    const bestTechnician = this.selectBestTechnician(alternatives, job);
    
    // Update job assignment
    await this.api.jobs.update(job.id, {
      assignedTechnicianId: bestTechnician.id,
      reassignmentReason: 'Original technician unavailable',
      reassignedAt: new Date().toISOString()
    });

    // Notify customer of change
    await this.notifyCustomerOfReassignment(job, bestTechnician);

    return {
      success: true,
      newTechnician: bestTechnician,
      action: 'reassigned'
    };
  }

  async findAlternativeSlots(job) {
    const alternatives = await this.api.scheduling.findAlternativeSlots({
      jobId: job.id,
      searchWindow: 14, // days
      customerPreferences: job.customer.schedulingPreferences,
      technicianId: job.assignedTechnicianId
    });

    // Rank alternatives by customer preference and business efficiency
    const rankedAlternatives = alternatives.map(slot => ({
      ...slot,
      score: this.calculateSlotScore(slot, job.customer.schedulingPreferences)
    })).sort((a, b) => b.score - a.score);

    return {
      alternatives: rankedAlternatives.slice(0, 5), // Top 5 options
      recommendedSlot: rankedAlternatives[0]
    };
  }
}
```

## Webhook Integration

### Setting Up Webhooks

```javascript
class WebhookManager {
  constructor(apiClient, serverConfig) {
    this.api = apiClient;
    this.server = serverConfig;
    this.webhookSecret = serverConfig.webhookSecret;
    this.setupWebhookEndpoints();
  }

  setupWebhookEndpoints() {
    // Subscribe to relevant events
    const events = [
      'customer.created',
      'customer.updated', 
      'job.created',
      'job.status_changed',
      'job.completed',
      'emergency.alert_created',
      'conversation.message_received',
      'quote.approved',
      'warranty.expiring'
    ];

    events.forEach(event => {
      this.api.webhooks.subscribe(event, async (payload) => {
        await this.handleWebhookEvent(event, payload);
      });
    });
  }

  async handleWebhookEvent(eventType, payload) {
    try {
      // Verify webhook signature
      if (!this.verifyWebhookSignature(payload)) {
        console.error('Invalid webhook signature');
        return;
      }

      // Implement idempotency
      if (await this.isEventProcessed(payload.deliveryId)) {
        console.log(`Event ${payload.deliveryId} already processed`);
        return;
      }

      // Route to specific handler
      switch (eventType) {
        case 'customer.created':
          await this.handleCustomerCreated(payload.data);
          break;
        
        case 'job.completed':
          await this.handleJobCompleted(payload.data);
          break;
        
        case 'emergency.alert_created':
          await this.handleEmergencyAlert(payload.data);
          break;
        
        case 'conversation.message_received':
          await this.handleMessageReceived(payload.data);
          break;
        
        default:
          console.log(`Unhandled event type: ${eventType}`);
      }

      // Mark event as processed
      await this.markEventProcessed(payload.deliveryId);

    } catch (error) {
      console.error(`Webhook handling failed for ${eventType}:`, error);
      
      // Log error for retry mechanism
      await this.logWebhookError(eventType, payload, error);
    }
  }

  verifyWebhookSignature(payload) {
    const crypto = require('crypto');
    const signature = payload.signature;
    const body = JSON.stringify(payload.data);
    
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(body)
      .digest('hex');
    
    return `sha256=${expectedSignature}` === signature;
  }

  async handleJobCompleted(jobData) {
    // 1. Generate invoice
    await this.generateInvoice(jobData);
    
    // 2. Send completion notification
    await this.sendCompletionNotification(jobData);
    
    // 3. Schedule follow-up
    await this.scheduleFollowUp(jobData);
    
    // 4. Update CRM
    await this.updateCRM(jobData);
    
    // 5. Process warranty
    if (jobData.warrantyPeriodMonths > 0) {
      await this.createWarranty(jobData);
    }
  }

  async handleEmergencyAlert(alertData) {
    // 1. Send immediate notifications
    await this.sendEmergencyNotifications(alertData);
    
    // 2. Update emergency dashboard
    await this.updateEmergencyDashboard(alertData);
    
    // 3. Log for regulatory compliance
    await this.logEmergencyIncident(alertData);
  }

  async handleMessageReceived(messageData) {
    // 1. Process with AI for intent classification
    const classification = await this.api.ai.classifyMessage({
      messageText: messageData.text,
      customerContext: { customerId: messageData.customerId }
    });

    // 2. Route based on classification
    if (classification.intent === 'complaint') {
      await this.escalateComplaint(messageData, classification);
    } else if (classification.urgencyLevel === 'emergency') {
      await this.triggerEmergencyResponse(messageData, classification);
    } else {
      await this.processNormalMessage(messageData, classification);
    }
  }
}
```

### Webhook Testing and Debugging

```javascript
class WebhookTester {
  constructor(webhookUrl, secret) {
    this.webhookUrl = webhookUrl;
    this.secret = secret;
  }

  async testWebhook(eventType, testData) {
    const payload = {
      event: eventType,
      timestamp: new Date().toISOString(),
      data: testData,
      deliveryId: `test_${Date.now()}`
    };

    // Generate signature
    const signature = this.generateSignature(JSON.stringify(payload.data));
    payload.signature = signature;

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': eventType,
          'X-Webhook-Signature': signature,
          'X-Webhook-Delivery': payload.deliveryId
        },
        body: JSON.stringify(payload)
      });

      return {
        success: response.ok,
        status: response.status,
        response: await response.text(),
        latency: Date.now() - payload.timestamp
      };

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  generateSignature(body) {
    const crypto = require('crypto');
    return `sha256=${crypto.createHmac('sha256', this.secret).update(body).digest('hex')}`;
  }

  async runWebhookTests() {
    const tests = [
      {
        name: 'Customer Created',
        event: 'customer.created',
        data: {
          customerId: 'test-customer-123',
          name: 'Test Customer',
          email: 'test@example.com',
          phone: '+15551234567'
        }
      },
      {
        name: 'Job Completed',
        event: 'job.completed',
        data: {
          jobId: 'test-job-123',
          customerId: 'test-customer-123',
          completedAt: new Date().toISOString(),
          totalCost: 250.00
        }
      },
      {
        name: 'Emergency Alert',
        event: 'emergency.alert_created',
        data: {
          alertId: 'test-alert-123',
          type: 'water_leak',
          severity: 'high',
          customerId: 'test-customer-123'
        }
      }
    ];

    const results = [];
    for (const test of tests) {
      console.log(`Testing webhook: ${test.name}`);
      const result = await this.testWebhook(test.event, test.data);
      results.push({ ...test, result });
      
      if (result.success) {
        console.log(`✅ ${test.name} - Success (${result.latency}ms)`);
      } else {
        console.log(`❌ ${test.name} - Failed: ${result.error || result.status}`);
      }
    }

    return results;
  }
}
```

## Error Handling & Resilience

### Comprehensive Error Handling

```javascript
class ResilientAPIClient {
  constructor(config) {
    this.config = {
      baseUrl: config.baseUrl,
      maxRetries: 3,
      retryDelay: 1000,
      circuitBreakerThreshold: 5,
      circuitBreakerTimeout: 60000,
      ...config
    };
    
    this.circuitBreaker = new CircuitBreaker();
    this.retryQueue = new RetryQueue();
    this.errorLog = [];
  }

  async request(endpoint, options = {}) {
    const requestId = this.generateRequestId();
    
    try {
      // Check circuit breaker
      if (this.circuitBreaker.isOpen()) {
        throw new Error('Circuit breaker is open - service temporarily unavailable');
      }

      const result = await this.executeWithRetry(endpoint, options, requestId);
      this.circuitBreaker.recordSuccess();
      return result;

    } catch (error) {
      this.circuitBreaker.recordFailure();
      this.logError(requestId, endpoint, error);
      
      // Determine if error is retryable
      if (this.isRetryableError(error) && options.retry !== false) {
        await this.retryQueue.add(endpoint, options, requestId);
        throw new RetryableError(error.message, error);
      }
      
      throw error;
    }
  }

  async executeWithRetry(endpoint, options, requestId, attempt = 1) {
    try {
      const response = await this.makeHttpRequest(endpoint, options);
      return await this.handleResponse(response, requestId);

    } catch (error) {
      if (attempt < this.config.maxRetries && this.shouldRetry(error, attempt)) {
        const delay = this.calculateRetryDelay(attempt);
        console.log(`Request ${requestId} failed, retrying in ${delay}ms (attempt ${attempt + 1})`);
        
        await this.sleep(delay);
        return this.executeWithRetry(endpoint, options, requestId, attempt + 1);
      }
      
      throw error;
    }
  }

  async handleResponse(response, requestId) {
    if (response.status === 429) {
      // Rate limited - extract retry-after header
      const retryAfter = parseInt(response.headers.get('retry-after') || '1');
      throw new RateLimitError(`Rate limited, retry after ${retryAfter}s`, retryAfter);
    }

    if (response.status >= 500) {
      throw new ServerError(`Server error: ${response.status}`, response.status);
    }

    if (response.status >= 400) {
      const errorData = await response.json().catch(() => ({}));
      throw new ClientError(errorData.error?.message || 'Client error', response.status, errorData);
    }

    return await response.json();
  }

  isRetryableError(error) {
    return error instanceof ServerError ||
           error instanceof RateLimitError ||
           error.code === 'ECONNRESET' ||
           error.code === 'ETIMEDOUT' ||
           error.code === 'ENOTFOUND';
  }

  shouldRetry(error, attempt) {
    if (error instanceof RateLimitError) {
      return attempt <= 2; // Limit rate limit retries
    }
    
    if (error instanceof ServerError) {
      return error.status !== 501 && error.status !== 505; // Don't retry on not implemented
    }
    
    return this.isRetryableError(error);
  }

  calculateRetryDelay(attempt) {
    // Exponential backoff with jitter
    const baseDelay = this.config.retryDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.1 * baseDelay;
    return Math.min(baseDelay + jitter, 30000); // Max 30 seconds
  }

  logError(requestId, endpoint, error) {
    const errorEntry = {
      requestId,
      endpoint,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        status: error.status
      },
      timestamp: new Date().toISOString()
    };

    this.errorLog.push(errorEntry);
    
    // Keep only last 100 errors
    if (this.errorLog.length > 100) {
      this.errorLog.shift();
    }

    console.error(`API Error [${requestId}]:`, errorEntry);
  }

  getErrorStats() {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    
    const recentErrors = this.errorLog.filter(
      error => new Date(error.timestamp).getTime() > oneHourAgo
    );

    const errorsByType = recentErrors.reduce((acc, error) => {
      const type = error.error.name;
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    return {
      totalErrors: recentErrors.length,
      errorsByType,
      circuitBreakerState: this.circuitBreaker.getState(),
      retryQueueSize: this.retryQueue.size()
    };
  }
}

// Custom error classes
class RetryableError extends Error {
  constructor(message, originalError) {
    super(message);
    this.name = 'RetryableError';
    this.originalError = originalError;
  }
}

class RateLimitError extends Error {
  constructor(message, retryAfter) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

class ServerError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ServerError';
    this.status = status;
  }
}

class ClientError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ClientError';
    this.status = status;
    this.details = details;
  }
}
```

## Performance Optimization

### Request Batching and Caching

```javascript
class OptimizedAPIClient {
  constructor(config) {
    this.config = config;
    this.cache = new Map();
    this.batchQueue = new Map();
    this.requestDeduplication = new Map();
  }

  async getCustomer(customerId, options = {}) {
    const cacheKey = `customer:${customerId}:${JSON.stringify(options)}`;
    
    // Check cache first
    if (this.cache.has(cacheKey) && !options.forceRefresh) {
      const cached = this.cache.get(cacheKey);
      if (Date.now() - cached.timestamp < (options.cacheTTL || 300000)) { // 5 min default
        return cached.data;
      }
    }

    // Deduplicate concurrent requests for same resource
    if (this.requestDeduplication.has(cacheKey)) {
      return await this.requestDeduplication.get(cacheKey);
    }

    const requestPromise = this.fetchCustomer(customerId, options);
    this.requestDeduplication.set(cacheKey, requestPromise);

    try {
      const customer = await requestPromise;
      
      // Cache the result
      this.cache.set(cacheKey, {
        data: customer,
        timestamp: Date.now()
      });

      return customer;
    } finally {
      this.requestDeduplication.delete(cacheKey);
    }
  }

  async getMultipleCustomers(customerIds, options = {}) {
    // Check which customers are already cached
    const cached = [];
    const toFetch = [];

    for (const id of customerIds) {
      const cacheKey = `customer:${id}:${JSON.stringify(options)}`;
      const cachedData = this.cache.get(cacheKey);
      
      if (cachedData && Date.now() - cachedData.timestamp < (options.cacheTTL || 300000)) {
        cached.push(cachedData.data);
      } else {
        toFetch.push(id);
      }
    }

    // Batch fetch uncached customers
    let fetchedCustomers = [];
    if (toFetch.length > 0) {
      fetchedCustomers = await this.batchFetchCustomers(toFetch, options);
    }

    // Combine cached and fetched results
    return [...cached, ...fetchedCustomers];
  }

  async batchFetchCustomers(customerIds, options) {
    // Group into batch requests (API might have limits)
    const batchSize = 50;
    const batches = [];
    
    for (let i = 0; i < customerIds.length; i += batchSize) {
      batches.push(customerIds.slice(i, i + batchSize));
    }

    const batchPromises = batches.map(batch =>
      this.api.customers.getBatch(batch, options)
    );

    const batchResults = await Promise.all(batchPromises);
    const allCustomers = batchResults.flat();

    // Cache individual results
    allCustomers.forEach(customer => {
      const cacheKey = `customer:${customer.id}:${JSON.stringify(options)}`;
      this.cache.set(cacheKey, {
        data: customer,
        timestamp: Date.now()
      });
    });

    return allCustomers;
  }

  // Smart cache invalidation
  invalidateCustomerCache(customerId) {
    const keysToDelete = [];
    
    for (const [key] of this.cache) {
      if (key.startsWith(`customer:${customerId}:`)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));
  }

  // Preload frequently accessed data
  async preloadFrequentData() {
    try {
      // Preload recent customers
      const recentCustomers = await this.api.customers.list({
        limit: 100,
        sortBy: 'lastServiceDate',
        order: 'desc'
      });

      // Preload active jobs
      const activeJobs = await this.api.jobs.list({
        status: ['scheduled', 'in_progress'],
        limit: 200
      });

      // Preload technicians
      const technicians = await this.api.technicians.list({
        active: true,
        include: 'skills,schedule'
      });

      console.log('Preloaded frequent data:', {
        customers: recentCustomers.length,
        jobs: activeJobs.length,
        technicians: technicians.length
      });

    } catch (error) {
      console.error('Preload failed:', error);
    }
  }

  // Memory management
  cleanupCache() {
    const now = Date.now();
    const maxAge = 30 * 60 * 1000; // 30 minutes
    
    for (const [key, value] of this.cache) {
      if (now - value.timestamp > maxAge) {
        this.cache.delete(key);
      }
    }

    // Limit cache size
    if (this.cache.size > 1000) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      // Remove oldest 20%
      const toRemove = Math.floor(entries.length * 0.2);
      for (let i = 0; i < toRemove; i++) {
        this.cache.delete(entries[i][0]);
      }
    }
  }
}
```

## Production Deployment

### Health Monitoring and Observability

```javascript
class APIHealthMonitor {
  constructor(apiClient) {
    this.api = apiClient;
    this.metrics = {
      requests: 0,
      errors: 0,
      responseTime: [],
      lastHealthCheck: null
    };
    
    this.startHealthChecks();
    this.startMetricsCollection();
  }

  startHealthChecks() {
    setInterval(async () => {
      await this.performHealthCheck();
    }, 60000); // Every minute
  }

  async performHealthCheck() {
    const startTime = Date.now();
    
    try {
      // Test critical endpoints
      const healthChecks = [
        this.checkAPIHealth(),
        this.checkDatabaseHealth(),
        this.checkAIServiceHealth(),
        this.checkExternalIntegrationsHealth()
      ];

      const results = await Promise.allSettled(healthChecks);
      const responseTime = Date.now() - startTime;

      const healthStatus = {
        status: results.every(r => r.status === 'fulfilled') ? 'healthy' : 'degraded',
        responseTime,
        timestamp: new Date().toISOString(),
        checks: {
          api: results[0].status === 'fulfilled',
          database: results[1].status === 'fulfilled',
          ai: results[2].status === 'fulfilled',
          integrations: results[3].status === 'fulfilled'
        },
        errors: results
          .filter(r => r.status === 'rejected')
          .map(r => r.reason.message)
      };

      this.metrics.lastHealthCheck = healthStatus;
      
      // Log health status
      console.log('Health check completed:', healthStatus);

      // Alert on degraded service
      if (healthStatus.status === 'degraded') {
        await this.sendHealthAlert(healthStatus);
      }

    } catch (error) {
      console.error('Health check failed:', error);
      this.metrics.lastHealthCheck = {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  async checkAPIHealth() {
    const response = await this.api.health.check();
    if (response.status !== 'healthy') {
      throw new Error(`API unhealthy: ${response.status}`);
    }
    return response;
  }

  async checkDatabaseHealth() {
    const response = await this.api.health.database();
    if (response.connectionPool < 0.8) {
      throw new Error('Database connection pool low');
    }
    return response;
  }

  async checkAIServiceHealth() {
    const testResponse = await this.api.ai.healthCheck();
    if (testResponse.responseTime > 5000) {
      throw new Error('AI service response time too high');
    }
    return testResponse;
  }

  async checkExternalIntegrationsHealth() {
    const integrations = ['google_voice', 'quickbooks', 'twilio'];
    const results = await Promise.allSettled(
      integrations.map(service => this.api.integrations.healthCheck(service))
    );

    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > integrations.length / 2) {
      throw new Error(`Multiple integrations failing: ${failed.length}/${integrations.length}`);
    }

    return { integrations: results.length - failed.length, failed: failed.length };
  }

  startMetricsCollection() {
    // Collect metrics every 5 minutes
    setInterval(() => {
      this.collectAndReportMetrics();
    }, 300000);
  }

  async collectAndReportMetrics() {
    try {
      const metrics = {
        // API metrics
        totalRequests: this.metrics.requests,
        errorRate: this.metrics.errors / this.metrics.requests,
        averageResponseTime: this.calculateAverageResponseTime(),
        
        // Business metrics
        activeCustomers: await this.getActiveCustomersCount(),
        pendingJobs: await this.getPendingJobsCount(),
        emergencyAlerts: await this.getActiveEmergencyCount(),
        
        // System metrics
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      };

      // Send to monitoring service
      await this.reportMetrics(metrics);
      
      // Reset counters
      this.resetMetrics();

    } catch (error) {
      console.error('Metrics collection failed:', error);
    }
  }

  calculateAverageResponseTime() {
    if (this.metrics.responseTime.length === 0) return 0;
    
    const sum = this.metrics.responseTime.reduce((a, b) => a + b, 0);
    return sum / this.metrics.responseTime.length;
  }

  async getActiveCustomersCount() {
    const response = await this.api.analytics.getMetric('active_customers_24h');
    return response.value;
  }

  async getPendingJobsCount() {
    const response = await this.api.jobs.count({ 
      status: ['scheduled', 'assigned'] 
    });
    return response.count;
  }

  async getActiveEmergencyCount() {
    const response = await this.api.emergency.alerts.count({ 
      status: 'active' 
    });
    return response.count;
  }

  async reportMetrics(metrics) {
    // Send to monitoring service (e.g., DataDog, New Relic)
    await fetch(process.env.METRICS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metrics)
    });
  }

  resetMetrics() {
    this.metrics.requests = 0;
    this.metrics.errors = 0;
    this.metrics.responseTime = [];
  }

  async sendHealthAlert(healthStatus) {
    const alertMessage = {
      title: 'API Health Degraded',
      message: `API health check failed: ${healthStatus.errors.join(', ')}`,
      severity: 'warning',
      timestamp: healthStatus.timestamp,
      details: healthStatus
    };

    // Send to alerting service
    await this.api.alerts.send(alertMessage);
  }
}
```

---

*This integration guide provides comprehensive examples and patterns for building robust integrations with the Plumbing Business AI Platform API. For specific implementation questions or advanced use cases, please refer to the API documentation or contact our support team.*