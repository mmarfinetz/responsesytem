# Google Voice Integration Documentation

## Overview

This documentation covers the comprehensive Google Voice OAuth2 authentication and API integration system for the plumbing business CRM. The system provides secure access to Google Voice messages, contacts, and call history with automatic customer matching and conversation threading.

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Setup and Configuration](#setup-and-configuration)
3. [Authentication Flow](#authentication-flow)
4. [API Endpoints](#api-endpoints)
5. [Message Synchronization](#message-synchronization)
6. [Customer Matching](#customer-matching)
7. [Error Handling](#error-handling)
8. [Security Considerations](#security-considerations)
9. [Troubleshooting](#troubleshooting)
10. [Production Deployment](#production-deployment)

## System Architecture

### Core Components

- **GoogleVoiceAuthService**: Handles OAuth2 flow and token management
- **GoogleVoiceApiClient**: Interfaces with Google Voice API
- **GoogleVoiceSyncService**: Manages message synchronization
- **CustomerMatchingService**: Intelligent customer identification
- **Database Models**: Data persistence and mapping

### Database Schema

The integration adds the following tables:

- `google_oauth_tokens`: OAuth2 token storage
- `google_voice_sync_status`: Synchronization tracking
- `google_voice_message_mapping`: Google message to local message mapping
- `google_voice_phone_mapping`: Phone number management
- `google_api_rate_limits`: API usage tracking

## Setup and Configuration

### Prerequisites

1. **Google Cloud Console Setup**:
   - Create a Google Cloud project
   - Enable Google Voice API
   - Create OAuth2 credentials
   - Configure authorized redirect URIs

2. **Environment Variables**:
   ```bash
   # Required OAuth2 Credentials
   GOOGLE_CLIENT_ID=your_google_client_id_here
   GOOGLE_CLIENT_SECRET=your_google_client_secret_here
   GOOGLE_REDIRECT_URI=http://localhost:3001/api/google-voice/auth/callback

   # Security Keys (generate secure random strings)
   TOKEN_ENCRYPTION_KEY=your_secure_token_encryption_key_here
   SESSION_SECRET=your_secure_session_secret_here

   # Optional Configuration
   GOOGLE_VOICE_SYNC_BATCH_SIZE=50
   GOOGLE_VOICE_SYNC_INTERVAL_MINUTES=15
   GOOGLE_VOICE_REQUESTS_PER_MINUTE=60
   ```

3. **Database Migration**:
   ```bash
   npm run db:migrate
   ```

### Quick Setup with Wizard

Run the interactive setup wizard:

```bash
# Run setup wizard
node -r ts-node/register src/utils/googleVoiceSetup.ts setup

# Or create environment template
node -r ts-node/register src/utils/googleVoiceSetup.ts create-env
```

The wizard will:
- Validate environment configuration
- Check database setup
- Guide through Google Cloud configuration
- Test OAuth2 flow
- Verify API permissions

## Authentication Flow

### 1. Generate Authorization URL

```typescript
GET /api/google-voice/auth/url
```

Response:
```json
{
  "success": true,
  "data": {
    "authUrl": "https://accounts.google.com/oauth/authorize?...",
    "state": "random_state_value"
  }
}
```

### 2. User Authorization

Direct users to the `authUrl` to grant permissions. They'll be redirected back to your callback URL.

### 3. Exchange Authorization Code

```typescript
POST /api/google-voice/auth/callback
Content-Type: application/json

{
  "code": "authorization_code_from_callback",
  "state": "state_value_from_step_1"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "tokenId": "uuid-token-id",
    "email": "user@example.com",
    "scopes": ["voice.readonly", "voice.v1"],
    "scopeValidation": {
      "valid": true,
      "missing": []
    }
  }
}
```

### 4. Verify Authentication Status

```typescript
GET /api/google-voice/auth/status
```

## API Endpoints

### Authentication Endpoints

- `GET /api/google-voice/auth/url` - Generate OAuth URL
- `POST /api/google-voice/auth/callback` - Handle OAuth callback
- `GET /api/google-voice/auth/status` - Check auth status
- `DELETE /api/google-voice/auth/revoke/:tokenId` - Revoke access

### Google Voice Data Endpoints

- `GET /api/google-voice/numbers/:tokenId` - Get Voice numbers
- `GET /api/google-voice/messages/:tokenId` - Get messages
- `POST /api/google-voice/messages/:tokenId/send` - Send message
- `GET /api/google-voice/contacts/:tokenId` - Get contacts
- `GET /api/google-voice/calls/:tokenId` - Get call history

### Synchronization Endpoints

- `POST /api/google-voice/sync/:tokenId/start` - Start sync
- `GET /api/google-voice/sync/:tokenId/status` - Get sync status

### Testing Endpoint

- `GET /api/google-voice/test/:tokenId` - Test connectivity

## Message Synchronization

### Sync Types

1. **Initial Sync**: Complete message history import
2. **Incremental Sync**: New messages since last sync
3. **Manual Sync**: User-triggered sync with custom parameters

### Starting a Sync

```typescript
POST /api/google-voice/sync/:tokenId/start
Content-Type: application/json

{
  "syncType": "initial",
  "startDate": "2024-01-01T00:00:00Z",
  "endDate": "2024-12-31T23:59:59Z"
}
```

### Monitoring Sync Progress

```typescript
GET /api/google-voice/sync/:tokenId/status
```

Response:
```json
{
  "success": true,
  "data": {
    "syncStatuses": [
      {
        "id": "sync-uuid",
        "status": "running",
        "messagesProcessed": 150,
        "messagesTotal": 500,
        "conversationsCreated": 12,
        "customersCreated": 8
      }
    ]
  }
}
```

### Duplicate Detection

The system automatically detects and skips duplicate messages using:
- Google Message ID matching
- Content and timestamp fuzzy matching
- Configurable detection window

## Customer Matching

### Automatic Customer Creation

When new phone numbers are encountered, the system:
1. Checks for exact phone number matches
2. Searches alternate phone numbers
3. Performs fuzzy matching on names/emails (if available)
4. Matches customers via property addresses
5. Creates new customer records if no match found

### Conversation Threading

The system intelligently manages conversation threads by:
- Finding existing active conversations
- Resuming recent inactive conversations
- Detecting follow-up patterns
- Merging duplicate conversations
- Analyzing message context for priority assignment

### Example Customer Matching

```typescript
// Automatic matching during sync
const matchResult = await customerMatchingService.matchCustomer({
  phoneNumber: '+15551234567',
  name: 'John Smith',
  fuzzyMatch: true,
  createIfNotFound: true
});

// Enhanced matching with property info
const enhancedMatch = await customerMatchingService.matchCustomerWithProperty({
  phoneNumber: '+15551234567',
  address: '123 Main St',
  city: 'Anytown',
  zipCode: '12345'
});
```

## Error Handling

### Google API Error Categories

- **Authentication Errors**: Token expired, insufficient scope
- **Rate Limiting**: Too many requests
- **Quota Errors**: API quota exceeded
- **Network Errors**: Connection issues
- **Server Errors**: Google service unavailable

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests to Google Voice. Please wait a moment and try again.",
    "category": "rate_limit",
    "retryable": true,
    "retryAfter": 60
  }
}
```

### Automatic Recovery

The system includes:
- Automatic token refresh
- Exponential backoff for retries
- Rate limit compliance
- Error categorization and logging

## Security Considerations

### Token Security

- Tokens encrypted at rest using AES-256
- Secure token refresh handling
- PKCE (Proof Key for Code Exchange) support
- State parameter validation

### Production Security Checklist

- [ ] Set strong `TOKEN_ENCRYPTION_KEY`
- [ ] Configure secure `SESSION_SECRET`
- [ ] Use HTTPS for all OAuth redirects
- [ ] Implement rate limiting
- [ ] Monitor for suspicious activity
- [ ] Regular token rotation
- [ ] Audit access logs

## Troubleshooting

### Common Issues

#### 1. "Invalid OAuth credentials" Error

**Cause**: Missing or incorrect Google Cloud credentials
**Solution**:
- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- Check Google Cloud Console project setup
- Ensure OAuth2 credentials are correctly configured

#### 2. "Redirect URI mismatch" Error

**Cause**: OAuth redirect URI not authorized
**Solution**:
- Add redirect URI to Google Cloud Console
- Ensure exact match including protocol and port
- Check for trailing slashes

#### 3. "Insufficient scope" Error

**Cause**: Required Google Voice permissions not granted
**Solution**:
- Re-run OAuth flow with `prompt=consent`
- Verify required scopes in Google Cloud Console
- Check API enablement status

#### 4. Sync Process Stalled

**Cause**: Rate limiting or network issues
**Solution**:
- Check sync status for errors
- Monitor rate limit usage
- Restart sync if necessary

#### 5. Customer Matching Issues

**Cause**: Phone number format variations
**Solution**:
- Verify phone number normalization
- Check alternate phone number fields
- Enable fuzzy matching if needed

### Debug Mode

Enable detailed logging by setting:
```bash
NODE_ENV=development
LOG_LEVEL=debug
```

### Health Check

Test system health:
```bash
GET /api/google-voice/test/:tokenId
```

## Production Deployment

### Environment Setup

1. **Google Cloud Configuration**:
   - Use production Google Cloud project
   - Configure production domain redirects
   - Set up monitoring and alerting

2. **Environment Variables**:
   ```bash
   NODE_ENV=production
   GOOGLE_CLIENT_ID=prod_client_id
   GOOGLE_CLIENT_SECRET=prod_client_secret
   GOOGLE_REDIRECT_URI=https://yourdomain.com/api/google-voice/auth/callback
   TOKEN_ENCRYPTION_KEY=secure_random_key_32_chars
   SESSION_SECRET=secure_session_secret
   ```

3. **Database**:
   - Run production migrations
   - Set up database backups
   - Configure connection pooling

### Monitoring

Set up monitoring for:
- OAuth token expiration
- API rate limit usage
- Sync process failures
- Authentication errors
- System performance metrics

### Scaling Considerations

- Implement job queue for sync processes
- Database connection pooling
- Redis for session management
- Load balancer configuration
- Background task processing

### Backup Strategy

- Regular database backups
- OAuth token backup and recovery
- Configuration backup
- Disaster recovery procedures

## Support and Maintenance

### Regular Maintenance Tasks

- Monitor API quota usage
- Clean up old sync records
- Update OAuth tokens
- Review error logs
- Performance optimization

### Monitoring Checklist

- [ ] OAuth token health
- [ ] API rate limit status
- [ ] Sync process success rate
- [ ] Customer matching accuracy
- [ ] System performance metrics
- [ ] Error rate tracking

### Getting Help

For technical support:
1. Check error logs and monitoring dashboards
2. Review this documentation
3. Test with the setup wizard
4. Check Google Cloud Console for API issues
5. Contact development team with specific error details

---

*Last updated: January 2025*
*Version: 1.0.0*