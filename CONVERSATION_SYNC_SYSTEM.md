# Conversation Sync System Documentation

## Overview

The Conversation Sync System is a comprehensive solution for importing, parsing, and managing customer conversations from Google Voice for plumbing businesses. It provides intelligent conversation threading, customer matching, message parsing with plumbing-specific information extraction, and comprehensive monitoring.

## Architecture

### Core Components

1. **ConversationSyncService** - Main orchestration service for Google Voice message import
2. **MessageParsingService** - Extracts plumbing-specific information from messages
3. **CustomerMatchingService** - Matches phone numbers to customers with fuzzy matching
4. **ConversationManagerService** - Manages conversation threading and context
5. **ConversationSyncMonitoringService** - Monitors performance and provides alerts

### Database Schema

The system extends the existing database with several new tables:

- `conversation_sync_metadata` - Tracks sync sessions and metadata
- `message_parsing_results` - Stores extracted information from messages
- `message_attachments` - Handles file attachments from messages
- `conversation_analytics` - Stores conversation analysis results
- `phone_number_normalizations` - Caches phone number normalizations
- `customer_identification_cache` - Caches customer matching results
- `sync_performance_metrics` - Tracks performance metrics
- `message_processing_queue` - Queue for asynchronous message processing

## Features

### 1. Google Voice Integration

#### Historical Message Import
- Paginated import of historical messages
- Configurable page sizes and limits
- Resume capability for interrupted syncs
- Duplicate detection and prevention

#### Incremental Sync
- Import only new messages since last sync
- Efficient timestamp-based filtering
- Automatic scheduling of incremental syncs

#### Message Threading
- Automatic conversation threading by phone number
- Time-based conversation grouping
- Support for conversation merging and splitting

### 2. Message Parsing & Information Extraction

#### Plumbing-Specific Extraction
```typescript
interface ExtractedInformation {
  // Contact information
  customerName?: string;
  alternatePhoneNumbers?: string[];
  emailAddresses?: string[];
  
  // Service information
  serviceTypes?: Array<{
    type: string;
    confidence: number;
    keywords: string[];
  }>;
  
  // Urgency assessment
  urgencyLevel: 'low' | 'medium' | 'high' | 'emergency';
  emergencyKeywords?: string[];
  
  // Scheduling requests
  schedulingRequests?: Array<{
    type: 'specific' | 'range' | 'asap' | 'flexible';
    dateTime?: Date;
    timeRange?: { start: string; end: string };
  }>;
  
  // Communication analysis
  sentiment: 'positive' | 'neutral' | 'negative' | 'frustrated' | 'urgent';
  communicationStyle: 'formal' | 'casual' | 'brief' | 'detailed';
  
  // Business classification
  isBusinessCustomer: boolean;
  isPropertyManager: boolean;
  isEmergencyContact: boolean;
}
```

#### Supported Service Types
- Drain cleaning
- Pipe repair
- Faucet repair
- Toilet repair
- Water heater service
- Emergency plumbing
- Installation services
- Maintenance and inspection

#### Emergency Detection
- Real-time emergency keyword detection
- Automatic priority escalation
- Configurable emergency response rules

### 3. Customer Matching

#### Phone Number Normalization
- Automatic phone number formatting
- Support for multiple formats (US/International)
- Caching for performance optimization

#### Matching Strategies
1. **Exact Match** - Direct phone number match
2. **Alternate Phone Match** - Check alternate phone numbers
3. **Fuzzy Match** - Name and email similarity matching
4. **Property-Based Match** - Match via service addresses

#### Customer Creation
- Automatic customer profile creation for unknown numbers
- Intelligent name extraction from messages
- Business vs residential classification

### 4. Conversation Management

#### Threading Logic
```typescript
interface ThreadingDecision {
  decision: 'new_thread' | 'existing_thread' | 'merge_threads' | 'split_thread';
  confidence: number;
  reasoning: string;
  factors: Array<{
    factor: string;
    weight: number;
    influence: 'positive' | 'negative' | 'neutral';
  }>;
}
```

#### Threading Factors
- Time since last activity (24-hour window)
- Message content similarity
- Platform consistency
- Emergency vs non-emergency context
- Multiple active conversations

#### Conversation Analysis
- Sentiment trajectory analysis
- Response time tracking
- Topic extraction and categorization
- Resolution status prediction

### 5. Performance Monitoring

#### Real-time Metrics
- Messages processed per second
- Average processing time
- Memory usage tracking
- Error rate monitoring
- Queue depth monitoring

#### Alerting System
```typescript
interface PerformanceAlert {
  alertType: 'performance' | 'error_rate' | 'memory' | 'timeout' | 'queue_backup';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details: Record<string, any>;
}
```

#### Health Checks
- Database connectivity
- Google Voice API status
- Message queue health
- Memory usage monitoring
- Disk space monitoring

## Usage

### Starting a Sync Operation

```typescript
import { ConversationSyncService } from './services/ConversationSyncService';

const syncService = new ConversationSyncService(db, googleVoiceApi);

const progress = await syncService.startSync({
  tokenId: 'google_voice_token_id',
  syncType: 'initial', // or 'incremental'
  pageSize: 100,
  maxPages: 50,
  enableDuplicateDetection: true,
  enableMessageParsing: true,
  enableCustomerMatching: true,
  enableConversationThreading: true,
  parallelProcessing: false,
  batchSize: 50
});

console.log(`Sync started: ${progress.syncId}`);
```

### Monitoring Sync Progress

```typescript
const progress = await syncService.getSyncProgress(syncId);

console.log(`Status: ${progress.status}`);
console.log(`Processed: ${progress.progress.processedMessages}/${progress.progress.totalMessages}`);
console.log(`Customers created: ${progress.progress.customersCreated}`);
console.log(`Conversations created: ${progress.progress.conversationsCreated}`);
```

### Message Parsing

```typescript
import { MessageParsingService } from './services/MessageParsingService';

const parsingService = new MessageParsingService(db);

const result = await parsingService.parseMessage(messageId, messageContent);

console.log(`Urgency level: ${result.extractedInfo.urgencyLevel}`);
console.log(`Service types: ${result.extractedInfo.serviceTypes?.map(s => s.type).join(', ')}`);
console.log(`Confidence: ${result.extractedInfo.confidenceScore}`);
```

### Customer Matching

```typescript
import { CustomerMatchingService } from './services/CustomerMatchingService';

const matchingService = new CustomerMatchingService(db);

const result = await matchingService.matchCustomer({
  phoneNumber: '+15551234567',
  name: 'John Doe',
  fuzzyMatch: true,
  createIfNotFound: true
});

console.log(`Match type: ${result.matchType}`);
console.log(`Confidence: ${result.confidence}`);
console.log(`Customer: ${result.customer?.firstName} ${result.customer?.lastName}`);
```

### Conversation Analysis

```typescript
import { ConversationManagerService } from './services/ConversationManagerService';

const managerService = new ConversationManagerService(db);

const analysis = await managerService.analyzeConversation(conversationId);

console.log(`Message count: ${analysis.messageCount}`);
console.log(`Overall sentiment: ${analysis.sentiment.overall}`);
console.log(`Urgency level: ${analysis.urgency.currentLevel}`);
console.log(`Resolution status: ${analysis.resolution.status}`);
```

### Performance Monitoring

```typescript
import { ConversationSyncMonitoringService } from './services/ConversationSyncMonitoringService';

const monitoring = new ConversationSyncMonitoringService(db);

// Record custom metrics
await monitoring.recordPerformanceMetric(
  syncSessionId,
  'custom_metric',
  value,
  'unit'
);

// Get dashboard data
const dashboard = await monitoring.getDashboardData();
console.log(`System health: ${dashboard.systemHealth}`);
console.log(`Active alerts: ${dashboard.activeAlerts}`);
console.log(`Throughput: ${dashboard.throughput} messages/second`);
```

## Configuration

### Environment Variables

```bash
# Google Voice API Configuration
GOOGLE_VOICE_CLIENT_ID=your_client_id
GOOGLE_VOICE_CLIENT_SECRET=your_client_secret
GOOGLE_VOICE_REDIRECT_URI=your_redirect_uri

# Database Configuration
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=voicebot
DATABASE_USER=username
DATABASE_PASSWORD=password

# Sync Configuration
MAX_CONCURRENT_SYNCS=3
DEFAULT_BATCH_SIZE=50
DEFAULT_PAGE_SIZE=100
CONVERSATION_TIMEOUT_HOURS=24

# Monitoring Configuration
PERFORMANCE_ALERT_THRESHOLD_MS=5000
MEMORY_ALERT_THRESHOLD_MB=512
ERROR_RATE_THRESHOLD_PERCENT=5
```

### Message Parsing Configuration

The message parsing service uses configurable patterns and keywords:

```typescript
const config = {
  emergencyKeywords: [
    {
      keyword: 'flooding',
      pattern: /\b(flood|flooding|water everywhere)\b/i,
      severity: 'critical'
    }
  ],
  serviceTypePatterns: [
    {
      serviceType: 'drain_cleaning',
      patterns: [/\b(drain|clog|slow drain|backup)\b/i],
      confidence: 85
    }
  ]
};
```

## Database Schema

### Key Tables

#### conversation_sync_metadata
Tracks sync operations and metadata:
- `syncSessionId` - Unique session identifier
- `syncType` - Type of sync (initial/incremental/manual)
- `messagesImported` - Count of imported messages
- `syncSource` - Source system (google_voice)
- `syncConfig` - JSON configuration used

#### message_parsing_results
Stores extracted information:
- `messageId` - Reference to message
- `parsingVersion` - Parser version used
- `extractedInfo` - JSON with parsed data
- `processingTimeMs` - Time taken to parse

#### conversation_analytics
Daily conversation analysis:
- `conversationId` - Reference to conversation
- `analysisDate` - Date of analysis
- `metrics` - JSON with conversation metrics
- `keywordAnalysis` - JSON with keyword analysis

### Performance Tables

#### sync_performance_metrics
Detailed performance tracking:
- `syncSessionId` - Session identifier
- `metricName` - Name of metric
- `value` - Metric value
- `unit` - Unit of measurement
- `recordedAt` - Timestamp

#### performance_alerts
Alert tracking:
- `alertType` - Type of alert
- `severity` - Alert severity level
- `message` - Alert description
- `resolved` - Resolution status

## API Endpoints

### Sync Management

```http
POST /api/sync/start
{
  "tokenId": "string",
  "syncType": "initial|incremental|manual",
  "options": {
    "pageSize": 100,
    "enableParsing": true
  }
}

GET /api/sync/{syncId}/progress
Response: {
  "syncId": "string",
  "status": "running|completed|failed",
  "progress": {
    "totalMessages": 1000,
    "processedMessages": 750
  }
}

POST /api/sync/{syncId}/cancel
```

### Monitoring

```http
GET /api/monitoring/dashboard
Response: {
  "activeSync": 2,
  "systemHealth": "healthy",
  "throughput": 5.2,
  "activeAlerts": 0
}

GET /api/monitoring/alerts
Response: {
  "alerts": [
    {
      "alertId": "string",
      "alertType": "performance",
      "severity": "medium",
      "message": "High processing time"
    }
  ]
}

POST /api/monitoring/alerts/{alertId}/resolve
```

## Testing

### Integration Tests

The system includes comprehensive integration tests:

```bash
# Run all conversation sync tests
npm test -- --testPathPattern=ConversationSyncIntegration

# Run specific test suites
npm test -- --testNamePattern="End-to-End Conversation Sync"
npm test -- --testNamePattern="Performance Benchmarks"
```

### Performance Benchmarks

Key performance targets:
- Message processing: < 5 seconds per message
- Sync completion: < 30 seconds for 100 messages
- Memory usage: < 512MB peak
- Error rate: < 5%

### Mock Data

Test data includes realistic plumbing scenarios:
- Emergency situations (toilet overflow, pipe burst)
- Routine service requests (drain cleaning, faucet repair)
- Quote requests with addresses
- Follow-up messages and satisfaction feedback

## Deployment

### Database Migration

```bash
# Run migrations
npm run migrate

# Rollback if needed
npm run migrate:rollback
```

### Service Dependencies

Required services:
- PostgreSQL database
- Google Voice API access
- Redis (for caching, optional)
- Message queue system (optional)

### Monitoring Setup

1. Configure performance thresholds
2. Set up alert notifications (email, Slack, etc.)
3. Configure log aggregation
4. Set up health check endpoints

## Troubleshooting

### Common Issues

#### Sync Fails with Rate Limit Error
- Reduce `pageSize` and increase delays between requests
- Check Google Voice API quotas
- Implement exponential backoff

#### High Memory Usage
- Reduce `batchSize` for processing
- Enable garbage collection monitoring
- Check for memory leaks in parsing logic

#### Conversations Not Threading Properly
- Review threading decision factors
- Check phone number normalization
- Verify customer matching accuracy

### Logging

The system provides detailed logging at multiple levels:

```typescript
// Enable debug logging
process.env.LOG_LEVEL = 'debug';

// Monitor specific components
logger.info('Sync started', { syncId, options });
logger.debug('Processing message', { messageId, content });
logger.error('Sync failed', { error, context });
```

### Performance Monitoring

Monitor key metrics:
- Sync throughput (messages/second)
- Processing latency (ms per message)
- Error rates (% of failed operations)
- Memory usage (MB)
- Queue depth (pending messages)

## Security Considerations

### Data Privacy
- All customer data is encrypted at rest
- Message content is stored securely
- Access logs maintained for audit trails

### API Security
- OAuth2 authentication for Google Voice
- Rate limiting on all endpoints
- Input validation and sanitization

### Error Handling
- Sensitive information excluded from logs
- Graceful degradation on service failures
- Automatic retry with exponential backoff

## Future Enhancements

### Planned Features
1. **Multi-platform Support** - SMS, WhatsApp, Facebook Messenger
2. **Advanced AI Integration** - Claude API for response generation
3. **Real-time Processing** - WebSocket updates for live sync
4. **Business Intelligence** - Advanced analytics and reporting
5. **Mobile App Integration** - Push notifications and mobile dashboard

### Performance Optimizations
1. **Parallel Processing** - Multi-threaded message processing
2. **Caching Layer** - Redis for frequently accessed data
3. **Database Optimization** - Improved indexing and queries
4. **Message Queuing** - Asynchronous processing with RabbitMQ

### Integration Opportunities
1. **CRM Systems** - Salesforce, HubSpot integration
2. **Scheduling Software** - ServiceTitan, Jobber integration
3. **Payment Processing** - Stripe, Square integration
4. **Mapping Services** - Route optimization for technicians

## Support

For technical support or questions about the Conversation Sync System:

- Review the integration tests for usage examples
- Check the monitoring dashboard for system health
- Examine log files for detailed error information
- Consult the database schema documentation for data structure

The system is designed to be self-monitoring and self-healing, with comprehensive error handling and automatic recovery capabilities.