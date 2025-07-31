import { DatabaseService } from './DatabaseService';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { MessageClassification } from './BusinessRulesService';
import { GoogleVoiceEvent } from './WebhookProcessingService';

export interface NotificationRule {
  id: string;
  userId: string;
  userRole: 'admin' | 'manager' | 'technician' | 'dispatcher';
  notificationType: 'emergency_message' | 'new_customer' | 'quote_request' | 'job_update' | 'system_alert' | 'missed_call' | 'voicemail';
  severity: 'low' | 'medium' | 'high' | 'critical';
  channels: ('dashboard' | 'email' | 'sms' | 'push' | 'webhook')[];
  timeWindows: {
    businessHours: boolean;
    afterHours: boolean;
    weekends: boolean;
    holidays: boolean;
  };
  filters?: {
    keywords?: string[];
    customerSegments?: string[];
    serviceTypes?: string[];
    priorityLevels?: string[];
  };
  delayMinutes: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface NotificationEvent {
  id: string;
  type: NotificationRule['notificationType'];
  severity: NotificationRule['severity'];
  title: string;
  message: string;
  data: Record<string, any>;
  triggeredBy: string; // webhook ID, user ID, etc.
  customerId?: string;
  jobId?: string;
  conversationId?: string;
  phoneNumber?: string;
  createdAt: Date;
}

export interface NotificationDelivery {
  id: string;
  notificationId: string;
  userId: string;
  channel: 'dashboard' | 'email' | 'sms' | 'push' | 'webhook';
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'cancelled';
  scheduledAt: Date;
  sentAt?: Date;
  deliveredAt?: Date;
  errorMessage?: string;
  retryCount: number;
  maxRetries: number;
  externalId?: string; // For tracking with external services
  createdAt: Date;
  updatedAt: Date;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'admin' | 'manager' | 'technician' | 'dispatcher';
  isActive: boolean;
  timezone: string;
  workSchedule?: {
    monday?: { start: string; end: string };
    tuesday?: { start: string; end: string };
    wednesday?: { start: string; end: string };
    thursday?: { start: string; end: string };
    friday?: { start: string; end: string };
    saturday?: { start: string; end: string };
    sunday?: { start: string; end: string };
  };
}

export class NotificationService {
  private webSocketService?: any; // Will be injected
  private emailConfig: any;
  private smsConfig: any;
  
  // Emergency escalation rules
  private readonly emergencyEscalation = {
    'critical': {
      immediate: ['admin', 'manager'],
      after5min: ['technician'],
      after15min: ['all']
    },
    'high': {
      immediate: ['manager'],
      after10min: ['admin', 'technician'],
      after30min: ['all']
    },
    'medium': {
      immediate: ['dispatcher'],
      after30min: ['manager'],
      after60min: ['admin']
    }
  };

  constructor(private db: DatabaseService) {
    this.setupNotificationChannels();
  }

  /**
   * Set WebSocket service for real-time notifications
   */
  setWebSocketService(webSocketService: any): void {
    this.webSocketService = webSocketService;
  }

  /**
   * Send immediate emergency notification
   */
  async sendEmergencyNotification(
    event: GoogleVoiceEvent,
    classification: MessageClassification,
    customerId: string
  ): Promise<string[]> {
    try {
      const notificationId = uuidv4();
      
      // Create notification event
      const notification: NotificationEvent = {
        id: notificationId,
        type: 'emergency_message',
        severity: classification.emergencyLevel as any,
        title: `🚨 EMERGENCY: ${classification.serviceType || 'Service Request'}`,
        message: this.formatEmergencyMessage(event, classification),
        data: {
          event,
          classification,
          customerId,
          phoneNumber: event.phoneNumber,
          matchedKeywords: classification.matchedKeywords.map(k => k.keyword)
        },
        triggeredBy: `event-${event.messageId || event.callId}`,
        customerId,
        phoneNumber: event.phoneNumber,
        createdAt: new Date()
      };

      // Store notification
      await this.storeNotification(notification);

      // Get emergency response team
      const emergencyTeam = await this.getEmergencyResponseTeam(classification.emergencyLevel);
      
      // Send immediate notifications
      const deliveryIds: string[] = [];
      
      for (const staffMember of emergencyTeam) {
        // Dashboard notification (immediate)
        const dashboardDelivery = await this.sendDashboardNotification(notification, staffMember);
        if (dashboardDelivery) deliveryIds.push(dashboardDelivery);

        // SMS for critical emergencies
        if (classification.emergencyLevel === 'critical') {
          const smsDelivery = await this.sendSMSNotification(notification, staffMember);
          if (smsDelivery) deliveryIds.push(smsDelivery);
        }

        // Email notification
        const emailDelivery = await this.sendEmailNotification(notification, staffMember);
        if (emailDelivery) deliveryIds.push(emailDelivery);
      }

      // Schedule escalation if no response
      await this.scheduleEmergencyEscalation(notification, classification);

      logger.warn('Emergency notification sent', {
        notificationId,
        severity: classification.emergencyLevel,
        recipientsCount: emergencyTeam.length,
        deliveriesCreated: deliveryIds.length
      });

      return deliveryIds;
    } catch (error) {
      logger.error('Failed to send emergency notification', { error, event });
      throw error;
    }
  }

  /**
   * Send new customer notification
   */
  async sendNewCustomerNotification(
    customerId: string,
    customerInfo: any,
    triggeredBy: string
  ): Promise<string[]> {
    try {
      const notificationId = uuidv4();
      
      const notification: NotificationEvent = {
        id: notificationId,
        type: 'new_customer',
        severity: 'medium',
        title: 'New Customer Contact',
        message: `New customer inquiry from ${customerInfo.phone}${customerInfo.name ? ` (${customerInfo.name})` : ''}`,
        data: { customerId, customerInfo },
        triggeredBy,
        customerId,
        phoneNumber: customerInfo.phone,
        createdAt: new Date()
      };

      await this.storeNotification(notification);

      // Get staff who should be notified of new customers
      const notificationRules = await this.getNotificationRules('new_customer', 'medium');
      const deliveryIds = await this.processNotificationRules(notification, notificationRules);

      logger.info('New customer notification sent', {
        notificationId,
        customerId,
        deliveriesCreated: deliveryIds.length
      });

      return deliveryIds;
    } catch (error) {
      logger.error('Failed to send new customer notification', { error, customerId });
      throw error;
    }
  }

  /**
   * Send voicemail notification
   */
  async sendVoicemailNotification(
    event: GoogleVoiceEvent,
    classification: MessageClassification | undefined,
    customerId: string
  ): Promise<string[]> {
    try {
      const notificationId = uuidv4();
      
      const notification: NotificationEvent = {
        id: notificationId,
        type: 'voicemail',
        severity: classification?.isEmergency ? 'high' : 'medium',
        title: '📞 New Voicemail',
        message: this.formatVoicemailMessage(event, classification),
        data: {
          event,
          classification,
          customerId,
          phoneNumber: event.phoneNumber,
          hasTranscription: !!event.metadata?.transcription,
          duration: event.metadata?.duration
        },
        triggeredBy: `voicemail-${event.voicemailId}`,
        customerId,
        phoneNumber: event.phoneNumber,
        createdAt: new Date()
      };

      await this.storeNotification(notification);

      const severity = classification?.isEmergency ? 'high' : 'medium';
      const notificationRules = await this.getNotificationRules('voicemail', severity);
      const deliveryIds = await this.processNotificationRules(notification, notificationRules);

      logger.info('Voicemail notification sent', {
        notificationId,
        severity,
        hasTranscription: !!event.metadata?.transcription,
        deliveriesCreated: deliveryIds.length
      });

      return deliveryIds;
    } catch (error) {
      logger.error('Failed to send voicemail notification', { error, event });
      throw error;
    }
  }

  /**
   * Send missed call notification
   */
  async sendMissedCallNotification(
    event: GoogleVoiceEvent,
    customerId: string
  ): Promise<string[]> {
    try {
      const notificationId = uuidv4();
      
      const notification: NotificationEvent = {
        id: notificationId,
        type: 'missed_call',
        severity: 'medium',
        title: '📞 Missed Call',
        message: `Missed call from ${event.phoneNumber}${event.metadata?.duration ? ` (${event.metadata.duration}s)` : ''}`,
        data: {
          event,
          customerId,
          phoneNumber: event.phoneNumber,
          duration: event.metadata?.duration
        },
        triggeredBy: `call-${event.callId}`,
        customerId,
        phoneNumber: event.phoneNumber,
        createdAt: new Date()
      };

      await this.storeNotification(notification);

      const notificationRules = await this.getNotificationRules('missed_call', 'medium');
      const deliveryIds = await this.processNotificationRules(notification, notificationRules);

      logger.info('Missed call notification sent', {
        notificationId,
        phoneNumber: event.phoneNumber,
        deliveriesCreated: deliveryIds.length
      });

      return deliveryIds;
    } catch (error) {
      logger.error('Failed to send missed call notification', { error, event });
      throw error;
    }
  }

  /**
   * Send quote request notification
   */
  async sendQuoteRequestNotification(
    customerId: string,
    serviceType: string,
    estimatedValue: number,
    triggeredBy: string
  ): Promise<string[]> {
    try {
      const notificationId = uuidv4();
      
      const notification: NotificationEvent = {
        id: notificationId,
        type: 'quote_request',
        severity: 'medium',
        title: 'Quote Request Generated',
        message: `Quote request for ${serviceType} (Est. $${estimatedValue})`,
        data: {
          customerId,
          serviceType,
          estimatedValue
        },
        triggeredBy,
        customerId,
        createdAt: new Date()
      };

      await this.storeNotification(notification);

      const notificationRules = await this.getNotificationRules('quote_request', 'medium');
      const deliveryIds = await this.processNotificationRules(notification, notificationRules);

      logger.info('Quote request notification sent', {
        notificationId,
        serviceType,
        estimatedValue,
        deliveriesCreated: deliveryIds.length
      });

      return deliveryIds;
    } catch (error) {
      logger.error('Failed to send quote request notification', { error });
      throw error;
    }
  }

  /**
   * Send system alert notification
   */
  async sendSystemAlert(
    title: string,
    message: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    data?: Record<string, any>
  ): Promise<string[]> {
    try {
      const notificationId = uuidv4();
      
      const notification: NotificationEvent = {
        id: notificationId,
        type: 'system_alert',
        severity,
        title: `🔔 ${title}`,
        message,
        data: data || {},
        triggeredBy: 'system',
        createdAt: new Date()
      };

      await this.storeNotification(notification);

      const notificationRules = await this.getNotificationRules('system_alert', severity);
      const deliveryIds = await this.processNotificationRules(notification, notificationRules);

      logger.warn('System alert sent', {
        notificationId,
        title,
        severity,
        deliveriesCreated: deliveryIds.length
      });

      return deliveryIds;
    } catch (error) {
      logger.error('Failed to send system alert', { error, title, severity });
      throw error;
    }
  }

  /**
   * Get notification history for dashboard
   */
  async getNotificationHistory(
    userId?: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ notifications: NotificationEvent[]; total: number }> {
    try {
      const knex = await DatabaseService.getInstance();
      
      let query = knex('notifications as n');
      
      if (userId) {
        query = query
          .join('notification_deliveries as nd', 'n.id', 'nd.notification_id')
          .where('nd.user_id', userId);
      }
      
      const total = await query.clone().count('n.id as count').first();
      const notifications = await query
        .select('n.*')
        .orderBy('n.created_at', 'desc')
        .limit(limit)
        .offset(offset);

      return {
        notifications: notifications.map(this.mapNotificationRow),
        total: Number(total?.count || 0)
      };
    } catch (error) {
      logger.error('Failed to get notification history', { error, userId });
      throw error;
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    try {
      const knex = await DatabaseService.getInstance();
      await knex('notification_deliveries')
        .where({ notification_id: notificationId, user_id: userId })
        .update({
          status: 'delivered',
          delivered_at: new Date(),
          updated_at: new Date()
        });

      // Send WebSocket update
      if (this.webSocketService) {
        this.webSocketService.sendToUser(userId, 'notification_read', {
          notificationId
        });
      }

      logger.debug('Marked notification as read', { notificationId, userId });
    } catch (error) {
      logger.error('Failed to mark notification as read', { error, notificationId, userId });
      throw error;
    }
  }

  // Private helper methods

  private async setupNotificationChannels(): Promise<void> {
    // Setup email configuration
    this.emailConfig = {
      host: process.env.SMTP_HOST || 'localhost',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    };

    // Setup SMS configuration
    this.smsConfig = {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      fromNumber: process.env.TWILIO_FROM_NUMBER
    };
  }

  private formatEmergencyMessage(event: GoogleVoiceEvent, classification: MessageClassification): string {
    const parts = [
      `Emergency detected from ${event.phoneNumber}`,
      `Service Type: ${classification.serviceType || 'Unknown'}`,
      `Priority: ${classification.emergencyLevel.toUpperCase()}`,
      `Keywords: ${classification.matchedKeywords.map(k => k.keyword).join(', ')}`,
      `Message: "${event.content || 'No message content'}"`,
      `Estimated Response Time: ${classification.estimatedResponseTime} minutes`
    ];

    if (classification.requiresImmediate) {
      parts.unshift('⚠️ IMMEDIATE RESPONSE REQUIRED');
    }

    return parts.join('\n');
  }

  private formatVoicemailMessage(event: GoogleVoiceEvent, classification?: MessageClassification): string {
    const parts = [
      `New voicemail from ${event.phoneNumber}`,
      `Duration: ${event.metadata?.duration || 'Unknown'}s`
    ];

    if (event.metadata?.transcription) {
      parts.push(`Transcription: "${event.metadata.transcription}"`);
    }

    if (classification?.isEmergency) {
      parts.unshift('🚨 EMERGENCY VOICEMAIL');
      parts.push(`Priority: ${classification.emergencyLevel.toUpperCase()}`);
    }

    return parts.join('\n');
  }

  private async getEmergencyResponseTeam(severity: string): Promise<StaffMember[]> {
    try {
      const knex = await DatabaseService.getInstance();
      const roles = this.emergencyEscalation[severity as keyof typeof this.emergencyEscalation]?.immediate || ['admin'];
      
      const staff = await knex('users')
        .whereIn('role', roles)
        .where('is_active', true)
        .select('*');

      return staff.map(this.mapStaffMemberRow);
    } catch (error) {
      logger.error('Failed to get emergency response team', { error, severity });
      return [];
    }
  }

  private async getNotificationRules(
    type: NotificationRule['notificationType'],
    severity: NotificationRule['severity']
  ): Promise<NotificationRule[]> {
    try {
      const knex = await DatabaseService.getInstance();
      const rules = await knex('notification_rules')
        .where('notification_type', type)
        .where('is_active', true)
        .where(function(this: any) {
          this.where('severity', severity).orWhere('severity', 'all');
        })
        .select('*');

      return rules.map(this.mapNotificationRuleRow);
    } catch (error) {
      logger.error('Failed to get notification rules', { error, type, severity });
      return [];
    }
  }

  private async processNotificationRules(
    notification: NotificationEvent,
    rules: NotificationRule[]
  ): Promise<string[]> {
    const deliveryIds: string[] = [];

    for (const rule of rules) {
      try {
        // Check if rule applies to current time window
        if (!this.isInTimeWindow(rule.timeWindows)) {
          continue;
        }

        // Apply filters if any
        if (!this.passesFilters(notification, rule.filters)) {
          continue;
        }

        // Get user info
        const user = await this.getStaffMember(rule.userId);
        if (!user || !user.isActive) {
          continue;
        }

        // Send notifications via configured channels
        for (const channel of rule.channels) {
          let deliveryId: string | null = null;

          switch (channel) {
            case 'dashboard':
              deliveryId = await this.sendDashboardNotification(notification, user, rule.delayMinutes);
              break;
            case 'email':
              deliveryId = await this.sendEmailNotification(notification, user, rule.delayMinutes);
              break;
            case 'sms':
              deliveryId = await this.sendSMSNotification(notification, user, rule.delayMinutes);
              break;
            case 'push':
              deliveryId = await this.sendPushNotification(notification, user, rule.delayMinutes);
              break;
          }

          if (deliveryId) {
            deliveryIds.push(deliveryId);
          }
        }
      } catch (error) {
        logger.error('Failed to process notification rule', { error, ruleId: rule.id });
      }
    }

    return deliveryIds;
  }

  private async sendDashboardNotification(
    notification: NotificationEvent,
    user: StaffMember,
    delayMinutes: number = 0
  ): Promise<string | null> {
    try {
      const deliveryId = await this.createDelivery(notification.id, user.id, 'dashboard', delayMinutes);

      // Send immediately via WebSocket if no delay
      if (delayMinutes === 0 && this.webSocketService) {
        this.webSocketService.sendToUser(user.id, 'notification', {
          id: notification.id,
          type: notification.type,
          severity: notification.severity,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          createdAt: notification.createdAt
        });

        await this.markDeliveryAsSent(deliveryId);
      }

      return deliveryId;
    } catch (error) {
      logger.error('Failed to send dashboard notification', { error, notificationId: notification.id, userId: user.id });
      return null;
    }
  }

  private async sendEmailNotification(
    notification: NotificationEvent,
    user: StaffMember,
    delayMinutes: number = 0
  ): Promise<string | null> {
    try {
      const deliveryId = await this.createDelivery(notification.id, user.id, 'email', delayMinutes);

      if (delayMinutes === 0) {
        // Send email immediately
        // Implementation would use nodemailer or similar
        logger.info('Email notification queued', { deliveryId, userEmail: user.email });
        await this.markDeliveryAsSent(deliveryId);
      }

      return deliveryId;
    } catch (error) {
      logger.error('Failed to send email notification', { error, notificationId: notification.id, userId: user.id });
      return null;
    }
  }

  private async sendSMSNotification(
    notification: NotificationEvent,
    user: StaffMember,
    delayMinutes: number = 0
  ): Promise<string | null> {
    try {
      const deliveryId = await this.createDelivery(notification.id, user.id, 'sms', delayMinutes);

      if (delayMinutes === 0) {
        // Send SMS immediately
        // Implementation would use Twilio or similar
        logger.info('SMS notification queued', { deliveryId, userPhone: user.phone });
        await this.markDeliveryAsSent(deliveryId);
      }

      return deliveryId;
    } catch (error) {
      logger.error('Failed to send SMS notification', { error, notificationId: notification.id, userId: user.id });
      return null;
    }
  }

  private async sendPushNotification(
    notification: NotificationEvent,
    user: StaffMember,
    delayMinutes: number = 0
  ): Promise<string | null> {
    try {
      const deliveryId = await this.createDelivery(notification.id, user.id, 'push', delayMinutes);

      if (delayMinutes === 0) {
        // Send push notification immediately
        // Implementation would use Firebase Cloud Messaging or similar
        logger.info('Push notification queued', { deliveryId, userId: user.id });
        await this.markDeliveryAsSent(deliveryId);
      }

      return deliveryId;
    } catch (error) {
      logger.error('Failed to send push notification', { error, notificationId: notification.id, userId: user.id });
      return null;
    }
  }

  private async storeNotification(notification: NotificationEvent): Promise<void> {
    const knex = await DatabaseService.getInstance();
    await knex('notifications').insert({
      id: notification.id,
      type: notification.type,
      severity: notification.severity,
      title: notification.title,
      message: notification.message,
      data: JSON.stringify(notification.data),
      triggered_by: notification.triggeredBy,
      customer_id: notification.customerId,
      job_id: notification.jobId,
      conversation_id: notification.conversationId,
      phone_number: notification.phoneNumber,
      created_at: notification.createdAt
    });
  }

  private async createDelivery(
    notificationId: string,
    userId: string,
    channel: NotificationDelivery['channel'],
    delayMinutes: number
  ): Promise<string> {
    const knex = await DatabaseService.getInstance();
    const deliveryId = uuidv4();
    const scheduledAt = new Date(Date.now() + delayMinutes * 60 * 1000);

    await knex('notification_deliveries').insert({
      id: deliveryId,
      notification_id: notificationId,
      user_id: userId,
      channel,
      status: 'pending',
      scheduled_at: scheduledAt,
      retry_count: 0,
      max_retries: 3,
      created_at: new Date(),
      updated_at: new Date()
    });

    return deliveryId;
  }

  private async markDeliveryAsSent(deliveryId: string): Promise<void> {
    const knex = await DatabaseService.getInstance();
    await knex('notification_deliveries')
      .where({ id: deliveryId })
      .update({
        status: 'sent',
        sent_at: new Date(),
        updated_at: new Date()
      });
  }

  private async getStaffMember(userId: string): Promise<StaffMember | null> {
    try {
      const knex = await DatabaseService.getInstance();
      const user = await knex('users').where({ id: userId }).first();
      return user ? this.mapStaffMemberRow(user) : null;
    } catch (error) {
      logger.error('Failed to get staff member', { error, userId });
      return null;
    }
  }

  private isInTimeWindow(timeWindows: NotificationRule['timeWindows']): boolean {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0 = Sunday

    // Business hours check (9 AM - 6 PM)
    const isBusinessHours = hour >= 9 && hour < 18 && day >= 1 && day <= 5;
    if (isBusinessHours && timeWindows.businessHours) return true;

    // After hours check
    const isAfterHours = !isBusinessHours && (day >= 1 && day <= 5);
    if (isAfterHours && timeWindows.afterHours) return true;

    // Weekend check
    const isWeekend = day === 0 || day === 6;
    if (isWeekend && timeWindows.weekends) return true;

    return false;
  }

  private passesFilters(notification: NotificationEvent, filters?: NotificationRule['filters']): boolean {
    if (!filters) return true;

    // Add filter logic based on notification data
    // This would check keywords, customer segments, service types, etc.
    return true;
  }

  private async scheduleEmergencyEscalation(
    notification: NotificationEvent,
    classification: MessageClassification
  ): Promise<void> {
    // Implementation would schedule escalation jobs
    logger.info('Emergency escalation scheduled', {
      notificationId: notification.id,
      severity: classification.emergencyLevel
    });
  }

  private mapNotificationRow(row: any): NotificationEvent {
    return {
      id: row.id,
      type: row.type,
      severity: row.severity,
      title: row.title,
      message: row.message,
      data: JSON.parse(row.data || '{}'),
      triggeredBy: row.triggered_by,
      customerId: row.customer_id,
      jobId: row.job_id,
      conversationId: row.conversation_id,
      phoneNumber: row.phone_number,
      createdAt: new Date(row.created_at)
    };
  }

  private mapNotificationRuleRow(row: any): NotificationRule {
    return {
      id: row.id,
      userId: row.user_id,
      userRole: row.user_role,
      notificationType: row.notification_type,
      severity: row.severity,
      channels: JSON.parse(row.channels || '[]'),
      timeWindows: JSON.parse(row.time_windows || '{}'),
      filters: row.filters ? JSON.parse(row.filters) : undefined,
      delayMinutes: row.delay_minutes || 0,
      isActive: row.is_active,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  private mapStaffMemberRow(row: any): StaffMember {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      isActive: row.is_active,
      timezone: row.timezone || 'UTC',
      workSchedule: row.work_schedule ? JSON.parse(row.work_schedule) : undefined
    };
  }
}