# System Troubleshooting Guide

## Overview

This comprehensive troubleshooting guide provides systematic approaches to diagnose and resolve common issues in the Plumbing Business AI Platform. It includes step-by-step procedures, diagnostic tools, and resolution strategies for both technical and non-technical staff.

## Table of Contents

1. [Quick Diagnostic Checklist](#quick-diagnostic-checklist)
2. [Application Issues](#application-issues)
3. [Database Problems](#database-problems)
4. [AI Service Issues](#ai-service-issues)
5. [Integration Problems](#integration-problems)
6. [Performance Issues](#performance-issues)
7. [User Experience Problems](#user-experience-problems)
8. [Emergency Response Issues](#emergency-response-issues)
9. [Monitoring and Alerts](#monitoring-and-alerts)
10. [Escalation Procedures](#escalation-procedures)

## Quick Diagnostic Checklist

### System Health Overview

```bash
#!/bin/bash
# quick-health-check.sh

echo "=== QUICK SYSTEM HEALTH CHECK ==="
echo "Timestamp: $(date)"
echo ""

# 1. API Health
echo "1. API Health Check:"
if curl -f https://api.plumbingai.com/v1/health > /dev/null 2>&1; then
    echo "   ✅ API is responding"
else
    echo "   ❌ API is not responding"
fi

# 2. Database Connectivity
echo "2. Database Check:"
if kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- npm run db:test-connection > /dev/null 2>&1; then
    echo "   ✅ Database is accessible"
else
    echo "   ❌ Database connection failed"
fi

# 3. AI Service
echo "3. AI Service Check:"
if curl -f -H "Authorization: Bearer $API_TOKEN" https://api.plumbingai.com/v1/ai/health > /dev/null 2>&1; then
    echo "   ✅ AI service is operational"
else
    echo "   ❌ AI service is not responding"
fi

# 4. External Integrations
echo "4. External Integrations:"
curl -f https://api.anthropic.com/v1/health > /dev/null 2>&1 && echo "   ✅ Anthropic API" || echo "   ❌ Anthropic API"
curl -f https://www.googleapis.com/oauth2/v1/tokeninfo > /dev/null 2>&1 && echo "   ✅ Google APIs" || echo "   ❌ Google APIs"

# 5. System Resources
echo "5. System Resources:"
kubectl top nodes | head -5
kubectl top pods -n plumbing-ai-prod | head -5

echo ""
echo "=== END HEALTH CHECK ==="
```

### 🚨 Critical System Alerts

| Alert | Immediate Action | Escalation Level |
|-------|------------------|------------------|
| API Down | Run health check script → Check logs → Restart services | Level 2 |
| Database Offline | Check DB pod status → Review logs → Contact DBA | Level 3 |
| High Error Rate | Check recent deployments → Review error logs → Rollback if needed | Level 2 |
| Emergency Service Failure | Activate manual dispatch → Notify management → Emergency hotline | Level 4 |

## Application Issues

### Issue: Application Won't Start

**Symptoms:**
- Pods in CrashLoopBackOff state
- Application returns 500 errors
- Health check endpoints fail

**Diagnostic Steps:**

```bash
# Step 1: Check pod status
kubectl get pods -n plumbing-ai-prod

# Step 2: Examine pod logs
kubectl logs -n plumbing-ai-prod deployment/plumbing-ai-backend --tail=50

# Step 3: Check configuration
kubectl describe configmap plumbing-ai-config -n plumbing-ai-prod

# Step 4: Verify environment variables
kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- env | grep -E "(DB_|API_|NODE_)"
```

**Common Causes & Solutions:**

1. **Missing Environment Variables**
   ```bash
   # Check required environment variables
   kubectl get secrets plumbing-ai-secrets -n plumbing-ai-prod -o yaml
   
   # Fix: Update secrets
   kubectl create secret generic plumbing-ai-secrets \
     --from-env-file=config/production.env \
     --namespace=plumbing-ai-prod \
     --dry-run=client -o yaml | kubectl apply -f -
   ```

2. **Database Connection Failure**
   ```bash
   # Test database connectivity
   kubectl exec -n plumbing-ai-prod postgres-0 -- pg_isready -U plumbing_admin
   
   # Fix: Restart database if needed
   kubectl delete pod postgres-0 -n plumbing-ai-prod
   ```

3. **Insufficient Resources**
   ```bash
   # Check resource usage
   kubectl describe pod -n plumbing-ai-prod | grep -A5 "Resource"
   
   # Fix: Increase resource limits
   kubectl patch deployment plumbing-ai-backend -n plumbing-ai-prod -p '
   {
     "spec": {
       "template": {
         "spec": {
           "containers": [{
             "name": "backend",
             "resources": {
               "limits": {"cpu": "1000m", "memory": "2Gi"},
               "requests": {"cpu": "500m", "memory": "1Gi"}
             }
           }]
         }
       }
     }
   }'
   ```

### Issue: Slow Application Performance

**Symptoms:**
- Response times > 2 seconds
- Timeouts on API calls
- Users report sluggish interface

**Diagnostic Steps:**

```bash
# Check API response times
curl -w "@curl-format.txt" -o /dev/null -s https://api.plumbingai.com/v1/health

# Monitor resource usage
kubectl top pods -n plumbing-ai-prod --sort-by=cpu
kubectl top pods -n plumbing-ai-prod --sort-by=memory

# Check database performance
kubectl exec -n plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -d plumbing_ai_prod -c "
SELECT query, calls, mean_exec_time, total_exec_time 
FROM pg_stat_statements 
ORDER BY total_exec_time DESC 
LIMIT 10;"
```

**Performance Optimization:**

1. **Scale Up Application**
   ```bash
   # Increase replica count
   kubectl scale deployment plumbing-ai-backend --replicas=5 -n plumbing-ai-prod
   
   # Add horizontal pod autoscaler
   kubectl autoscale deployment plumbing-ai-backend \
     --cpu-percent=70 \
     --min=3 --max=10 \
     -n plumbing-ai-prod
   ```

2. **Database Optimization**
   ```bash
   # Run database maintenance
   kubectl exec -n plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -d plumbing_ai_prod -c "
   VACUUM ANALYZE;
   REINDEX DATABASE plumbing_ai_prod;
   "
   
   # Check for missing indexes
   kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- npm run db:analyze-performance
   ```

3. **Enable Caching**
   ```bash
   # Deploy Redis for caching
   kubectl apply -f k8s/redis.yaml
   
   # Update application to use caching
   kubectl set env deployment/plumbing-ai-backend REDIS_ENABLED=true -n plumbing-ai-prod
   ```

## Database Problems

### Issue: Database Connection Failures

**Symptoms:**
- "Connection refused" errors
- Application can't connect to database
- Timeout errors on database queries

**Diagnostic Steps:**

```bash
# Check database pod status
kubectl get pods -n plumbing-ai-prod | grep postgres

# Test database connectivity
kubectl exec -n plumbing-ai-prod postgres-0 -- pg_isready -U plumbing_admin -d plumbing_ai_prod

# Check database logs
kubectl logs -n plumbing-ai-prod postgres-0 --tail=100

# Verify service connectivity
kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- nc -zv postgres-service 5432
```

**Resolution Steps:**

1. **Database Pod Issues**
   ```bash
   # Restart database pod
   kubectl delete pod postgres-0 -n plumbing-ai-prod
   
   # Wait for pod to be ready
   kubectl wait --for=condition=ready pod postgres-0 -n plumbing-ai-prod --timeout=300s
   
   # Verify database is accepting connections
   kubectl exec -n plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -d plumbing_ai_prod -c "SELECT 1"
   ```

2. **Connection Pool Exhaustion**
   ```bash
   # Check active connections
   kubectl exec -n plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -d plumbing_ai_prod -c "
   SELECT count(*) as active_connections, 
          state, 
          application_name 
   FROM pg_stat_activity 
   GROUP BY state, application_name 
   ORDER BY active_connections DESC;"
   
   # Terminate idle connections
   kubectl exec -n plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -d plumbing_ai_prod -c "
   SELECT pg_terminate_backend(pid) 
   FROM pg_stat_activity 
   WHERE state = 'idle' 
   AND query_start < NOW() - INTERVAL '1 hour';"
   ```

3. **Storage Issues**
   ```bash
   # Check disk space
   kubectl exec -n plumbing-ai-prod postgres-0 -- df -h
   
   # Check PostgreSQL data directory
   kubectl exec -n plumbing-ai-prod postgres-0 -- du -sh /var/lib/postgresql/data/*
   
   # Clean up old WAL files if needed
   kubectl exec -n plumbing-ai-prod postgres-0 -- find /var/lib/postgresql/data/pg_wal -name "*.backup" -mtime +7 -delete
   ```

### Issue: Database Performance Degradation

**Symptoms:**
- Slow query responses
- High CPU usage on database
- Lock contention

**Diagnostic Steps:**

```bash
# Check running queries
kubectl exec -n plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -d plumbing_ai_prod -c "
SELECT pid, now() - pg_stat_activity.query_start AS duration, query 
FROM pg_stat_activity 
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes';"

# Check for locks
kubectl exec -n plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -d plumbing_ai_prod -c "
SELECT blocked_locks.pid AS blocked_pid,
       blocked_activity.usename AS blocked_user,
       blocking_locks.pid AS blocking_pid,
       blocking_activity.usename AS blocking_user,
       blocked_activity.query AS blocked_statement,
       blocking_activity.query AS current_statement_in_blocking_process
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks ON blocking_locks.locktype = blocked_locks.locktype
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;"

# Check table statistics
kubectl exec -n plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -d plumbing_ai_prod -c "
SELECT schemaname, tablename, n_tup_ins, n_tup_upd, n_tup_del, last_vacuum, last_autovacuum, last_analyze, last_autoanalyze
FROM pg_stat_user_tables 
ORDER BY n_tup_ins + n_tup_upd + n_tup_del DESC 
LIMIT 10;"
```

**Performance Tuning:**

```bash
# Run maintenance operations
kubectl exec -n plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -d plumbing_ai_prod -c "
VACUUM (VERBOSE, ANALYZE);
REINDEX DATABASE plumbing_ai_prod;
"

# Update PostgreSQL configuration for better performance
kubectl exec -n plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -d plumbing_ai_prod -c "
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;
SELECT pg_reload_conf();
"
```

## AI Service Issues

### Issue: AI Responses Not Generated

**Symptoms:**
- API returns 500 errors for AI endpoints
- AI response generation timeouts
- Poor quality or irrelevant responses

**Diagnostic Steps:**

```bash
# Test AI service health
curl -f -H "Authorization: Bearer $API_TOKEN" https://api.plumbingai.com/v1/ai/health

# Check AI service logs
kubectl logs -n plumbing-ai-prod deployment/plumbing-ai-backend | grep -i "ai\|claude\|anthropic"

# Verify API keys
kubectl get secrets plumbing-ai-secrets -n plumbing-ai-prod -o jsonpath='{.data.ANTHROPIC_API_KEY}' | base64 -d | wc -c

# Test direct API connection
kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- curl -f https://api.anthropic.com/v1/health
```

**Common Fixes:**

1. **API Key Issues**
   ```bash
   # Update Anthropic API key
   kubectl patch secret plumbing-ai-secrets -n plumbing-ai-prod -p '{"data":{"ANTHROPIC_API_KEY":"'$(echo -n "$NEW_ANTHROPIC_KEY" | base64)'"}}'
   
   # Restart pods to pick up new key
   kubectl rollout restart deployment/plumbing-ai-backend -n plumbing-ai-prod
   ```

2. **Rate Limiting**
   ```bash
   # Check rate limit status
   kubectl logs -n plumbing-ai-prod deployment/plumbing-ai-backend | grep -i "rate limit"
   
   # Implement backoff strategy
   kubectl set env deployment/plumbing-ai-backend AI_RETRY_DELAY=5000 -n plumbing-ai-prod
   kubectl set env deployment/plumbing-ai-backend AI_MAX_RETRIES=3 -n plumbing-ai-prod
   ```

3. **Context Window Issues**
   ```bash
   # Reduce context size
   kubectl set env deployment/plumbing-ai-backend AI_MAX_CONTEXT_LENGTH=2000 -n plumbing-ai-prod
   
   # Enable context trimming
   kubectl set env deployment/plumbing-ai-backend AI_TRIM_CONTEXT=true -n plumbing-ai-prod
   ```

### Issue: Poor AI Response Quality

**Symptoms:**
- Irrelevant or generic responses
- AI doesn't understand plumbing context
- Responses don't match customer intent

**Diagnostic Steps:**

```bash
# Test AI classification
curl -X POST https://api.plumbingai.com/v1/ai/classify-message \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messageText": "My kitchen sink is clogged"}'

# Check prompt templates
kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- cat src/ai/prompts/responseGeneration.ts

# Review recent AI interactions
kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- npm run ai:analyze-recent-interactions
```

**Quality Improvements:**

1. **Update Prompts**
   ```bash
   # Deploy updated prompt templates
   kubectl create configmap ai-prompts \
     --from-file=src/ai/prompts/ \
     --namespace=plumbing-ai-prod \
     --dry-run=client -o yaml | kubectl apply -f -
   
   # Restart to load new prompts
   kubectl rollout restart deployment/plumbing-ai-backend -n plumbing-ai-prod
   ```

2. **Improve Context**
   ```bash
   # Enable customer history in AI context
   kubectl set env deployment/plumbing-ai-backend AI_INCLUDE_CUSTOMER_HISTORY=true -n plumbing-ai-prod
   
   # Enable service history context
   kubectl set env deployment/plumbing-ai-backend AI_INCLUDE_SERVICE_HISTORY=true -n plumbing-ai-prod
   ```

## Integration Problems

### Issue: Google Voice Integration Failure

**Symptoms:**
- Messages not received from Google Voice
- Outbound messages not sent
- Authentication errors

**Diagnostic Steps:**

```bash
# Check Google Voice integration status
kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- npm run test:integration:google-voice

# Verify OAuth tokens
kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- npm run google-voice:check-tokens

# Test webhook endpoint
curl -X POST https://api.plumbingai.com/webhooks/google-voice \
  -H "Content-Type: application/json" \
  -d '{"test": true}'

# Check recent webhook deliveries
kubectl logs -n plumbing-ai-prod deployment/plumbing-ai-backend | grep "webhook" | tail -20
```

**Resolution Steps:**

1. **OAuth Token Refresh**
   ```bash
   # Refresh OAuth tokens
   kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- npm run google-voice:refresh-tokens
   
   # Update webhook URL in Google Voice
   kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- npm run google-voice:update-webhook-url
   ```

2. **Webhook Configuration**
   ```bash
   # Verify webhook signature validation
   kubectl set env deployment/plumbing-ai-backend GOOGLE_VOICE_WEBHOOK_SECRET="$NEW_WEBHOOK_SECRET" -n plumbing-ai-prod
   
   # Update Google Voice webhook settings
   kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- npm run google-voice:configure-webhook
   ```

### Issue: Payment Processing Integration

**Symptoms:**
- Payment transactions failing
- Credit card processing errors
- Invoice generation problems

**Diagnostic Steps:**

```bash
# Test payment gateway connectivity
kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- npm run test:integration:payments

# Check payment processor status
curl https://status.stripe.com/api/v2/status.json

# Review recent payment errors
kubectl logs -n plumbing-ai-prod deployment/plumbing-ai-backend | grep -i "payment\|stripe" | tail -20
```

**Common Fixes:**

1. **API Key Updates**
   ```bash
   # Update payment processor API keys
   kubectl patch secret plumbing-ai-secrets -n plumbing-ai-prod -p '{"data":{"STRIPE_SECRET_KEY":"'$(echo -n "$NEW_STRIPE_KEY" | base64)'"}}'
   
   # Test payment processing
   kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- npm run test:payment-processing
   ```

2. **Webhook Configuration**
   ```bash
   # Update payment webhook endpoint
   curl -X POST https://api.stripe.com/v1/webhook_endpoints \
     -H "Authorization: Bearer $STRIPE_SECRET_KEY" \
     -d "url=https://api.plumbingai.com/webhooks/stripe" \
     -d "enabled_events[]=payment_intent.succeeded"
   ```

## Performance Issues

### Issue: High Response Times

**Symptoms:**
- API response times > 2 seconds
- Dashboard loads slowly
- Mobile app performance issues

**Performance Analysis:**

```bash
# Monitor API response times
curl -w "@curl-format.txt" -o /dev/null -s https://api.plumbingai.com/v1/customers

# Check resource utilization
kubectl top pods -n plumbing-ai-prod --sort-by=cpu
kubectl top pods -n plumbing-ai-prod --sort-by=memory

# Database query performance
kubectl exec -n plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -d plumbing_ai_prod -c "
SELECT query, calls, mean_exec_time, rows
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC
LIMIT 10;"

# Check for N+1 queries
kubectl logs -n plumbing-ai-prod deployment/plumbing-ai-backend | grep -E "SELECT.*FROM.*WHERE.*IN" | wc -l
```

**Performance Optimization:**

1. **Application Scaling**
   ```bash
   # Scale horizontally
   kubectl scale deployment plumbing-ai-backend --replicas=5 -n plumbing-ai-prod
   
   # Enable autoscaling
   kubectl autoscale deployment plumbing-ai-backend \
     --cpu-percent=70 \
     --min=3 --max=10 \
     -n plumbing-ai-prod
   ```

2. **Database Optimization**
   ```bash
   # Add missing indexes
   kubectl exec -n plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -d plumbing_ai_prod -c "
   CREATE INDEX CONCURRENTLY idx_jobs_customer_status ON jobs(customer_id, status);
   CREATE INDEX CONCURRENTLY idx_conversations_phone_active ON conversations(phone_number, status) WHERE status = 'active';
   "
   
   # Optimize queries
   kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- npm run db:optimize-queries
   ```

3. **Caching Implementation**
   ```bash
   # Enable Redis caching
   kubectl set env deployment/plumbing-ai-backend CACHE_ENABLED=true -n plumbing-ai-prod
   kubectl set env deployment/plumbing-ai-backend CACHE_TTL=300 -n plumbing-ai-prod
   
   # Enable CDN for static assets
   kubectl set env deployment/plumbing-ai-frontend CDN_ENABLED=true -n plumbing-ai-prod
   ```

### Issue: Memory Leaks

**Symptoms:**
- Pods getting OOMKilled
- Memory usage continuously increasing
- Application becomes unresponsive

**Memory Leak Detection:**

```bash
# Monitor memory usage over time
kubectl top pods -n plumbing-ai-prod --sort-by=memory
kubectl describe pod -n plumbing-ai-prod | grep -A5 "Memory"

# Check for memory leaks in Node.js
kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- node --expose-gc --inspect=0.0.0.0:9229 dist/app.js &

# Generate heap dump
kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- kill -USR2 1

# Analyze heap dump
kubectl cp plumbing-ai-prod/backend-pod:/heapdump.* ./heapdump.prof
```

**Memory Leak Fixes:**

1. **Increase Memory Limits**
   ```bash
   kubectl patch deployment plumbing-ai-backend -n plumbing-ai-prod -p '
   {
     "spec": {
       "template": {
         "spec": {
           "containers": [{
             "name": "backend",
             "resources": {
               "limits": {"memory": "4Gi"},
               "requests": {"memory": "2Gi"}
             }
           }]
         }
       }
     }
   }'
   ```

2. **Enable Garbage Collection**
   ```bash
   kubectl set env deployment/plumbing-ai-backend NODE_OPTIONS="--max-old-space-size=3072 --optimize-for-size" -n plumbing-ai-prod
   ```

3. **Implement Memory Monitoring**
   ```bash
   kubectl set env deployment/plumbing-ai-backend MEMORY_MONITORING=true -n plumbing-ai-prod
   kubectl set env deployment/plumbing-ai-backend MEMORY_THRESHOLD=80 -n plumbing-ai-prod
   ```

## User Experience Problems

### Issue: Login Problems

**Symptoms:**
- Users can't log in
- Session expires quickly
- Authentication errors

**Diagnostic Steps:**

```bash
# Test authentication endpoint
curl -X POST https://api.plumbingai.com/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'

# Check JWT token validity
echo "$JWT_TOKEN" | cut -d. -f2 | base64 -d | jq .

# Verify user exists in database
kubectl exec -n plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -d plumbing_ai_prod -c "
SELECT id, email, active, last_login_at FROM users WHERE email = 'test@example.com';"
```

**Common Solutions:**

1. **Password Reset**
   ```bash
   # Reset user password
   kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- npm run user:reset-password test@example.com
   ```

2. **Session Configuration**
   ```bash
   # Extend session timeout
   kubectl set env deployment/plumbing-ai-backend JWT_EXPIRY=24h -n plumbing-ai-prod
   
   # Update JWT secret
   kubectl patch secret plumbing-ai-secrets -n plumbing-ai-prod -p '{"data":{"JWT_SECRET":"'$(echo -n "$NEW_JWT_SECRET" | base64)'"}}'
   ```

### Issue: Mobile App Performance

**Symptoms:**
- App crashes frequently
- Slow loading times
- Offline functionality issues

**Mobile Diagnostics:**

```bash
# Check API response times for mobile endpoints
curl -w "@curl-format.txt" -H "User-Agent: PlumbingAI-Mobile/1.0" https://api.plumbingai.com/v1/mobile/dashboard

# Test offline functionality
curl -X POST https://api.plumbingai.com/v1/mobile/sync \
  -H "Authorization: Bearer $MOBILE_TOKEN" \
  -H "Content-Type: application/json"

# Check mobile-specific configurations
kubectl get configmap mobile-config -n plumbing-ai-prod -o yaml
```

**Mobile Optimizations:**

1. **API Response Optimization**
   ```bash
   # Enable response compression
   kubectl set env deployment/plumbing-ai-backend COMPRESSION_ENABLED=true -n plumbing-ai-prod
   
   # Implement pagination for mobile
   kubectl set env deployment/plumbing-ai-backend MOBILE_PAGE_SIZE=20 -n plumbing-ai-prod
   ```

2. **Offline Support**
   ```bash
   # Enable offline data sync
   kubectl set env deployment/plumbing-ai-backend OFFLINE_SYNC_ENABLED=true -n plumbing-ai-prod
   
   # Configure sync interval
   kubectl set env deployment/plumbing-ai-backend SYNC_INTERVAL=300000 -n plumbing-ai-prod
   ```

## Emergency Response Issues

### Issue: Emergency Detection Failures

**Symptoms:**
- Emergency messages not classified correctly
- No alerts generated for urgent issues
- Delayed emergency response

**Emergency System Diagnostics:**

```bash
# Test emergency classification
curl -X POST https://api.plumbingai.com/v1/ai/classify-message \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"messageText": "EMERGENCY! Water flooding basement!"}'

# Check emergency alert system
kubectl logs -n plumbing-ai-prod deployment/plumbing-ai-backend | grep -i emergency

# Verify notification system
kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- npm run test:emergency-notifications
```

**Emergency System Fixes:**

1. **Update Emergency Keywords**
   ```bash
   # Update emergency detection patterns
   kubectl create configmap emergency-keywords \
     --from-file=emergency-keywords.json \
     --namespace=plumbing-ai-prod \
     --dry-run=client -o yaml | kubectl apply -f -
   ```

2. **Fix Notification Delivery**
   ```bash
   # Test SMS notifications
   kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- npm run test:sms-delivery
   
   # Update notification service credentials
   kubectl patch secret plumbing-ai-secrets -n plumbing-ai-prod -p '{"data":{"TWILIO_ACCOUNT_SID":"'$(echo -n "$NEW_TWILIO_SID" | base64)'"}}'
   ```

### Issue: Technician Dispatch Problems

**Symptoms:**
- Technicians not receiving job assignments
- Incorrect location routing
- Schedule conflicts

**Dispatch System Diagnostics:**

```bash
# Check technician availability
kubectl exec -n plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -d plumbing_ai_prod -c "
SELECT id, name, status, current_location, available_until 
FROM technicians 
WHERE status = 'available';"

# Test dispatch algorithm
kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- npm run test:dispatch-algorithm

# Check push notification delivery
kubectl logs -n plumbing-ai-prod deployment/plumbing-ai-backend | grep -i "push notification"
```

**Dispatch System Fixes:**

1. **Update Technician Status**
   ```bash
   # Reset technician availability
   kubectl exec -n plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -d plumbing_ai_prod -c "
   UPDATE technicians 
   SET status = 'available', 
       last_ping = NOW() 
   WHERE last_ping < NOW() - INTERVAL '1 hour';"
   ```

2. **Fix Location Services**
   ```bash
   # Update Google Maps API key
   kubectl patch secret plumbing-ai-secrets -n plumbing-ai-prod -p '{"data":{"GOOGLE_MAPS_API_KEY":"'$(echo -n "$NEW_MAPS_KEY" | base64)'"}}'
   
   # Test location services
   kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- npm run test:location-services
   ```

## Monitoring and Alerts

### Issue: Missing Alerts

**Symptoms:**
- No alerts for system issues
- Monitoring dashboard shows no data
- Log aggregation not working

**Monitoring Diagnostics:**

```bash
# Check Prometheus status
kubectl get pods -n monitoring | grep prometheus

# Test metrics collection
curl http://prometheus.monitoring.svc.cluster.local:9090/api/v1/query?query=up

# Check Grafana connectivity
curl http://grafana.monitoring.svc.cluster.local:3000/api/health

# Verify log collection
kubectl logs -n logging | grep fluent-bit
```

**Monitoring Fixes:**

1. **Restart Monitoring Stack**
   ```bash
   # Restart Prometheus
   kubectl rollout restart deployment/prometheus -n monitoring
   
   # Restart Grafana
   kubectl rollout restart deployment/grafana -n monitoring
   
   # Restart log collector
   kubectl rollout restart daemonset/fluent-bit -n logging
   ```

2. **Update Alert Rules**
   ```bash
   # Apply updated alert rules
   kubectl apply -f config/monitoring/alerts.yaml
   
   # Reload Prometheus configuration
   curl -X POST http://prometheus.monitoring.svc.cluster.local:9090/-/reload
   ```

### Issue: False Positive Alerts

**Symptoms:**
- Too many unnecessary alerts
- Alert fatigue among team
- Important alerts missed due to noise

**Alert Tuning:**

1. **Adjust Alert Thresholds**
   ```yaml
   # Update alert thresholds in config/monitoring/alerts.yaml
   - alert: HighMemoryUsage
     expr: (node_memory_MemTotal_bytes - node_memory_MemAvailable_bytes) / node_memory_MemTotal_bytes > 0.9  # Increased from 0.8
     for: 10m  # Increased from 5m
   ```

2. **Implement Alert Grouping**
   ```yaml
   # Update alertmanager configuration
   groupBy: ['alertname', 'cluster', 'service']
   groupWait: 10s
   groupInterval: 10s
   repeatInterval: 12h
   ```

## Escalation Procedures

### Level 1: Initial Response (0-15 minutes)
**Responder:** On-call engineer
**Actions:**
1. Acknowledge alert within 5 minutes
2. Run quick diagnostic script
3. Attempt immediate fixes for known issues
4. Document actions taken

### Level 2: Technical Escalation (15-30 minutes)
**Responder:** Senior engineer + Team lead
**Actions:**
1. Review Level 1 actions
2. Perform detailed system analysis
3. Implement temporary workarounds
4. Prepare communication for stakeholders

### Level 3: Management Escalation (30-60 minutes)
**Responder:** Engineering manager + Product owner
**Actions:**
1. Assess business impact
2. Coordinate with external vendors if needed
3. Authorize emergency procedures
4. Update executives and customers

### Level 4: Executive Escalation (60+ minutes)
**Responder:** CTO + Executive team
**Actions:**
1. Consider external support contracts
2. Approve significant resource expenditure
3. Manage public communications
4. Post-incident executive review

### Emergency Contacts

```
Level 1 On-Call: +1-555-ONCALL-1
Level 2 Technical: +1-555-TECH-LEAD
Level 3 Management: +1-555-ENG-MGR
Level 4 Executive: +1-555-CTO-HELP

Slack Channels:
- #incidents (all levels)
- #engineering-emergency (Level 2+)
- #executive-alerts (Level 4)

External Support:
- Cloud Provider: 1-800-CLOUD-HELP
- Database Support: 1-800-DB-SUPPORT
- Security Hotline: 1-800-SEC-HELP
```

---

*This troubleshooting guide should be regularly updated based on new issues encountered and solutions developed. All team members should be familiar with the diagnostic procedures relevant to their role and responsibilities.*