import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';

export async function up(knex: Knex): Promise<void> {
  // Enhanced webhooks table with comprehensive tracking
  await knex.schema.dropTableIfExists('webhooks');
  await knex.schema.createTable('webhooks', (table) => {
    table.string('id').primary();
    table.enum('source', ['google_voice', 'google_calendar', 'pubsub', 'stripe', 'twilio', 'other']).notNullable();
    table.string('event').notNullable();
    table.string('eventId').notNullable(); // Unique identifier from source system
    table.json('payload').notNullable();
    table.json('headers'); // Store request headers for debugging
    table.string('signature'); // Store webhook signature for verification
    table.enum('status', ['received', 'processing', 'completed', 'failed', 'duplicate']).defaultTo('received');
    table.enum('priority', ['low', 'medium', 'high', 'emergency']).defaultTo('medium');
    table.datetime('processedAt');
    table.json('processingResult'); // Store processing results/metadata
    table.text('errorMessage');
    table.integer('retryCount').defaultTo(0);
    table.integer('maxRetries').defaultTo(3);
    table.datetime('nextRetryAt');
    table.boolean('isDuplicate').defaultTo(false);
    table.string('duplicateOfId').references('id').inTable('webhooks').onDelete('SET NULL');
    table.integer('processingDurationMs'); // Track processing performance
    table.timestamps(true, true);

    // Indexes for performance
    table.index(['source', 'event']);
    table.index(['eventId', 'source']); // Unique constraint handled separately
    table.index(['status']);
    table.index(['priority']);
    table.index(['processedAt']);
    table.index(['nextRetryAt']);
    table.index(['retryCount']);
    table.index(['created_at']);
    
    // Unique constraint for duplicate detection
    table.unique(['eventId', 'source']);
  });

  // Webhook processing jobs queue
  await knex.schema.createTable('webhook_processing_jobs', (table) => {
    table.string('id').primary();
    table.string('webhookId').notNullable().references('id').inTable('webhooks').onDelete('CASCADE');
    table.string('jobType').notNullable(); // 'message_processing', 'ai_analysis', 'notification', etc.
    table.enum('status', ['pending', 'processing', 'completed', 'failed', 'cancelled']).defaultTo('pending');
    table.enum('priority', ['low', 'medium', 'high', 'emergency']).defaultTo('medium');
    table.json('jobData'); // Data needed for processing
    table.json('result'); // Processing result
    table.text('errorMessage');
    table.integer('retryCount').defaultTo(0);
    table.integer('maxRetries').defaultTo(3);
    table.datetime('scheduledAt').defaultTo(knex.fn.now());
    table.datetime('startedAt');
    table.datetime('completedAt');
    table.integer('processingDurationMs');
    table.string('workerId'); // Which worker processed this job
    table.timestamps(true, true);

    // Indexes
    table.index(['webhookId']);
    table.index(['jobType']);
    table.index(['status']);
    table.index(['priority']);
    table.index(['scheduledAt']);
    table.index(['retryCount']);
  });

  // Business rules for webhook processing
  await knex.schema.createTable('webhook_business_rules', (table) => {
    table.string('id').primary();
    table.string('name').notNullable();
    table.text('description');
    table.enum('source', ['google_voice', 'google_calendar', 'pubsub', 'stripe', 'twilio', 'any']).defaultTo('any');
    table.string('eventPattern'); // Regex pattern to match events
    table.json('conditions'); // JSON conditions to evaluate
    table.json('actions'); // Actions to take when rule matches
    table.integer('priority').defaultTo(100); // Lower number = higher priority
    table.boolean('isActive').defaultTo(true);
    table.integer('matchCount').defaultTo(0); // Track how often rule is triggered
    table.datetime('lastMatchedAt');
    table.timestamps(true, true);

    // Indexes
    table.index(['source']);
    table.index(['priority']);
    table.index(['isActive']);
    table.index(['lastMatchedAt']);
  });

  // Emergency keywords and patterns for plumbing business
  await knex.schema.createTable('emergency_keywords', (table) => {
    table.string('id').primary();
    table.string('keyword').notNullable();
    table.string('pattern'); // Regex pattern for more complex matching
    table.enum('severity', ['low', 'medium', 'high', 'critical']).notNullable();
    table.enum('category', ['flooding', 'gas_leak', 'no_water', 'backup', 'burst_pipe', 'electrical', 'other']).notNullable();
    table.text('description');
    table.json('actions'); // Automatic actions to take
    table.integer('escalationMinutes').defaultTo(15); // Minutes before escalation
    table.boolean('requiresImmediate').defaultTo(false); // Requires immediate technician dispatch
    table.boolean('isActive').defaultTo(true);
    table.integer('matchCount').defaultTo(0);
    table.datetime('lastMatchedAt');
    table.timestamps(true, true);

    // Indexes
    table.index(['keyword']);
    table.index(['category']);
    table.index(['severity']);
    table.index(['isActive']);
    table.unique(['keyword']); // Prevent duplicate keywords
  });

  // Service type classification patterns
  await knex.schema.createTable('service_type_patterns', (table) => {
    table.string('id').primary();
    table.string('pattern').notNullable(); // Regex pattern to match message content
    table.enum('serviceType', [
      'drain_cleaning',
      'pipe_repair', 
      'faucet_repair',
      'toilet_repair',
      'water_heater',
      'emergency_plumbing',
      'installation',
      'inspection',
      'maintenance',
      'garbage_disposal',
      'sump_pump',
      'water_softener',
      'other'
    ]).notNullable();
    table.integer('confidence').defaultTo(80); // Confidence level 0-100
    table.json('requiredSkills'); // Skills needed for this service type
    table.json('typicalParts'); // Common parts for this service
    table.integer('estimatedDuration').defaultTo(60); // Typical duration in minutes
    table.boolean('isActive').defaultTo(true);
    table.integer('matchCount').defaultTo(0);
    table.datetime('lastMatchedAt');
    table.timestamps(true, true);

    // Indexes
    table.index(['serviceType']);
    table.index(['confidence']);
    table.index(['isActive']);
  });

  // Staff notification preferences and escalation rules
  await knex.schema.createTable('staff_notification_rules', (table) => {
    table.string('id').primary();
    table.string('userId').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.enum('notificationType', [
      'emergency_message',
      'new_customer',
      'quote_request',
      'job_update',
      'system_alert',
      'missed_call',
      'voicemail'
    ]).notNullable();
    table.enum('severity', ['low', 'medium', 'high', 'critical']).notNullable();
    table.json('timeWindows'); // When to send notifications (business hours, etc.)
    table.json('contactMethods'); // sms, email, push, call
    table.integer('delayMinutes').defaultTo(0); // Delay before sending
    table.boolean('isActive').defaultTo(true);
    table.timestamps(true, true);

    // Indexes
    table.index(['userId']);
    table.index(['notificationType']);
    table.index(['severity']);
    table.index(['isActive']);
  });

  // Webhook performance metrics
  await knex.schema.createTable('webhook_metrics', (table) => {
    table.string('id').primary();
    table.enum('source', ['google_voice', 'google_calendar', 'pubsub', 'stripe', 'twilio', 'other']).notNullable();
    table.string('event').notNullable();
    table.date('date').notNullable();
    table.integer('hour').notNullable(); // 0-23 for hourly metrics
    table.integer('totalReceived').defaultTo(0);
    table.integer('totalProcessed').defaultTo(0);
    table.integer('totalFailed').defaultTo(0);
    table.integer('totalDuplicates').defaultTo(0);
    table.integer('emergencyCount').defaultTo(0);
    table.integer('avgProcessingTimeMs').defaultTo(0);
    table.integer('maxProcessingTimeMs').defaultTo(0);
    table.integer('minProcessingTimeMs').defaultTo(0);
    table.timestamps(true, true);

    // Indexes
    table.index(['source', 'event']);
    table.index(['date', 'hour']);
    table.unique(['source', 'event', 'date', 'hour']);
  });

  // Customer communication preferences inferred from webhook data
  await knex.schema.createTable('customer_communication_profiles', (table) => {
    table.string('id').primary();
    table.string('customerId').notNullable().references('id').inTable('customers').onDelete('CASCADE');
    table.json('preferredHours'); // Inferred from message timing
    table.json('responsePatterns'); // How quickly they typically respond
    table.json('communicationStyle'); // Formal, casual, brief, detailed
    table.json('urgencyIndicators'); // Words/phrases that indicate urgency for this customer
    table.boolean('prefersText').defaultTo(true);
    table.boolean('prefersCall').defaultTo(false);
    table.integer('avgResponseTimeMinutes');
    table.integer('totalInteractions').defaultTo(0);
    table.datetime('lastAnalyzedAt');
    table.timestamps(true, true);

    // Indexes
    table.index(['customerId']);
    table.index(['lastAnalyzedAt']);
    table.unique(['customerId']);
  });

  // Seed emergency keywords
  await knex('emergency_keywords').insert([
    {
      id: uuidv4(),
      keyword: 'flooding',
      pattern: '\\b(flood|flooding|water everywhere|basement flood)\\b',
      severity: 'critical',
      category: 'flooding',
      description: 'Water flooding emergency',
      actions: JSON.stringify(['immediate_dispatch', 'call_customer', 'notify_emergency_team']),
      escalationMinutes: 5,
      requiresImmediate: true,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    },
    {
      id: uuidv4(),
      keyword: 'gas leak',
      pattern: '\\b(gas leak|smell gas|gas odor|propane leak)\\b',
      severity: 'critical',
      category: 'gas_leak',
      description: 'Gas leak emergency - safety hazard',
      actions: JSON.stringify(['immediate_dispatch', 'call_customer', 'notify_emergency_team', 'safety_protocol']),
      escalationMinutes: 0,
      requiresImmediate: true,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    },
    {
      id: uuidv4(),
      keyword: 'no water',
      pattern: '\\b(no water|water shut off|no pressure|main line)\\b',
      severity: 'high',
      category: 'no_water',
      description: 'No water service',
      actions: JSON.stringify(['priority_dispatch', 'call_customer']),
      escalationMinutes: 15,
      requiresImmediate: false,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    },
    {
      id: uuidv4(),
      keyword: 'burst pipe',
      pattern: '\\b(burst pipe|pipe burst|broken pipe|pipe leak)\\b',
      severity: 'high',
      category: 'burst_pipe',
      description: 'Burst or broken pipe',
      actions: JSON.stringify(['immediate_dispatch', 'call_customer']),
      escalationMinutes: 10,
      requiresImmediate: true,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    },
    {
      id: uuidv4(),
      keyword: 'backup',
      pattern: '\\b(sewer backup|drain backup|toilet backup|overflow)\\b',
      severity: 'high',
      category: 'backup',
      description: 'Sewer or drain backup',
      actions: JSON.stringify(['priority_dispatch', 'call_customer']),
      escalationMinutes: 20,
      requiresImmediate: false,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    }
  ]);

  // Seed service type patterns
  await knex('service_type_patterns').insert([
    {
      id: uuidv4(),
      pattern: '\\b(drain|clog|slow drain|backup|snake)\\b',
      serviceType: 'drain_cleaning',
      confidence: 85,
      requiredSkills: JSON.stringify(['drain_cleaning', 'snake_operation']),
      typicalParts: JSON.stringify(['drain_cleaner', 'snake_cable']),
      estimatedDuration: 90,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    },
    {
      id: uuidv4(),
      pattern: '\\b(water heater|hot water|no hot water|heater)\\b',
      serviceType: 'water_heater',
      confidence: 90,
      requiredSkills: JSON.stringify(['water_heater_repair', 'gas_line', 'electrical']),
      typicalParts: JSON.stringify(['heating_element', 'thermostat', 'relief_valve']),
      estimatedDuration: 120,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    },
    {
      id: uuidv4(),
      pattern: '\\b(toilet|running|flush|tank|bowl)\\b',
      serviceType: 'toilet_repair',
      confidence: 80,
      requiredSkills: JSON.stringify(['toilet_repair']),
      typicalParts: JSON.stringify(['flapper', 'fill_valve', 'wax_ring']),
      estimatedDuration: 60,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    },
    {
      id: uuidv4(),
      pattern: '\\b(faucet|tap|drip|leak|handle)\\b',
      serviceType: 'faucet_repair',
      confidence: 75,
      requiredSkills: JSON.stringify(['faucet_repair']),
      typicalParts: JSON.stringify(['cartridge', 'washer', 'o_ring']),
      estimatedDuration: 45,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    }
  ]);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('customer_communication_profiles');
  await knex.schema.dropTableIfExists('webhook_metrics');
  await knex.schema.dropTableIfExists('staff_notification_rules');
  await knex.schema.dropTableIfExists('service_type_patterns');
  await knex.schema.dropTableIfExists('emergency_keywords');
  await knex.schema.dropTableIfExists('webhook_business_rules');
  await knex.schema.dropTableIfExists('webhook_processing_jobs');
  await knex.schema.dropTableIfExists('webhooks');
}