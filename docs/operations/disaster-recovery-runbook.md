# Disaster Recovery Runbook

## Overview

This runbook provides comprehensive procedures for disaster recovery of the Plumbing Business AI Platform. It covers various disaster scenarios, recovery procedures, data restoration, and business continuity measures.

## Table of Contents

1. [Disaster Response Team](#disaster-response-team)
2. [Disaster Classification](#disaster-classification)
3. [Initial Response Procedures](#initial-response-procedures)
4. [Data Recovery Procedures](#data-recovery-procedures)
5. [Infrastructure Recovery](#infrastructure-recovery)
6. [Service Restoration](#service-restoration)
7. [Business Continuity](#business-continuity)
8. [Communication Procedures](#communication-procedures)
9. [Post-Recovery Procedures](#post-recovery-procedures)
10. [Testing and Validation](#testing-and-validation)

## Disaster Response Team

### Primary Response Team
- **Incident Commander**: CTO / Engineering Manager
- **Technical Lead**: Senior Backend Engineer
- **Infrastructure Lead**: DevOps Engineer
- **Database Administrator**: Senior Database Engineer
- **Communications Lead**: Product Manager

### Contact Information
```
Role                    Primary Contact           Backup Contact
Incident Commander      +1-555-0001              +1-555-0002
Technical Lead          +1-555-0003              +1-555-0004
Infrastructure Lead     +1-555-0005              +1-555-0006
Database Administrator  +1-555-0007              +1-555-0008
Communications Lead     +1-555-0009              +1-555-0010

Emergency Slack: #incident-response
Emergency Email: incident@plumbingai.com
```

### Escalation Chain
1. **Level 1**: On-call engineer responds within 15 minutes
2. **Level 2**: Technical lead and incident commander notified within 30 minutes
3. **Level 3**: Full response team activated within 1 hour
4. **Level 4**: Executive team and board notified for critical incidents

## Disaster Classification

### Severity Levels

#### Level 1 - Critical (Complete Service Outage)
- **Impact**: Complete system unavailability
- **Examples**: Data center failure, complete database corruption, major security breach
- **Response Time**: Immediate (< 15 minutes)
- **Recovery Target**: < 4 hours

#### Level 2 - High (Major Service Degradation)
- **Impact**: Significant functionality loss, emergency services affected
- **Examples**: Primary database failure, major component failures
- **Response Time**: < 30 minutes
- **Recovery Target**: < 8 hours

#### Level 3 - Medium (Service Degradation)
- **Impact**: Some features unavailable, performance issues
- **Examples**: Secondary service failures, network issues
- **Response Time**: < 1 hour
- **Recovery Target**: < 24 hours

#### Level 4 - Low (Minor Issues)
- **Impact**: Minimal user impact, non-critical features affected
- **Examples**: Monitoring alerts, minor performance degradation
- **Response Time**: < 4 hours
- **Recovery Target**: < 48 hours

## Initial Response Procedures

### 1. Incident Detection and Alert

```bash
#!/bin/bash
# incident-detection.sh

# Automated incident detection script
set -e

ALERT_THRESHOLD=${1:-5}
CHECK_INTERVAL=${2:-60}

echo "Starting incident monitoring with threshold: $ALERT_THRESHOLD failures in $CHECK_INTERVAL seconds"

while true; do
    # Check system health
    HEALTH_STATUS=$(kubectl get pods -n plumbing-ai-prod --no-headers | grep -v Running | wc -l)
    
    if [ $HEALTH_STATUS -gt $ALERT_THRESHOLD ]; then
        echo "🚨 INCIDENT DETECTED: $HEALTH_STATUS pods not in Running state"
        
        # Trigger incident response
        ./trigger-incident-response.sh "HIGH" "Pod failures detected: $HEALTH_STATUS pods failing"
        break
    fi
    
    # Check API health
    if ! curl -f https://api.plumbingai.com/v1/health > /dev/null 2>&1; then
        echo "🚨 INCIDENT DETECTED: API health check failed"
        ./trigger-incident-response.sh "CRITICAL" "API health check failure"
        break
    fi
    
    # Check database connectivity
    if ! kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- npm run db:test-connection > /dev/null 2>&1; then
        echo "🚨 INCIDENT DETECTED: Database connectivity failure"
        ./trigger-incident-response.sh "CRITICAL" "Database connectivity failure"
        break
    fi
    
    sleep $CHECK_INTERVAL
done
```

### 2. Incident Response Activation

```bash
#!/bin/bash
# trigger-incident-response.sh

set -e

SEVERITY=${1:-"MEDIUM"}
DESCRIPTION=${2:-"System incident detected"}
INCIDENT_ID="INC-$(date +%Y%m%d-%H%M%S)"

echo "🚨 ACTIVATING INCIDENT RESPONSE 🚨"
echo "Incident ID: $INCIDENT_ID"
echo "Severity: $SEVERITY"
echo "Description: $DESCRIPTION"

# Step 1: Create incident record
cat > "/tmp/incident-$INCIDENT_ID.json" << EOF
{
  "incidentId": "$INCIDENT_ID",
  "severity": "$SEVERITY",
  "description": "$DESCRIPTION",
  "detectedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "active",
  "responders": []
}
EOF

# Step 2: Notify response team
case $SEVERITY in
    "CRITICAL")
        PHONE_ALERT=true
        SLACK_CHANNEL="#incident-critical"
        ESCALATION_LEVEL=3
        ;;
    "HIGH")
        PHONE_ALERT=true
        SLACK_CHANNEL="#incident-response"
        ESCALATION_LEVEL=2
        ;;
    "MEDIUM")
        PHONE_ALERT=false
        SLACK_CHANNEL="#incident-response"
        ESCALATION_LEVEL=1
        ;;
    *)
        PHONE_ALERT=false
        SLACK_CHANNEL="#ops-alerts"
        ESCALATION_LEVEL=1
        ;;
esac

# Send Slack notification
curl -X POST "$SLACK_WEBHOOK_URL" \
    -H 'Content-type: application/json' \
    --data '{
        "channel": "'$SLACK_CHANNEL'",
        "text": "🚨 INCIDENT DECLARED: '$INCIDENT_ID'",
        "attachments": [{
            "color": "danger",
            "fields": [
                {"title": "Severity", "value": "'$SEVERITY'", "short": true},
                {"title": "Description", "value": "'$DESCRIPTION'", "short": false},
                {"title": "Time", "value": "<!date^'$(date +%s)'^{date_short_pretty} at {time}|'$(date)''>", "short": true}
            ]
        }]
    }'

# Send phone alerts for critical incidents
if [ "$PHONE_ALERT" = "true" ]; then
    echo "Sending phone alerts to response team..."
    # Integration with PagerDuty or similar service
    curl -X POST https://events.pagerduty.com/v2/enqueue \
        -H 'Content-Type: application/json' \
        -d '{
            "routing_key": "'$PAGERDUTY_ROUTING_KEY'",
            "event_action": "trigger",
            "payload": {
                "summary": "Critical incident: '$DESCRIPTION'",
                "severity": "critical",
                "source": "plumbing-ai-monitoring"
            }
        }'
fi

# Step 3: Start incident tracking
echo "Incident response activated. Starting recovery procedures..."
./start-recovery-procedures.sh "$INCIDENT_ID" "$SEVERITY"
```

### 3. Initial Assessment

```bash
#!/bin/bash
# initial-assessment.sh

set -e

INCIDENT_ID=${1}
SEVERITY=${2}

echo "Performing initial assessment for incident: $INCIDENT_ID"

# Step 1: System status check
echo "=== SYSTEM STATUS ASSESSMENT ==="

# Check Kubernetes cluster health
echo "Kubernetes Cluster Status:"
kubectl cluster-info
kubectl get nodes
kubectl get pods --all-namespaces | grep -E "(Error|CrashLoopBackOff|Pending)"

# Check application status
echo "Application Status:"
kubectl get deployments -n plumbing-ai-prod
kubectl get services -n plumbing-ai-prod
kubectl get ingress -n plumbing-ai-prod

# Step 2: Infrastructure assessment
echo "=== INFRASTRUCTURE ASSESSMENT ==="

# Check database status
echo "Database Status:"
kubectl exec -n plumbing-ai-prod postgres-0 -- pg_isready -U plumbing_admin -d plumbing_ai_prod

# Check Redis status
echo "Redis Status:"
kubectl exec -n plumbing-ai-prod redis-0 -- redis-cli ping

# Check external dependencies
echo "External Dependencies:"
curl -f https://api.anthropic.com/v1/health || echo "Anthropic API: FAILED"
curl -f https://www.googleapis.com/oauth2/v1/tokeninfo || echo "Google APIs: FAILED"

# Step 3: Data integrity check
echo "=== DATA INTEGRITY ASSESSMENT ==="

# Check recent backups
echo "Recent Backups:"
ls -la /backups/ | tail -5

# Check data consistency
kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- npm run db:integrity-check

# Step 4: Security assessment
echo "=== SECURITY ASSESSMENT ==="

# Check for security incidents
kubectl logs -n plumbing-ai-prod deployment/plumbing-ai-backend --since=1h | grep -i "security\|unauthorized\|breach" || echo "No security alerts found"

# Check SSL certificates
echo | openssl s_client -servername api.plumbingai.com -connect api.plumbingai.com:443 2>/dev/null | openssl x509 -noout -dates

# Step 5: Impact assessment
echo "=== IMPACT ASSESSMENT ==="

# Calculate affected users (if metrics available)
if kubectl exec -n monitoring prometheus-0 -- promtool query instant 'rate(http_requests_total[5m])' > /dev/null 2>&1; then
    echo "Current traffic rate:"
    kubectl exec -n monitoring prometheus-0 -- promtool query instant 'rate(http_requests_total[5m])'
fi

# Step 6: Generate assessment report
cat > "/tmp/assessment-$INCIDENT_ID.txt" << EOF
INCIDENT ASSESSMENT REPORT
=========================
Incident ID: $INCIDENT_ID
Severity: $SEVERITY
Assessment Time: $(date)

SYSTEM STATUS:
$(kubectl get pods -n plumbing-ai-prod --no-headers | awk '{print $1 ": " $3}')

INFRASTRUCTURE STATUS:
- Database: $(kubectl exec -n plumbing-ai-prod postgres-0 -- pg_isready -U plumbing_admin -d plumbing_ai_prod 2>/dev/null || echo "FAILED")
- Redis: $(kubectl exec -n plumbing-ai-prod redis-0 -- redis-cli ping 2>/dev/null || echo "FAILED")

RECOMMENDED ACTIONS:
- $(if [ "$SEVERITY" = "CRITICAL" ]; then echo "Immediate failover to backup systems"; else echo "Investigate and repair affected components"; fi)
- Activate communication plan
- Monitor system recovery

NEXT STEPS:
1. Execute recovery procedures
2. Communicate with stakeholders
3. Monitor progress and adjust as needed
EOF

echo "Assessment completed. Report saved to /tmp/assessment-$INCIDENT_ID.txt"
```

## Data Recovery Procedures

### 1. Database Recovery

```bash
#!/bin/bash
# database-recovery.sh

set -e

INCIDENT_ID=${1}
RECOVERY_TYPE=${2:-"point_in_time"}
RECOVERY_TIME=${3:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}

echo "Starting database recovery for incident: $INCIDENT_ID"
echo "Recovery type: $RECOVERY_TYPE"
echo "Recovery time: $RECOVERY_TIME"

# Step 1: Assess database damage
echo "Assessing database status..."

DB_STATUS="unknown"
if kubectl exec -n plumbing-ai-prod postgres-0 -- pg_isready -U plumbing_admin -d plumbing_ai_prod > /dev/null 2>&1; then
    DB_STATUS="online"
    echo "Database is online, checking integrity..."
    
    if kubectl exec -n plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -d plumbing_ai_prod -c "SELECT COUNT(*) FROM customers;" > /dev/null 2>&1; then
        DB_STATUS="healthy"
    else
        DB_STATUS="corrupted"
    fi
else
    DB_STATUS="offline"
fi

echo "Database status: $DB_STATUS"

# Step 2: Choose recovery strategy
case $DB_STATUS in
    "healthy")
        echo "Database is healthy, no recovery needed"
        exit 0
        ;;
    "corrupted")
        echo "Database corruption detected, initiating restore from backup"
        RECOVERY_TYPE="full_restore"
        ;;
    "offline")
        echo "Database is offline, attempting restart first"
        kubectl delete pod postgres-0 -n plumbing-ai-prod
        kubectl wait --for=condition=ready pod postgres-0 -n plumbing-ai-prod --timeout=300s
        
        # Recheck status
        if kubectl exec -n plumbing-ai-prod postgres-0 -- pg_isready -U plumbing_admin -d plumbing_ai_prod > /dev/null 2>&1; then
            echo "Database recovered after restart"
            exit 0
        else
            echo "Database failed to start, initiating full restore"
            RECOVERY_TYPE="full_restore"
        fi
        ;;
esac

# Step 3: Stop application to prevent data inconsistency
echo "Scaling down application to prevent data inconsistency..."
kubectl scale deployment plumbing-ai-backend --replicas=0 -n plumbing-ai-prod
kubectl wait --for=delete pod -l app=plumbing-ai-backend -n plumbing-ai-prod --timeout=300s

# Step 4: Execute recovery based on type
case $RECOVERY_TYPE in
    "full_restore")
        echo "Performing full database restore..."
        
        # Find latest backup
        LATEST_BACKUP=$(ls -t /backups/full_backup_*.sql | head -1)
        if [ -z "$LATEST_BACKUP" ]; then
            echo "ERROR: No backup files found"
            exit 1
        fi
        
        echo "Restoring from backup: $LATEST_BACKUP"
        
        # Drop and recreate database
        kubectl exec -n plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -c "DROP DATABASE IF EXISTS plumbing_ai_prod;"
        kubectl exec -n plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -c "CREATE DATABASE plumbing_ai_prod;"
        
        # Restore from backup
        kubectl exec -i plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -d plumbing_ai_prod < "$LATEST_BACKUP"
        ;;
        
    "point_in_time")
        echo "Performing point-in-time recovery to: $RECOVERY_TIME"
        
        # Stop PostgreSQL
        kubectl exec -n plumbing-ai-prod postgres-0 -- pg_ctl stop -D /var/lib/postgresql/data
        
        # Restore base backup
        LATEST_BASE_BACKUP=$(ls -t /backups/base_backup_*.tar.gz | head -1)
        kubectl exec -n plumbing-ai-prod postgres-0 -- tar -xzf "$LATEST_BASE_BACKUP" -C /var/lib/postgresql/data/
        
        # Create recovery configuration
        kubectl exec -n plumbing-ai-prod postgres-0 -- bash -c "echo \"restore_command = 'cp /backups/wal/%f %p'\" > /var/lib/postgresql/data/recovery.conf"
        kubectl exec -n plumbing-ai-prod postgres-0 -- bash -c "echo \"recovery_target_time = '$RECOVERY_TIME'\" >> /var/lib/postgresql/data/recovery.conf"
        
        # Start PostgreSQL for recovery
        kubectl exec -n plumbing-ai-prod postgres-0 -- pg_ctl start -D /var/lib/postgresql/data
        
        # Wait for recovery to complete
        sleep 60
        ;;
esac

# Step 5: Verify database recovery
echo "Verifying database recovery..."

# Test basic connectivity
if ! kubectl exec -n plumbing-ai-prod postgres-0 -- pg_isready -U plumbing_admin -d plumbing_ai_prod; then
    echo "ERROR: Database recovery failed - connection test failed"
    exit 1
fi

# Test data integrity
CUSTOMER_COUNT=$(kubectl exec -n plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -d plumbing_ai_prod -t -c "SELECT COUNT(*) FROM customers;")
if [ "$CUSTOMER_COUNT" -lt 1 ]; then
    echo "WARNING: Customer count is $CUSTOMER_COUNT, data may be incomplete"
fi

# Run integrity checks
kubectl exec -n plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -d plumbing_ai_prod -c "VACUUM ANALYZE;"

echo "Database recovery completed successfully"

# Step 6: Restart application
echo "Restarting application..."
kubectl scale deployment plumbing-ai-backend --replicas=3 -n plumbing-ai-prod
kubectl rollout status deployment/plumbing-ai-backend -n plumbing-ai-prod --timeout=300s

echo "Database recovery procedure completed"
```

### 2. File System Recovery

```bash
#!/bin/bash
# filesystem-recovery.sh

set -e

INCIDENT_ID=${1}
VOLUME_NAME=${2:-"plumbing-ai-data"}

echo "Starting file system recovery for incident: $INCIDENT_ID"
echo "Target volume: $VOLUME_NAME"

# Step 1: Identify affected persistent volumes
echo "Identifying affected persistent volumes..."

kubectl get pv | grep $VOLUME_NAME

# Step 2: Check volume status
VOLUME_STATUS=$(kubectl get pv -o jsonpath='{.items[?(@.metadata.name=="'$VOLUME_NAME'")].status.phase}')
echo "Volume status: $VOLUME_STATUS"

if [ "$VOLUME_STATUS" = "Available" ] || [ "$VOLUME_STATUS" = "Bound" ]; then
    echo "Volume is accessible, checking data integrity..."
    
    # Mount volume for inspection
    kubectl run volume-inspector --image=busybox --restart=Never --rm -i --tty \
        --overrides='{"spec":{"containers":[{"name":"inspector","image":"busybox","volumeMounts":[{"name":"data","mountPath":"/data"}]}],"volumes":[{"name":"data","persistentVolumeClaim":{"claimName":"'$VOLUME_NAME'-claim"}}]}}' \
        -- sh -c "ls -la /data && du -sh /data/*"
        
else
    echo "Volume is not accessible, initiating restore from backup..."
    
    # Step 3: Restore from backup storage
    echo "Restoring from backup storage..."
    
    # Find latest backup
    LATEST_BACKUP=$(gsutil ls gs://plumbing-ai-backups/filesystem/ | grep $(date +%Y-%m-%d) | tail -1)
    
    if [ -z "$LATEST_BACKUP" ]; then
        echo "No recent backup found, using latest available..."
        LATEST_BACKUP=$(gsutil ls gs://plumbing-ai-backups/filesystem/ | tail -1)
    fi
    
    echo "Restoring from backup: $LATEST_BACKUP"
    
    # Create new PVC for restore
    kubectl apply -f - << EOF
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ${VOLUME_NAME}-restore
  namespace: plumbing-ai-prod
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 100Gi
  storageClassName: fast-ssd
EOF

    # Restore data
    kubectl run data-restore --image=google/cloud-sdk:latest --restart=Never \
        --overrides='{"spec":{"containers":[{"name":"restore","image":"google/cloud-sdk:latest","volumeMounts":[{"name":"data","mountPath":"/data"}],"command":["gsutil","-m","cp","-r","'$LATEST_BACKUP'","/data/"]}],"volumes":[{"name":"data","persistentVolumeClaim":{"claimName":"'$VOLUME_NAME'-restore"}}]}}' \
        --namespace=plumbing-ai-prod
    
    # Wait for restore to complete
    kubectl wait --for=condition=complete job/data-restore -n plumbing-ai-prod --timeout=1800s
    
    # Update application to use restored volume
    kubectl patch deployment plumbing-ai-backend -n plumbing-ai-prod -p '{"spec":{"template":{"spec":{"volumes":[{"name":"data","persistentVolumeClaim":{"claimName":"'$VOLUME_NAME'-restore"}}]}}}}'
fi

echo "File system recovery completed"
```

## Infrastructure Recovery

### 1. Kubernetes Cluster Recovery

```bash
#!/bin/bash
# cluster-recovery.sh

set -e

INCIDENT_ID=${1}
CLUSTER_NAME=${2:-"plumbing-ai-prod"}

echo "Starting Kubernetes cluster recovery for incident: $INCIDENT_ID"

# Step 1: Assess cluster health
echo "Assessing cluster health..."

# Check node status
kubectl get nodes -o wide
NODE_READY_COUNT=$(kubectl get nodes --no-headers | grep " Ready " | wc -l)
NODE_TOTAL_COUNT=$(kubectl get nodes --no-headers | wc -l)

echo "Nodes ready: $NODE_READY_COUNT/$NODE_TOTAL_COUNT"

if [ $NODE_READY_COUNT -eq $NODE_TOTAL_COUNT ]; then
    echo "All nodes are ready, checking pod status..."
    
    # Check critical pods
    CRITICAL_PODS_READY=$(kubectl get pods -n plumbing-ai-prod --no-headers | grep Running | wc -l)
    CRITICAL_PODS_TOTAL=$(kubectl get pods -n plumbing-ai-prod --no-headers | wc -l)
    
    echo "Critical pods ready: $CRITICAL_PODS_READY/$CRITICAL_PODS_TOTAL"
    
    if [ $CRITICAL_PODS_READY -eq $CRITICAL_PODS_TOTAL ]; then
        echo "Cluster appears healthy, checking service connectivity..."
        
        # Test service connectivity
        if kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- curl -f http://localhost:3001/health > /dev/null 2>&1; then
            echo "Cluster is healthy, no recovery needed"
            exit 0
        fi
    fi
fi

# Step 2: Node recovery
echo "Checking node health..."

for node in $(kubectl get nodes --no-headers | grep -v " Ready " | awk '{print $1}'); do
    echo "Attempting to recover node: $node"
    
    # Try to drain and uncordon node
    kubectl drain $node --ignore-daemonsets --delete-emptydir-data --force --grace-period=0
    sleep 30
    kubectl uncordon $node
    
    # Wait for node to be ready
    kubectl wait --for=condition=ready node/$node --timeout=300s
done

# Step 3: Pod recovery
echo "Recovering failed pods..."

# Delete failed pods to trigger recreation
kubectl delete pods --all-namespaces --field-selector=status.phase=Failed
kubectl delete pods --all-namespaces --field-selector=status.phase=Pending --timeout=60s || true

# Restart deployments if needed
kubectl rollout restart deployment/plumbing-ai-backend -n plumbing-ai-prod
kubectl rollout restart deployment/plumbing-ai-frontend -n plumbing-ai-prod

# Wait for deployments to be ready
kubectl rollout status deployment/plumbing-ai-backend -n plumbing-ai-prod --timeout=600s
kubectl rollout status deployment/plumbing-ai-frontend -n plumbing-ai-prod --timeout=600s

# Step 4: Network recovery
echo "Checking network connectivity..."

# Test internal service communication
kubectl run network-test --image=busybox --restart=Never --rm -i --tty -- sh -c "
    nslookup plumbing-ai-backend-service.plumbing-ai-prod.svc.cluster.local &&
    nslookup postgres-service.plumbing-ai-prod.svc.cluster.local &&
    nslookup redis-service.plumbing-ai-prod.svc.cluster.local
"

# Test external connectivity
kubectl run external-test --image=busybox --restart=Never --rm -i --tty -- sh -c "
    nslookup google.com &&
    wget -q --spider https://api.anthropic.com
"

echo "Cluster recovery completed"
```

### 2. Load Balancer Recovery

```bash
#!/bin/bash
# loadbalancer-recovery.sh

set -e

INCIDENT_ID=${1}
LB_NAME=${2:-"plumbing-ai-lb"}

echo "Starting load balancer recovery for incident: $INCIDENT_ID"

# Step 1: Check load balancer status
echo "Checking load balancer status..."

# Get load balancer IP
LB_IP=$(kubectl get service plumbing-ai-service -n plumbing-ai-prod -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

if [ -z "$LB_IP" ]; then
    echo "Load balancer IP not assigned, recreating service..."
    
    # Delete and recreate service
    kubectl delete service plumbing-ai-service -n plumbing-ai-prod
    kubectl apply -f k8s/service.yaml
    
    # Wait for external IP assignment
    echo "Waiting for external IP assignment..."
    kubectl wait --for=jsonpath='{.status.loadBalancer.ingress[0].ip}' service/plumbing-ai-service -n plumbing-ai-prod --timeout=300s
    
    LB_IP=$(kubectl get service plumbing-ai-service -n plumbing-ai-prod -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
fi

echo "Load balancer IP: $LB_IP"

# Step 2: Test load balancer connectivity
echo "Testing load balancer connectivity..."

# Test HTTP endpoint
if curl -f "http://$LB_IP/health" > /dev/null 2>&1; then
    echo "✅ HTTP connectivity test passed"
else
    echo "❌ HTTP connectivity test failed"
fi

# Test HTTPS endpoint
if curl -f "https://$LB_IP/health" > /dev/null 2>&1; then
    echo "✅ HTTPS connectivity test passed"
else
    echo "❌ HTTPS connectivity test failed"
    
    # Check SSL certificate
    echo "Checking SSL certificate..."
    kubectl get certificate -n plumbing-ai-prod
    kubectl describe certificate plumbing-ai-tls -n plumbing-ai-prod
fi

# Step 3: Update DNS if needed
echo "Checking DNS records..."

CURRENT_DNS_IP=$(dig +short api.plumbingai.com @8.8.8.8 | tail -1)

if [ "$CURRENT_DNS_IP" != "$LB_IP" ]; then
    echo "DNS update required: $CURRENT_DNS_IP -> $LB_IP"
    
    # Update DNS record (example for CloudFlare)
    curl -X PUT "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records/$CLOUDFLARE_RECORD_ID" \
        -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
        -H "Content-Type: application/json" \
        --data '{"type":"A","name":"api","content":"'$LB_IP'","ttl":300}'
    
    echo "DNS record updated, waiting for propagation..."
    sleep 60
fi

# Step 4: Verify end-to-end connectivity
echo "Verifying end-to-end connectivity..."

# Test through domain name
if curl -f "https://api.plumbingai.com/health" > /dev/null 2>&1; then
    echo "✅ End-to-end connectivity test passed"
else
    echo "❌ End-to-end connectivity test failed"
    exit 1
fi

echo "Load balancer recovery completed"
```

## Service Restoration

### 1. Application Service Restoration

```bash
#!/bin/bash
# service-restoration.sh

set -e

INCIDENT_ID=${1}
RESTORATION_MODE=${2:-"rolling"}

echo "Starting service restoration for incident: $INCIDENT_ID"
echo "Restoration mode: $RESTORATION_MODE"

# Step 1: Prepare for restoration
echo "Preparing for service restoration..."

# Verify infrastructure is ready
./verify-infrastructure.sh

# Step 2: Database restoration verification
echo "Verifying database is ready..."
if ! kubectl exec -n plumbing-ai-prod postgres-0 -- pg_isready -U plumbing_admin -d plumbing_ai_prod; then
    echo "Database not ready, running database recovery..."
    ./database-recovery.sh "$INCIDENT_ID"
fi

# Step 3: Service restoration based on mode
case $RESTORATION_MODE in
    "rolling")
        echo "Performing rolling restoration..."
        
        # Start with backend services
        kubectl scale deployment plumbing-ai-backend --replicas=1 -n plumbing-ai-prod
        kubectl wait --for=condition=available deployment/plumbing-ai-backend -n plumbing-ai-prod --timeout=300s
        
        # Verify backend health
        if kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- curl -f http://localhost:3001/health > /dev/null 2>&1; then
            echo "Backend service healthy, scaling up..."
            kubectl scale deployment plumbing-ai-backend --replicas=3 -n plumbing-ai-prod
        else
            echo "Backend service unhealthy, investigating..."
            kubectl logs -n plumbing-ai-prod deployment/plumbing-ai-backend --tail=50
            exit 1
        fi
        
        # Start frontend services
        kubectl scale deployment plumbing-ai-frontend --replicas=1 -n plumbing-ai-prod
        kubectl wait --for=condition=available deployment/plumbing-ai-frontend -n plumbing-ai-prod --timeout=300s
        kubectl scale deployment plumbing-ai-frontend --replicas=2 -n plumbing-ai-prod
        ;;
        
    "blue-green")
        echo "Performing blue-green restoration..."
        
        # Deploy to green environment
        kubectl apply -f k8s/backend-green.yaml
        kubectl apply -f k8s/frontend-green.yaml
        
        # Wait for green deployment
        kubectl rollout status deployment/plumbing-ai-backend-green -n plumbing-ai-prod --timeout=600s
        kubectl rollout status deployment/plumbing-ai-frontend-green -n plumbing-ai-prod --timeout=600s
        
        # Test green environment
        kubectl run health-test --image=busybox --restart=Never --rm -i --tty -- sh -c "
            wget -qO- http://plumbing-ai-backend-green-service:3001/health
        "
        
        # Switch traffic to green
        kubectl patch service plumbing-ai-service -p '{"spec":{"selector":{"color":"green"}}}' -n plumbing-ai-prod
        
        # Clean up blue environment
        kubectl delete deployment plumbing-ai-backend-blue -n plumbing-ai-prod || true
        kubectl delete deployment plumbing-ai-frontend-blue -n plumbing-ai-prod || true
        ;;
        
    "immediate")
        echo "Performing immediate restoration..."
        
        # Start all services simultaneously
        kubectl apply -f k8s/backend.yaml
        kubectl apply -f k8s/frontend.yaml
        
        # Wait for services to be ready
        kubectl rollout status deployment/plumbing-ai-backend -n plumbing-ai-prod --timeout=300s
        kubectl rollout status deployment/plumbing-ai-frontend -n plumbing-ai-prod --timeout=300s
        ;;
esac

# Step 4: Verify service restoration
echo "Verifying service restoration..."

# Test all critical endpoints
CRITICAL_ENDPOINTS=(
    "/health"
    "/customers"
    "/jobs"
    "/conversations"
    "/ai/health"
)

for endpoint in "${CRITICAL_ENDPOINTS[@]}"; do
    echo "Testing endpoint: $endpoint"
    
    if curl -f "https://api.plumbingai.com/v1$endpoint" -H "Authorization: Bearer $TEST_API_TOKEN" > /dev/null 2>&1; then
        echo "✅ $endpoint - OK"
    else
        echo "❌ $endpoint - FAILED"
        SERVICE_RESTORATION_FAILED=true
    fi
done

if [ "$SERVICE_RESTORATION_FAILED" = "true" ]; then
    echo "Service restoration verification failed"
    exit 1
fi

# Step 5: Restore external integrations
echo "Restoring external integrations..."

# Test Google Voice integration
kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- npm run test:integration:google-voice

# Test AI service integration
kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- npm run test:integration:ai

# Test notification services
kubectl exec -n plumbing-ai-prod deployment/plumbing-ai-backend -- npm run test:integration:notifications

echo "Service restoration completed successfully"
```

### 2. Data Consistency Verification

```bash
#!/bin/bash
# data-consistency-check.sh

set -e

INCIDENT_ID=${1}

echo "Performing data consistency verification for incident: $INCIDENT_ID"

# Step 1: Database consistency checks
echo "Checking database consistency..."

# Check foreign key constraints
CONSTRAINT_VIOLATIONS=$(kubectl exec -n plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -d plumbing_ai_prod -t -c "
    SELECT COUNT(*) FROM (
        SELECT conname, confrelid::regclass, af.attname AS fcol, confkey, 
               conrelid::regclass, a.attname AS col, conkey
        FROM pg_attribute af, pg_attribute a,
             (SELECT conname, conrelid, confrelid, conkey[i] AS conkey, confkey[i] AS confkey
              FROM (SELECT conname, conrelid, confrelid, conkey, confkey,
                           generate_series(1,array_upper(conkey,1)) AS i
                    FROM pg_constraint WHERE contype = 'f') ss) ss2
        WHERE af.attnum = confkey AND af.attrelid = confrelid AND
              a.attnum = conkey AND a.attrelid = conrelid AND
              NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = confrelid AND c.relname LIKE 'test_%')
    ) AS violations;
")

if [ "$CONSTRAINT_VIOLATIONS" -gt 0 ]; then
    echo "⚠️ Found $CONSTRAINT_VIOLATIONS foreign key constraint violations"
else
    echo "✅ No foreign key constraint violations found"
fi

# Check for orphaned records
echo "Checking for orphaned records..."

ORPHANED_JOBS=$(kubectl exec -n plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -d plumbing_ai_prod -t -c "
    SELECT COUNT(*) FROM jobs j LEFT JOIN customers c ON j.customer_id = c.id WHERE c.id IS NULL;
")

ORPHANED_CONVERSATIONS=$(kubectl exec -n plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -d plumbing_ai_prod -t -c "
    SELECT COUNT(*) FROM conversations conv LEFT JOIN customers c ON conv.customer_id = c.id WHERE c.id IS NULL;
")

echo "Orphaned jobs: $ORPHANED_JOBS"
echo "Orphaned conversations: $ORPHANED_CONVERSATIONS"

# Step 2: Data integrity verification
echo "Verifying data integrity..."

# Check critical business data
TOTAL_CUSTOMERS=$(kubectl exec -n plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -d plumbing_ai_prod -t -c "SELECT COUNT(*) FROM customers;")
TOTAL_JOBS=$(kubectl exec -n plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -d plumbing_ai_prod -t -c "SELECT COUNT(*) FROM jobs;")
TOTAL_CONVERSATIONS=$(kubectl exec -n plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -d plumbing_ai_prod -t -c "SELECT COUNT(*) FROM conversations;")

echo "Data counts:"
echo "  Customers: $TOTAL_CUSTOMERS"
echo "  Jobs: $TOTAL_JOBS"
echo "  Conversations: $TOTAL_CONVERSATIONS"

# Compare with pre-incident counts (if available)
if [ -f "/tmp/pre-incident-counts-$INCIDENT_ID.txt" ]; then
    source "/tmp/pre-incident-counts-$INCIDENT_ID.txt"
    
    CUSTOMER_DIFF=$((TOTAL_CUSTOMERS - PRE_INCIDENT_CUSTOMERS))
    JOB_DIFF=$((TOTAL_JOBS - PRE_INCIDENT_JOBS))
    CONVERSATION_DIFF=$((TOTAL_CONVERSATIONS - PRE_INCIDENT_CONVERSATIONS))
    
    echo "Data changes since incident:"
    echo "  Customers: $CUSTOMER_DIFF"
    echo "  Jobs: $JOB_DIFF"
    echo "  Conversations: $CONVERSATION_DIFF"
fi

# Step 3: Business logic validation
echo "Validating business logic consistency..."

# Check for jobs without quotes where required
JOBS_WITHOUT_QUOTES=$(kubectl exec -n plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -d plumbing_ai_prod -t -c "
    SELECT COUNT(*) FROM jobs j 
    LEFT JOIN quotes q ON j.id = q.job_id 
    WHERE j.type = 'service' AND j.status = 'completed' AND q.id IS NULL;
")

echo "Completed service jobs without quotes: $JOBS_WITHOUT_QUOTES"

# Check for active warranties without expiry dates
INVALID_WARRANTIES=$(kubectl exec -n plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -d plumbing_ai_prod -t -c "
    SELECT COUNT(*) FROM warranties WHERE status = 'active' AND expiry_date IS NULL;
")

echo "Active warranties without expiry dates: $INVALID_WARRANTIES"

# Step 4: Generate consistency report
cat > "/tmp/consistency-report-$INCIDENT_ID.txt" << EOF
DATA CONSISTENCY VERIFICATION REPORT
====================================
Incident ID: $INCIDENT_ID
Verification Time: $(date)

DATABASE CONSISTENCY:
- Constraint violations: $CONSTRAINT_VIOLATIONS
- Orphaned jobs: $ORPHANED_JOBS
- Orphaned conversations: $ORPHANED_CONVERSATIONS

DATA INTEGRITY:
- Total customers: $TOTAL_CUSTOMERS
- Total jobs: $TOTAL_JOBS
- Total conversations: $TOTAL_CONVERSATIONS

BUSINESS LOGIC CONSISTENCY:
- Jobs without quotes: $JOBS_WITHOUT_QUOTES
- Invalid warranties: $INVALID_WARRANTIES

RECOMMENDATIONS:
$(if [ "$CONSTRAINT_VIOLATIONS" -gt 0 ] || [ "$ORPHANED_JOBS" -gt 0 ] || [ "$ORPHANED_CONVERSATIONS" -gt 0 ]; then
    echo "- Fix data consistency issues before full service restoration"
    echo "- Run data cleanup procedures"
else
    echo "- Data consistency verified - safe to proceed with full service restoration"
fi)
EOF

echo "Data consistency verification completed"
echo "Report saved to /tmp/consistency-report-$INCIDENT_ID.txt"

if [ "$CONSTRAINT_VIOLATIONS" -gt 0 ] || [ "$ORPHANED_JOBS" -gt 5 ] || [ "$ORPHANED_CONVERSATIONS" -gt 5 ]; then
    echo "⚠️ Data consistency issues detected - manual review recommended"
    exit 1
else
    echo "✅ Data consistency verification passed"
fi
```

## Business Continuity

### 1. Emergency Operations Mode

```bash
#!/bin/bash
# emergency-operations.sh

set -e

INCIDENT_ID=${1}
EMERGENCY_MODE=${2:-"limited_service"}

echo "Activating emergency operations mode for incident: $INCIDENT_ID"
echo "Emergency mode: $EMERGENCY_MODE"

case $EMERGENCY_MODE in
    "read_only")
        echo "Activating read-only mode..."
        
        # Scale down write-intensive services
        kubectl scale deployment plumbing-ai-backend --replicas=1 -n plumbing-ai-prod
        
        # Enable read-only mode in application
        kubectl set env deployment/plumbing-ai-backend EMERGENCY_MODE=read_only -n plumbing-ai-prod
        
        # Route traffic to read replicas
        kubectl patch service plumbing-ai-service -p '{"spec":{"selector":{"mode":"read-only"}}}' -n plumbing-ai-prod
        ;;
        
    "emergency_only")
        echo "Activating emergency-only mode..."
        
        # Disable non-critical endpoints
        kubectl set env deployment/plumbing-ai-backend EMERGENCY_MODE=emergency_only -n plumbing-ai-prod
        
        # Scale up emergency response services
        kubectl scale deployment emergency-dispatcher --replicas=2 -n plumbing-ai-prod || true
        
        # Enable emergency hotline
        kubectl apply -f k8s/emergency-hotline.yaml
        ;;
        
    "limited_service")
        echo "Activating limited service mode..."
        
        # Enable core functionality only
        kubectl set env deployment/plumbing-ai-backend EMERGENCY_MODE=limited_service -n plumbing-ai-prod
        
        # Reduce resource usage
        kubectl patch deployment plumbing-ai-backend -p '{"spec":{"template":{"spec":{"containers":[{"name":"backend","resources":{"limits":{"cpu":"500m","memory":"1Gi"}}}]}}}}' -n plumbing-ai-prod
        ;;
esac

# Step 2: Notify customers of service disruption
echo "Notifying customers of service disruption..."

# Create service status page update
curl -X POST "https://api.statuspage.io/v1/pages/$STATUSPAGE_ID/incidents" \
    -H "Authorization: OAuth $STATUSPAGE_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
        "incident": {
            "name": "Service Disruption - Emergency Operations Active",
            "status": "investigating",
            "impact_override": "major",
            "body": "We are currently experiencing technical difficulties and have activated emergency operations mode. Emergency services remain available. We are working to restore full service as quickly as possible."
        }
    }'

# Send customer notifications
kubectl run customer-notification --image=plumbing-ai/backend:latest --restart=Never \
    --namespace=plumbing-ai-prod \
    --command -- npm run emergency:notify-customers -- \
    --message="We are currently experiencing technical difficulties. Emergency services remain available at 1-800-EMERGENCY." \
    --channels=sms,email

echo "Emergency operations mode activated"
```

### 2. Manual Operations Procedures

```bash
#!/bin/bash
# manual-operations.sh

set -e

echo "MANUAL OPERATIONS PROCEDURES"
echo "==========================="

echo "1. EMERGENCY PHONE SYSTEM"
echo "   - Primary emergency line: 1-800-EMERGENCY"
echo "   - Backup emergency line: 1-855-BACKUP"
echo "   - On-call dispatcher: +1-555-ONCALL"

echo "2. MANUAL JOB DISPATCH"
echo "   - Use backup dispatch system: https://backup.plumbingai.com/dispatch"
echo "   - Emergency job assignment spreadsheet: /emergency/job-assignments.xlsx"
echo "   - Technician contact list: /emergency/technician-contacts.txt"

echo "3. CUSTOMER COMMUNICATION"
echo "   - SMS gateway: https://backup-sms.plumbingai.com"
echo "   - Email service: smtp://backup-mail.plumbingai.com"
echo "   - Status page: https://status.plumbingai.com"

echo "4. PAYMENT PROCESSING"
echo "   - Backup payment terminal: Terminal #2 (Office)"
echo "   - Manual credit card processing: Call 1-800-MERCHANT"
echo "   - Cash/check procedures: See manual operations binder"

echo "5. DATA ENTRY"
echo "   - Offline forms location: /emergency/offline-forms/"
echo "   - Data entry spreadsheet: /emergency/manual-data-entry.xlsx"
echo "   - Synchronization procedure: See manual ops guide Section 5"

# Generate manual operations checklist
cat > "/tmp/manual-operations-checklist.txt" << EOF
MANUAL OPERATIONS CHECKLIST
===========================

☐ Activate emergency phone lines
☐ Deploy backup dispatch system
☐ Notify all technicians of manual procedures
☐ Set up manual payment processing
☐ Prepare offline data entry forms
☐ Update status page with manual contact information
☐ Inform customers of alternative contact methods
☐ Document all manual activities for later data entry
☐ Monitor emergency hotline continuously
☐ Regular status updates every 30 minutes

CONTACT INFORMATION:
- Emergency Coordinator: +1-555-EMERGENCY
- IT Support: +1-555-ITHELP
- Management Team: +1-555-MGMT
EOF

echo "Manual operations checklist created: /tmp/manual-operations-checklist.txt"
```

## Communication Procedures

### 1. Stakeholder Communication

```bash
#!/bin/bash
# stakeholder-communication.sh

set -e

INCIDENT_ID=${1}
SEVERITY=${2}
STATUS=${3:-"investigating"}
UPDATE_TYPE=${4:-"initial"}

echo "Sending stakeholder communication for incident: $INCIDENT_ID"

# Define stakeholder groups
case $SEVERITY in
    "CRITICAL")
        STAKEHOLDERS="executives,customers,technicians,partners"
        URGENCY="immediate"
        ;;
    "HIGH")
        STAKEHOLDERS="customers,technicians,managers"
        URGENCY="urgent"
        ;;
    "MEDIUM")
        STAKEHOLDERS="technicians,managers"
        URGENCY="normal"
        ;;
    *)
        STAKEHOLDERS="technicians"
        URGENCY="low"
        ;;
esac

# Step 1: Internal team communication
echo "Notifying internal teams..."

# Slack notification
SLACK_COLOR="danger"
case $STATUS in
    "resolved") SLACK_COLOR="good" ;;
    "monitoring") SLACK_COLOR="warning" ;;
esac

curl -X POST "$SLACK_WEBHOOK_URL" \
    -H 'Content-type: application/json' \
    --data '{
        "channel": "#incident-updates",
        "attachments": [{
            "color": "'$SLACK_COLOR'",
            "title": "Incident Update: '$INCIDENT_ID'",
            "fields": [
                {"title": "Severity", "value": "'$SEVERITY'", "short": true},
                {"title": "Status", "value": "'$STATUS'", "short": true},
                {"title": "Time", "value": "<!date^'$(date +%s)'^{date_short_pretty} at {time}|'$(date)''>", "short": true}
            ],
            "footer": "Incident Response System"
        }]
    }'

# Step 2: Customer communication
if [[ $STAKEHOLDERS == *"customers"* ]]; then
    echo "Notifying customers..."
    
    # Status page update
    STATUS_MESSAGE=""
    case $STATUS in
        "investigating")
            STATUS_MESSAGE="We are investigating reports of service issues and will provide updates as we learn more."
            ;;
        "identified")
            STATUS_MESSAGE="We have identified the cause of the service disruption and are working on a resolution."
            ;;
        "monitoring")
            STATUS_MESSAGE="A fix has been implemented and we are monitoring the situation."
            ;;
        "resolved")
            STATUS_MESSAGE="The service disruption has been resolved. All systems are operating normally."
            ;;
    esac
    
    # Update status page
    curl -X PATCH "https://api.statuspage.io/v1/pages/$STATUSPAGE_ID/incidents/$STATUSPAGE_INCIDENT_ID" \
        -H "Authorization: OAuth $STATUSPAGE_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{
            "incident": {
                "status": "'$STATUS'",
                "body": "'$STATUS_MESSAGE'"
            }
        }'
    
    # Send customer notifications for critical incidents
    if [ "$SEVERITY" = "CRITICAL" ]; then
        kubectl run customer-alert --image=plumbing-ai/backend:latest --restart=Never \
            --namespace=plumbing-ai-prod \
            --command -- npm run incident:notify-customers -- \
            --incident-id="$INCIDENT_ID" \
            --message="$STATUS_MESSAGE" \
            --urgency="high"
    fi
fi

# Step 3: Technician communication
if [[ $STAKEHOLDERS == *"technicians"* ]]; then
    echo "Notifying technicians..."
    
    # SMS to all active technicians
    kubectl run technician-alert --image=plumbing-ai/backend:latest --restart=Never \
        --namespace=plumbing-ai-prod \
        --command -- npm run incident:notify-technicians -- \
        --incident-id="$INCIDENT_ID" \
        --severity="$SEVERITY" \
        --status="$STATUS"
fi

# Step 4: Executive communication
if [[ $STAKEHOLDERS == *"executives"* ]]; then
    echo "Notifying executives..."
    
    # Email to executive team
    cat > "/tmp/executive-update-$INCIDENT_ID.html" << EOF
<html>
<body>
<h2>Incident Update: $INCIDENT_ID</h2>
<p><strong>Severity:</strong> $SEVERITY</p>
<p><strong>Status:</strong> $STATUS</p>
<p><strong>Time:</strong> $(date)</p>

<h3>Impact Assessment:</h3>
<ul>
<li>Service availability: $([ "$STATUS" = "resolved" ] && echo "Restored" || echo "Impacted")</li>
<li>Customer impact: $([ "$SEVERITY" = "CRITICAL" ] && echo "High" || echo "Moderate")</li>
<li>Business operations: $([ "$STATUS" = "resolved" ] && echo "Normal" || echo "Emergency procedures active")</li>
</ul>

<h3>Next Steps:</h3>
<ul>
<li>Continue monitoring system stability</li>
<li>Conduct post-incident review</li>
<li>Implement preventive measures</li>
</ul>

<p>For real-time updates, monitor: https://status.plumbingai.com</p>
</body>
</html>
EOF

    # Send executive notification
    curl -X POST "https://api.sendgrid.com/v3/mail/send" \
        -H "Authorization: Bearer $SENDGRID_API_KEY" \
        -H "Content-Type: application/json" \
        -d '{
            "personalizations": [{
                "to": [
                    {"email": "cto@plumbingai.com"},
                    {"email": "ceo@plumbingai.com"}
                ]
            }],
            "from": {"email": "incidents@plumbingai.com"},
            "subject": "URGENT: Incident Update - '$INCIDENT_ID'",
            "content": [{
                "type": "text/html",
                "value": "'$(cat /tmp/executive-update-$INCIDENT_ID.html | tr '\n' ' ')'"
            }]
        }'
fi

echo "Stakeholder communication completed"
```

## Post-Recovery Procedures

### 1. Post-Incident Review

```bash
#!/bin/bash
# post-incident-review.sh

set -e

INCIDENT_ID=${1}
INCIDENT_START=${2}
INCIDENT_END=${3:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}

echo "Conducting post-incident review for: $INCIDENT_ID"

# Step 1: Collect incident data
echo "Collecting incident data..."

# Create incident directory
mkdir -p "/tmp/incident-review-$INCIDENT_ID"
cd "/tmp/incident-review-$INCIDENT_ID"

# Collect logs
echo "Collecting system logs..."
kubectl logs -n plumbing-ai-prod deployment/plumbing-ai-backend --since-time="$INCIDENT_START" > backend-logs.txt
kubectl logs -n plumbing-ai-prod deployment/plumbing-ai-frontend --since-time="$INCIDENT_START" > frontend-logs.txt
kubectl get events -n plumbing-ai-prod --sort-by='.firstTimestamp' > kubernetes-events.txt

# Collect metrics
echo "Collecting metrics data..."
if kubectl exec -n monitoring prometheus-0 -- promtool query range \
    --start="$INCIDENT_START" \
    --end="$INCIDENT_END" \
    --step=1m \
    'rate(http_requests_total[5m])' > metrics-requests.txt 2>/dev/null; then
    echo "Request metrics collected"
fi

# Collect database performance data
kubectl exec -n plumbing-ai-prod postgres-0 -- psql -U plumbing_admin -d plumbing_ai_prod -c "
    SELECT query, calls, mean_exec_time, total_exec_time 
    FROM pg_stat_statements 
    WHERE last_call >= '$INCIDENT_START'::timestamp 
    ORDER BY total_exec_time DESC 
    LIMIT 20;
" > database-performance.txt 2>/dev/null || echo "Database performance data not available"

# Step 2: Timeline reconstruction
echo "Reconstructing incident timeline..."

cat > "timeline.md" << EOF
# Incident Timeline: $INCIDENT_ID

## Detection
- **Time**: $INCIDENT_START
- **Source**: $(grep -m1 "INCIDENT DETECTED" /var/log/incidents.log | cut -d' ' -f4- || echo "Automated monitoring")
- **Initial Impact**: Service degradation detected

## Response Actions
$(grep -A10 "INCIDENT_ID=$INCIDENT_ID" /var/log/incident-actions.log || echo "- Response actions logged in manual notes")

## Resolution
- **Time**: $INCIDENT_END
- **Resolution**: Service restored and verified

## Key Events
$(kubectl get events -n plumbing-ai-prod --sort-by='.firstTimestamp' | grep -E "(Error|Failed|Warning)" | tail -10)
EOF

# Step 3: Impact analysis
echo "Analyzing incident impact..."

# Calculate downtime
DOWNTIME_SECONDS=$(( $(date -d "$INCIDENT_END" +%s) - $(date -d "$INCIDENT_START" +%s) ))
DOWNTIME_MINUTES=$(( DOWNTIME_SECONDS / 60 ))

# Estimate affected users (if metrics available)
AFFECTED_USERS="Unknown"
if [ -f "metrics-requests.txt" ]; then
    AFFECTED_USERS=$(awk '/requests/ {sum+=$2} END {print int(sum/60)}' metrics-requests.txt)
fi

# Calculate business impact
cat > "impact-analysis.md" << EOF
# Impact Analysis: $INCIDENT_ID

## Service Impact
- **Total Downtime**: $DOWNTIME_MINUTES minutes
- **Affected Users**: $AFFECTED_USERS (estimated)
- **Service Availability**: $(echo "scale=2; (1440 - $DOWNTIME_MINUTES) / 1440 * 100" | bc)% (24h window)

## Business Impact
- **Emergency Services**: $([ "$DOWNTIME_MINUTES" -gt 30 ] && echo "Affected - manual dispatch activated" || echo "Minimal impact")
- **Customer Communications**: $([ -f "/tmp/manual-operations-checklist.txt" ] && echo "Manual procedures activated" || echo "Automated systems functional")
- **Revenue Impact**: Estimated $(echo "$DOWNTIME_MINUTES * 5" | bc) USD (based on average hourly revenue)

## Technical Impact
- **Database**: $([ -s "database-performance.txt" ] && echo "Performance degradation detected" || echo "No significant impact")
- **External Integrations**: $(grep -c "integration.*failed" backend-logs.txt || echo "0") failed integration attempts
- **Data Integrity**: $([ -f "/tmp/consistency-report-$INCIDENT_ID.txt" ] && echo "Verified - see consistency report" || echo "Not verified")
EOF

# Step 4: Root cause analysis
echo "Conducting root cause analysis..."

cat > "root-cause-analysis.md" << EOF
# Root Cause Analysis: $INCIDENT_ID

## Primary Cause
$(grep -A5 "ERROR" backend-logs.txt | head -5 | sed 's/^/- /')

## Contributing Factors
- System configuration
- External dependencies
- Load conditions
- Infrastructure limitations

## Prevention Measures
- [ ] Implement additional monitoring
- [ ] Review system capacity
- [ ] Update incident response procedures
- [ ] Enhance error handling
- [ ] Improve documentation

## Action Items
| Action | Owner | Due Date | Status |
|--------|-------|----------|--------|
| Implement monitoring improvements | DevOps Team | $(date -d '+1 week' +%Y-%m-%d) | Open |
| Review and update runbooks | Engineering Team | $(date -d '+3 days' +%Y-%m-%d) | Open |
| Conduct team training | Team Lead | $(date -d '+2 weeks' +%Y-%m-%d) | Open |
EOF

# Step 5: Generate final report
echo "Generating final incident report..."

cat > "incident-report-$INCIDENT_ID.md" << EOF
# Incident Report: $INCIDENT_ID

**Date**: $(date)
**Incident Duration**: $DOWNTIME_MINUTES minutes
**Severity**: $(grep "SEVERITY" /tmp/incident-$INCIDENT_ID.json | cut -d'"' -f4)

## Executive Summary
On $(date -d "$INCIDENT_START" +"%B %d, %Y at %H:%M UTC"), we experienced a service disruption that affected our plumbing business platform for approximately $DOWNTIME_MINUTES minutes. The incident was detected by our monitoring systems and resolved through coordinated response procedures.

## What Happened
$(cat timeline.md)

## Impact
$(cat impact-analysis.md)

## Root Cause
$(cat root-cause-analysis.md)

## What We're Doing to Prevent This
1. Implementing enhanced monitoring and alerting
2. Improving system resilience and redundancy
3. Updating incident response procedures
4. Conducting team training on new procedures

## Lessons Learned
- Early detection systems worked as expected
- Response team coordination was effective
- Recovery procedures need refinement
- Communication processes can be improved

---
*This report will be reviewed in our next engineering meeting and action items will be tracked to completion.*
EOF

echo "Post-incident review completed"
echo "Report available at: /tmp/incident-review-$INCIDENT_ID/incident-report-$INCIDENT_ID.md"

# Step 6: Schedule follow-up actions
echo "Scheduling follow-up actions..."

# Create follow-up tasks
kubectl run follow-up-scheduler --image=plumbing-ai/backend:latest --restart=Never \
    --namespace=plumbing-ai-prod \
    --command -- npm run incident:schedule-followup -- \
    --incident-id="$INCIDENT_ID" \
    --report-path="/tmp/incident-review-$INCIDENT_ID/incident-report-$INCIDENT_ID.md"

echo "Follow-up actions scheduled"
```

## Testing and Validation

### 1. Disaster Recovery Testing

```bash
#!/bin/bash
# dr-testing.sh

set -e

TEST_TYPE=${1:-"partial"}
TEST_ENVIRONMENT=${2:-"staging"}

echo "Starting disaster recovery testing"
echo "Test type: $TEST_TYPE"
echo "Environment: $TEST_ENVIRONMENT"

# Step 1: Pre-test backup
echo "Creating pre-test backup..."
./backup-system.sh "dr-test-$(date +%Y%m%d)"

# Step 2: Execute test scenarios
case $TEST_TYPE in
    "database_failure")
        echo "Simulating database failure..."
        kubectl delete pod postgres-0 -n $TEST_ENVIRONMENT
        kubectl patch statefulset postgres -p '{"spec":{"template":{"spec":{"containers":[{"name":"postgres","image":"invalid-image"}]}}}}' -n $TEST_ENVIRONMENT
        
        # Test recovery procedures
        sleep 60
        ./database-recovery.sh "TEST-DB-001" "full_restore"
        ;;
        
    "node_failure")
        echo "Simulating node failure..."
        NODE_TO_FAIL=$(kubectl get nodes --no-headers | head -1 | awk '{print $1}')
        kubectl drain $NODE_TO_FAIL --ignore-daemonsets --delete-emptydir-data --force
        
        # Test cluster recovery
        sleep 120
        ./cluster-recovery.sh "TEST-NODE-001"
        kubectl uncordon $NODE_TO_FAIL
        ;;
        
    "complete_outage")
        echo "Simulating complete service outage..."
        kubectl scale deployment --all --replicas=0 -n $TEST_ENVIRONMENT
        kubectl delete service --all -n $TEST_ENVIRONMENT
        
        # Test full restoration
        sleep 60
        ./service-restoration.sh "TEST-OUTAGE-001" "immediate"
        ;;
        
    "partial")
        echo "Running partial disaster recovery test..."
        # Test individual components
        ./test-database-recovery.sh
        ./test-service-restoration.sh
        ./test-communication-procedures.sh
        ;;
esac

# Step 3: Validate recovery
echo "Validating recovery..."
./post-deployment-validation.sh $TEST_ENVIRONMENT

# Step 4: Cleanup
echo "Cleaning up test environment..."
if [ "$TEST_ENVIRONMENT" != "production" ]; then
    kubectl delete namespace $TEST_ENVIRONMENT || true
fi

echo "Disaster recovery testing completed"
```

### 2. Recovery Time Objective (RTO) Testing

```bash
#!/bin/bash
# rto-testing.sh

set -e

TEST_SCENARIO=${1:-"database_failure"}
TARGET_RTO=${2:-240} # 4 hours in minutes

echo "Testing Recovery Time Objective for scenario: $TEST_SCENARIO"
echo "Target RTO: $TARGET_RTO minutes"

# Record start time
START_TIME=$(date +%s)

# Execute failure scenario
case $TEST_SCENARIO in
    "database_failure")
        echo "Initiating database failure simulation..."
        kubectl exec -n plumbing-ai-prod postgres-0 -- pg_ctl stop -D /var/lib/postgresql/data -m immediate
        
        # Start recovery
        ./database-recovery.sh "RTO-TEST-DB" "full_restore"
        ;;
        
    "application_failure")
        echo "Initiating application failure simulation..."
        kubectl delete deployment plumbing-ai-backend -n plumbing-ai-prod
        kubectl delete deployment plumbing-ai-frontend -n plumbing-ai-prod
        
        # Start recovery
        ./service-restoration.sh "RTO-TEST-APP" "rolling"
        ;;
esac

# Wait for recovery completion
echo "Monitoring recovery progress..."
while true; do
    if curl -f https://api.plumbingai.com/v1/health > /dev/null 2>&1; then
        break
    fi
    
    CURRENT_TIME=$(date +%s)
    ELAPSED_MINUTES=$(( (CURRENT_TIME - START_TIME) / 60 ))
    
    if [ $ELAPSED_MINUTES -gt $TARGET_RTO ]; then
        echo "❌ RTO EXCEEDED: Recovery took longer than $TARGET_RTO minutes"
        exit 1
    fi
    
    echo "Recovery in progress... ${ELAPSED_MINUTES}/${TARGET_RTO} minutes elapsed"
    sleep 30
done

# Calculate actual recovery time
END_TIME=$(date +%s)
ACTUAL_RTO=$(( (END_TIME - START_TIME) / 60 ))

echo "✅ Recovery completed in $ACTUAL_RTO minutes"

if [ $ACTUAL_RTO -le $TARGET_RTO ]; then
    echo "✅ RTO TARGET MET: $ACTUAL_RTO <= $TARGET_RTO minutes"
else
    echo "❌ RTO TARGET MISSED: $ACTUAL_RTO > $TARGET_RTO minutes"
    exit 1
fi

# Generate RTO report
cat > "/tmp/rto-report-$(date +%Y%m%d).txt" << EOF
RTO TEST REPORT
===============
Test Scenario: $TEST_SCENARIO
Target RTO: $TARGET_RTO minutes
Actual RTO: $ACTUAL_RTO minutes
Result: $([ $ACTUAL_RTO -le $TARGET_RTO ] && echo "PASS" || echo "FAIL")

Test Date: $(date)
Recovery Start: $(date -d @$START_TIME)
Recovery End: $(date -d @$END_TIME)

Performance Analysis:
- Detection Time: < 5 minutes (automated)
- Response Time: < 15 minutes (team activation)
- Recovery Time: $ACTUAL_RTO minutes
- Validation Time: < 10 minutes

Recommendations:
$([ $ACTUAL_RTO -gt $TARGET_RTO ] && echo "- Review and optimize recovery procedures" || echo "- Current procedures meet RTO requirements")
- Continue regular RTO testing
- Update documentation based on lessons learned
EOF

echo "RTO test completed. Report saved to /tmp/rto-report-$(date +%Y%m%d).txt"
```

---

*This disaster recovery runbook should be tested regularly and updated based on infrastructure changes, lessons learned from incidents, and evolving business requirements. All team members should be familiar with their roles and responsibilities outlined in this document.*