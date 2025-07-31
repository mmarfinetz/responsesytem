// Load environment variables FIRST before any other imports
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createServer } from 'http';

// Import middleware
import { errorHandler } from '@/middleware/errorHandler';
import { requestLogger } from '@/middleware/logger';
import { rateLimiterMiddleware } from '@/middleware/rateLimiter';
import { validateApiKey } from '@/middleware/auth';

// Import routes
import authRoutes from '@/routes/auth';
import customerRoutes from '@/routes/customers';
import conversationRoutes from '@/routes/conversations';
import jobRoutes from '@/routes/jobs';
import quoteRoutes from '@/routes/quotes';
import webhookRoutes from '@/routes/webhooks';
import aiRoutes from '@/routes/ai';
import analyticsRoutes from '@/routes/analytics';
import googleVoiceRoutes from '@/routes/googleVoice';

// Import services
import { DatabaseService } from '@/services/DatabaseService';
import { logger } from '@/utils/logger';

const app = express();
const server = createServer(app);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// Logging middleware
app.use(requestLogger);

// Rate limiting
app.use('/api', rateLimiterMiddleware);

// Enhanced health check endpoints
app.get('/health', async (_req, res) => {
  try {
    const healthStatus = await getBasicHealthStatus();
    res.status(healthStatus.status === 'healthy' ? 200 : 503).json(healthStatus);
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: (error as Error).message,
    });
  }
});

// Kubernetes readiness probe
app.get('/health/ready', async (_req, res) => {
  try {
    const readinessStatus = await getReadinessStatus();
    res.status(readinessStatus.ready ? 200 : 503).json(readinessStatus);
  } catch (error) {
    res.status(503).json({
      ready: false,
      timestamp: new Date().toISOString(),
      error: (error as Error).message,
    });
  }
});

// Kubernetes liveness probe
app.get('/health/live', async (_req, res) => {
  try {
    const livenessStatus = await getLivenessStatus();
    res.status(livenessStatus.alive ? 200 : 503).json(livenessStatus);
  } catch (error) {
    res.status(503).json({
      alive: false,
      timestamp: new Date().toISOString(),
      error: (error as Error).message,
    });
  }
});

// Prometheus metrics endpoint
app.get('/metrics', async (_req, res) => {
  try {
    const metrics = await getPrometheusMetrics();
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.status(200).send(metrics);
  } catch (error) {
    logger.error('Failed to generate metrics:', error);
    res.status(500).send('# Failed to generate metrics');
  }
});

// Detailed health status for monitoring
app.get('/health/detailed', async (_req, res) => {
  try {
    const detailedStatus = await getDetailedHealthStatus();
    res.status(200).json(detailedStatus);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get detailed health status',
      message: (error as Error).message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Health check functions
async function getBasicHealthStatus() {
  const startTime = Date.now();
  const status = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    version: process.env.npm_package_version || 'unknown',
    responseTime: 0,
  };

  try {
    // Quick database connectivity check
    const dbHealthy = await DatabaseService.healthCheck();
    if (!dbHealthy) {
      status.status = 'unhealthy';
    }
  } catch (error) {
    status.status = 'unhealthy';
  }

  status.responseTime = Date.now() - startTime;
  return status;
}

async function getReadinessStatus() {
  const checks = [];
  let allReady = true;

  // Database readiness
  try {
    const dbStatus = await DatabaseService.getConnectionPoolStatus();
    const dbReady = dbStatus.primary.isHealthy;
    checks.push({
      name: 'database',
      ready: dbReady,
      details: dbStatus,
    });
    if (!dbReady) allReady = false;
  } catch (error) {
    checks.push({
      name: 'database',
      ready: false,
      error: (error as Error).message,
    });
    allReady = false;
  }

  // AI Service readiness
  try {
    // Check if AI service can handle requests
    const aiServiceReady = true; // Placeholder - would check AI service connectivity
    checks.push({
      name: 'ai_service',
      ready: aiServiceReady,
    });
    if (!aiServiceReady) allReady = false;
  } catch (error) {
    checks.push({
      name: 'ai_service',
      ready: false,
      error: (error as Error).message,
    });
    allReady = false;
  }

  // External API dependencies
  try {
    // Check Google Voice API connectivity
    const googleVoiceReady = true; // Placeholder - would test Google Voice API
    checks.push({
      name: 'google_voice_api',
      ready: googleVoiceReady,
    });
    if (!googleVoiceReady) allReady = false;
  } catch (error) {
    checks.push({
      name: 'google_voice_api',
      ready: false,
      error: (error as Error).message,
    });
    allReady = false;
  }

  return {
    ready: allReady,
    timestamp: new Date().toISOString(),
    checks,
  };
}

async function getLivenessStatus() {
  const checks = [];
  let alive = true;

  // Memory usage check
  const memUsage = process.memoryUsage();
  const memLimit = parseInt(process.env.MEMORY_LIMIT || '1073741824'); // 1GB default
  const memHealthy = memUsage.heapUsed < memLimit * 0.9; // 90% threshold
  
  checks.push({
    name: 'memory',
    alive: memHealthy,
    usage: memUsage,
    limit: memLimit,
    percentage: (memUsage.heapUsed / memLimit * 100).toFixed(2),
  });
  if (!memHealthy) alive = false;

  // Event loop lag check
  const eventLoopLag = await measureEventLoopLag();
  const lagHealthy = eventLoopLag < 100; // 100ms threshold
  
  checks.push({
    name: 'event_loop',
    alive: lagHealthy,
    lag: eventLoopLag,
    threshold: 100,
  });
  if (!lagHealthy) alive = false;

  // Application responsiveness
  const appResponsive = Date.now() > 0; // Basic responsiveness check
  checks.push({
    name: 'application',
    alive: appResponsive,
  });
  if (!appResponsive) alive = false;

  return {
    alive,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks,
  };
}

async function getDetailedHealthStatus() {
  const startTime = Date.now();
  
  // System information
  const systemInfo = {
    nodeVersion: process.version,
    platform: process.platform,
    architecture: process.arch,
    pid: process.pid,
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    memoryUsage: process.memoryUsage(),
  };

  // Database detailed status
  let databaseStatus;
  try {
    const dbStats = DatabaseService.getStats();
    const poolStatus = await DatabaseService.getConnectionPoolStatus();
    databaseStatus = {
      healthy: poolStatus.primary.isHealthy,
      stats: dbStats,
      pools: poolStatus,
    };
  } catch (error) {
    databaseStatus = {
      healthy: false,
      error: (error as Error).message,
    };
  }

  // External service status
  const externalServices = [
    {
      name: 'Claude AI API',
      status: 'unknown', // Would check actual service
      lastCheck: new Date().toISOString(),
    },
    {
      name: 'Google Voice API',
      status: 'unknown', // Would check actual service
      lastCheck: new Date().toISOString(),
    },
  ];

  const responseTime = Date.now() - startTime;

  return {
    timestamp: new Date().toISOString(),
    responseTime,
    system: systemInfo,
    database: databaseStatus,
    externalServices,
  };
}

async function getPrometheusMetrics() {
  const metrics = [];
  
  // Application metrics
  metrics.push(`# HELP nodejs_uptime_seconds Process uptime in seconds`);
  metrics.push(`# TYPE nodejs_uptime_seconds gauge`);
  metrics.push(`nodejs_uptime_seconds ${process.uptime()}`);

  // Memory metrics
  const memUsage = process.memoryUsage();
  metrics.push(`# HELP nodejs_memory_heap_used_bytes Process heap memory used`);
  metrics.push(`# TYPE nodejs_memory_heap_used_bytes gauge`);
  metrics.push(`nodejs_memory_heap_used_bytes ${memUsage.heapUsed}`);

  metrics.push(`# HELP nodejs_memory_heap_total_bytes Process heap memory total`);
  metrics.push(`# TYPE nodejs_memory_heap_total_bytes gauge`);
  metrics.push(`nodejs_memory_heap_total_bytes ${memUsage.heapTotal}`);

  // Database metrics
  try {
    const dbStats = DatabaseService.getStats();
    metrics.push(`# HELP database_connections_active Active database connections`);
    metrics.push(`# TYPE database_connections_active gauge`);
    metrics.push(`database_connections_active ${dbStats.activeConnections}`);

    metrics.push(`# HELP database_connections_idle Idle database connections`);
    metrics.push(`# TYPE database_connections_idle gauge`);
    metrics.push(`database_connections_idle ${dbStats.idleConnections}`);

    metrics.push(`# HELP database_queries_total Total database queries`);
    metrics.push(`# TYPE database_queries_total counter`);
    metrics.push(`database_queries_total ${dbStats.queryCount}`);

    metrics.push(`# HELP database_errors_total Total database errors`);
    metrics.push(`# TYPE database_errors_total counter`);
    metrics.push(`database_errors_total ${dbStats.errorCount}`);

    metrics.push(`# HELP database_query_duration_average Average query duration in milliseconds`);
    metrics.push(`# TYPE database_query_duration_average gauge`);
    metrics.push(`database_query_duration_average ${dbStats.averageQueryTime}`);
  } catch (error) {
    logger.warn('Failed to get database metrics:', error);
  }

  return metrics.join('\n');
}

function measureEventLoopLag(): Promise<number> {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to milliseconds
      resolve(lag);
    });
  });
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/customers', validateApiKey, customerRoutes);
app.use('/api/conversations', validateApiKey, conversationRoutes);
app.use('/api/jobs', validateApiKey, jobRoutes);
app.use('/api/quotes', validateApiKey, quoteRoutes);
app.use('/api/ai', validateApiKey, aiRoutes);
app.use('/api/analytics', validateApiKey, analyticsRoutes);
app.use('/api/google-voice', validateApiKey, googleVoiceRoutes);

// Webhook routes (no API key validation for external services)
app.use('/webhooks', webhookRoutes);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Initialize database and start server
async function startServer() {
  try {
    // Initialize database
    await DatabaseService.initialize();
    logger.info('Database initialized successfully');

    const PORT = process.env.PORT || 3001;
    const HOST = process.env.HOST || 'localhost';

    server.listen(Number(PORT), HOST, () => {
      logger.info(`🚀 Server running on http://${HOST}:${PORT}`);
      logger.info(`📊 Environment: ${process.env.NODE_ENV}`);
      logger.info(`🗄️  Database: ${process.env.DATABASE_TYPE}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    DatabaseService.close();
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    DatabaseService.close();
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

if (require.main === module) {
  startServer();
}

export { app, server };
export default app;