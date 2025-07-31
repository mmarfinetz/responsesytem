# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a comprehensive AI-powered voice communication system designed specifically for plumbing businesses. The system integrates Google Voice API with Claude AI to provide intelligent customer communication management, job tracking, and automated response generation.

## Architecture

**Monorepo with workspaces**: Backend (Express/TypeScript) and Frontend (React/TypeScript)
- **Database**: SQLite for development, PostgreSQL for production with read replica support
- **AI Integration**: Claude AI (Anthropic) for intelligent response generation
- **Communication**: Google Voice API for SMS/voice integration
- **State Management**: React Query for server state, Zustand for client state
- **Styling**: Tailwind CSS with shadcn/ui components

## Development Commands

### Setup and Development
```bash
npm run setup          # Install dependencies and initialize database
npm run dev            # Start both backend (3001) and frontend (3000)
npm run dev:backend    # Backend only
npm run dev:frontend   # Frontend only
```

### Database Operations
```bash
npm run db:migrate     # Run database migrations
npm run db:seed        # Seed with sample data
npm run db:reset       # Reset database (backend workspace)
```

### Testing
```bash
npm run test           # Run all tests (backend + frontend)
npm run test:watch     # Watch mode for tests (backend)
```

### Code Quality
```bash
npm run lint           # Lint all workspaces
npm run type-check     # TypeScript checking
```

### Production
```bash
npm run build          # Build both applications
npm start              # Start production server
```

## Core Architecture Patterns

### Service-Oriented Architecture
The backend follows a service-oriented pattern with 30+ specialized services:

```typescript
export class ServiceName {
  constructor(private db: DatabaseService) {}
  
  async methodName(params: Type): Promise<ReturnType> {
    // Implementation
  }
}
```

**Key Services:**
- `ConversationSyncService` - Google Voice message import and processing
- `MessageParsingService` - AI-powered message analysis
- `CustomerMatchingService` - Intelligent customer identification
- `ClaudeAIService` - Claude AI integration for response generation
- `DatabaseService` - Connection pooling, health checks, read replica support
- `EmergencyRoutingService` - Priority-based job routing
- `WebhookProcessingService` - Real-time webhook handling

### Database Architecture
Complex relational schema with 30+ tables managed through Knex.js:

**Core Entities:**
- customers, properties, conversations, messages, jobs, quotes
- staff, service_history, warranties, maintenance_schedules
- equipment, emergency_routing, business_config, audit_logs

**Database Service Features:**
- Connection pooling with health monitoring
- Read replica support for production
- Automatic failover and reconnection
- Query performance monitoring
- SQLite optimizations (WAL mode, pragmas)
- PostgreSQL optimizations (timeouts, parameters)

### TypeScript Architecture
Comprehensive shared types in `shared/types/index.ts`:
- 30+ interfaces covering all business entities
- Enhanced business logic fields (emergency routing, maintenance, performance metrics)
- Request/response types for all API endpoints
- Analytics and metrics types

## Key Business Logic

### Message Processing Pipeline
1. Google Voice webhook receives message/call
2. Customer matching via phone number normalization
3. AI message parsing extracts plumbing-specific information
4. Intent classification (emergency, routine, estimate, scheduling)
5. Context-aware response generation using business data
6. Emergency routing and after-hours handling
7. Conversation threading and staff assignment

### AI Integration Patterns
- Modularized prompts in `ai/prompts/` directory
- Context-aware responses using customer history and job data
- Intent classification for service types and urgency
- Performance monitoring with token usage tracking
- Response quality assessment and training data collection

### Customer Data Model
- Multiple properties per customer support
- Business vs residential classification
- Equipment tracking per property with maintenance schedules
- Service history with warranty management
- Emergency service approval and credit management

### Job Workflow States
```
inquiry → quoted → approved → scheduled → in_progress → completed
```

Emergency jobs bypass normal workflow with automatic technician assignment.

## Environment Configuration

### Backend (.env)
```bash
# Database
DATABASE_TYPE=sqlite
DATABASE_PATH=./database.sqlite
DATABASE_REPLICA_URL=postgresql://... # Production only

# Claude AI
ANTHROPIC_API_KEY=your_api_key

# Google Voice
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=your_redirect_uri

# Security
JWT_SECRET=your_jwt_secret
API_KEY=your_api_key
```

### Frontend (.env)
```bash
VITE_API_URL=http://localhost:3001
VITE_API_KEY=your_api_key
```

## Testing Strategy

### Backend Testing with Jest
```bash
# Run specific test suites
npm test -- --testPathPattern=ConversationSyncIntegration
npm test -- --testNamePattern="End-to-End Conversation Sync"
```

**Test Categories:**
- Integration tests for conversation sync system
- Performance benchmarks for message processing
- Security test suites for authentication/authorization
- Load testing for concurrent request handling

### Frontend Testing with Vitest
```bash
npm run test --workspace=frontend
npm run test:ui --workspace=frontend  # UI test runner
```

## Performance Considerations

### Database Optimization
- Indexed foreign keys and frequently queried fields
- Connection pooling with health monitoring
- Read replica routing for SELECT queries
- Query performance monitoring with slow query detection
- Automatic connection failover and retry logic

### API Performance
- Rate limiting with `rate-limiter-flexible`
- Request/response compression
- JWT-based stateless authentication
- Circuit breaker pattern for external API calls
- Webhook processing with queue system

### Frontend Optimization
- React Query for efficient server state management
- Code splitting with Vite
- Tailwind CSS with purging for optimal bundle size
- Component lazy loading

## Security Implementation

### Authentication & Authorization
- JWT tokens with refresh mechanism
- Role-based access control (admin, technician, dispatcher, readonly)
- API key validation for external integrations
- Session management with automatic expiration

### Data Protection
- Input validation using Joi schemas
- Parameterized queries preventing SQL injection
- Request logging for comprehensive audit trails
- Rate limiting on all endpoints

### API Security
- CORS configuration for cross-origin requests
- Helmet.js for security headers
- Request sanitization and validation
- Comprehensive error handling without information leakage

## Integration Points

### Google Voice API
- OAuth2 authentication flow with token refresh
- Real-time webhook processing for messages/calls
- Message synchronization with deduplication
- Call recording and transcription support

### Claude AI Integration
- Context-aware prompt engineering with business data
- Response generation with customer history
- Token usage optimization and monitoring
- Performance metrics and quality assessment

## Deployment Architecture

### Production Environment
- PostgreSQL with read replica support
- Environment-specific configuration management
- Health monitoring endpoints (`/health`)
- Kubernetes deployment configurations in `k8s/`
- Docker multi-stage builds for optimization

### Monitoring & Observability
- Winston logging with structured JSON output
- Prometheus metrics collection
- Grafana dashboards for business KPIs
- Error tracking and alerting
- Database connection pool monitoring

## Common Development Patterns

### Adding New Services
1. Create service class extending EventEmitter if needed
2. Inject `DatabaseService` for data operations
3. Add comprehensive error handling with logging
4. Include TypeScript interfaces in `shared/types/`
5. Write integration tests following existing patterns

### Database Schema Changes
1. Create numbered migration in `database/migrations/`
2. Define both `up` and `down` operations
3. Update TypeScript interfaces in `shared/types/`
4. Run migration: `npm run db:migrate`
5. Update seed data if required

### AI Prompt Development
1. Add new prompts in `ai/prompts/` directory
2. Include context gathering and response formatting
3. Test with various customer scenarios
4. Monitor token usage and response quality
5. Implement fallback strategies for API failures

### Message Processing Extensions
1. Update parsing patterns in `MessageParsingService`
2. Extend conversation analytics in `ConversationAnalyzerService`
3. Add new intent classifications
4. Update emergency routing rules
5. Test with realistic plumbing scenarios

## Default Login Credentials

For development and testing:
```
Email: admin@plumbingcompany.com
Password: admin123

Email: tech@plumbingcompany.com  
Password: tech123
```

## Important File Locations

- **Types**: `shared/types/index.ts` - Comprehensive business entity types
- **Services**: `backend/src/services/` - Core business logic
- **Database**: `database/migrations/` - Schema changes, `database/seeders/` - Sample data
- **AI Prompts**: `backend/src/ai/prompts/` - Claude AI prompt templates
- **Tests**: `backend/src/tests/` - Integration and performance tests