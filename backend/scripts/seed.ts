import knex from 'knex';
import { dbConfig } from '../src/config/database';

async function runSeeds() {
  const db = knex(dbConfig);
  
  try {
    console.log('🌱 Running database seeds...');
    await db.seed.run();
    console.log('✅ Seeds completed successfully');
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

runSeeds();