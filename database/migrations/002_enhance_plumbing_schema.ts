import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ============================================================================
  // ENHANCE EXISTING TABLES
  // ============================================================================

  // Enhance customers table with additional plumbing-specific fields
  await knex.schema.alterTable('customers', (table) => {
    table.string('businessName'); // For commercial customers
    table.string('contactTitle'); // Primary contact's role
    table.string('alternatePhone'); // Secondary contact number
    table.text('accessInstructions'); // Gate codes, key locations, etc.
    table.boolean('emergencyServiceApproved').defaultTo(false); // Pre-approved for emergency work
    table.decimal('creditLimit', 10, 2); // Credit limit for commercial customers
    table.enum('creditStatus', ['good', 'hold', 'cod_only']).defaultTo('good');
    table.enum('customerType', ['residential', 'commercial', 'property_manager']).defaultTo('residential');
    table.json('preferences'); // Communication preferences, scheduling preferences
    table.decimal('latitude', 10, 7); // For distance calculations
    table.decimal('longitude', 10, 7); // For distance calculations
    table.integer('loyaltyPoints').defaultTo(0); // Customer loyalty program
    table.datetime('lastServiceDate'); // Last service performed

    // Additional indexes
    table.index(['businessName']);
    table.index(['customerType']);
    table.index(['creditStatus']);
    table.index(['emergencyServiceApproved']);
    table.index(['lastServiceDate']);
  });

  // Enhance properties table with plumbing-specific details
  await knex.schema.alterTable('properties', (table) => {
    table.integer('yearBuilt');
    table.integer('squareFootage');
    table.integer('bathrooms');
    table.integer('floors');
    table.boolean('hasBasement').defaultTo(false);
    table.boolean('hasCrawlspace').defaultTo(false);
    table.boolean('hasAttic').defaultTo(false);
    table.enum('waterHeaterType', ['gas', 'electric', 'tankless', 'solar', 'hybrid']).nullable();
    table.integer('waterHeaterAge'); // Years since installation
    table.enum('pipeType', ['copper', 'pvc', 'pex', 'galvanized', 'mixed']).nullable();
    table.boolean('septicSystem').defaultTo(false);
    table.text('accessInstructions'); // Property-specific access info
    table.json('equipmentInfo'); // Water heaters, sump pumps, etc.
    table.decimal('latitude', 10, 7);
    table.decimal('longitude', 10, 7);
    table.boolean('requiresPermits').defaultTo(false); // HOA or municipal permits needed

    // Additional indexes
    table.index(['waterHeaterType']);
    table.index(['pipeType']);
    table.index(['yearBuilt']);
    table.index(['requiresPermits']);
  });

  // Enhance conversations table with better routing and tracking
  await knex.schema.alterTable('conversations', (table) => {
    table.string('assignedTo').references('id').inTable('users').nullable(); // Assigned staff member
    table.enum('channel', ['voice', 'sms', 'email', 'web_chat', 'in_person']).defaultTo('sms');
    table.boolean('isEmergency').defaultTo(false);
    table.datetime('firstResponseAt'); // Time of first response
    table.datetime('resolvedAt'); // Time conversation was resolved
    table.integer('responseTimeMinutes'); // Time to first response
    table.json('routingInfo'); // Emergency routing, on-call assignments
    table.string('originalPhoneNumber'); // In case customer calls from different number
    table.boolean('followUpRequired').defaultTo(false);
    table.datetime('followUpAt'); // Scheduled follow-up time

    // Additional indexes
    table.index(['assignedTo']);
    table.index(['channel']);
    table.index(['isEmergency']);
    table.index(['firstResponseAt']);
    table.index(['followUpRequired']);
  });

  // Enhance messages table with better content analysis
  await knex.schema.alterTable('messages', (table) => {
    table.text('originalContent'); // Before any processing
    table.json('attachments'); // File attachments with metadata
    table.boolean('containsEmergencyKeywords').defaultTo(false);
    table.json('extractedInfo'); // AI-extracted service details
    table.decimal('sentimentScore', 3, 2); // -1 to 1 sentiment analysis
    table.boolean('requiresHumanReview').defaultTo(false);
    table.string('processedBy').references('id').inTable('users').nullable(); // Staff who handled
    table.integer('processingTimeSeconds'); // Time spent processing message

    // Additional indexes
    table.index(['containsEmergencyKeywords']);
    table.index(['requiresHumanReview']);
    table.index(['processedBy']);
    table.index(['sentimentScore']);
  });

  // Enhance jobs table with comprehensive plumbing workflow
  await knex.schema.alterTable('jobs', (table) => {
    table.string('assignedTechnician').references('id').inTable('users').nullable();
    table.string('backupTechnician').references('id').inTable('users').nullable();
    table.enum('serviceCategory', [
      'emergency', 'repair', 'installation', 'maintenance', 'inspection', 'consultation'
    ]).defaultTo('repair');
    table.boolean('requiresPermit').defaultTo(false);
    table.string('permitNumber');
    table.datetime('permitAppliedAt');
    table.datetime('permitApprovedAt');
    table.json('requiredTools'); // Tools needed for job
    table.json('requiredParts'); // Parts needed
    table.decimal('travelDistance', 5, 2); // Miles from office
    table.integer('travelTime'); // Minutes to reach location
    table.text('safetyNotes'); // Safety considerations
    table.text('customerRequests'); // Specific customer requests
    table.enum('accessType', ['key', 'lockbox', 'customer_present', 'gate_code', 'other']).nullable();
    table.boolean('followUpScheduled').defaultTo(false);
    table.datetime('followUpDate');
    table.json('beforePhotos'); // Photo URLs before work
    table.json('afterPhotos'); // Photo URLs after work
    table.decimal('customerSatisfactionRating', 2, 1); // 1-5 rating
    table.text('customerFeedback');

    // Additional indexes
    table.index(['assignedTechnician']);
    table.index(['serviceCategory']);
    table.index(['requiresPermit']);
    table.index(['followUpScheduled']);
    table.index(['followUpDate']);
    table.index(['customerSatisfactionRating']);
  });

  // Enhance ai_responses table with learning improvements
  await knex.schema.alterTable('ai_responses', (table) => {
    table.json('contextData'); // Full context used for generation
    table.text('editedResponse'); // Human-edited version
    table.string('editedBy').references('id').inTable('users').nullable(); // Who edited
    table.datetime('editedAt'); // When it was edited
    table.boolean('markedForTraining').defaultTo(false); // Include in future training
    table.enum('responseQuality', ['excellent', 'good', 'fair', 'poor']).nullable();
    table.text('improvementNotes'); // Notes on how to improve

    // Additional indexes
    table.index(['editedBy']);
    table.index(['markedForTraining']);
    table.index(['responseQuality']);
  });

  // ============================================================================
  // NEW TABLES
  // ============================================================================

  // Staff/Technician management
  await knex.schema.createTable('staff', (table) => {
    table.string('id').primary();
    table.string('userId').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('employeeId').unique().notNullable();
    table.string('firstName').notNullable();
    table.string('lastName').notNullable();
    table.string('email').notNullable();
    table.string('phone').notNullable();
    table.enum('role', [
      'lead_technician', 'technician', 'apprentice', 'dispatcher', 'office_manager', 'owner'
    ]).notNullable();
    table.enum('status', ['active', 'inactive', 'on_leave', 'terminated']).defaultTo('active');
    table.date('hireDate').notNullable();
    table.date('terminationDate');
    table.json('certifications'); // Licenses, certifications
    table.json('specialties'); // Drain cleaning, water heater, etc.
    table.json('serviceAreas'); // ZIP codes they cover
    table.boolean('onCallAvailable').defaultTo(false);
    table.boolean('emergencyTechnician').defaultTo(false);
    table.decimal('hourlyRate', 8, 2);
    table.decimal('emergencyRate', 8, 2);
    table.integer('maxJobsPerDay').defaultTo(8);
    table.json('workSchedule'); // Available hours by day
    table.text('notes');
    table.timestamps(true, true);

    // Indexes
    table.index(['employeeId']);
    table.index(['role']);
    table.index(['status']);
    table.index(['onCallAvailable']);
    table.index(['emergencyTechnician']);
  });

  // Service history tracking
  await knex.schema.createTable('service_history', (table) => {
    table.string('id').primary();
    table.string('customerId').notNullable().references('id').inTable('customers').onDelete('CASCADE');
    table.string('propertyId').notNullable().references('id').inTable('properties').onDelete('CASCADE');
    table.string('jobId').notNullable().references('id').inTable('jobs').onDelete('CASCADE');
    table.string('technician').notNullable().references('id').inTable('staff').onDelete('RESTRICT');
    table.datetime('serviceDate').notNullable();
    table.enum('serviceType', [
      'drain_cleaning', 'pipe_repair', 'faucet_repair', 'toilet_repair', 'water_heater',
      'emergency_plumbing', 'installation', 'inspection', 'maintenance', 'other'
    ]).notNullable();
    table.text('workPerformed').notNullable(); // Detailed description
    table.json('partsUsed'); // Parts installed/replaced
    table.json('equipmentServiced'); // Equipment worked on
    table.decimal('laborHours', 4, 2).notNullable();
    table.decimal('totalCost', 10, 2).notNullable();
    table.boolean('warrantyCovered').defaultTo(false);
    table.text('recommendations'); // Future maintenance recommendations
    table.json('beforeCondition'); // State before service
    table.json('afterCondition'); // State after service
    table.enum('serviceOutcome', ['completed', 'partial', 'referred', 'postponed']).defaultTo('completed');
    table.text('notes');
    table.timestamps(true, true);

    // Indexes
    table.index(['customerId']);
    table.index(['propertyId']);
    table.index(['jobId']);
    table.index(['technician']);
    table.index(['serviceDate']);
    table.index(['serviceType']);
    table.index(['warrantyCovered']);
  });

  // Warranty tracking
  await knex.schema.createTable('warranties', (table) => {
    table.string('id').primary();
    table.string('customerId').notNullable().references('id').inTable('customers').onDelete('CASCADE');
    table.string('propertyId').notNullable().references('id').inTable('properties').onDelete('CASCADE');
    table.string('serviceHistoryId').notNullable().references('id').inTable('service_history').onDelete('CASCADE');
    table.string('warrantyNumber').unique().notNullable();
    table.enum('warrantyType', ['parts', 'labor', 'full_service']).notNullable();
    table.text('description').notNullable(); // What's covered
    table.date('startDate').notNullable();
    table.date('endDate').notNullable();
    table.integer('durationMonths').notNullable();
    table.enum('status', ['active', 'expired', 'claimed', 'voided']).defaultTo('active');
    table.json('termsAndConditions');
    table.decimal('warrantyValue', 10, 2); // Value of warranty
    table.boolean('transferable').defaultTo(false);
    table.text('claimInstructions');
    table.timestamps(true, true);

    // Indexes
    table.index(['customerId']);
    table.index(['propertyId']);
    table.index(['warrantyNumber']);
    table.index(['status']);
    table.index(['endDate']);
    table.index(['warrantyType']);
  });

  // Warranty claims
  await knex.schema.createTable('warranty_claims', (table) => {
    table.string('id').primary();
    table.string('warrantyId').notNullable().references('id').inTable('warranties').onDelete('CASCADE');
    table.string('customerId').notNullable().references('id').inTable('customers').onDelete('CASCADE');
    table.string('jobId').references('id').inTable('jobs').onDelete('SET NULL');
    table.datetime('claimDate').notNullable();
    table.text('issueDescription').notNullable();
    table.enum('claimType', ['parts_failure', 'labor_issue', 'service_callback']).notNullable();
    table.enum('status', ['submitted', 'under_review', 'approved', 'denied', 'completed']).defaultTo('submitted');
    table.string('reviewedBy').references('id').inTable('staff').nullable();
    table.datetime('reviewedAt');
    table.text('reviewNotes');
    table.decimal('claimAmount', 10, 2).defaultTo(0);
    table.boolean('coverageApproved').defaultTo(false);
    table.text('resolutionNotes');
    table.datetime('resolvedAt');
    table.timestamps(true, true);

    // Indexes
    table.index(['warrantyId']);
    table.index(['customerId']);
    table.index(['claimDate']);
    table.index(['status']);
    table.index(['reviewedBy']);
  });

  // Recurring maintenance schedules
  await knex.schema.createTable('maintenance_schedules', (table) => {
    table.string('id').primary();
    table.string('customerId').notNullable().references('id').inTable('customers').onDelete('CASCADE');
    table.string('propertyId').notNullable().references('id').inTable('properties').onDelete('CASCADE');
    table.string('name').notNullable(); // Schedule name
    table.text('description').notNullable();
    table.enum('serviceType', [
      'drain_cleaning', 'pipe_inspection', 'water_heater_maintenance', 'sump_pump_check',
      'general_inspection', 'grease_trap_cleaning', 'other'
    ]).notNullable();
    table.enum('frequency', ['monthly', 'quarterly', 'semi_annual', 'annual']).notNullable();
    table.date('nextServiceDate').notNullable();
    table.date('lastServiceDate');
    table.integer('estimatedDuration').defaultTo(60); // Minutes
    table.decimal('estimatedCost', 10, 2);
    table.boolean('autoSchedule').defaultTo(true);
    table.integer('advanceNotificationDays').defaultTo(7);
    table.enum('status', ['active', 'paused', 'cancelled']).defaultTo('active');
    table.string('preferredTechnician').references('id').inTable('staff').nullable();
    table.json('serviceNotes'); // Special instructions
    table.timestamps(true, true);

    // Indexes
    table.index(['customerId']);
    table.index(['propertyId']);
    table.index(['serviceType']);
    table.index(['nextServiceDate']);
    table.index(['status']);
    table.index(['preferredTechnician']);
  });

  // Business configuration
  await knex.schema.createTable('business_config', (table) => {
    table.string('id').primary();
    table.string('key').unique().notNullable();
    table.json('value').notNullable();
    table.text('description');
    table.enum('category', [
      'business_info', 'service_hours', 'pricing', 'service_area', 'emergency_settings',
      'ai_settings', 'notification_settings', 'integration_settings'
    ]).notNullable();
    table.boolean('isActive').defaultTo(true);
    table.string('lastModifiedBy').references('id').inTable('users').nullable();
    table.timestamps(true, true);

    // Indexes
    table.index(['key']);
    table.index(['category']);
    table.index(['isActive']);
  });

  // Audit log for tracking important changes
  await knex.schema.createTable('audit_logs', (table) => {
    table.string('id').primary();
    table.string('tableName').notNullable();
    table.string('recordId').notNullable();
    table.enum('operation', ['INSERT', 'UPDATE', 'DELETE']).notNullable();
    table.json('oldValues');
    table.json('newValues');
    table.string('changedBy').references('id').inTable('users').nullable();
    table.datetime('changedAt').notNullable();
    table.string('changeReason');
    table.string('ipAddress');
    table.string('userAgent');
    table.timestamps(true, true);

    // Indexes
    table.index(['tableName']);
    table.index(['recordId']);
    table.index(['operation']);
    table.index(['changedBy']);
    table.index(['changedAt']);
  });

  // Equipment tracking
  await knex.schema.createTable('equipment', (table) => {
    table.string('id').primary();
    table.string('propertyId').notNullable().references('id').inTable('properties').onDelete('CASCADE');
    table.enum('equipmentType', [
      'water_heater', 'sump_pump', 'water_softener', 'garbage_disposal', 'toilet',
      'faucet', 'shower', 'bathtub', 'laundry_connection', 'dishwasher_connection', 'other'
    ]).notNullable();
    table.string('brand');
    table.string('model');
    table.string('serialNumber');
    table.date('installationDate');
    table.date('warrantyExpiration');
    table.integer('ageYears');
    table.enum('condition', ['excellent', 'good', 'fair', 'poor', 'needs_replacement']).defaultTo('good');
    table.text('location'); // Kitchen, master bath, etc.
    table.json('specifications'); // Capacity, efficiency, etc.
    table.text('maintenanceNotes');
    table.date('lastServiceDate');
    table.boolean('isActive').defaultTo(true);
    table.timestamps(true, true);

    // Indexes
    table.index(['propertyId']);
    table.index(['equipmentType']);
    table.index(['condition']);
    table.index(['warrantyExpiration']);
    table.index(['isActive']);
  });

  // Emergency routing configuration
  await knex.schema.createTable('emergency_routing', (table) => {
    table.string('id').primary();
    table.string('name').notNullable(); // Rule name
    table.text('description');
    table.json('conditions'); // When this rule applies
    table.string('primaryTechnician').references('id').inTable('staff').nullable();
    table.string('backupTechnician').references('id').inTable('staff').nullable();
    table.json('notificationList'); // Who to notify
    table.integer('responseTimeMinutes').defaultTo(60); // Expected response time
    table.decimal('emergencyRate', 8, 2); // Emergency hourly rate
    table.boolean('autoAssign').defaultTo(false);
    table.boolean('isActive').defaultTo(true);
    table.integer('priority').defaultTo(1); // Rule priority
    table.timestamps(true, true);

    // Indexes
    table.index(['primaryTechnician']);
    table.index(['isActive']);
    table.index(['priority']);
  });
}

export async function down(knex: Knex): Promise<void> {
  // Drop new tables in reverse order
  await knex.schema.dropTableIfExists('emergency_routing');
  await knex.schema.dropTableIfExists('equipment');
  await knex.schema.dropTableIfExists('audit_logs');
  await knex.schema.dropTableIfExists('business_config');
  await knex.schema.dropTableIfExists('maintenance_schedules');
  await knex.schema.dropTableIfExists('warranty_claims');
  await knex.schema.dropTableIfExists('warranties');
  await knex.schema.dropTableIfExists('service_history');
  await knex.schema.dropTableIfExists('staff');

  // Remove added columns from existing tables (in reverse order of addition)
  const tables = ['ai_responses', 'jobs', 'messages', 'conversations', 'properties', 'customers'];
  
  for (const tableName of tables) {
    await knex.schema.alterTable(tableName, (_table) => {
      // Note: This is a simplified rollback - in production, you'd need to drop each column individually
      // For now, we'll leave the enhanced columns as dropping them could cause data loss
    });
  }
}