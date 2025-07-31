import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Conversation Analyses Table
  await knex.schema.createTable('conversation_analyses', (table) => {
    table.uuid('id').primary();
    table.uuid('conversation_id').notNullable();
    table.enum('analysis_type', ['initial', 'update', 'summary']).notNullable();
    
    // Intent Analysis
    table.enum('primary_intent', [
      'emergency_service', 'routine_inquiry', 'quote_request', 'scheduling',
      'rescheduling', 'complaint', 'follow_up', 'payment_inquiry',
      'service_information', 'appointment_confirmation', 'cancellation',
      'warranty_claim', 'maintenance_reminder', 'general_question', 'other'
    ]).notNullable();
    table.json('secondary_intents').defaultTo('[]');
    table.decimal('intent_confidence', 3, 2).notNullable();
    
    // Emergency Detection
    table.boolean('is_emergency').defaultTo(false);
    table.enum('emergency_type', [
      'flooding', 'burst_pipe', 'gas_leak', 'sewage_backup', 'no_water',
      'major_leak', 'toilet_overflow', 'water_heater_failure', 'none'
    ]).defaultTo('none');
    table.decimal('emergency_confidence', 3, 2).notNullable();
    
    // Urgency Assessment
    table.enum('urgency_level', ['immediate', 'same_day', 'within_week', 'flexible', 'unknown']).notNullable();
    table.json('urgency_reasons').defaultTo('[]');
    
    // Customer Analysis
    table.enum('customer_sentiment', ['positive', 'neutral', 'frustrated', 'angry', 'worried', 'unknown']).notNullable();
    table.decimal('sentiment_confidence', 3, 2).notNullable();
    table.json('frustration_indicators').defaultTo('[]');
    
    // Service Information
    table.enum('service_type', [
      'drain_cleaning', 'pipe_repair', 'faucet_repair', 'toilet_repair',
      'water_heater', 'emergency_plumbing', 'installation', 'inspection',
      'maintenance', 'other'
    ]).nullable();
    table.decimal('service_type_confidence', 3, 2).nullable();
    
    // Extracted Information
    table.json('extracted_info').defaultTo('{}');
    
    // Context Analysis
    table.enum('conversation_stage', [
      'initial_contact', 'information_gathering', 'quote_discussion',
      'scheduling', 'follow_up', 'resolved'
    ]).notNullable();
    table.text('next_recommended_action').notNullable();
    table.text('suggested_follow_up').nullable();
    
    // Summary
    table.text('short_summary').notNullable();
    table.json('key_points').defaultTo('[]');
    table.json('action_items').defaultTo('[]');
    
    // Metadata
    table.integer('tokens_used').notNullable();
    table.integer('processing_time_ms').notNullable();
    table.string('model_version', 100).notNullable();
    table.timestamp('created_at').notNullable();
    table.timestamp('updated_at').notNullable();
    
    // Indexes
    table.index('conversation_id');
    table.index('analysis_type');
    table.index('primary_intent');
    table.index('is_emergency');
    table.index('urgency_level');
    table.index('customer_sentiment');
    table.index('created_at');
  });

  // Intent Classifications Table
  await knex.schema.createTable('intent_classifications', (table) => {
    table.uuid('id').primary();
    table.uuid('message_id').notNullable();
    table.uuid('conversation_id').notNullable();
    
    // Primary Intent
    table.enum('primary_intent', [
      'emergency_service', 'routine_inquiry', 'quote_request', 'scheduling',
      'rescheduling', 'complaint', 'follow_up', 'payment_inquiry',
      'service_information', 'appointment_confirmation', 'cancellation',
      'warranty_claim', 'maintenance_reminder', 'general_question', 'other'
    ]).notNullable();
    table.decimal('primary_confidence', 3, 2).notNullable();
    
    // All Possible Intents (JSON array)
    table.json('intents').notNullable();
    
    // Context Factors
    table.json('context_factors').notNullable();
    
    // Processing Metadata
    table.integer('tokens_used').notNullable();
    table.integer('processing_time_ms').notNullable();
    table.string('model_version', 100).notNullable();
    table.timestamp('created_at').notNullable();
    
    // Indexes
    table.index('message_id');
    table.index('conversation_id');
    table.index('primary_intent');
    table.index('primary_confidence');
    table.index('created_at');
  });

  // Response Generations Table
  await knex.schema.createTable('response_generations', (table) => {
    table.uuid('id').primary();
    table.uuid('conversation_id').notNullable();
    table.uuid('message_id').nullable();
    table.uuid('analysis_id').nullable();
    
    // Generated Response
    table.text('generated_response').notNullable();
    table.enum('response_type', [
      'immediate', 'informational', 'scheduling', 'emergency', 'quote', 'follow_up'
    ]).notNullable();
    table.enum('tone', ['professional', 'empathetic', 'urgent', 'friendly', 'formal']).notNullable();
    
    // Alternative Responses (JSON array)
    table.json('alternatives').defaultTo('[]');
    
    // Template Information
    table.string('template_used', 100).nullable();
    table.boolean('personalization_applied').defaultTo(false);
    
    // Business Rules Applied
    table.json('business_rules_applied').defaultTo('[]');
    table.boolean('pricing_mentioned').defaultTo(false);
    table.boolean('scheduling_suggested').defaultTo(false);
    
    // Quality Metrics
    table.decimal('confidence', 3, 2).notNullable();
    table.decimal('appropriateness_score', 3, 2).notNullable();
    
    // Human Review
    table.boolean('needs_review').defaultTo(false);
    table.text('review_reason').nullable();
    table.boolean('human_approved').nullable();
    table.boolean('human_edited').nullable();
    table.text('final_response').nullable();
    table.string('edited_by', 100).nullable();
    table.timestamp('edited_at').nullable();
    
    // Feedback
    table.enum('customer_feedback', ['positive', 'neutral', 'negative']).nullable();
    table.integer('internal_rating').nullable(); // 1-5 scale
    table.text('improvement_notes').nullable();
    
    // Metadata
    table.integer('tokens_used').notNullable();
    table.integer('processing_time_ms').notNullable();
    table.string('model_version', 100).notNullable();
    table.timestamp('created_at').notNullable();
    table.timestamp('updated_at').notNullable();
    
    // Indexes
    table.index('conversation_id');
    table.index('message_id');
    table.index('response_type');
    table.index('needs_review');
    table.index('human_approved');
    table.index('created_at');
  });

  // AI Configuration Table
  await knex.schema.createTable('ai_configurations', (table) => {
    table.uuid('id').primary();
    table.enum('config_type', ['conversation_analysis', 'intent_classification', 'response_generation']).notNullable();
    
    // Model Settings
    table.string('model_version', 100).notNullable();
    table.decimal('temperature', 3, 2).notNullable();
    table.integer('max_tokens').notNullable();
    
    // Business Context (JSON)
    table.json('business_info').notNullable();
    table.json('service_types').notNullable();
    table.json('emergency_keywords').defaultTo('[]');
    table.json('urgent_keywords').defaultTo('[]');
    
    // Response Guidelines (JSON)
    table.json('response_guidelines').notNullable();
    
    // Quality Thresholds (JSON)
    table.json('quality_thresholds').notNullable();
    
    table.boolean('is_active').defaultTo(true);
    table.string('created_by', 100).notNullable();
    table.timestamp('created_at').notNullable();
    table.timestamp('updated_at').notNullable();
    
    // Indexes
    table.index('config_type');
    table.index('is_active');
    table.index('created_at');
  });

  // AI Performance Metrics Table
  await knex.schema.createTable('ai_performance_metrics', (table) => {
    table.uuid('id').primary();
    table.enum('metric_type', ['daily', 'weekly', 'monthly']).notNullable();
    table.timestamp('period_start').notNullable();
    table.timestamp('period_end').notNullable();
    
    // Volume Metrics
    table.integer('total_analyses').notNullable();
    table.integer('conversation_analyses').notNullable();
    table.integer('intent_classifications').notNullable();
    table.integer('response_generations').notNullable();
    
    // Accuracy Metrics
    table.decimal('average_intent_confidence', 3, 2).notNullable();
    table.decimal('emergency_detection_accuracy', 3, 2).notNullable();
    table.decimal('response_approval_rate', 3, 2).notNullable();
    table.decimal('human_edit_rate', 3, 2).notNullable();
    
    // Performance Metrics
    table.integer('average_processing_time').notNullable(); // milliseconds
    table.integer('total_tokens_used').notNullable();
    table.integer('average_tokens_per_request').notNullable();
    table.decimal('cost_per_request', 8, 4).notNullable();
    table.decimal('total_cost', 10, 2).notNullable();
    
    // Quality Metrics
    table.decimal('customer_satisfaction_score', 3, 2).nullable();
    table.decimal('response_effectiveness_score', 3, 2).nullable();
    
    // Error Metrics
    table.decimal('error_rate', 5, 4).notNullable();
    table.decimal('timeout_rate', 5, 4).notNullable();
    table.decimal('retry_rate', 5, 4).notNullable();
    
    table.timestamp('created_at').notNullable();
    
    // Indexes
    table.index('metric_type');
    table.index('period_start');
    table.index('period_end');
    table.index('created_at');
  });

  // AI Training Data Table
  await knex.schema.createTable('ai_training_data', (table) => {
    table.uuid('id').primary();
    table.enum('data_type', ['conversation', 'intent_example', 'response_template']).notNullable();
    
    // Input Data
    table.text('input_text').notNullable();
    table.json('context').nullable();
    
    // Expected Output
    table.enum('expected_intent', [
      'emergency_service', 'routine_inquiry', 'quote_request', 'scheduling',
      'rescheduling', 'complaint', 'follow_up', 'payment_inquiry',
      'service_information', 'appointment_confirmation', 'cancellation',
      'warranty_claim', 'maintenance_reminder', 'general_question', 'other'
    ]).nullable();
    table.text('expected_response').nullable();
    table.json('expected_entities').nullable();
    
    // Quality Labels
    table.boolean('is_high_quality').defaultTo(false);
    table.string('verified_by', 100).nullable();
    table.timestamp('verified_at').nullable();
    
    // Usage Tracking
    table.boolean('used_in_training').defaultTo(false);
    table.integer('training_runs').defaultTo(0);
    table.timestamp('last_used').nullable();
    
    // Metadata
    table.enum('source', ['real_conversation', 'synthetic', 'manual_entry']).notNullable();
    table.json('tags').defaultTo('[]');
    table.text('notes').nullable();
    
    table.timestamp('created_at').notNullable();
    table.timestamp('updated_at').notNullable();
    
    // Indexes
    table.index('data_type');
    table.index('expected_intent');
    table.index('is_high_quality');
    table.index('used_in_training');
    table.index('source');
    table.index('created_at');
  });

  // AI Errors Table
  await knex.schema.createTable('ai_errors', (table) => {
    table.uuid('id').primary();
    table.enum('error_type', ['api_error', 'timeout', 'rate_limit', 'invalid_response', 'processing_error']).notNullable();
    table.enum('service', ['conversation_analysis', 'intent_classification', 'response_generation']).notNullable();
    
    // Error Details
    table.text('error_message').notNullable();
    table.string('error_code', 100).nullable();
    table.text('stack_trace').nullable();
    
    // Request Context
    table.string('request_id', 100).nullable();
    table.uuid('conversation_id').nullable();
    table.uuid('message_id').nullable();
    
    // Request Data
    table.json('input_data').nullable();
    table.json('model_parameters').nullable();
    
    // Recovery Information
    table.integer('retry_attempt').defaultTo(0);
    table.boolean('resolved').defaultTo(false);
    table.text('resolution').nullable();
    table.timestamp('resolved_at').nullable();
    
    // Impact Assessment
    table.enum('impact_level', ['low', 'medium', 'high', 'critical']).notNullable();
    table.boolean('user_impacted').defaultTo(false);
    table.boolean('fallback_used').defaultTo(false);
    
    table.timestamp('created_at').notNullable();
    
    // Indexes
    table.index('error_type');
    table.index('service');
    table.index('impact_level');
    table.index('resolved');
    table.index('conversation_id');
    table.index('created_at');
  });

  // AI Alert Rules Table
  await knex.schema.createTable('ai_alert_rules', (table) => {
    table.uuid('id').primary();
    table.string('name', 100).notNullable();
    table.text('condition_rule').notNullable();
    table.decimal('threshold_value', 10, 4).notNullable();
    table.enum('severity', ['critical', 'warning', 'info']).notNullable();
    table.boolean('enabled').defaultTo(true);
    table.timestamp('created_at').notNullable();
    
    // Indexes
    table.index('enabled');
    table.index('severity');
    table.index('created_at');
  });

  // AI Alerts Table
  await knex.schema.createTable('ai_alerts', (table) => {
    table.uuid('id').primary();
    table.enum('severity', ['critical', 'warning', 'info']).notNullable();
    table.string('service', 100).notNullable();
    table.text('message').notNullable();
    table.json('details').notNullable();
    table.json('action_items').defaultTo('[]');
    table.boolean('acknowledged').defaultTo(false);
    table.string('acknowledged_by', 100).nullable();
    table.timestamp('acknowledged_at').nullable();
    table.timestamp('created_at').notNullable();
    
    // Indexes
    table.index('severity');
    table.index('service');
    table.index('acknowledged');
    table.index('created_at');
  });

  // AI Cache Table (for caching responses)
  await knex.schema.createTable('ai_cache', (table) => {
    table.string('cache_key', 255).primary();
    table.json('cache_value').notNullable();
    table.timestamp('expiry_time').notNullable();
    table.integer('hit_count').defaultTo(0);
    table.timestamp('last_accessed').notNullable();
    table.timestamp('created_at').notNullable();
    
    // Indexes
    table.index('expiry_time');
    table.index('last_accessed');
    table.index('created_at');
  });

  console.log('✅ AI system tables created successfully');
}

export async function down(knex: Knex): Promise<void> {
  // Drop tables in reverse order to handle foreign key constraints
  await knex.schema.dropTableIfExists('ai_cache');
  await knex.schema.dropTableIfExists('ai_alerts');
  await knex.schema.dropTableIfExists('ai_alert_rules');
  await knex.schema.dropTableIfExists('ai_errors');
  await knex.schema.dropTableIfExists('ai_training_data');
  await knex.schema.dropTableIfExists('ai_performance_metrics');
  await knex.schema.dropTableIfExists('ai_configurations');
  await knex.schema.dropTableIfExists('response_generations');
  await knex.schema.dropTableIfExists('intent_classifications');
  await knex.schema.dropTableIfExists('conversation_analyses');

  console.log('✅ AI system tables dropped successfully');
}