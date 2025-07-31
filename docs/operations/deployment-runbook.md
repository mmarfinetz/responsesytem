# Deployment Runbook

## Overview

This runbook provides comprehensive procedures for deploying the Plumbing Business AI Platform to production environments. It covers pre-deployment checks, deployment procedures, rollback strategies, and post-deployment validation.

## Table of Contents

1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Environment Preparation](#environment-preparation)
3. [Deployment Procedures](#deployment-procedures)
4. [Database Migration](#database-migration)
5. [Service Configuration](#service-configuration)
6. [Monitoring Setup](#monitoring-setup)
7. [Rollback Procedures](#rollback-procedures)
8. [Post-Deployment Validation](#post-deployment-validation)
9. [Troubleshooting](#troubleshooting)

## Pre-Deployment Checklist

### Code and Testing
- [ ] All tests pass (unit, integration, load, security)
- [ ] Code review completed and approved
- [ ] Security scan completed with no critical issues
- [ ] Performance testing meets requirements
- [ ] Documentation updated
- [ ] Change log updated

### Infrastructure
- [ ] Target environment available and healthy
- [ ] Database backup completed
- [ ] Monitoring systems operational
- [ ] Load balancer configured
- [ ] SSL certificates valid and up-to-date
- [ ] DNS records configured correctly

### Dependencies
- [ ] External API integrations tested
- [ ] Third-party service status verified
- [ ] Environment variables configured
- [ ] Secrets management verified
- [ ] Resource quotas sufficient

### Team Coordination
- [ ] Deployment window scheduled
- [ ] Stakeholders notified
- [ ] On-call team identified
- [ ] Communication channels established
- [ ] Rollback plan reviewed

## Environment Preparation

### 1. Infrastructure Setup

```bash
#!/bin/bash
# infrastructure-setup.sh

set -e

echo "Setting up production infrastructure..."

# Create namespace
kubectl create namespace plumbing-ai-prod || true

# Apply infrastructure manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml

# Setup database
kubectl apply -f k8s/postgres.yaml

# Setup Redis
kubectl apply -f k8s/redis.yaml

# Wait for infrastructure to be ready
kubectl wait --for=condition=ready pod -l app=postgres -n plumbing-ai-prod --timeout=300s
kubectl wait --for=condition=ready pod -l app=redis -n plumbing-ai-prod --timeout=300s

echo "Infrastructure setup completed"
```

### 2. Database Preparation

```bash
#!/bin/bash
# database-setup.sh

set -e

DB_HOST=${DB_HOST:-localhost}
DB_NAME=${DB_NAME:-plumbing_ai_prod}
DB_USER=${DB_USER:-plumbing_admin}
BACKUP_DIR=${BACKUP_DIR:-/backups}

echo "Preparing database for deployment..."

# Create backup of current database
echo "Creating database backup..."
pg_dump -h $DB_HOST -U $DB_USER -d $DB_NAME > "$BACKUP_DIR/pre_deploy_$(date +%Y%m%d_%H%M%S).sql"

# Verify backup
echo "Verifying backup..."
if [ ! -f "$BACKUP_DIR/pre_deploy_$(date +%Y%m%d)_*.sql" ]; then
    echo "ERROR: Backup verification failed"
    exit 1
fi

# Test database connection
echo "Testing database connection..."
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT 1" > /dev/null

echo "Database preparation completed"
```

### 3. Environment Variables Setup

```bash
#!/bin/bash
# setup-environment.sh

set -e

ENVIRONMENT=${1:-production}
CONFIG_DIR="./config/environments"

echo "Setting up environment: $ENVIRONMENT"

# Load environment-specific configuration
if [ ! -f "$CONFIG_DIR/$ENVIRONMENT.env" ]; then
    echo "ERROR: Environment file not found: $CONFIG_DIR/$ENVIRONMENT.env"
    exit 1
fi

# Create Kubernetes secrets from environment file
kubectl create secret generic plumbing-ai-secrets \
    --from-env-file="$CONFIG_DIR/$ENVIRONMENT.env" \
    --namespace=plumbing-ai-prod \
    --dry-run=client -o yaml | kubectl apply -f -

# Verify secrets were created
kubectl get secrets -n plumbing-ai-prod | grep plumbing-ai-secrets

echo "Environment setup completed"
```

## Deployment Procedures

### 1. Zero-Downtime Deployment

```bash
#!/bin/bash
# deploy.sh

set -e

VERSION=${1:-latest}
ENVIRONMENT=${2:-production}
NAMESPACE="plumbing-ai-prod"

echo "Starting deployment of version $VERSION to $ENVIRONMENT"

# Step 1: Pre-deployment health check
echo "Performing pre-deployment health check..."
kubectl get pods -n $NAMESPACE
kubectl get svc -n $NAMESPACE

# Step 2: Build and push Docker images
echo "Building Docker images..."
docker build -t plumbing-ai/backend:$VERSION ./backend
docker build -t plumbing-ai/frontend:$VERSION ./frontend

echo "Pushing images to registry..."
docker push plumbing-ai/backend:$VERSION
docker push plumbing-ai/frontend:$VERSION

# Step 3: Update Kubernetes manifests with new version
echo "Updating deployment manifests..."
sed -i "s/image: plumbing-ai\/backend:.*/image: plumbing-ai\/backend:$VERSION/" k8s/backend.yaml
sed -i "s/image: plumbing-ai\/frontend:.*/image: plumbing-ai\/frontend:$VERSION/" k8s/frontend.yaml

# Step 4: Apply database migrations
echo "Running database migrations..."
kubectl run db-migrate --image=plumbing-ai/backend:$VERSION \
    --restart=Never \
    --namespace=$NAMESPACE \
    --command -- npm run db:migrate

# Wait for migration to complete
kubectl wait --for=condition=complete job/db-migrate -n $NAMESPACE --timeout=300s

# Step 5: Deploy backend services
echo "Deploying backend services..."
kubectl apply -f k8s/backend.yaml

# Wait for backend deployment to be ready
kubectl rollout status deployment/plumbing-ai-backend -n $NAMESPACE --timeout=600s

# Step 6: Deploy frontend services
echo "Deploying frontend services..."
kubectl apply -f k8s/frontend.yaml

# Wait for frontend deployment to be ready
kubectl rollout status deployment/plumbing-ai-frontend -n $NAMESPACE --timeout=600s

# Step 7: Update ingress if needed
kubectl apply -f k8s/ingress.yaml

echo "Deployment completed successfully"
```

### 2. Blue-Green Deployment

```bash
#!/bin/bash
# blue-green-deploy.sh

set -e

VERSION=${1:-latest}
CURRENT_COLOR=$(kubectl get service plumbing-ai-service -o jsonpath='{.spec.selector.color}' -n plumbing-ai-prod)
NEW_COLOR="blue"

if [ "$CURRENT_COLOR" = "blue" ]; then
    NEW_COLOR="green"
fi

echo "Current environment: $CURRENT_COLOR"
echo "Deploying to: $NEW_COLOR"

# Step 1: Deploy to inactive environment
echo "Deploying version $VERSION to $NEW_COLOR environment..."

# Update deployment manifest with new color and version
sed -i "s/color: .*/color: $NEW_COLOR/" k8s/backend.yaml
sed -i "s/image: plumbing-ai\/backend:.*/image: plumbing-ai\/backend:$VERSION/" k8s/backend.yaml

kubectl apply -f k8s/backend.yaml

# Wait for new deployment to be ready
kubectl rollout status deployment/plumbing-ai-backend-$NEW_COLOR -n plumbing-ai-prod --timeout=600s

# Step 2: Run health checks on new environment
echo "Running health checks on $NEW_COLOR environment..."

# Get pod IP for direct testing
POD_IP=$(kubectl get pod -l app=plumbing-ai-backend,color=$NEW_COLOR -o jsonpath='{.items[0].status.podIP}' -n plumbing-ai-prod)

# Test health endpoint
for i in {1..10}; do
    if curl -f "http://$POD_IP:3001/health" > /dev/null 2>&1; then
        echo "Health check passed"
        break
    fi
    
    if [ $i -eq 10 ]; then
        echo "ERROR: Health checks failed"
        exit 1
    fi
    
    echo "Health check attempt $i failed, retrying..."
    sleep 10
done

# Step 3: Switch traffic to new environment
echo "Switching traffic to $NEW_COLOR environment..."

kubectl patch service plumbing-ai-service -p '{"spec":{"selector":{"color":"'$NEW_COLOR'"}}}' -n plumbing-ai-prod

# Step 4: Monitor new environment
echo "Monitoring new environment for 5 minutes..."
sleep 300

# Check for errors in new environment
ERROR_COUNT=$(kubectl logs -l app=plumbing-ai-backend,color=$NEW_COLOR -n plumbing-ai-prod --since=5m | grep -i error | wc -l)

if [ $ERROR_COUNT -gt 10 ]; then
    echo "ERROR: High error count detected ($ERROR_COUNT errors)"
    echo "Rolling back..."
    kubectl patch service plumbing-ai-service -p '{"spec":{"selector":{"color":"'$CURRENT_COLOR'"}}}' -n plumbing-ai-prod
    exit 1
fi

# Step 5: Clean up old environment
echo "Deployment successful. Cleaning up $CURRENT_COLOR environment..."
kubectl delete deployment plumbing-ai-backend-$CURRENT_COLOR -n plumbing-ai-prod

echo "Blue-green deployment completed successfully"
```

## Database Migration

### 1. Migration Execution

```bash
#!/bin/bash
# run-migrations.sh

set -e

ENVIRONMENT=${1:-production}
DRY_RUN=${2:-false}

echo "Running database migrations for $ENVIRONMENT environment"

if [ "$DRY_RUN" = "true" ]; then
    echo "DRY RUN MODE - No changes will be made"
fi

# Step 1: Create migration backup
echo "Creating pre-migration backup..."
BACKUP_FILE="pre_migration_$(date +%Y%m%d_%H%M%S).sql"
kubectl exec -it postgres-0 -n plumbing-ai-prod -- pg_dump -U plumbing_admin plumbing_ai_prod > "/backups/$BACKUP_FILE"

# Step 2: Check current migration status
echo "Checking current migration status..."
kubectl run migration-check --image=plumbing-ai/backend:latest \
    --restart=Never \
    --namespace=plumbing-ai-prod \
    --command -- npm run db:migrate:status

# Step 3: Run migrations
if [ "$DRY_RUN" != "true" ]; then
    echo "Executing migrations..."
    kubectl run migration-execute --image=plumbing-ai/backend:latest \
        --restart=Never \
        --namespace=plumbing-ai-prod \
        --command -- npm run db:migrate
    
    # Wait for migration to complete
    kubectl wait --for=condition=complete job/migration-execute -n plumbing-ai-prod --timeout=600s
    
    # Check migration results
    kubectl logs job/migration-execute -n plumbing-ai-prod
else
    echo "Dry run completed - no migrations executed"
fi

# Step 4: Verify database integrity
echo "Verifying database integrity..."
kubectl run integrity-check --image=plumbing-ai/backend:latest \
    --restart=Never \
    --namespace=plumbing-ai-prod \
    --command -- npm run db:verify

echo "Migration process completed"
```

### 2. Migration Rollback

```bash
#!/bin/bash
# rollback-migration.sh

set -e

BACKUP_FILE=${1}
ENVIRONMENT=${2:-production}

if [ -z "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file not specified"
    echo "Usage: $0 <backup_file> [environment]"
    exit 1
fi

echo "Rolling back database using backup: $BACKUP_FILE"

# Step 1: Verify backup file exists
if [ ! -f "/backups/$BACKUP_FILE" ]; then
    echo "ERROR: Backup file not found: /backups/$BACKUP_FILE"
    exit 1
fi

# Step 2: Stop application to prevent new connections
echo "Scaling down application..."
kubectl scale deployment plumbing-ai-backend --replicas=0 -n plumbing-ai-prod

# Wait for pods to terminate
kubectl wait --for=delete pod -l app=plumbing-ai-backend -n plumbing-ai-prod --timeout=300s

# Step 3: Create current state backup before rollback
echo "Creating pre-rollback backup..."
ROLLBACK_BACKUP="pre_rollback_$(date +%Y%m%d_%H%M%S).sql"
kubectl exec -it postgres-0 -n plumbing-ai-prod -- pg_dump -U plumbing_admin plumbing_ai_prod > "/backups/$ROLLBACK_BACKUP"

# Step 4: Restore from backup
echo "Restoring database from backup..."
kubectl exec -i postgres-0 -n plumbing-ai-prod -- psql -U plumbing_admin -d plumbing_ai_prod < "/backups/$BACKUP_FILE"

# Step 5: Verify restoration
echo "Verifying database restoration..."
kubectl run db-verify --image=plumbing-ai/backend:latest \
    --restart=Never \
    --namespace=plumbing-ai-prod \
    --command -- npm run db:verify

# Step 6: Restart application
echo "Restarting application..."
kubectl scale deployment plumbing-ai-backend --replicas=3 -n plumbing-ai-prod

# Wait for application to be ready
kubectl rollout status deployment/plumbing-ai-backend -n plumbing-ai-prod --timeout=300s

echo "Database rollback completed successfully"
echo "Pre-rollback backup saved as: $ROLLBACK_BACKUP"
```

## Service Configuration

### 1. Configuration Management

```bash
#!/bin/bash
# configure-services.sh

set -e

ENVIRONMENT=${1:-production}
CONFIG_DIR="./config"

echo "Configuring services for $ENVIRONMENT environment"

# Step 1: Apply ConfigMaps
echo "Applying configuration maps..."
kubectl apply -f $CONFIG_DIR/configmap.yaml

# Step 2: Configure monitoring
echo "Setting up monitoring configuration..."
kubectl apply -f config/prometheus/
kubectl apply -f config/grafana/

# Step 3: Configure alerting
echo "Setting up alerting rules..."
kubectl apply -f config/alerting/

# Step 4: Configure service mesh (if using Istio)
if kubectl get namespace istio-system > /dev/null 2>&1; then
    echo "Configuring service mesh..."
    kubectl apply -f config/istio/
fi

# Step 5: Configure ingress and SSL
echo "Configuring ingress and SSL certificates..."
kubectl apply -f k8s/ingress.yaml

# Verify SSL certificate
kubectl get certificate -n plumbing-ai-prod

echo "Service configuration completed"
```

### 2. Environment-Specific Configuration

```yaml
# config/environments/production.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: plumbing-ai-config
  namespace: plumbing-ai-prod
data:
  NODE_ENV: "production"
  LOG_LEVEL: "info"
  
  # Database configuration
  DB_HOST: "postgres-service.plumbing-ai-prod.svc.cluster.local"
  DB_PORT: "5432"
  DB_NAME: "plumbing_ai_prod"
  DB_SSL: "true"
  DB_POOL_SIZE: "20"
  
  # Redis configuration
  REDIS_HOST: "redis-service.plumbing-ai-prod.svc.cluster.local"
  REDIS_PORT: "6379"
  REDIS_CLUSTER_MODE: "false"
  
  # API configuration
  API_PORT: "3001"
  API_CORS_ORIGIN: "https://app.plumbingai.com"
  API_RATE_LIMIT: "1000"
  
  # AI service configuration
  ANTHROPIC_API_URL: "https://api.anthropic.com"
  AI_RESPONSE_TIMEOUT: "30000"
  AI_MAX_TOKENS: "1000"
  
  # Monitoring configuration
  METRICS_ENABLED: "true"
  METRICS_PORT: "9090"
  HEALTH_CHECK_PATH: "/health"
  
  # External integrations
  GOOGLE_VOICE_WEBHOOK_URL: "https://api.plumbingai.com/webhooks/google-voice"
  TWILIO_WEBHOOK_URL: "https://api.plumbingai.com/webhooks/twilio"
  
  # Business configuration
  BUSINESS_HOURS_START: "08:00"
  BUSINESS_HOURS_END: "18:00"
  EMERGENCY_RESPONSE_TIME: "30"
  DEFAULT_WARRANTY_MONTHS: "12"
```

## Monitoring Setup

### 1. Application Monitoring

```bash
#!/bin/bash
# setup-monitoring.sh

set -e

echo "Setting up comprehensive monitoring..."

# Step 1: Install Prometheus
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install prometheus prometheus-community/kube-prometheus-stack \
    --namespace monitoring \
    --create-namespace \
    --values config/prometheus/values.yaml

# Step 2: Install Grafana dashboards
kubectl apply -f config/grafana/dashboards/

# Step 3: Setup application metrics
kubectl apply -f config/monitoring/servicemonitor.yaml

# Step 4: Configure alerts
kubectl apply -f config/monitoring/alerts.yaml

# Step 5: Setup log aggregation
helm install loki grafana/loki-stack \
    --namespace logging \
    --create-namespace \
    --values config/loki/values.yaml

# Step 6: Configure application logging
kubectl apply -f config/logging/fluent-bit.yaml

echo "Monitoring setup completed"

# Verify monitoring stack
kubectl get pods -n monitoring
kubectl get pods -n logging
```

### 2. Custom Metrics Configuration

```yaml
# config/monitoring/servicemonitor.yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: plumbing-ai-metrics
  namespace: plumbing-ai-prod
spec:
  selector:
    matchLabels:
      app: plumbing-ai-backend
  endpoints:
  - port: metrics
    interval: 30s
    path: /metrics
    honorLabels: true
---
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: plumbing-ai-alerts
  namespace: plumbing-ai-prod
spec:
  groups:
  - name: plumbing-ai
    rules:
    - alert: HighErrorRate
      expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: "High error rate detected"
        description: "Error rate is {{ $value }} errors per second"
    
    - alert: ResponseTimeHigh
      expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
      for: 10m
      labels:
        severity: warning
      annotations:
        summary: "High response time detected"
        description: "95th percentile response time is {{ $value }}s"
    
    - alert: DatabaseConnectionsHigh
      expr: pg_stat_database_numbackends > 80
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: "High database connection count"
        description: "Database has {{ $value }} active connections"
```

## Rollback Procedures

### 1. Application Rollback

```bash
#!/bin/bash
# rollback-application.sh

set -e

PREVIOUS_VERSION=${1}
ENVIRONMENT=${2:-production}
NAMESPACE="plumbing-ai-prod"

if [ -z "$PREVIOUS_VERSION" ]; then
    echo "ERROR: Previous version not specified"
    echo "Usage: $0 <previous_version> [environment]"
    echo ""
    echo "Available versions:"
    kubectl rollout history deployment/plumbing-ai-backend -n $NAMESPACE
    exit 1
fi

echo "Rolling back to version: $PREVIOUS_VERSION"

# Step 1: Check current deployment status
echo "Current deployment status:"
kubectl get deployments -n $NAMESPACE

# Step 2: Perform rollback
echo "Executing rollback..."

if [ "$PREVIOUS_VERSION" = "previous" ]; then
    # Rollback to previous version
    kubectl rollout undo deployment/plumbing-ai-backend -n $NAMESPACE
    kubectl rollout undo deployment/plumbing-ai-frontend -n $NAMESPACE
else
    # Rollback to specific version
    kubectl rollout undo deployment/plumbing-ai-backend --to-revision=$PREVIOUS_VERSION -n $NAMESPACE
    kubectl rollout undo deployment/plumbing-ai-frontend --to-revision=$PREVIOUS_VERSION -n $NAMESPACE
fi

# Step 3: Wait for rollback to complete
echo "Waiting for rollback to complete..."
kubectl rollout status deployment/plumbing-ai-backend -n $NAMESPACE --timeout=600s
kubectl rollout status deployment/plumbing-ai-frontend -n $NAMESPACE --timeout=600s

# Step 4: Verify rollback
echo "Verifying rollback..."
kubectl get pods -n $NAMESPACE

# Step 5: Run health checks
echo "Running health checks..."
sleep 30

HEALTH_CHECK_RESULT=$(kubectl exec -n $NAMESPACE deployment/plumbing-ai-backend -- curl -f http://localhost:3001/health)

if echo "$HEALTH_CHECK_RESULT" | grep -q '"status":"healthy"'; then
    echo "✅ Rollback completed successfully"
    echo "Application is healthy and responding"
else
    echo "❌ Rollback verification failed"
    echo "Health check result: $HEALTH_CHECK_RESULT"
    exit 1
fi

# Step 6: Notify team
echo "Sending rollback notification..."
curl -X POST "$SLACK_WEBHOOK_URL" -H 'Content-type: application/json' \
    --data '{"text":"🔄 Application rollback completed successfully to version '$PREVIOUS_VERSION' in '$ENVIRONMENT' environment"}'

echo "Rollback procedure completed"
```

### 2. Emergency Rollback

```bash
#!/bin/bash
# emergency-rollback.sh

set -e

echo "🚨 EMERGENCY ROLLBACK INITIATED 🚨"

NAMESPACE="plumbing-ai-prod"

# Step 1: Immediate rollback to last known good version
echo "Rolling back to last known good version..."
kubectl rollout undo deployment/plumbing-ai-backend -n $NAMESPACE
kubectl rollout undo deployment/plumbing-ai-frontend -n $NAMESPACE

# Step 2: Scale up replicas for faster recovery
echo "Scaling up for faster recovery..."
kubectl scale deployment plumbing-ai-backend --replicas=5 -n $NAMESPACE
kubectl scale deployment plumbing-ai-frontend --replicas=3 -n $NAMESPACE

# Step 3: Wait for rollback (shorter timeout for emergency)
echo "Waiting for emergency rollback..."
kubectl rollout status deployment/plumbing-ai-backend -n $NAMESPACE --timeout=300s
kubectl rollout status deployment/plumbing-ai-frontend -n $NAMESPACE --timeout=300s

# Step 4: Immediate health verification
echo "Verifying system health..."
for i in {1..5}; do
    if kubectl exec -n $NAMESPACE deployment/plumbing-ai-backend -- curl -f http://localhost:3001/health > /dev/null 2>&1; then
        echo "✅ Emergency rollback successful - system is responding"
        break
    fi
    
    if [ $i -eq 5 ]; then
        echo "❌ Emergency rollback failed - system still unhealthy"
        echo "ESCALATING TO OPERATIONS TEAM"
        # Send urgent alert
        curl -X POST "$EMERGENCY_WEBHOOK_URL" -H 'Content-type: application/json' \
            --data '{"text":"🚨 CRITICAL: Emergency rollback failed - immediate intervention required", "channel": "#ops-emergency"}'
        exit 1
    fi
    
    echo "Health check $i failed, retrying..."
    sleep 10
done

# Step 5: Emergency notification
echo "Sending emergency notification..."
curl -X POST "$SLACK_WEBHOOK_URL" -H 'Content-type: application/json' \
    --data '{"text":"🚨 Emergency rollback completed - system restored to previous version", "channel": "#ops-alerts"}'

echo "Emergency rollback completed successfully"
```

## Post-Deployment Validation

### 1. Comprehensive Health Check

```bash
#!/bin/bash
# post-deployment-validation.sh

set -e

ENVIRONMENT=${1:-production}
NAMESPACE="plumbing-ai-prod"

echo "Starting post-deployment validation for $ENVIRONMENT..."

# Test results array
declare -a TEST_RESULTS=()

# Function to run test and record result
run_test() {
    local test_name="$1"
    local test_command="$2"
    
    echo "Running test: $test_name"
    
    if eval "$test_command"; then
        echo "✅ $test_name - PASSED"
        TEST_RESULTS+=("PASS:$test_name")
        return 0
    else
        echo "❌ $test_name - FAILED"
        TEST_RESULTS+=("FAIL:$test_name")
        return 1
    fi
}

# Step 1: Infrastructure validation
run_test "Pod Health Check" "kubectl get pods -n $NAMESPACE | grep -v Terminating | grep Running | wc -l | grep -q '^[1-9]'"
run_test "Service Endpoints" "kubectl get endpoints -n $NAMESPACE | grep -q plumbing-ai"
run_test "Ingress Status" "kubectl get ingress -n $NAMESPACE | grep -q plumbing-ai"

# Step 2: Application health validation
run_test "Backend Health Endpoint" "kubectl exec -n $NAMESPACE deployment/plumbing-ai-backend -- curl -f http://localhost:3001/health"
run_test "Frontend Accessibility" "curl -f https://app.plumbingai.com/health"
run_test "API Authentication" "curl -f -H 'Authorization: Bearer test-token' https://api.plumbingai.com/v1/health"

# Step 3: Database validation
run_test "Database Connection" "kubectl exec -n $NAMESPACE deployment/plumbing-ai-backend -- npm run db:test-connection"
run_test "Migration Status" "kubectl exec -n $NAMESPACE deployment/plumbing-ai-backend -- npm run db:migrate:status"
run_test "Database Integrity" "kubectl exec -n $NAMESPACE deployment/plumbing-ai-backend -- npm run db:verify"

# Step 4: External integrations validation
run_test "Google Voice Integration" "kubectl exec -n $NAMESPACE deployment/plumbing-ai-backend -- npm run test:integration:google-voice"
run_test "AI Service Integration" "kubectl exec -n $NAMESPACE deployment/plumbing-ai-backend -- npm run test:integration:ai"
run_test "Notification Service" "kubectl exec -n $NAMESPACE deployment/plumbing-ai-backend -- npm run test:integration:notifications"

# Step 5: Business functionality validation
run_test "Customer Creation" "curl -f -X POST -H 'Content-Type: application/json' -H 'Authorization: Bearer $API_TOKEN' https://api.plumbingai.com/v1/customers -d '{\"name\":\"Test Customer\",\"phone\":\"+15551234567\"}'"
run_test "Job Creation" "curl -f -X POST -H 'Content-Type: application/json' -H 'Authorization: Bearer $API_TOKEN' https://api.plumbingai.com/v1/jobs -d '{\"customerId\":\"test-id\",\"type\":\"service\",\"serviceType\":\"test\",\"description\":\"Test job\"}'"
run_test "AI Response Generation" "curl -f -X POST -H 'Content-Type: application/json' -H 'Authorization: Bearer $API_TOKEN' https://api.plumbingai.com/v1/ai/generate-response -d '{\"conversationId\":\"test-id\"}'"

# Step 6: Performance validation
run_test "Response Time Check" "time curl -f https://api.plumbingai.com/v1/health | grep -q real.*0m[0-2]"
run_test "Load Balancer Health" "curl -f https://api.plumbingai.com/v1/health | grep -q healthy"
run_test "SSL Certificate Validity" "echo | openssl s_client -servername api.plumbingai.com -connect api.plumbingai.com:443 2>/dev/null | openssl x509 -noout -dates | grep 'notAfter' | grep -q $(date -d '+30 days' '+%Y')"

# Step 7: Monitoring validation
run_test "Prometheus Metrics" "curl -f http://prometheus.monitoring.svc.cluster.local:9090/api/v1/query?query=up{job=\"plumbing-ai-backend\"} | grep -q '\"value\":\\[.*,\"1\"\\]'"
run_test "Log Aggregation" "kubectl logs -n $NAMESPACE deployment/plumbing-ai-backend --tail=10 | grep -q 'Server started'"
run_test "Alert Manager" "curl -f http://alertmanager.monitoring.svc.cluster.local:9093/api/v1/status | grep -q '\"status\":\"success\"'"

# Results summary
echo ""
echo "========================================="
echo "DEPLOYMENT VALIDATION SUMMARY"
echo "========================================="

PASSED_TESTS=0
FAILED_TESTS=0

for result in "${TEST_RESULTS[@]}"; do
    if [[ $result == PASS:* ]]; then
        ((PASSED_TESTS++))
    else
        ((FAILED_TESTS++))
        echo "❌ ${result#FAIL:}"
    fi
done

echo "Total tests: $((PASSED_TESTS + FAILED_TESTS))"
echo "Passed: $PASSED_TESTS"
echo "Failed: $FAILED_TESTS"

if [ $FAILED_TESTS -eq 0 ]; then
    echo ""
    echo "🎉 ALL TESTS PASSED - DEPLOYMENT VALIDATED SUCCESSFULLY"
    
    # Send success notification
    curl -X POST "$SLACK_WEBHOOK_URL" -H 'Content-type: application/json' \
        --data '{"text":"✅ Deployment validation completed successfully - all systems operational", "channel": "#deployments"}'
    
    exit 0
else
    echo ""
    echo "🚨 DEPLOYMENT VALIDATION FAILED - $FAILED_TESTS test(s) failed"
    
    # Send failure notification
    curl -X POST "$SLACK_WEBHOOK_URL" -H 'Content-type: application/json' \
        --data '{"text":"❌ Deployment validation failed - '$FAILED_TESTS' test(s) failed. Manual review required.", "channel": "#deployments"}'
    
    exit 1
fi
```

### 2. Performance Validation

```bash
#!/bin/bash
# performance-validation.sh

set -e

echo "Starting performance validation..."

# Step 1: Load test critical endpoints
echo "Running load tests..."

# Create temporary load test configuration
cat > /tmp/load-test-config.yaml << EOF
scenarios:
  - name: "API Health Check"
    url: "https://api.plumbingai.com/v1/health"
    method: "GET"
    users: 100
    duration: "60s"
    expectedRPS: 50
    maxResponseTime: 200

  - name: "Customer List"
    url: "https://api.plumbingai.com/v1/customers"
    method: "GET"
    headers:
      Authorization: "Bearer $API_TOKEN"
    users: 50
    duration: "60s"
    expectedRPS: 25
    maxResponseTime: 1000

  - name: "Job Creation"
    url: "https://api.plumbingai.com/v1/jobs"
    method: "POST"
    headers:
      Authorization: "Bearer $API_TOKEN"
      Content-Type: "application/json"
    body: '{"customerId":"test-id","type":"service","serviceType":"test","description":"Load test job"}'
    users: 20
    duration: "60s"
    expectedRPS: 10
    maxResponseTime: 2000
EOF

# Run load tests
kubectl run load-test --image=loadimpact/k6 \
    --restart=Never \
    --namespace=plumbing-ai-prod \
    --volume-mount=/tmp/load-test-config.yaml:/config.yaml \
    --command -- k6 run --config /config.yaml

# Step 2: Database performance check
echo "Checking database performance..."
kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- npm run db:performance-test

# Step 3: Memory usage validation
echo "Validating memory usage..."
kubectl top pods -n plumbing-ai-prod

# Step 4: Response time validation
echo "Validating response times..."
for endpoint in "/health" "/customers" "/jobs"; do
    response_time=$(curl -w "@curl-format.txt" -o /dev/null -s "https://api.plumbingai.com/v1$endpoint" -H "Authorization: Bearer $API_TOKEN")
    echo "Endpoint $endpoint response time: $response_time"
done

echo "Performance validation completed"
```

## Troubleshooting

### Common Deployment Issues

#### 1. Pod Startup Failures

```bash
# Diagnose pod startup issues
kubectl describe pod <pod-name> -n plumbing-ai-prod
kubectl logs <pod-name> -n plumbing-ai-prod --previous

# Common fixes:
# - Check resource limits
# - Verify environment variables
# - Check image pull secrets
# - Validate persistent volume claims
```

#### 2. Database Connection Issues

```bash
# Test database connectivity
kubectl exec -it postgres-0 -n plumbing-ai-prod -- psql -U plumbing_admin -d plumbing_ai_prod -c "SELECT 1"

# Check connection pool
kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- npm run db:pool-status

# Common fixes:
# - Verify database credentials
# - Check network policies
# - Validate service DNS resolution
# - Check connection pool configuration
```

#### 3. SSL Certificate Issues

```bash
# Check certificate status
kubectl get certificate -n plumbing-ai-prod
kubectl describe certificate plumbing-ai-tls -n plumbing-ai-prod

# Verify certificate chain
echo | openssl s_client -servername api.plumbingai.com -connect api.plumbingai.com:443

# Common fixes:
# - Renew expired certificates
# - Update DNS records
# - Check cert-manager configuration
# - Validate ingress annotations
```

### Emergency Contacts

- **Operations Team**: ops@plumbingai.com
- **Development Team**: dev@plumbingai.com
- **On-Call Engineer**: +1-555-ON-CALL
- **Slack Channel**: #ops-emergency

### Escalation Procedures

1. **Level 1**: Development team member attempts resolution
2. **Level 2**: Senior engineer and operations team involved
3. **Level 3**: Engineering manager and product owner notified
4. **Level 4**: CTO and executive team involved for critical issues

---

*This runbook should be reviewed and updated regularly to reflect changes in infrastructure, procedures, and lessons learned from deployments.*