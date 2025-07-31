import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';

export async function up(knex: Knex): Promise<void> {
  // Conversation sync metadata table
  await knex.schema.createTable('conversation_sync_metadata', (table) => {
    table.string('id').primary();
    table.string('conversationId').notNullable().references('id').inTable('conversations').onDelete('CASCADE');
    table.enum('syncType', ['initial', 'incremental', 'manual']).notNullable();
    table.string('syncSessionId').notNullable();
    table.integer('messagesImported').defaultTo(0);
    table.integer('duplicatesSkipped').defaultTo(0);
    table.integer('errorCount').defaultTo(0);
    table.string('lastSyncedMessageId');
    table.datetime('lastSyncedTimestamp');
    table.enum('syncSource', ['google_voice', 'twilio', 'manual']).notNullable();
    table.json('syncConfig');
    table.datetime('completedAt');
    table.timestamps(true, true);

    // Indexes
    table.index(['conversationId']);
    table.index(['syncSessionId']);
    table.index(['syncType']);
    table.index(['syncSource']);
    table.index(['completedAt']);
  });

  // Message parsing results table
  await knex.schema.createTable('message_parsing_results', (table) => {
    table.string('id').primary();
    table.string('messageId').notNullable().references('id').inTable('messages').onDelete('CASCADE');
    table.string('parsingVersion').notNullable();
    table.datetime('parsingTimestamp').notNullable();
    table.json('extractedInfo').notNullable();
    table.json('parsingErrors');
    table.integer('processingTimeMs').defaultTo(0);
    table.timestamps(true, true);

    // Indexes
    table.index(['messageId']);
    table.index(['parsingVersion']);
    table.index(['parsingTimestamp']);
    table.unique(['messageId', 'parsingVersion']); // One parsing result per message per version
  });

  // Conversation threading results table
  await knex.schema.createTable('conversation_threading_results', (table) => {
    table.string('id').primary();
    table.string('customerId').notNullable().references('id').inTable('customers').onDelete('CASCADE');
    table.string('threadingSessionId').notNullable();
    table.integer('conversationsAnalyzed').defaultTo(0);
    table.integer('conversationsMerged').defaultTo(0);
    table.integer('conversationsSplit').defaultTo(0);
    table.json('threadingDecisions').notNullable();
    table.integer('processingTimeMs').defaultTo(0);
    table.timestamps(true, true);

    // Indexes
    table.index(['customerId']);
    table.index(['threadingSessionId']);
    table.index(['created_at']);
  });

  // Message attachments table
  await knex.schema.createTable('message_attachments', (table) => {
    table.string('id').primary();
    table.string('messageId').notNullable().references('id').inTable('messages').onDelete('CASCADE');
    table.text('originalUrl');
    table.text('localPath');
    table.string('filename').notNullable();
    table.string('mimeType').notNullable();
    table.bigInteger('sizeBytes').defaultTo(0);
    table.enum('status', ['pending', 'downloaded', 'processed', 'failed']).defaultTo('pending');
    table.boolean('isImage').defaultTo(false);
    table.boolean('isAudio').defaultTo(false);
    table.boolean('isTranscribed').defaultTo(false);
    table.text('transcription');
    table.json('imageAnalysis');
    table.json('metadata');
    table.timestamps(true, true);

    // Indexes
    table.index(['messageId']);
    table.index(['status']);
    table.index(['isImage']);
    table.index(['isAudio']);
    table.index(['mimeType']);
  });

  // Conversation analytics table
  await knex.schema.createTable('conversation_analytics', (table) => {
    table.string('id').primary();
    table.string('conversationId').notNullable().references('id').inTable('conversations').onDelete('CASCADE');
    table.date('analysisDate').notNullable();
    table.json('metrics').notNullable();
    table.json('keywordAnalysis').notNullable();
    table.json('communicationPatterns').notNullable();
    table.timestamps(true, true);

    // Indexes
    table.index(['conversationId']);
    table.index(['analysisDate']);
    table.unique(['conversationId', 'analysisDate']); // One analysis per conversation per day
  });

  // Enhanced Google Voice sync status table (update existing)
  await knex.schema.alterTable('google_voice_sync_status', (table) => {
    table.json('batchMetrics'); // Track batch processing metrics
    table.json('errorBreakdown'); // Detailed error categorization
    table.integer('averageProcessingTimeMs').defaultTo(0);
    table.integer('peakMemoryUsageMB').defaultTo(0);
    table.boolean('hadPerformanceIssues').defaultTo(false);
  });

  // Phone number normalization tracking
  await knex.schema.createTable('phone_number_normalizations', (table) => {
    table.string('id').primary();
    table.string('originalPhoneNumber').notNullable();
    table.string('normalizedPhoneNumber').notNullable();
    table.string('countryCode').defaultTo('+1');
    table.string('region').defaultTo('US');
    table.json('validationResults');
    table.boolean('isValid').defaultTo(true);
    table.integer('usageCount').defaultTo(1);
    table.datetime('lastUsedAt').defaultTo(knex.fn.now());
    table.timestamps(true, true);

    // Indexes
    table.index(['originalPhoneNumber']);
    table.index(['normalizedPhoneNumber']);
    table.index(['isValid']);
    table.unique(['originalPhoneNumber']); // One normalization per original number
  });

  // Customer identification cache
  await knex.schema.createTable('customer_identification_cache', (table) => {
    table.string('id').primary();
    table.string('phoneNumber').notNullable();
    table.string('customerId').references('id').inTable('customers').onDelete('CASCADE');
    table.enum('matchType', ['exact', 'fuzzy', 'created', 'none']).notNullable();
    table.decimal('confidence', 3, 2).notNullable(); // 0.00 to 1.00
    table.json('matchDetails');
    table.datetime('expiresAt').notNullable();
    table.integer('hitCount').defaultTo(0);
    table.timestamps(true, true);

    // Indexes
    table.index(['phoneNumber']);
    table.index(['customerId']);
    table.index(['matchType']);
    table.index(['expiresAt']);
    table.index(['confidence']);
  });

  // Conversation context cache
  await knex.schema.createTable('conversation_context_cache', (table) => {
    table.string('id').primary();
    table.string('conversationId').notNullable().references('id').inTable('conversations').onDelete('CASCADE');
    table.json('context').notNullable();
    table.string('contextVersion').notNullable().defaultTo('1.0');
    table.datetime('expiresAt').notNullable();
    table.boolean('isActive').defaultTo(true);
    table.timestamps(true, true);

    // Indexes
    table.index(['conversationId']);
    table.index(['expiresAt']);
    table.index(['isActive']);
    table.unique(['conversationId', 'contextVersion']);
  });

  // Sync performance metrics
  await knex.schema.createTable('sync_performance_metrics', (table) => {
    table.string('id').primary();
    table.string('syncSessionId').notNullable();
    table.string('metricName').notNullable();
    table.decimal('value', 15, 4).notNullable();
    table.string('unit').notNullable(); // 'ms', 'mb', 'count', 'percentage'
    table.json('metadata');
    table.datetime('recordedAt').defaultTo(knex.fn.now());
    table.timestamps(true, true);

    // Indexes
    table.index(['syncSessionId']);
    table.index(['metricName']);
    table.index(['recordedAt']);
    table.index(['syncSessionId', 'metricName']);
  });

  // Message processing queue
  await knex.schema.createTable('message_processing_queue', (table) => {
    table.string('id').primary();
    table.string('messageId').notNullable().references('id').inTable('messages').onDelete('CASCADE');
    table.enum('processingType', ['parsing', 'customer_matching', 'sentiment_analysis', 'ai_response']).notNullable();
    table.enum('status', ['pending', 'processing', 'completed', 'failed', 'retrying']).defaultTo('pending');
    table.enum('priority', ['low', 'medium', 'high', 'emergency']).defaultTo('medium');
    table.json('processingConfig');
    table.json('result');
    table.text('errorMessage');
    table.integer('retryCount').defaultTo(0);
    table.integer('maxRetries').defaultTo(3);
    table.datetime('scheduledAt').defaultTo(knex.fn.now());
    table.datetime('startedAt');
    table.datetime('completedAt');
    table.integer('processingTimeMs').defaultTo(0);
    table.string('workerInstanceId');
    table.timestamps(true, true);

    // Indexes
    table.index(['messageId']);
    table.index(['processingType']);
    table.index(['status']);
    table.index(['priority']);
    table.index(['scheduledAt']);
    table.index(['retryCount']);
    table.index(['status', 'priority', 'scheduledAt']); // Composite for queue processing
  });

  // Enhanced conversation status tracking
  await knex.schema.alterTable('conversations', (table) => {
    table.string('googleThreadId').nullable(); // Add Google Voice thread ID
    table.json('threadingMetadata'); // Store threading decision metadata
    table.integer('messageCount').defaultTo(0);
    table.decimal('averageResponseTimeMinutes', 8, 2).defaultTo(0);
    table.datetime('firstResponseAt');
    table.datetime('resolvedAt');
    table.string('assignedTo').references('id').inTable('users').onDelete('SET NULL');
    table.json('tags'); // Array of tags for categorization
    table.boolean('requiresAttention').defaultTo(false);
    table.datetime('lastBotResponseAt');
    table.datetime('lastHumanResponseAt');
  });

  // Enhanced message tracking
  await knex.schema.alterTable('messages', (table) => {
    table.string('originalContent'); // Store original before any processing
    table.json('attachments'); // Store attachment metadata
    table.boolean('containsEmergencyKeywords').defaultTo(false);
    table.json('extractedInfo'); // Store parsed information
    table.decimal('sentimentScore', 3, 2); // -1.00 to 1.00
    table.boolean('requiresHumanReview').defaultTo(false);
    table.string('processedBy'); // Track which system processed the message
    table.integer('processingTimeSeconds').defaultTo(0);
  });

  // Create indexes for enhanced columns
  await knex.schema.alterTable('conversations', (table) => {
    table.index(['googleThreadId']);
    table.index(['messageCount']);
    table.index(['assignedTo']);
    table.index(['requiresAttention']);
    table.index(['lastBotResponseAt']);
    table.index(['lastHumanResponseAt']);
  });

  await knex.schema.alterTable('messages', (table) => {
    table.index(['containsEmergencyKeywords']);
    table.index(['sentimentScore']);
    table.index(['requiresHumanReview']);
    table.index(['processedBy']);
  });

  // Conversation merge history
  await knex.schema.createTable('conversation_merge_history', (table) => {
    table.string('id').primary();
    table.string('targetConversationId').notNullable().references('id').inTable('conversations').onDelete('CASCADE');
    table.json('sourceConversationIds').notNullable(); // Array of merged conversation IDs
    table.string('mergedBy').references('id').inTable('users').onDelete('SET NULL');
    table.text('reason').notNullable();
    table.integer('mergedMessageCount').defaultTo(0);
    table.json('mergeMetadata');
    table.timestamps(true, true);

    // Indexes
    table.index(['targetConversationId']);
    table.index(['mergedBy']);
    table.index(['created_at']);
  });

  // Conversation split history
  await knex.schema.createTable('conversation_split_history', (table) => {
    table.string('id').primary();
    table.string('originalConversationId').notNullable().references('id').inTable('conversations').onDelete('CASCADE');
    table.string('newConversationId').notNullable().references('id').inTable('conversations').onDelete('CASCADE');
    table.string('splitByUserId').references('id').inTable('users').onDelete('SET NULL');
    table.string('splitPointMessageId').notNullable().references('id').inTable('messages').onDelete('CASCADE');
    table.text('reason').notNullable();
    table.integer('movedMessageCount').defaultTo(0);
    table.json('splitMetadata');
    table.timestamps(true, true);

    // Indexes
    table.index(['originalConversationId']);
    table.index(['newConversationId']);
    table.index(['splitByUserId']);
    table.index(['splitPointMessageId']);
    table.index(['created_at']);
  });

  // Add triggers for automatic message counting
  await knex.raw(`
    CREATE OR REPLACE FUNCTION update_conversation_message_count()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        UPDATE conversations 
        SET message_count = message_count + 1,
            updated_at = NOW()
        WHERE id = NEW.conversation_id;
        RETURN NEW;
      ELSIF TG_OP = 'DELETE' THEN
        UPDATE conversations 
        SET message_count = GREATEST(message_count - 1, 0),
            updated_at = NOW()
        WHERE id = OLD.conversation_id;
        RETURN OLD;
      ELSIF TG_OP = 'UPDATE' AND OLD.conversation_id != NEW.conversation_id THEN
        -- Message moved between conversations
        UPDATE conversations 
        SET message_count = GREATEST(message_count - 1, 0),
            updated_at = NOW()
        WHERE id = OLD.conversation_id;
        
        UPDATE conversations 
        SET message_count = message_count + 1,
            updated_at = NOW()
        WHERE id = NEW.conversation_id;
        RETURN NEW;
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER message_count_trigger
    AFTER INSERT OR UPDATE OR DELETE ON messages
    FOR EACH ROW EXECUTE FUNCTION update_conversation_message_count();
  `);

  // Add cleanup job for expired cache entries
  await knex.raw(`
    CREATE OR REPLACE FUNCTION cleanup_expired_cache()
    RETURNS void AS $$
    BEGIN
      -- Clean up expired customer identification cache
      DELETE FROM customer_identification_cache WHERE expires_at < NOW();
      
      -- Clean up expired conversation context cache
      DELETE FROM conversation_context_cache WHERE expires_at < NOW();
      
      -- Clean up old sync performance metrics (keep last 30 days)
      DELETE FROM sync_performance_metrics WHERE recorded_at < NOW() - INTERVAL '30 days';
      
      -- Clean up completed message processing queue items (keep last 7 days)
      DELETE FROM message_processing_queue 
      WHERE status = 'completed' AND completed_at < NOW() - INTERVAL '7 days';
    END;
    $$ LANGUAGE plpgsql;
  `);

  // Seed some initial data
  
  // Add default phone number normalizations for common formats
  await knex('phone_number_normalizations').insert([
    {
      id: uuidv4(),
      originalPhoneNumber: '(555) 123-4567',
      normalizedPhoneNumber: '+15551234567',
      countryCode: '+1',
      region: 'US',
      validationResults: JSON.stringify({ isValid: true, format: 'national' }),
      isValid: true,
      usageCount: 0,
      lastUsedAt: knex.fn.now(),
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    },
    {
      id: uuidv4(),
      originalPhoneNumber: '555-123-4567',
      normalizedPhoneNumber: '+15551234567',
      countryCode: '+1',
      region: 'US',
      validationResults: JSON.stringify({ isValid: true, format: 'national' }),
      isValid: true,
      usageCount: 0,
      lastUsedAt: knex.fn.now(),
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    },
    {
      id: uuidv4(),
      originalPhoneNumber: '5551234567',
      normalizedPhoneNumber: '+15551234567',
      countryCode: '+1',
      region: 'US',
      validationResults: JSON.stringify({ isValid: true, format: 'national' }),
      isValid: true,
      usageCount: 0,
      lastUsedAt: knex.fn.now(),
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    }
  ]);
}

export async function down(knex: Knex): Promise<void> {
  // Drop triggers first
  await knex.raw('DROP TRIGGER IF EXISTS message_count_trigger ON messages');
  await knex.raw('DROP FUNCTION IF EXISTS update_conversation_message_count()');
  await knex.raw('DROP FUNCTION IF EXISTS cleanup_expired_cache()');

  // Drop new tables
  await knex.schema.dropTableIfExists('conversation_split_history');
  await knex.schema.dropTableIfExists('conversation_merge_history');
  await knex.schema.dropTableIfExists('message_processing_queue');
  await knex.schema.dropTableIfExists('sync_performance_metrics');
  await knex.schema.dropTableIfExists('conversation_context_cache');
  await knex.schema.dropTableIfExists('customer_identification_cache');
  await knex.schema.dropTableIfExists('phone_number_normalizations');
  await knex.schema.dropTableIfExists('conversation_analytics');
  await knex.schema.dropTableIfExists('message_attachments');
  await knex.schema.dropTableIfExists('conversation_threading_results');
  await knex.schema.dropTableIfExists('message_parsing_results');
  await knex.schema.dropTableIfExists('conversation_sync_metadata');

  // Revert enhanced columns in existing tables
  await knex.schema.alterTable('messages', (table) => {
    table.dropColumn('originalContent');
    table.dropColumn('attachments');
    table.dropColumn('containsEmergencyKeywords');
    table.dropColumn('extractedInfo');
    table.dropColumn('sentimentScore');
    table.dropColumn('requiresHumanReview');
    table.dropColumn('processedBy');
    table.dropColumn('processingTimeSeconds');
  });

  await knex.schema.alterTable('conversations', (table) => {
    table.dropColumn('googleThreadId');
    table.dropColumn('threadingMetadata');
    table.dropColumn('messageCount');
    table.dropColumn('averageResponseTimeMinutes');
    table.dropColumn('firstResponseAt');
    table.dropColumn('resolvedAt');
    table.dropColumn('assignedTo');
    table.dropColumn('tags');
    table.dropColumn('requiresAttention');
    table.dropColumn('lastBotResponseAt');
    table.dropColumn('lastHumanResponseAt');
  });

  await knex.schema.alterTable('google_voice_sync_status', (table) => {
    table.dropColumn('batchMetrics');
    table.dropColumn('errorBreakdown');
    table.dropColumn('averageProcessingTimeMs');
    table.dropColumn('peakMemoryUsageMB');
    table.dropColumn('hadPerformanceIssues');
  });
}