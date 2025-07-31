import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  console.log('🚀 Adding critical production performance indexes...');

  // ============================================================================
  // COMPOUND INDEXES FOR HIGH-PERFORMANCE QUERIES
  // ============================================================================

  // Critical conversation queries - most frequently accessed patterns
  await knex.schema.alterTable('conversations', (table) => {
    // Status + Priority + Created (conversation dashboards, active work queues)
    table.index(['status', 'priority', 'created_at'], 'idx_conversations_status_priority_created');
    
    // Customer + Status + Updated (customer conversation history)
    table.index(['customer_id', 'status', 'updated_at'], 'idx_conversations_customer_status_updated');
    
    // Emergency + Channel + Created (emergency response routing)
    table.index(['is_emergency', 'channel', 'created_at'], 'idx_conversations_emergency_channel_created');
    
    // Assigned + Status + Priority (technician workload management)
    table.index(['assigned_to', 'status', 'priority'], 'idx_conversations_assigned_status_priority');
    
    // Follow-up queries (scheduled follow-up management)
    table.index(['follow_up_required', 'follow_up_at', 'status'], 'idx_conversations_followup_scheduling');
    
    // Response time analytics (performance metrics)
    table.index(['first_response_at', 'created_at', 'channel'], 'idx_conversations_response_analytics');
    
    // Customer type + Emergency (routing optimization)
    table.index(['customer_id', 'is_emergency', 'created_at'], 'idx_conversations_customer_emergency');
  });

  // Critical message queries - high volume table requiring optimization
  await knex.schema.alterTable('messages', (table) => {
    // Conversation + Timestamp (conversation threading, chronological display)
    table.index(['conversation_id', 'timestamp', 'direction'], 'idx_messages_conversation_time_direction');
    
    // Emergency detection + Processing (emergency message routing)
    table.index(['contains_emergency_keywords', 'requires_human_review', 'created_at'], 'idx_messages_emergency_review');
    
    // Customer + Direction + Timestamp (customer communication history)
    table.index(['customer_id', 'direction', 'timestamp'], 'idx_messages_customer_direction_time');
    
    // Processing workflow (AI and human review queues)
    table.index(['requires_human_review', 'processed_by', 'created_at'], 'idx_messages_review_processing');
    
    // Sentiment analysis queries (quality monitoring)
    table.index(['sentiment_score', 'conversation_id', 'timestamp'], 'idx_messages_sentiment_analysis');
    
    // Full-text search support (if using PostgreSQL)
    table.index(['content'], 'idx_messages_content_search');
  });

  // Customer-centric indexes for CRM functionality
  await knex.schema.alterTable('customers', (table) => {
    // Geographic clustering (service area optimization)
    table.index(['latitude', 'longitude', 'customer_type'], 'idx_customers_location_type');
    
    // Service history + Type (customer segmentation)
    table.index(['customer_type', 'last_service_date', 'credit_status'], 'idx_customers_service_segment');
    
    // Emergency service eligibility (rapid emergency routing)
    table.index(['emergency_service_approved', 'customer_type', 'credit_status'], 'idx_customers_emergency_eligible');
    
    // Phone number lookup optimization (high-frequency lookup)
    table.index(['phone_number', 'alternate_phone'], 'idx_customers_phone_lookup');
    
    // Business customer management
    table.index(['customer_type', 'business_name', 'credit_limit'], 'idx_customers_business_mgmt');
  });

  // Property-specific service optimization
  await knex.schema.alterTable('properties', (table) => {
    // Equipment maintenance scheduling
    table.index(['water_heater_type', 'water_heater_age', 'customer_id'], 'idx_properties_equipment_maintenance');
    
    // Service complexity estimation (job planning)
    table.index(['pipe_type', 'year_built', 'bathrooms'], 'idx_properties_service_complexity');
    
    // Geographic service routing
    table.index(['latitude', 'longitude', 'requires_permits'], 'idx_properties_location_permits');
    
    // Property age analysis (predictive maintenance)
    table.index(['year_built', 'water_heater_age', 'pipe_type'], 'idx_properties_age_analysis');
  });

  // Job management and scheduling optimization
  await knex.schema.alterTable('jobs', (table) => {
    // Active job management (technician scheduling)
    table.index(['status', 'assigned_technician', 'scheduled_date'], 'idx_jobs_active_scheduling');
    
    // Emergency response (priority routing)
    table.index(['priority', 'status', 'created_at'], 'idx_jobs_emergency_response');
    
    // Customer job history (service tracking)
    table.index(['customer_id', 'status', 'completion_date'], 'idx_jobs_customer_history');
    
    // Revenue tracking and analysis
    table.index(['completion_date', 'total_amount', 'payment_status'], 'idx_jobs_revenue_analysis');
    
    // Technician performance metrics
    table.index(['assigned_technician', 'completion_date', 'customer_rating'], 'idx_jobs_technician_performance');
    
    // Geographic job distribution
    table.index(['property_id', 'scheduled_date', 'status'], 'idx_jobs_geographic_scheduling');
  });

  // Quote management optimization
  await knex.schema.alterTable('quotes', (table) => {
    // Active quote management (sales pipeline)
    table.index(['status', 'expires_at', 'total_amount'], 'idx_quotes_active_pipeline');
    
    // Customer quote history
    table.index(['customer_id', 'status', 'created_at'], 'idx_quotes_customer_history');
    
    // Revenue opportunity tracking
    table.index(['total_amount', 'status', 'created_at'], 'idx_quotes_revenue_opportunity');
    
    // Expiration management (automated follow-up)
    table.index(['expires_at', 'status', 'customer_id'], 'idx_quotes_expiration_management');
  });

  // ============================================================================
  // AI SYSTEM PERFORMANCE INDEXES
  // ============================================================================

  // Conversation analysis performance
  await knex.schema.alterTable('conversation_analyses', (table) => {
    // Real-time analysis retrieval (AI dashboard)
    table.index(['conversation_id', 'analysis_type', 'created_at'], 'idx_analyses_conversation_type_time');
    
    // Emergency detection workflows
    table.index(['is_emergency', 'emergency_type', 'created_at'], 'idx_analyses_emergency_detection');
    
    // Intent classification performance
    table.index(['primary_intent', 'intent_confidence', 'created_at'], 'idx_analyses_intent_classification');
    
    // Customer sentiment tracking
    table.index(['customer_sentiment', 'sentiment_confidence', 'conversation_id'], 'idx_analyses_sentiment_tracking');
    
    // Service type classification
    table.index(['service_type', 'service_type_confidence', 'urgency_level'], 'idx_analyses_service_classification');
  });

  // Intent classification optimization
  await knex.schema.alterTable('intent_classifications', (table) => {
    // Message-level intent tracking
    table.index(['conversation_id', 'message_id', 'created_at'], 'idx_intent_message_tracking');
    
    // Confidence-based filtering (quality control)
    table.index(['primary_intent', 'primary_confidence', 'created_at'], 'idx_intent_confidence_filtering');
  });

  // Response generation performance
  await knex.schema.alterTable('response_generations', (table) => {
    // Human review queue optimization
    table.index(['needs_review', 'response_type', 'created_at'], 'idx_responses_review_queue');
    
    // Quality control workflows
    table.index(['human_approved', 'confidence', 'created_at'], 'idx_responses_quality_control');
    
    // Response type analytics
    table.index(['response_type', 'tone', 'appropriateness_score'], 'idx_responses_type_analytics');
    
    // Feedback analysis
    table.index(['customer_feedback', 'internal_rating', 'created_at'], 'idx_responses_feedback_analysis');
  });

  // AI performance monitoring
  await knex.schema.alterTable('ai_performance_metrics', (table) => {
    // Time-series performance analysis
    table.index(['metric_type', 'period_start', 'period_end'], 'idx_ai_metrics_timeseries');
    
    // Cost optimization queries
    table.index(['period_start', 'total_cost', 'total_tokens_used'], 'idx_ai_metrics_cost_optimization');
  });

  // AI error tracking and resolution
  await knex.schema.alterTable('ai_errors', (table) => {
    // Active error management
    table.index(['resolved', 'error_type', 'created_at'], 'idx_ai_errors_active_management');
    
    // Impact assessment
    table.index(['impact_level', 'user_impacted', 'created_at'], 'idx_ai_errors_impact_assessment');
    
    // Service-specific error tracking
    table.index(['service', 'error_type', 'resolved'], 'idx_ai_errors_service_tracking');
  });

  // ============================================================================
  // COMMUNICATION SYSTEM PERFORMANCE INDEXES
  // ============================================================================

  // Google Voice sync optimization
  await knex.schema.alterTable('google_voice_sync_status', (table) => {
    // Sync monitoring and management
    table.index(['status', 'sync_type', 'started_at'], 'idx_gv_sync_monitoring');
    
    // Performance analysis
    table.index(['messages_processed', 'processing_time_seconds', 'started_at'], 'idx_gv_sync_performance');
  });

  // Webhook system performance
  await knex.schema.alterTable('webhook_deliveries', (table) => {
    // Delivery status monitoring
    table.index(['status', 'webhook_type', 'created_at'], 'idx_webhook_delivery_monitoring');
    
    // Retry management
    table.index(['retry_count', 'status', 'next_retry_at'], 'idx_webhook_retry_management');
    
    // Response time analysis
    table.index(['response_time_ms', 'status', 'created_at'], 'idx_webhook_response_analysis');
  });

  // ============================================================================
  // SYNC SYSTEM PERFORMANCE INDEXES
  // ============================================================================

  // Conversation sync metadata
  await knex.schema.alterTable('conversation_sync_metadata', (table) => {
    // Active sync monitoring
    table.index(['sync_type', 'completed_at', 'error_count'], 'idx_sync_meta_monitoring');
    
    // Performance optimization
    table.index(['sync_source', 'messages_imported', 'created_at'], 'idx_sync_meta_performance');
  });

  // Message processing queue optimization
  await knex.schema.alterTable('message_processing_queue', (table) => {
    // Queue processing efficiency (critical for real-time processing)
    table.index(['status', 'priority', 'scheduled_at'], 'idx_msg_queue_processing');
    
    // Retry management
    table.index(['retry_count', 'status', 'processing_type'], 'idx_msg_queue_retry_mgmt');
    
    // Performance monitoring
    table.index(['processing_type', 'processing_time_ms', 'completed_at'], 'idx_msg_queue_performance');
  });

  // Customer identification cache (high-frequency lookups)
  await knex.schema.alterTable('customer_identification_cache', (table) => {
    // Phone number lookup optimization (critical path)
    table.index(['phone_number', 'expires_at', 'confidence'], 'idx_customer_cache_phone_lookup');
    
    // Cache management and cleanup
    table.index(['expires_at', 'hit_count', 'created_at'], 'idx_customer_cache_management');
  });

  // ============================================================================
  // SPECIALIZED INDEXES FOR COMPLEX QUERIES
  // ============================================================================

  // Multi-table join optimization for dashboard queries
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_customer_join
    ON conversations (customer_id, status, created_at)
    INCLUDE (priority, is_emergency, assigned_to);
  `);

  // Time-series data optimization for analytics
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_timeseries
    ON messages (DATE(created_at), conversation_id)
    INCLUDE (direction, content, sentiment_score);
  `);

  // Full-text search optimization (PostgreSQL specific)
  if (knex.client.config.client === 'postgresql') {
    await knex.raw(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_content_fts
      ON messages USING gin(to_tsvector('english', content));
    `);

    await knex.raw(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_search_fts
      ON customers USING gin(to_tsvector('english', 
        COALESCE(first_name, '') || ' ' || 
        COALESCE(last_name, '') || ' ' || 
        COALESCE(business_name, '') || ' ' ||
        COALESCE(email, '') || ' ' ||
        COALESCE(phone_number, '')
      ));
    `);
  }

  // Partial indexes for specific high-performance scenarios
  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_active_emergency
    ON conversations (created_at, priority)
    WHERE status IN ('active', 'pending') AND is_emergency = true;
  `);

  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_unread_emergency
    ON messages (created_at, conversation_id)
    WHERE direction = 'inbound' AND requires_human_review = true;
  `);

  await knex.raw(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_scheduled_today
    ON jobs (scheduled_date, assigned_technician, priority)
    WHERE status IN ('scheduled', 'in_progress') AND scheduled_date >= CURRENT_DATE;
  `);

  // ============================================================================
  // MAINTENANCE AND MONITORING INDEXES
  // ============================================================================

  // Database maintenance optimization
  await knex.schema.alterTable('ai_cache', (table) => {
    // Cache cleanup efficiency
    table.index(['expiry_time', 'last_accessed'], 'idx_ai_cache_cleanup');
    
    // Hit rate analysis
    table.index(['hit_count', 'created_at', 'cache_key'], 'idx_ai_cache_analytics');
  });

  // Performance monitoring support
  await knex.schema.alterTable('sync_performance_metrics', (table) => {
    // Metric aggregation efficiency
    table.index(['sync_session_id', 'metric_name', 'recorded_at'], 'idx_sync_metrics_aggregation');
    
    // Performance trend analysis
    table.index(['metric_name', 'recorded_at', 'value'], 'idx_sync_metrics_trends');
  });

  console.log('✅ Production performance indexes created successfully');
  console.log('📊 Indexes optimized for:');
  console.log('   - Real-time conversation management');
  console.log('   - Emergency response routing');
  console.log('   - AI system performance');
  console.log('   - Customer relationship management');
  console.log('   - Technician scheduling and dispatch');
  console.log('   - Revenue and analytics reporting');
  console.log('   - Full-text search capabilities');
  console.log('   - High-frequency cache lookups');
}

export async function down(knex: Knex): Promise<void> {
  console.log('🗑️  Removing production performance indexes...');

  // Remove specialized indexes
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_conversations_customer_join;');
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_messages_timeseries;');
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_messages_content_fts;');
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_customers_search_fts;');
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_conversations_active_emergency;');
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_messages_unread_emergency;');
  await knex.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_jobs_scheduled_today;');

  // Remove compound indexes from each table
  const indexesToDrop = [
    // Conversations
    'idx_conversations_status_priority_created',
    'idx_conversations_customer_status_updated',
    'idx_conversations_emergency_channel_created',
    'idx_conversations_assigned_status_priority',
    'idx_conversations_followup_scheduling',
    'idx_conversations_response_analytics',
    'idx_conversations_customer_emergency',
    
    // Messages
    'idx_messages_conversation_time_direction',
    'idx_messages_emergency_review',
    'idx_messages_customer_direction_time',
    'idx_messages_review_processing',
    'idx_messages_sentiment_analysis',
    'idx_messages_content_search',
    
    // Customers
    'idx_customers_location_type',
    'idx_customers_service_segment',
    'idx_customers_emergency_eligible',
    'idx_customers_phone_lookup',
    'idx_customers_business_mgmt',
    
    // Properties
    'idx_properties_equipment_maintenance',
    'idx_properties_service_complexity',
    'idx_properties_location_permits',
    'idx_properties_age_analysis',
    
    // Jobs
    'idx_jobs_active_scheduling',
    'idx_jobs_emergency_response',
    'idx_jobs_customer_history',
    'idx_jobs_revenue_analysis',
    'idx_jobs_technician_performance',
    'idx_jobs_geographic_scheduling',
    
    // Quotes
    'idx_quotes_active_pipeline',
    'idx_quotes_customer_history',
    'idx_quotes_revenue_opportunity',
    'idx_quotes_expiration_management',
    
    // AI System
    'idx_analyses_conversation_type_time',
    'idx_analyses_emergency_detection',
    'idx_analyses_intent_classification',
    'idx_analyses_sentiment_tracking',
    'idx_analyses_service_classification',
    'idx_intent_message_tracking',
    'idx_intent_confidence_filtering',
    'idx_responses_review_queue',
    'idx_responses_quality_control',
    'idx_responses_type_analytics',
    'idx_responses_feedback_analysis',
    'idx_ai_metrics_timeseries',
    'idx_ai_metrics_cost_optimization',
    'idx_ai_errors_active_management',
    'idx_ai_errors_impact_assessment',
    'idx_ai_errors_service_tracking',
    
    // Communication System
    'idx_gv_sync_monitoring',
    'idx_gv_sync_performance',
    'idx_webhook_delivery_monitoring',
    'idx_webhook_retry_management',
    'idx_webhook_response_analysis',
    
    // Sync System
    'idx_sync_meta_monitoring',
    'idx_sync_meta_performance',
    'idx_msg_queue_processing',
    'idx_msg_queue_retry_mgmt',
    'idx_msg_queue_performance',
    'idx_customer_cache_phone_lookup',
    'idx_customer_cache_management',
    
    // Maintenance
    'idx_ai_cache_cleanup',
    'idx_ai_cache_analytics',
    'idx_sync_metrics_aggregation',
    'idx_sync_metrics_trends',
  ];

  // Drop each index individually to handle cases where some may not exist
  for (const indexName of indexesToDrop) {
    try {
      await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${indexName};`);
    } catch (error) {
      console.warn(`⚠️  Could not drop index ${indexName}: ${(error as Error).message}`);
    }
  }

  console.log('✅ Production performance indexes removed successfully');
}