import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create google_oauth_tokens table for storing OAuth2 credentials
  await knex.schema.createTable('google_oauth_tokens', (table) => {
    table.string('id').primary();
    table.string('userId').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('email').notNullable(); // Google account email
    table.text('accessToken').notNullable();
    table.text('refreshToken').notNullable();
    table.string('idToken'); // Optional ID token for user info
    table.datetime('expiresAt').notNullable();
    table.json('scopes').notNullable(); // Array of granted scopes
    table.string('tokenType').defaultTo('Bearer');
    table.boolean('isActive').defaultTo(true);
    table.datetime('lastRefreshedAt');
    table.integer('refreshCount').defaultTo(0);
    table.text('errorMessage'); // Store last error if token refresh fails
    table.timestamps(true, true);

    // Indexes
    table.index(['userId']);
    table.index(['email']);
    table.index(['isActive']);
    table.index(['expiresAt']);
    table.unique(['userId', 'email']); // One token set per user per Google account
  });

  // Create google_voice_sync_status table for tracking sync operations
  await knex.schema.createTable('google_voice_sync_status', (table) => {
    table.string('id').primary();
    table.string('tokenId').notNullable().references('id').inTable('google_oauth_tokens').onDelete('CASCADE');
    table.enum('syncType', ['initial', 'incremental', 'manual']).notNullable();
    table.enum('status', ['pending', 'running', 'completed', 'failed', 'cancelled']).defaultTo('pending');
    table.datetime('startedAt');
    table.datetime('completedAt');
    table.integer('messagesProcessed').defaultTo(0);
    table.integer('messagesTotal').defaultTo(0);
    table.integer('conversationsCreated').defaultTo(0);
    table.integer('conversationsUpdated').defaultTo(0);
    table.integer('customersCreated').defaultTo(0);
    table.integer('customersMatched').defaultTo(0);
    table.string('lastSyncToken'); // For incremental syncs
    table.datetime('lastMessageDate'); // Track the latest message synced
    table.text('errorMessage');
    table.json('metadata'); // Additional sync information
    table.timestamps(true, true);

    // Indexes
    table.index(['tokenId']);
    table.index(['syncType']);
    table.index(['status']);
    table.index(['startedAt']);
    table.index(['lastMessageDate']);
  });

  // Create google_voice_message_mapping table for mapping Google Voice messages to our messages
  await knex.schema.createTable('google_voice_message_mapping', (table) => {
    table.string('id').primary();
    table.string('messageId').notNullable().references('id').inTable('messages').onDelete('CASCADE');
    table.string('googleMessageId').notNullable(); // Google Voice message ID
    table.string('googleThreadId'); // Google Voice thread/conversation ID
    table.string('tokenId').notNullable().references('id').inTable('google_oauth_tokens').onDelete('CASCADE');
    table.datetime('googleMessageDate').notNullable();
    table.json('googleMetadata'); // Original Google Voice message data
    table.timestamps(true, true);

    // Indexes
    table.index(['messageId']);
    table.index(['googleMessageId']);
    table.index(['googleThreadId']);
    table.index(['tokenId']);
    table.unique(['googleMessageId', 'tokenId']); // Prevent duplicate imports
  });

  // Create google_voice_phone_mapping table for mapping phone numbers to Google Voice numbers
  await knex.schema.createTable('google_voice_phone_mapping', (table) => {
    table.string('id').primary();
    table.string('tokenId').notNullable().references('id').inTable('google_oauth_tokens').onDelete('CASCADE');
    table.string('googleVoiceNumber').notNullable(); // The business Google Voice number
    table.string('customerPhoneNumber').notNullable(); // Customer's phone number
    table.string('normalizedPhoneNumber').notNullable(); // E164 format
    table.string('customerId').references('id').inTable('customers').onDelete('SET NULL');
    table.boolean('isActive').defaultTo(true);
    table.datetime('firstContactAt').notNullable();
    table.datetime('lastContactAt').notNullable();
    table.integer('messageCount').defaultTo(0);
    table.json('contactInfo'); // Any additional contact info from Google
    table.timestamps(true, true);

    // Indexes
    table.index(['tokenId']);
    table.index(['googleVoiceNumber']);
    table.index(['customerPhoneNumber']);
    table.index(['normalizedPhoneNumber']);
    table.index(['customerId']);
    table.index(['isActive']);
    table.unique(['tokenId', 'googleVoiceNumber', 'normalizedPhoneNumber']);
  });

  // Create google_api_rate_limits table for tracking API usage
  await knex.schema.createTable('google_api_rate_limits', (table) => {
    table.string('id').primary();
    table.string('tokenId').notNullable().references('id').inTable('google_oauth_tokens').onDelete('CASCADE');
    table.string('endpoint').notNullable(); // API endpoint
    table.integer('requestCount').defaultTo(0);
    table.datetime('windowStart').notNullable();
    table.datetime('windowEnd').notNullable();
    table.integer('quotaLimit').notNullable();
    table.integer('quotaRemaining').notNullable();
    table.datetime('quotaResetAt');
    table.boolean('isThrottled').defaultTo(false);
    table.datetime('throttledUntil');
    table.timestamps(true, true);

    // Indexes
    table.index(['tokenId']);
    table.index(['endpoint']);
    table.index(['windowStart', 'windowEnd']);
    table.index(['isThrottled']);
    table.unique(['tokenId', 'endpoint', 'windowStart']);
  });

  // Add new columns to existing conversations table for Google Voice integration
  await knex.schema.alterTable('conversations', (table) => {
    table.string('googleThreadId'); // Google Voice thread ID
    // Note: All other columns (assignedTo, channel, isEmergency, firstResponseAt, resolvedAt, 
    // responseTimeMinutes, routingInfo, originalPhoneNumber, followUpRequired, followUpAt) 
    // already exist from migration 002
  });

  // Add new columns to existing messages table for Google Voice integration
  // Note: All columns (originalContent, attachments, containsEmergencyKeywords, extractedInfo,
  // sentimentScore, requiresHumanReview, processedBy, processingTimeSeconds) already exist from migration 002

  // Add indexes for new columns
  await knex.schema.alterTable('conversations', (table) => {
    table.index(['googleThreadId']);
    // Note: All other indexes (assignedTo, channel, isEmergency, followUpRequired, followUpAt) 
    // already exist from migration 002
  });

  // Note: Message indexes (containsEmergencyKeywords, requiresHumanReview, processedBy, sentimentScore) 
  // already exist from migration 002
}

export async function down(knex: Knex): Promise<void> {
  // Note: No message columns to drop as they all belong to migration 002

  await knex.schema.alterTable('conversations', (table) => {
    table.dropIndex(['googleThreadId']);
    // Note: All other indexes and columns belong to migration 002, don't drop them here
    table.dropColumn('googleThreadId');
  });

  // Drop new tables
  await knex.schema.dropTableIfExists('google_api_rate_limits');
  await knex.schema.dropTableIfExists('google_voice_phone_mapping');
  await knex.schema.dropTableIfExists('google_voice_message_mapping');
  await knex.schema.dropTableIfExists('google_voice_sync_status');
  await knex.schema.dropTableIfExists('google_oauth_tokens');
}