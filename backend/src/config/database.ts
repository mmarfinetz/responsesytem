import { Knex } from 'knex';
import path from 'path';
import { logger } from '../utils/logger';

// Production-grade connection pool configuration
interface PoolConfig {
  min: number;
  max: number;
  createTimeoutMillis: number;
  acquireTimeoutMillis: number;
  idleTimeoutMillis: number;
  reapIntervalMillis: number;
  createRetryIntervalMillis: number;
  propagateCreateError: boolean;
}

// Environment-specific pool configurations
const getPoolConfig = (env: string): PoolConfig => {
  const baseConfig: PoolConfig = {
    min: parseInt(process.env.DB_POOL_MIN || '2'),
    max: parseInt(process.env.DB_POOL_MAX || '20'),
    createTimeoutMillis: parseInt(process.env.DB_CREATE_TIMEOUT || '30000'),
    acquireTimeoutMillis: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '60000'),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
    reapIntervalMillis: parseInt(process.env.DB_REAP_INTERVAL || '10000'),
    createRetryIntervalMillis: parseInt(process.env.DB_CREATE_RETRY_INTERVAL || '200'),
    propagateCreateError: false,
  };

  switch (env) {
    case 'production':
      return {
        ...baseConfig,
        min: parseInt(process.env.DB_POOL_MIN || '5'),
        max: parseInt(process.env.DB_POOL_MAX || '50'),
      };
    case 'staging':
      return {
        ...baseConfig,
        min: parseInt(process.env.DB_POOL_MIN || '3'),
        max: parseInt(process.env.DB_POOL_MAX || '30'),
      };
    case 'test':
      return {
        ...baseConfig,
        min: 1,
        max: 5,
        idleTimeoutMillis: 1000,
      };
    default:
      return baseConfig;
  }
};

// PostgreSQL connection configuration with failover support
const getPgConnection = (): any => {
  const primaryUrl = process.env.DATABASE_URL;
  const replicaUrl = process.env.DATABASE_REPLICA_URL;
  const sslMode = process.env.DATABASE_SSL_MODE || 'prefer';
  
  if (!primaryUrl) {
    throw new Error('DATABASE_URL is required for PostgreSQL');
  }

  const baseConfig = {
    connectionString: primaryUrl,
    ssl: sslMode === 'require' ? { rejectUnauthorized: false } : sslMode !== 'disable',
    statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000'),
    query_timeout: parseInt(process.env.DB_QUERY_TIMEOUT || '30000'),
    application_name: process.env.DB_APPLICATION_NAME || 'plumbing-voice-ai',
  };

  // Support read replicas for production
  if (replicaUrl && process.env.NODE_ENV === 'production') {
    return {
      master: baseConfig,
      replica: {
        ...baseConfig,
        connectionString: replicaUrl,
      },
    };
  }

  return baseConfig;
};

const config: { [key: string]: Knex.Config } = {
  development: {
    client: process.env.DATABASE_TYPE === 'postgresql' ? 'postgresql' : 'sqlite3',
    connection: process.env.DATABASE_TYPE === 'postgresql' 
      ? getPgConnection() as any
      : {
          filename: process.env.DATABASE_URL || path.join(__dirname, '../../database.sqlite'),
        },
    useNullAsDefault: process.env.DATABASE_TYPE !== 'postgresql',
    migrations: {
      directory: path.join(__dirname, '../../../database/migrations'),
      extension: 'ts',
    },
    seeds: {
      directory: path.join(__dirname, '../../../database/seeders'),
      extension: 'ts',
    },
    pool: {
      ...getPoolConfig('development'),
      ...(process.env.DATABASE_TYPE !== 'postgresql' && {
        afterCreate: (conn: any, done: any) => {
          // Enable foreign key constraints and performance optimizations for SQLite
          conn.run('PRAGMA foreign_keys = ON', (err: any) => {
            if (err) return done(err, conn);
            conn.run('PRAGMA journal_mode = WAL', (err: any) => {
              if (err) return done(err, conn);
              conn.run('PRAGMA synchronous = NORMAL', (err: any) => {
                if (err) return done(err, conn);
                conn.run('PRAGMA cache_size = 1000', (err: any) => {
                  done(err, conn);
                });
              });
            });
          });
        },
      }),
    },
    debug: process.env.DEBUG_SQL === 'true',
  },

  test: {
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, '../../../database/migrations'),
      extension: 'ts',
    },
    seeds: {
      directory: path.join(__dirname, '../../../database/seeders'),
      extension: 'ts',
    },
    pool: {
      ...getPoolConfig('test'),
      afterCreate: (conn: any, done: any) => {
        conn.run('PRAGMA foreign_keys = ON', done);
      },
    },
  },

  staging: {
    client: process.env.DATABASE_TYPE === 'postgresql' ? 'postgresql' : 'sqlite3',
    connection: process.env.DATABASE_TYPE === 'postgresql' 
      ? getPgConnection() as any
      : {
          filename: process.env.DATABASE_URL || path.join(__dirname, '../../database.sqlite'),
        },
    useNullAsDefault: process.env.DATABASE_TYPE !== 'postgresql',
    migrations: {
      directory: path.join(__dirname, '../../../database/migrations'),
      extension: 'ts',
    },
    seeds: {
      directory: path.join(__dirname, '../../../database/seeders'),
      extension: 'ts',
    },
    pool: {
      ...getPoolConfig('staging'),
      ...(process.env.DATABASE_TYPE !== 'postgresql' && {
        afterCreate: (conn: any, done: any) => {
          conn.run('PRAGMA foreign_keys = ON', done);
        },
      }),
    },
    acquireConnectionTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '60000'),
    debug: process.env.DEBUG_SQL === 'true',
  },

  production: {
    client: process.env.DATABASE_TYPE === 'postgresql' ? 'postgresql' : 'sqlite3',
    connection: process.env.DATABASE_TYPE === 'postgresql' 
      ? getPgConnection() as any
      : {
          filename: process.env.DATABASE_URL || path.join(__dirname, '../../database.sqlite'),
        },
    useNullAsDefault: process.env.DATABASE_TYPE !== 'postgresql',
    migrations: {
      directory: path.join(__dirname, '../../../database/migrations'),
      extension: 'ts',
    },
    seeds: {
      directory: path.join(__dirname, '../../../database/seeders'),
      extension: 'ts',
    },
    pool: {
      ...getPoolConfig('production'),
      ...(process.env.DATABASE_TYPE !== 'postgresql' && {
        afterCreate: (conn: any, done: any) => {
          conn.run('PRAGMA foreign_keys = ON', done);
        },
      }),
    },
    acquireConnectionTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '60000'),
    // Enable connection validation and monitoring
    postProcessResponse: (result: any, queryContext: any) => {
      // Log slow queries in production
      if (queryContext.duration > 1000) {
        logger.warn('Slow database query detected', {
          query: queryContext.sql,
          duration: queryContext.duration,
          bindings: queryContext.bindings,
        });
      }
      return result;
    },
    debug: false, // Never debug in production
  },
};

const environment = process.env.NODE_ENV || 'development';

// Validate configuration
const validateConfig = (config: Knex.Config, env: string) => {
  if (!config.client) {
    throw new Error(`Database client not specified for environment: ${env}`);
  }
  
  if (config.client === 'postgresql' && typeof config.connection === 'string' && !config.connection) {
    throw new Error(`PostgreSQL connection string required for environment: ${env}`);
  }
  
  if (config.pool && config.pool.max && config.pool.min && config.pool.max < config.pool.min) {
    throw new Error(`Invalid pool configuration: max (${config.pool.max}) < min (${config.pool.min})`);
  }
  
  logger.info('Database configuration validated', {
    environment: env,
    client: config.client,
    poolMin: config.pool?.min,
    poolMax: config.pool?.max,
  });
};

// Get and validate configuration
const selectedConfig = config[environment];
if (!selectedConfig) {
  throw new Error(`No database configuration found for environment: ${environment}`);
}

validateConfig(selectedConfig, environment);

export const dbConfig = selectedConfig;
export { getPoolConfig, getPgConnection };
export default config;