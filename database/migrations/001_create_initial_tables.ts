import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Create customers table
  await knex.schema.createTable('customers', (table) => {
    table.string('id').primary();
    table.string('firstName').notNullable();
    table.string('lastName').notNullable();
    table.string('email').unique();
    table.string('phone').notNullable();
    table.string('address');
    table.string('city');
    table.string('state');
    table.string('zipCode');
    table.text('notes');
    table.boolean('isActive').defaultTo(true);
    table.timestamps(true, true);

    // Indexes
    table.index(['phone']);
    table.index(['email']);
    table.index(['zipCode']);
    table.index(['isActive']);
  });

  // Create properties table
  await knex.schema.createTable('properties', (table) => {
    table.string('id').primary();
    table.string('customerId').notNullable().references('id').inTable('customers').onDelete('CASCADE');
    table.string('address').notNullable();
    table.string('city').notNullable();
    table.string('state').notNullable();
    table.string('zipCode').notNullable();
    table.enum('propertyType', ['residential', 'commercial', 'industrial']).defaultTo('residential');
    table.text('notes');
    table.boolean('isActive').defaultTo(true);
    table.timestamps(true, true);

    // Indexes
    table.index(['customerId']);
    table.index(['zipCode']);
    table.index(['propertyType']);
  });

  // Create conversations table
  await knex.schema.createTable('conversations', (table) => {
    table.string('id').primary();
    table.string('customerId').references('id').inTable('customers').onDelete('SET NULL');
    table.string('phoneNumber').notNullable();
    table.enum('platform', ['google_voice', 'sms', 'email', 'web_chat']).defaultTo('google_voice');
    table.enum('status', ['active', 'resolved', 'archived']).defaultTo('active');
    table.enum('priority', ['low', 'medium', 'high', 'emergency']).defaultTo('medium');
    table.text('summary');
    table.datetime('lastMessageAt').notNullable();
    table.timestamps(true, true);

    // Indexes
    table.index(['customerId']);
    table.index(['phoneNumber']);
    table.index(['status']);
    table.index(['priority']);
    table.index(['platform']);
    table.index(['lastMessageAt']);
  });

  // Create messages table
  await knex.schema.createTable('messages', (table) => {
    table.string('id').primary();
    table.string('conversationId').notNullable().references('id').inTable('conversations').onDelete('CASCADE');
    table.enum('direction', ['inbound', 'outbound']).notNullable();
    table.text('content').notNullable();
    table.enum('messageType', ['text', 'voice', 'image', 'video', 'file']).defaultTo('text');
    table.enum('platform', ['google_voice', 'sms', 'email', 'web_chat']).defaultTo('google_voice');
    table.enum('status', ['pending', 'sent', 'delivered', 'read', 'failed']).defaultTo('pending');
    table.json('metadata');
    table.datetime('sentAt').notNullable();
    table.timestamps(true, true);

    // Indexes
    table.index(['conversationId']);
    table.index(['direction']);
    table.index(['status']);
    table.index(['sentAt']);
    table.index(['platform']);
  });

  // Create jobs table
  await knex.schema.createTable('jobs', (table) => {
    table.string('id').primary();
    table.string('customerId').notNullable().references('id').inTable('customers').onDelete('CASCADE');
    table.string('propertyId').references('id').inTable('properties').onDelete('SET NULL');
    table.string('conversationId').references('id').inTable('conversations').onDelete('SET NULL');
    table.string('title').notNullable();
    table.text('description').notNullable();
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
      'other'
    ]).notNullable();
    table.enum('status', [
      'inquiry',
      'quoted',
      'approved',
      'scheduled',
      'in_progress',
      'completed',
      'cancelled',
      'on_hold'
    ]).defaultTo('inquiry');
    table.enum('priority', ['low', 'medium', 'high', 'emergency']).defaultTo('medium');
    table.datetime('scheduledAt');
    table.datetime('completedAt');
    table.integer('estimatedDuration'); // in minutes
    table.integer('actualDuration'); // in minutes
    table.text('notes');
    table.timestamps(true, true);

    // Indexes
    table.index(['customerId']);
    table.index(['propertyId']);
    table.index(['conversationId']);
    table.index(['serviceType']);
    table.index(['status']);
    table.index(['priority']);
    table.index(['scheduledAt']);
  });

  // Create quotes table
  await knex.schema.createTable('quotes', (table) => {
    table.string('id').primary();
    table.string('jobId').notNullable().references('id').inTable('jobs').onDelete('CASCADE');
    table.string('quoteNumber').notNullable().unique();
    table.enum('status', ['draft', 'sent', 'approved', 'rejected', 'expired']).defaultTo('draft');
    table.decimal('subtotal', 10, 2).notNullable();
    table.decimal('tax', 10, 2).defaultTo(0);
    table.decimal('total', 10, 2).notNullable();
    table.datetime('validUntil').notNullable();
    table.text('notes');
    table.timestamps(true, true);

    // Indexes
    table.index(['jobId']);
    table.index(['quoteNumber']);
    table.index(['status']);
    table.index(['validUntil']);
  });

  // Create quote_line_items table
  await knex.schema.createTable('quote_line_items', (table) => {
    table.string('id').primary();
    table.string('quoteId').notNullable().references('id').inTable('quotes').onDelete('CASCADE');
    table.string('description').notNullable();
    table.decimal('quantity', 8, 2).notNullable();
    table.decimal('unitPrice', 10, 2).notNullable();
    table.decimal('total', 10, 2).notNullable();
    table.enum('itemType', ['labor', 'parts', 'materials', 'fee']).notNullable();
    table.timestamps(true, true);

    // Indexes
    table.index(['quoteId']);
    table.index(['itemType']);
  });

  // Create ai_responses table
  await knex.schema.createTable('ai_responses', (table) => {
    table.string('id').primary();
    table.string('conversationId').notNullable().references('id').inTable('conversations').onDelete('CASCADE');
    table.string('messageId').references('id').inTable('messages').onDelete('SET NULL');
    table.text('prompt').notNullable();
    table.text('response').notNullable();
    table.string('model').notNullable();
    table.integer('tokens').notNullable();
    table.decimal('confidence', 3, 2);
    table.string('intent');
    table.json('entities');
    table.boolean('approved').defaultTo(false);
    table.boolean('edited').defaultTo(false);
    table.text('finalResponse');
    table.timestamps(true, true);

    // Indexes
    table.index(['conversationId']);
    table.index(['messageId']);
    table.index(['approved']);
    table.index(['intent']);
  });

  // Create webhooks table
  await knex.schema.createTable('webhooks', (table) => {
    table.string('id').primary();
    table.enum('source', ['google_voice', 'google_calendar', 'stripe', 'other']).notNullable();
    table.string('event').notNullable();
    table.json('payload').notNullable();
    table.boolean('processed').defaultTo(false);
    table.datetime('processedAt');
    table.text('error');
    table.integer('retryCount').defaultTo(0);
    table.timestamps(true, true);

    // Indexes
    table.index(['source']);
    table.index(['event']);
    table.index(['processed']);
    table.index(['retryCount']);
  });

  // Create users table (for admin/staff access)
  await knex.schema.createTable('users', (table) => {
    table.string('id').primary();
    table.string('email').notNullable().unique();
    table.string('passwordHash').notNullable();
    table.string('firstName').notNullable();
    table.string('lastName').notNullable();
    table.enum('role', ['admin', 'technician', 'dispatcher', 'readonly']).defaultTo('readonly');
    table.boolean('isActive').defaultTo(true);
    table.datetime('lastLoginAt');
    table.timestamps(true, true);

    // Indexes
    table.index(['email']);
    table.index(['role']);
    table.index(['isActive']);
  });
}

export async function down(knex: Knex): Promise<void> {
  // Drop tables in reverse order to handle foreign key constraints
  await knex.schema.dropTableIfExists('users');
  await knex.schema.dropTableIfExists('webhooks');
  await knex.schema.dropTableIfExists('ai_responses');
  await knex.schema.dropTableIfExists('quote_line_items');
  await knex.schema.dropTableIfExists('quotes');
  await knex.schema.dropTableIfExists('jobs');
  await knex.schema.dropTableIfExists('messages');
  await knex.schema.dropTableIfExists('conversations');
  await knex.schema.dropTableIfExists('properties');
  await knex.schema.dropTableIfExists('customers');
}