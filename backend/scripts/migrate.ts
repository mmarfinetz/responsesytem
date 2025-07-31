import dotenv from 'dotenv';
import knex from 'knex';
import { dbConfig } from '../src/config/database';

// Load environment variables
dotenv.config();

async function runMigrations() {
  const db = knex(dbConfig);
  
  try {
    console.log('🔄 Running database migrations...');
    await db.migrate.latest();
    console.log('✅ Migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

runMigrations();