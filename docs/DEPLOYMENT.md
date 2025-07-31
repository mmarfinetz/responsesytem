# Deployment Guide

## Production Deployment Checklist

### Pre-Deployment

#### 1. Environment Configuration
- [ ] Copy `.env.example` files and configure production values
- [ ] Generate secure JWT secret (minimum 32 characters)
- [ ] Configure production database (PostgreSQL recommended)
- [ ] Set up external API keys (Anthropic, Google Cloud)
- [ ] Configure CORS origins for production domains

#### 2. Database Setup
- [ ] Create production database
- [ ] Run migrations: `npm run db:migrate`
- [ ] Create admin user account
- [ ] Configure database backups

#### 3. Security Configuration
- [ ] Enable HTTPS/SSL certificates
- [ ] Configure rate limiting for production load
- [ ] Set up monitoring and alerting
- [ ] Configure log aggregation
- [ ] Review security headers

### Deployment Steps

#### Option 1: Docker Deployment (Recommended)

```dockerfile
# Dockerfile example
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 3001
CMD ["npm", "start"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://...
    depends_on:
      - db
  
  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=plumbing_ai
      - POSTGRES_USER=...
      - POSTGRES_PASSWORD=...
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

#### Option 2: Traditional Server Deployment

```bash
# On production server
git clone <repository>
cd plumbing-voice-ai

# Install dependencies
npm install

# Build application
npm run build

# Start with PM2 (process manager)
npm install -g pm2
pm2 start ecosystem.config.js
```

### Post-Deployment

#### 1. Health Checks
- [ ] Verify API endpoints respond: `GET /health`
- [ ] Test authentication flow
- [ ] Verify database connectivity
- [ ] Test webhook endpoints

#### 2. Monitoring Setup
- [ ] Configure application monitoring (New Relic, DataDog, etc.)
- [ ] Set up log monitoring
- [ ] Configure uptime monitoring
- [ ] Set up error alerting

#### 3. Performance Optimization
- [ ] Enable gzip compression
- [ ] Configure CDN for static assets
- [ ] Implement database connection pooling
- [ ] Set up Redis for caching (optional)

## Environment Variables Reference

### Backend (.env)
```bash
# Required
NODE_ENV=production
PORT=3001
DATABASE_URL=postgresql://user:pass@host:5432/db
JWT_SECRET=your-super-secure-secret
ANTHROPIC_API_KEY=your-claude-api-key

# Google Voice API
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=https://yourdomain.com/auth/google/callback

# Optional
CORS_ORIGIN=https://yourdomain.com
LOG_LEVEL=info
RATE_LIMIT_MAX_REQUESTS=1000
```

### Frontend (.env)
```bash
VITE_API_URL=https://api.yourdomain.com
VITE_API_KEY=your-api-key
```

## Database Migration to PostgreSQL

### 1. Install PostgreSQL
```bash
# Ubuntu/Debian
sudo apt-get install postgresql postgresql-contrib

# macOS
brew install postgresql
```

### 2. Update Configuration
```bash
# Update backend/.env
DATABASE_TYPE=postgresql
DATABASE_URL=postgresql://username:password@localhost:5432/plumbing_ai
```

### 3. Run Migrations
```bash
npm run db:migrate
npm run db:seed
```

## SSL/HTTPS Configuration

### Using Let's Encrypt (Recommended)
```bash
# Install Certbot
sudo apt-get install certbot

# Generate certificate
sudo certbot certonly --standalone -d yourdomain.com

# Configure auto-renewal
sudo crontab -e
# Add: 0 12 * * * /usr/bin/certbot renew --quiet
```

### Configure HTTPS in Application
```javascript
// In production, use HTTPS server
import https from 'https';
import fs from 'fs';

const options = {
  key: fs.readFileSync('/etc/letsencrypt/live/yourdomain.com/privkey.pem'),
  cert: fs.readFileSync('/etc/letsencrypt/live/yourdomain.com/fullchain.pem')
};

https.createServer(options, app).listen(443);
```

## Load Balancing & Scaling

### Nginx Configuration
```nginx
upstream backend {
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
}

server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### PM2 Cluster Mode
```json
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'plumbing-voice-ai',
    script: './dist/app.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    }
  }]
};
```

## Backup Strategy

### Database Backups
```bash
#!/bin/bash
# backup.sh
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="backup_$DATE.sql"

pg_dump $DATABASE_URL > $BACKUP_FILE
aws s3 cp $BACKUP_FILE s3://your-backup-bucket/

# Keep only last 30 days
find . -name "backup_*.sql" -mtime +30 -delete
```

### Automated Backups
```bash
# Add to crontab
0 2 * * * /path/to/backup.sh
```

## Monitoring & Alerting

### Application Monitoring
```javascript
// Example with Winston + Elasticsearch
import winston from 'winston';
import { ElasticsearchTransport } from 'winston-elasticsearch';

const logger = winston.createLogger({
  transports: [
    new ElasticsearchTransport({
      level: 'info',
      clientOpts: { node: 'http://localhost:9200' },
      index: 'plumbing-ai-logs'
    })
  ]
});
```

### Health Check Endpoint
```javascript
app.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      database: await checkDatabase(),
      redis: await checkRedis(),
      externalApis: await checkExternalApis()
    }
  };
  
  const isHealthy = Object.values(health.checks).every(check => check.status === 'ok');
  res.status(isHealthy ? 200 : 503).json(health);
});
```

## Performance Optimization

### Database Optimization
```sql
-- Add indexes for better performance
CREATE INDEX CONCURRENTLY idx_customers_phone ON customers(phone);
CREATE INDEX CONCURRENTLY idx_conversations_last_message ON conversations(last_message_at);
CREATE INDEX CONCURRENTLY idx_jobs_status_created ON jobs(status, created_at);
```

### Redis Caching (Optional)
```javascript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

// Cache frequently accessed data
app.get('/api/customers/:id', async (req, res) => {
  const cached = await redis.get(`customer:${req.params.id}`);
  if (cached) {
    return res.json(JSON.parse(cached));
  }
  
  const customer = await getCustomerFromDB(req.params.id);
  await redis.setex(`customer:${req.params.id}`, 300, JSON.stringify(customer));
  res.json(customer);
});
```

## Troubleshooting

### Common Issues

#### Database Connection Issues
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check connection
psql $DATABASE_URL -c "SELECT 1"
```

#### High Memory Usage
```bash
# Monitor Node.js memory
node --max-old-space-size=4096 dist/app.js

# Use PM2 memory monitoring
pm2 monit
```

#### API Rate Limiting
```bash
# Check rate limit status
curl -I https://api.yourdomain.com/api/customers
# Look for X-RateLimit-* headers
```

### Log Analysis
```bash
# View application logs
pm2 logs plumbing-voice-ai

# Search for errors
grep "ERROR" /var/log/plumbing-ai/app.log

# Monitor real-time logs
tail -f /var/log/plumbing-ai/app.log
```

## Security Checklist

- [ ] All secrets stored in environment variables (not code)
- [ ] HTTPS enabled with valid SSL certificate
- [ ] Rate limiting configured appropriately
- [ ] Input validation on all endpoints
- [ ] SQL injection protection enabled
- [ ] CORS configured for production domains only
- [ ] Security headers implemented (helmet.js)
- [ ] Regular security updates scheduled
- [ ] Database access restricted to application only
- [ ] Webhook endpoints secured with signature verification

## Rollback Procedure

In case of deployment issues:

1. **Stop new version**
   ```bash
   pm2 stop plumbing-voice-ai
   ```

2. **Restore previous version**
   ```bash
   git checkout previous-stable-tag
   npm install
   npm run build
   pm2 restart plumbing-voice-ai
   ```

3. **Rollback database if needed**
   ```bash
   # Restore from latest backup
   psql $DATABASE_URL < backup_YYYYMMDD_HHMMSS.sql
   ```

4. **Verify rollback**
   ```bash
   curl https://api.yourdomain.com/health
   ```

## Support & Maintenance

### Regular Maintenance Tasks
- Weekly: Review error logs and performance metrics
- Monthly: Update dependencies and security patches
- Quarterly: Review and rotate API keys and secrets
- Yearly: Security audit and penetration testing

### Monitoring Dashboards
Set up dashboards for:
- Application performance (response times, throughput)
- Business metrics (new customers, job completion rates)
- System health (CPU, memory, disk usage)
- Error rates and types

For additional support, refer to the main README.md or contact the development team.