# Plumbing Business AI Platform API Documentation

## Overview

The Plumbing Business AI Platform API is a comprehensive RESTful API that powers a production-ready plumbing business management system with AI-driven features. This API enables complete management of customers, jobs, conversations, emergency responses, scheduling, and business operations.

## Quick Start

### 1. Authentication

All API endpoints require JWT authentication unless specified otherwise. Obtain a token by logging in:

```bash
curl -X POST https://api.plumbingai.com/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@plumbingcompany.com", "password": "your_password"}'
```

Include the token in subsequent requests:

```bash
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  https://api.plumbingai.com/v1/customers
```

### 2. Basic Usage Examples

#### Create a New Customer
```bash
curl -X POST https://api.plumbingai.com/v1/customers \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Smith",
    "phone": "+15551234567",
    "email": "john@email.com",
    "address": "123 Main St",
    "city": "Anytown",
    "state": "TX",
    "zipCode": "12345"
  }'
```

#### Generate AI Response
```bash
curl -X POST https://api.plumbingai.com/v1/ai/generate-response \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": "550e8400-e29b-41d4-a716-446655440000",
    "messageText": "My kitchen sink is clogged",
    "context": {
      "serviceType": "drain_cleaning",
      "urgencyLevel": "normal"
    }
  }'
```

#### Create Emergency Alert
```bash
curl -X POST https://api.plumbingai.com/v1/emergency/alerts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "water_leak",
    "severity": "high",
    "customerId": "550e8400-e29b-41d4-a716-446655440000",
    "description": "Basement flooding from burst pipe",
    "location": {
      "address": "123 Main St",
      "coordinates": {"lat": 40.7128, "lng": -74.0060}
    }
  }'
```

## API Documentation Formats

### 1. OpenAPI Specification
- **File**: `openapi.yaml`
- **Format**: OpenAPI 3.0.3
- **Usage**: Import into Postman, Insomnia, or Swagger UI
- **Features**: Complete API specification with schemas, examples, and validation rules

### 2. Interactive Documentation
- **Swagger UI**: Available at `/docs` endpoint
- **Redoc**: Available at `/redoc` endpoint
- **Features**: Interactive testing, code generation, and comprehensive documentation

### 3. SDK and Code Examples
- **JavaScript/TypeScript**: Client SDK with TypeScript definitions
- **Python**: Python client library with async support
- **cURL**: Command-line examples for all endpoints
- **Postman Collection**: Pre-configured collection with environment variables

## Core API Concepts

### 1. Resource Relationships

```
Customer
├── Properties (1:many)
├── Jobs (1:many)
├── Conversations (1:many)
├── Warranties (1:many)
└── Emergency Alerts (1:many)

Job
├── Customer (many:1)
├── Quote (1:1)
├── Materials (1:many)
├── Status History (1:many)
└── Warranty (1:1)

Conversation
├── Customer (many:1)
├── Messages (1:many)
└── AI Interactions (1:many)
```

### 2. Data Flow Patterns

#### Customer Journey Flow
1. **Initial Contact** → Customer record created automatically
2. **Conversation** → AI-powered message processing
3. **Service Request** → Job creation and scheduling
4. **Quote Generation** → Dynamic pricing calculation
5. **Service Completion** → Warranty creation and follow-up

#### Emergency Response Flow
1. **Message Received** → AI emergency classification
2. **Alert Creation** → Automatic severity assessment
3. **Technician Dispatch** → Optimal resource allocation
4. **Real-time Updates** → Status tracking and notifications
5. **Resolution** → Documentation and follow-up

### 3. Business Logic Integration

#### Dynamic Pricing
```javascript
// Pricing factors automatically applied
{
  "basePrice": 200.00,
  "adjustedPrice": 170.00,
  "factors": {
    "timeOfDay": 1.0,        // Normal hours
    "urgencyMultiplier": 1.0, // Non-emergency
    "customerHistory": 0.85,  // 15% loyal customer discount
    "seasonality": 1.0,      // Standard season
    "demandLevel": 1.0       // Normal demand
  }
}
```

#### AI Context Management
```javascript
// AI responses consider full context
{
  "context": {
    "customerType": "returning",
    "serviceHistory": [...],
    "currentIssue": "drain_blockage",
    "urgencyLevel": "normal",
    "customerSentiment": "neutral"
  }
}
```

## Advanced Features

### 1. Real-time Capabilities
- **WebSocket Support**: Live updates for job status, emergency alerts
- **Server-Sent Events**: Real-time dashboard updates
- **Webhook Integrations**: External system notifications

### 2. AI-Powered Features
- **Intent Classification**: Automatic message categorization
- **Sentiment Analysis**: Customer emotion detection
- **Emergency Detection**: Real-time emergency identification
- **Response Generation**: Context-aware customer responses
- **Predictive Maintenance**: Equipment failure prediction

### 3. Business Intelligence
- **Analytics Endpoints**: Comprehensive business metrics
- **Performance Monitoring**: System health and performance data
- **Customer Insights**: Behavior analysis and segmentation
- **Revenue Optimization**: Pricing and scheduling recommendations

## Error Handling

### Standard Error Response Format
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": {
      "field": "email",
      "issue": "Invalid email format",
      "providedValue": "invalid-email"
    },
    "timestamp": "2024-01-15T10:30:00Z",
    "requestId": "req_123456789"
  }
}
```

### Error Categories
- **400 Bad Request**: Invalid input data or malformed requests
- **401 Unauthorized**: Missing or invalid authentication token
- **403 Forbidden**: Insufficient permissions for the requested action
- **404 Not Found**: Requested resource does not exist
- **409 Conflict**: Resource already exists or conflict with current state
- **422 Unprocessable Entity**: Valid request format but business logic violation
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Unexpected server error

### Error Handling Best Practices
1. **Always check status codes** before processing response data
2. **Implement retry logic** for 5xx errors with exponential backoff
3. **Handle rate limits** by respecting `Retry-After` headers
4. **Log error details** for debugging and monitoring
5. **Provide user-friendly messages** based on error codes

## Rate Limiting

### Default Limits
- **Standard API**: 1000 requests/hour per user
- **Search Endpoints**: 100 requests/minute per user
- **AI Services**: 50 requests/minute per user
- **Webhooks**: 10,000 requests/hour (no authentication required)

### Rate Limit Headers
```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1642262400
X-RateLimit-Window: 3600
```

### Handling Rate Limits
```javascript
if (response.status === 429) {
  const retryAfter = response.headers['retry-after'];
  const resetTime = response.headers['x-ratelimit-reset'];
  
  // Wait before retrying
  setTimeout(() => {
    // Retry the request
  }, retryAfter * 1000);
}
```

## Pagination

### Standard Pagination
```http
GET /api/customers?page=2&limit=25
```

### Response Format
```json
{
  "success": true,
  "customers": [...],
  "pagination": {
    "page": 2,
    "limit": 25,
    "totalPages": 10,
    "totalCount": 250,
    "hasNext": true,
    "hasPrev": true
  }
}
```

### Cursor-based Pagination (for real-time data)
```http
GET /api/messages?cursor=eyJpZCI6MTIzNDU2fQ&limit=50
```

## Filtering and Sorting

### Query Parameters
```http
GET /api/jobs?status=completed&priority=high&sortBy=completedAt&order=desc&dateFrom=2024-01-01&dateTo=2024-01-31
```

### Advanced Filtering
```http
GET /api/customers?search=john&customerType=residential&totalRevenue[gte]=1000&city=Austin
```

### Field Selection
```http
GET /api/customers?fields=id,name,email,phone&include=serviceHistory
```

## Webhooks

### Supported Events
- `customer.created`
- `customer.updated`
- `job.created`
- `job.status_changed`
- `job.completed`
- `emergency.alert_created`
- `conversation.message_received`
- `quote.approved`
- `warranty.expiring`

### Webhook Payload Format
```json
{
  "event": "job.completed",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "jobId": "660e8400-e29b-41d4-a716-446655440001",
    "customerId": "550e8400-e29b-41d4-a716-446655440000",
    "completedAt": "2024-01-15T10:30:00Z",
    "totalCost": 250.00,
    "customerRating": 5
  },
  "signature": "sha256=abcdef123456...",
  "deliveryId": "del_123456789"
}
```

### Webhook Security
1. **Signature Verification**: All webhooks include HMAC signatures
2. **Timestamp Validation**: Reject old webhook deliveries
3. **Idempotency**: Handle duplicate deliveries gracefully
4. **Rate Limiting**: Webhooks are rate-limited per endpoint

## Testing

### Test Environment
- **Base URL**: `https://staging-api.plumbingai.com/v1`
- **Authentication**: Use test credentials provided
- **Data**: Test environment is reset nightly
- **Rate Limits**: Relaxed for testing purposes

### Test Data
The API includes endpoints for creating test data:
```bash
# Create test customer with service history
POST /api/test/customers/create-with-history

# Generate sample conversations
POST /api/test/conversations/generate-sample

# Create emergency scenarios
POST /api/test/emergency/create-scenarios
```

### Postman Collection
Import the Postman collection for comprehensive API testing:
- **Collection**: `plumbing-ai-api.postman_collection.json`
- **Environment**: `plumbing-ai-staging.postman_environment.json`
- **Features**: Pre-request scripts, test assertions, environment management

## SDK and Libraries

### JavaScript/TypeScript SDK
```bash
npm install @plumbing-ai/api-client
```

```javascript
import { PlumbingAIClient } from '@plumbing-ai/api-client';

const client = new PlumbingAIClient({
  apiKey: 'your-jwt-token',
  baseURL: 'https://api.plumbingai.com/v1'
});

// Create customer
const customer = await client.customers.create({
  name: 'John Smith',
  phone: '+15551234567',
  email: 'john@email.com'
});

// Generate AI response
const response = await client.ai.generateResponse({
  conversationId: 'conv-123',
  messageText: 'My sink is clogged'
});
```

### Python SDK
```bash
pip install plumbing-ai-client
```

```python
from plumbing_ai import PlumbingAIClient

client = PlumbingAIClient(
    api_key='your-jwt-token',
    base_url='https://api.plumbingai.com/v1'
)

# Create customer
customer = client.customers.create({
    'name': 'John Smith',
    'phone': '+15551234567',
    'email': 'john@email.com'
})

# Generate AI response
response = client.ai.generate_response({
    'conversation_id': 'conv-123',
    'message_text': 'My sink is clogged'
})
```

## Support and Resources

### Documentation Links
- **OpenAPI Spec**: [openapi.yaml](./openapi.yaml)
- **Postman Collection**: [Download](./postman/collection.json)
- **Code Examples**: [examples/](./examples/)
- **SDK Documentation**: [sdk/](./sdk/)

### Support Channels
- **Email**: api-support@plumbingai.com
- **Documentation**: https://docs.plumbingai.com
- **Status Page**: https://status.plumbingai.com
- **GitHub Issues**: https://github.com/plumbing-ai/api-issues

### Community Resources
- **Developer Forum**: https://community.plumbingai.com
- **Discord Server**: https://discord.gg/plumbing-ai
- **Blog**: https://blog.plumbingai.com/developers
- **Changelog**: https://changelog.plumbingai.com

---

*Last updated: January 2025*
*API Version: 1.0.0*