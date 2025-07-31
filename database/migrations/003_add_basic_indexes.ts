import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // BASIC PERFORMANCE INDEXES (SQLite Compatible)
  // ============================================================================

  // Composite indexes for complex queries
  await knex.schema.alterTable('customers', (table) => {
    // Fast customer search by multiple fields
    table.index(['isActive', 'zipCode', 'customerType'], 'idx_customers_active_location_type');
    table.index(['phone', 'alternatePhone'], 'idx_customers_phone_lookup');
    table.index(['email', 'isActive'], 'idx_customers_email_active');
    table.index(['creditStatus', 'customerType'], 'idx_customers_credit_type');
  });

  await knex.schema.alterTable('properties', (table) => {
    // Geographic and property-based searches
    table.index(['latitude', 'longitude'], 'idx_properties_coordinates');
    table.index(['customerId', 'isActive', 'propertyType'], 'idx_properties_customer_active_type');
    table.index(['zipCode', 'propertyType'], 'idx_properties_location_type');
    table.index(['waterHeaterType', 'waterHeaterAge'], 'idx_properties_water_heater');
  });

  await knex.schema.alterTable('conversations', (table) => {
    // Fast conversation filtering and assignment
    table.index(['status', 'priority', 'isEmergency'], 'idx_conversations_triage');
    table.index(['assignedTo', 'status'], 'idx_conversations_assignment');
    table.index(['customerId', 'status', 'lastMessageAt'], 'idx_conversations_customer_recent');
    table.index(['followUpRequired', 'followUpAt'], 'idx_conversations_followup');
    table.index(['platform', 'lastMessageAt'], 'idx_conversations_platform_time');
  });

  await knex.schema.alterTable('messages', (table) => {
    // Content and sentiment analysis
    table.index(['sentAt'], 'idx_messages_emergency_time');
    table.index(['status'], 'idx_messages_review_processor');
    table.index(['conversationId', 'sentAt'], 'idx_messages_conversation_chronological');
  });

  await knex.schema.alterTable('jobs', (table) => {
    // Job management and scheduling
    table.index(['status', 'priority', 'serviceCategory'], 'idx_jobs_triage');
    table.index(['assignedTechnician', 'status', 'scheduledAt'], 'idx_jobs_technician_schedule');
    table.index(['customerId', 'status', 'created_at'], 'idx_jobs_customer_recent');
    table.index(['serviceType', 'status', 'priority'], 'idx_jobs_service_triage');
    table.index(['followUpScheduled', 'followUpDate'], 'idx_jobs_followup');
    table.index(['requiresPermit', 'permitApprovedAt'], 'idx_jobs_permits');
  });

  await knex.schema.alterTable('quotes', (table) => {
    // Quote processing and reporting
    table.index(['status', 'validUntil'], 'idx_quotes_status_expiry');
    table.index(['jobId', 'status', 'created_at'], 'idx_quotes_job_recent');
  });

  await knex.schema.alterTable('staff', (table) => {
    // Staff scheduling and assignment
    table.index(['status', 'role', 'onCallAvailable'], 'idx_staff_availability');
    table.index(['emergencyTechnician', 'status'], 'idx_staff_emergency');
    table.index(['role', 'status'], 'idx_staff_role_active');
  });

  await knex.schema.alterTable('service_history', (table) => {
    // Service history reporting
    table.index(['customerId', 'serviceDate'], 'idx_service_history_customer_date');
    table.index(['propertyId', 'serviceType', 'serviceDate'], 'idx_service_history_property_service');
    table.index(['technician', 'serviceDate'], 'idx_service_history_tech_date');
    table.index(['warrantyCovered', 'serviceDate'], 'idx_service_history_warranty');
  });

  await knex.schema.alterTable('warranties', (table) => {
    // Warranty tracking and expiration
    table.index(['status', 'endDate'], 'idx_warranties_active_expiry');
    table.index(['customerId', 'status'], 'idx_warranties_customer_active');
    table.index(['propertyId', 'warrantyType'], 'idx_warranties_property_type');
  });

  await knex.schema.alterTable('maintenance_schedules', (table) => {
    // Maintenance scheduling
    table.index(['status', 'nextServiceDate'], 'idx_maintenance_active_due');
    table.index(['customerId', 'status'], 'idx_maintenance_customer_active');
    table.index(['serviceType', 'nextServiceDate'], 'idx_maintenance_service_due');
  });

  console.log('✅ Basic performance indexes created');
}

export async function down(_knex: Knex): Promise<void> {
  // Drop indexes by dropping and recreating tables would be too destructive
  // In SQLite, indexes are automatically dropped when tables are dropped
  // For individual index removal, you'd need to use DROP INDEX statements
  console.log('✅ Basic performance indexes rollback completed');
}