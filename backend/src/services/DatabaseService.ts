import knex, { Knex } from 'knex';
import { dbConfig } from '@/config/database';
import { logger } from '@/utils/logger';
import { EventEmitter } from 'events';

interface DatabaseStats {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  queryCount: number;
  errorCount: number;
  averageQueryTime: number;
  slowQueryCount: number;
  connectionFailures: number;
  lastHealthCheck: Date;
  uptime: number;
}

interface PoolHealth {
  isHealthy: boolean;
  activeConnections: number;
  idleConnections: number;
  waitingClients: number;
  errors: string[];
}

export class DatabaseService extends EventEmitter {
  private static instance: Knex | null = null;
  private static replica: Knex | null = null;
  private static stats: DatabaseStats = {
    totalConnections: 0,
    activeConnections: 0,
    idleConnections: 0,
    queryCount: 0,
    errorCount: 0,
    averageQueryTime: 0,
    slowQueryCount: 0,
    connectionFailures: 0,
    lastHealthCheck: new Date(),
    uptime: Date.now(),
  };
  private static healthCheckInterval: NodeJS.Timeout | null = null;
  private static reconnectAttempts = 0;
  private static maxReconnectAttempts = 5;
  private static reconnectDelay = 1000;
  private static isShuttingDown = false;

  static async initialize(): Promise<Knex> {
    if (this.instance) {
      return this.instance;
    }

    try {
      this.instance = knex({
        ...dbConfig,
        pool: {
          ...dbConfig.pool,
          afterCreate: this.enhanceConnection.bind(this),
        },
        debug: dbConfig.debug,
      });
      
      // Initialize read replica if configured
      if (process.env.DATABASE_REPLICA_URL && process.env.NODE_ENV === 'production') {
        this.replica = knex({
          ...dbConfig,
          connection: {
            connectionString: process.env.DATABASE_REPLICA_URL,
            ssl: typeof dbConfig.connection === 'object' && dbConfig.connection && 'ssl' in dbConfig.connection && (typeof dbConfig.connection.ssl === 'boolean' || typeof dbConfig.connection.ssl === 'object') ? dbConfig.connection.ssl : false,
          },
          pool: {
            ...dbConfig.pool,
            max: Math.floor((dbConfig.pool?.max || 10) / 2), // Use fewer connections for replica
          },
        });
        logger.info('Read replica initialized');
      }
      
      // Test primary connection with retry logic
      await this.testConnection(this.instance, 'primary');
      
      // Test replica connection if available
      if (this.replica) {
        try {
          await this.testConnection(this.replica, 'replica');
        } catch (error) {
          logger.warn('Replica connection failed, continuing with primary only', error);
          await this.replica.destroy();
          this.replica = null;
        }
      }
      
      // Run migrations on primary only
      await this.instance.migrate.latest();
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      // Setup event listeners
      this.setupEventListeners();
      
      logger.info('Database service initialized successfully', {
        hasReplica: !!this.replica,
        poolConfig: dbConfig.pool,
      });
      
      return this.instance;
    } catch (error) {
      logger.error('Database initialization failed:', error);
      this.stats.connectionFailures++;
      throw error;
    }
  }

  private static async testConnection(db: Knex, type: 'primary' | 'replica', retries = 3): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const startTime = Date.now();
        await db.raw('SELECT 1+1 as result');
        const duration = Date.now() - startTime;
        
        logger.info(`${type} database connection test successful`, {
          attempt,
          duration,
        });
        return;
      } catch (error) {
        logger.warn(`${type} database connection test failed`, {
          attempt,
          error: (error as Error).message,
          willRetry: attempt < retries,
        });
        
        if (attempt === retries) {
          throw error;
        }
        
        // Exponential backoff
        await this.sleep(this.reconnectDelay * Math.pow(2, attempt - 1));
      }
    }
  }

  private static async enhanceConnection(conn: any, done: Function): Promise<void> {
    try {
      this.stats.totalConnections++;
      
      // Apply database-specific optimizations
      if (dbConfig.client === 'sqlite3') {
        await this.applySqliteOptimizations(conn);
      } else if (dbConfig.client === 'postgresql') {
        await this.applyPostgresOptimizations(conn);
      }
      
      logger.debug('Database connection enhanced', {
        totalConnections: this.stats.totalConnections,
      });
      
      done(null, conn);
    } catch (error) {
      logger.error('Failed to enhance database connection:', error);
      done(error, conn);
    }
  }

  private static async applySqliteOptimizations(conn: any): Promise<void> {
    return new Promise((resolve, reject) => {
      conn.run('PRAGMA foreign_keys = ON', (err: any) => {
        if (err) return reject(err);
        conn.run('PRAGMA journal_mode = WAL', (err: any) => {
          if (err) return reject(err);
          conn.run('PRAGMA synchronous = NORMAL', (err: any) => {
            if (err) return reject(err);
            conn.run('PRAGMA cache_size = 1000', (err: any) => {
              if (err) return reject(err);
              conn.run('PRAGMA temp_store = memory', (err: any) => {
                if (err) return reject(err);
                resolve(undefined);
              });
            });
          });
        });
      });
    });
  }

  private static async applyPostgresOptimizations(conn: any): Promise<void> {
    // Set connection-level parameters for PostgreSQL
    const optimizations = [
      'SET timezone = \'UTC\'',
      'SET statement_timeout = 30000',
      'SET lock_timeout = 10000',
      'SET idle_in_transaction_session_timeout = 60000',
    ];

    for (const sql of optimizations) {
      try {
        await conn.query(sql);
      } catch (error) {
        logger.warn(`Failed to apply PostgreSQL optimization: ${sql}`, error);
      }
    }
  }

  private static cleanupConnection(conn: any, done: Function): void {
    this.stats.totalConnections--;
    logger.debug('Database connection cleaned up', {
      remainingConnections: this.stats.totalConnections,
    });
    done();
  }

  private static setupEventListeners(): void {
    if (!this.instance) return;

    // Monitor pool events
    this.instance.client.pool.on('createSuccess', () => {
      logger.debug('Database connection created successfully');
    });

    this.instance.client.pool.on('createFail', (err: Error) => {
      logger.error('Database connection creation failed:', err);
      this.stats.connectionFailures++;
    });

    this.instance.client.pool.on('destroySuccess', () => {
      logger.debug('Database connection destroyed successfully');
    });

    this.instance.client.pool.on('destroyFail', (err: Error) => {
      logger.warn('Database connection destruction failed:', err);
    });

    // Monitor for acquire timeouts
    this.instance.client.pool.on('acquireTimeout', () => {
      logger.error('Database connection acquire timeout - possible connection leak');
      this.stats.errorCount++;
    });
  }

  private static startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.error('Health check failed:', error);
      }
    }, 30000); // Every 30 seconds
  }

  static getInstance(preferReplica = false): Knex {
    if (!this.instance) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    
    // Use replica for read operations if available and requested
    if (preferReplica && this.replica) {
      return this.replica;
    }
    
    return this.instance;
  }

  // Get read-only replica instance for read operations
  static getReplicaInstance(): Knex | null {
    return this.replica;
  }

  // Smart query routing based on operation type
  static getOptimalInstance(sql: string): Knex {
    const db = this.getInstance();
    
    // Route read queries to replica if available
    if (this.replica && this.isReadQuery(sql)) {
      return this.replica;
    }
    
    return db;
  }

  private static isReadQuery(sql: string): boolean {
    const normalizedSql = sql.trim().toLowerCase();
    return normalizedSql.startsWith('select') || 
           normalizedSql.startsWith('with') ||
           normalizedSql.includes('explain');
  }

  static async close(): Promise<void> {
    this.isShuttingDown = true;
    
    // Stop health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
    
    // Close replica first
    if (this.replica) {
      try {
        await this.replica.destroy();
        this.replica = null;
        logger.info('Database replica connection closed');
      } catch (error) {
        logger.error('Error closing replica connection:', error);
      }
    }
    
    // Close primary connection
    if (this.instance) {
      try {
        await this.instance.destroy();
        this.instance = null;
        logger.info('Database primary connection closed');
      } catch (error) {
        logger.error('Error closing primary connection:', error);
      }
    }
    
    // Reset stats
    this.stats = {
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      queryCount: 0,
      errorCount: 0,
      averageQueryTime: 0,
      slowQueryCount: 0,
      connectionFailures: 0,
      lastHealthCheck: new Date(),
      uptime: Date.now(),
    };
  }

  // Enhanced transaction method with timeout and retry logic
  static async runTransaction<T>(
    callback: (trx: Knex.Transaction) => Promise<T>,
    options: { timeout?: number; retries?: number } = {}
  ): Promise<T> {
    const { timeout = 30000, retries = 2 } = options;
    const db = this.getInstance(); // Always use primary for transactions
    
    let lastError: any;
    
    for (let attempt = 1; attempt <= retries + 1; attempt++) {
      try {
        return await Promise.race([
          db.transaction(callback),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Transaction timeout')), timeout)
          )
        ]);
      } catch (error) {
        lastError = error;
        this.stats.errorCount++;
        
        logger.warn('Transaction failed', {
          attempt,
          error: (error as Error).message,
          willRetry: attempt <= retries,
        });
        
        if (attempt <= retries && this.isRetryableError(error)) {
          await this.sleep(Math.pow(2, attempt - 1) * 1000); // Exponential backoff
          continue;
        }
        
        break;
      }
    }
    
    throw lastError;
  }

  private static isRetryableError(error: any): boolean {
    const retryableErrors = [
      'connection',
      'timeout',
      'deadlock',
      'serialization',
      'ECONNRESET',
      'ETIMEDOUT',
    ];
    
    const errorMessage = error.message?.toLowerCase() || '';
    return retryableErrors.some(retryable => errorMessage.includes(retryable));
  }

  // Enhanced health check method
  static async healthCheck(): Promise<boolean> {
    try {
      const result = await this.performHealthCheck();
      return result.isHealthy;
    } catch (error) {
      logger.error('Database health check failed:', error);
      return false;
    }
  }

  private static async performHealthCheck(): Promise<PoolHealth> {
    const errors: string[] = [];
    let isHealthy = true;

    try {
      // Check primary connection
      const startTime = Date.now();
      await this.instance?.raw('SELECT 1 as health_check');
      const primaryLatency = Date.now() - startTime;
      
      if (primaryLatency > 1000) {
        errors.push(`Primary connection latency high: ${primaryLatency}ms`);
        isHealthy = false;
      }
      
      // Check replica connection if available
      if (this.replica) {
        try {
          const replicaStartTime = Date.now();
          await this.replica.raw('SELECT 1 as health_check');
          const replicaLatency = Date.now() - replicaStartTime;
          
          if (replicaLatency > 1000) {
            errors.push(`Replica connection latency high: ${replicaLatency}ms`);
          }
        } catch (error) {
          errors.push(`Replica connection failed: ${(error as Error).message}`);
          logger.warn('Replica health check failed, removing replica:', error);
          await this.replica.destroy();
          this.replica = null;
        }
      }
      
      // Get pool stats
      const poolStats = this.getPoolStats();
      
      // Check for connection exhaustion
      if (poolStats.waitingClients > 0) {
        errors.push(`${poolStats.waitingClients} clients waiting for connections`);
        isHealthy = false;
      }
      
      // Update stats
      this.stats.lastHealthCheck = new Date();
      this.stats.activeConnections = poolStats.activeConnections;
      this.stats.idleConnections = poolStats.idleConnections;
      
      return {
        isHealthy,
        activeConnections: poolStats.activeConnections,
        idleConnections: poolStats.idleConnections,
        waitingClients: poolStats.waitingClients,
        errors,
      };
    } catch (error) {
      errors.push(`Health check query failed: ${(error as Error).message}`);
      this.stats.errorCount++;
      
      // Attempt reconnection if primary connection fails
      if (!this.isShuttingDown) {
        this.attemptReconnection();
      }
      
      return {
        isHealthy: false,
        activeConnections: 0,
        idleConnections: 0,
        waitingClients: 0,
        errors,
      };
    }
  }

  private static getPoolStats() {
    try {
      const pool = this.instance?.client?.pool;
      if (!pool) {
        return { activeConnections: 0, idleConnections: 0, waitingClients: 0 };
      }
      
      return {
        activeConnections: pool.numUsed() || 0,
        idleConnections: pool.numFree() || 0,
        waitingClients: pool.numPendingAcquires() || 0,
      };
    } catch (error) {
      logger.error('Failed to get pool stats:', error);
      return { activeConnections: 0, idleConnections: 0, waitingClients: 0 };
    }
  }

  private static async attemptReconnection(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached, giving up');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    logger.info(`Attempting database reconnection (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(async () => {
      try {
        if (this.instance) {
          await this.instance.destroy();
        }
        
        this.instance = null;
        await this.initialize();
        
        logger.info('Database reconnection successful');
        this.reconnectAttempts = 0;
      } catch (error) {
        logger.error('Database reconnection failed:', error);
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnection();
        }
      }
    }, delay);
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Enhanced utility method for safe table operations with caching
  private static tableExistsCache = new Map<string, { exists: boolean; timestamp: number }>();
  private static tableCacheTimeout = 60000; // 1 minute

  static async tableExists(tableName: string, useCache = true): Promise<boolean> {
    try {
      // Check cache first
      if (useCache) {
        const cached = this.tableExistsCache.get(tableName);
        if (cached && Date.now() - cached.timestamp < this.tableCacheTimeout) {
          return cached.exists;
        }
      }
      
      const db = this.getInstance(true); // Can use replica for this check
      const exists = await db.schema.hasTable(tableName);
      
      // Update cache
      this.tableExistsCache.set(tableName, {
        exists,
        timestamp: Date.now(),
      });
      
      return exists;
    } catch (error) {
      logger.error(`Error checking table existence for ${tableName}:`, error);
      return false;
    }
  }

  // Clear table existence cache
  static clearTableCache(): void {
    this.tableExistsCache.clear();
    logger.debug('Table existence cache cleared');
  }

  // Enhanced backup method with support for different database types
  static async backup(backupPath: string): Promise<void> {
    try {
      if (dbConfig.client === 'sqlite3') {
        await this.backupSqlite(backupPath);
      } else if (dbConfig.client === 'postgresql') {
        await this.backupPostgres(backupPath);
      } else {
        throw new Error(`Backup not supported for database type: ${dbConfig.client}`);
      }
      
      logger.info(`Database backed up successfully to ${backupPath}`);
    } catch (error) {
      logger.error('Database backup failed:', error);
      throw error;
    }
  }

  private static async backupSqlite(backupPath: string): Promise<void> {
    const db = this.getInstance();
    await db.raw(`VACUUM INTO '${backupPath}'`);
  }

  private static async backupPostgres(backupPath: string): Promise<void> {
    // For PostgreSQL, we'd typically use pg_dump command
    // This is a placeholder for actual implementation
    throw new Error('PostgreSQL backup requires external pg_dump command');
  }

  // Get comprehensive database statistics
  static getStats(): DatabaseStats {
    const uptime = Date.now() - this.stats.uptime;
    return {
      ...this.stats,
      uptime,
    };
  }

  // Execute query with automatic failover and monitoring
  static async executeQuery<T = any>(
    query: string,
    bindings?: any[],
    options: { preferReplica?: boolean; timeout?: number } = {}
  ): Promise<T> {
    const startTime = Date.now();
    const { preferReplica = false, timeout = 30000 } = options;
    
    try {
      const db = preferReplica && this.replica ? this.replica : this.instance;
      if (!db) {
        throw new Error('No database connection available');
      }
      
      // Set timeout for the query
      const result = await Promise.race([
        bindings ? db.raw(query, bindings) : db.raw(query),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Query timeout')), timeout)
        )
      ]);
      
      const duration = Date.now() - startTime;
      this.stats.queryCount++;
      this.stats.averageQueryTime = 
        (this.stats.averageQueryTime * (this.stats.queryCount - 1) + duration) / this.stats.queryCount;
      
      if (duration > 1000) {
        this.stats.slowQueryCount++;
        logger.warn('Slow query detected', {
          query: query.substring(0, 200),
          duration,
          bindings,
        });
      }
      
      return result as T;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.stats.errorCount++;
      
      logger.error('Database query failed', {
        query: query.substring(0, 200),
        duration,
        error: (error as Error).message,
        bindings,
      });
      
      // Attempt failover for read queries if replica is available
      if (preferReplica && this.replica && this.isReadQuery(query)) {
        try {
          logger.info('Attempting failover to primary for read query');
          return await this.executeQuery(query, bindings, { ...options, preferReplica: false });
        } catch (failoverError) {
          logger.error('Failover attempt failed:', failoverError);
        }
      }
      
      throw error;
    }
  }

  // Connection pool monitoring and management
  static async getConnectionPoolStatus(): Promise<{
    primary: PoolHealth;
    replica?: PoolHealth;
  }> {
    const primary = await this.performHealthCheck();
    let replica: PoolHealth | undefined;
    
    if (this.replica) {
      try {
        // Quick health check for replica
        await this.replica.raw('SELECT 1');
        const replicaStats = this.getReplicaPoolStats();
        replica = {
          isHealthy: true,
          activeConnections: replicaStats.activeConnections,
          idleConnections: replicaStats.idleConnections,
          waitingClients: replicaStats.waitingClients,
          errors: [],
        };
      } catch (error) {
        replica = {
          isHealthy: false,
          activeConnections: 0,
          idleConnections: 0,
          waitingClients: 0,
          errors: [(error as Error).message],
        };
      }
    }
    
    return { primary, replica };
  }

  private static getReplicaPoolStats() {
    try {
      const pool = this.replica?.client?.pool;
      if (!pool) {
        return { activeConnections: 0, idleConnections: 0, waitingClients: 0 };
      }
      
      return {
        activeConnections: pool.numUsed() || 0,
        idleConnections: pool.numFree() || 0,
        waitingClients: pool.numPendingAcquires() || 0,
      };
    } catch (error) {
      return { activeConnections: 0, idleConnections: 0, waitingClients: 0 };
    }
  }

  // Force close idle connections
  static async closeIdleConnections(): Promise<void> {
    try {
      if (this.instance?.client?.pool) {
        await this.instance.client.pool.clear();
        logger.info('Idle connections closed for primary database');
      }
      
      if (this.replica?.client?.pool) {
        await this.replica.client.pool.clear();
        logger.info('Idle connections closed for replica database');
      }
    } catch (error) {
      logger.error('Failed to close idle connections:', error);
    }
  }

  // Database migration management with rollback support
  static async runMigrations(options: { 
    to?: string; 
    rollback?: boolean; 
    dryRun?: boolean; 
  } = {}): Promise<void> {
    const { to, rollback = false, dryRun = false } = options;
    const db = this.getInstance(); // Always use primary for migrations
    
    try {
      if (dryRun) {
        logger.info('Migration dry run - no changes will be made');
        // In a real implementation, you'd show what migrations would run
        return;
      }
      
      if (rollback) {
        if (to) {
          await db.migrate.down({ name: to });
          logger.info(`Rolled back migrations to ${to}`);
        } else {
          await db.migrate.rollback();
          logger.info('Rolled back last migration batch');
        }
      } else {
        if (to) {
          await db.migrate.up({ name: to });
          logger.info(`Migrated up to ${to}`);
        } else {
          await db.migrate.latest();
          logger.info('Migrated to latest version');
        }
      }
    } catch (error) {
      logger.error('Migration failed:', error);
      throw error;
    }
  }

  // Get current migration status
  static async getMigrationStatus(): Promise<{
    current: string[];
    pending: string[];
  }> {
    const db = this.getInstance(true); // Can use replica for read
    
    try {
      const [completed] = await db.migrate.list();
      const all = await db.migrate.list();
      const pending = all[1] || [];
      
      return {
        current: completed || [],
        pending,
      };
    } catch (error) {
      logger.error('Failed to get migration status:', error);
      throw error;
    }
  }
}