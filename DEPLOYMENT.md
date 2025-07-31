# Plumbing AI Platform - Production Deployment Guide

## Overview

This guide provides comprehensive instructions for deploying the Plumbing AI Platform to production environments with high availability, security, and scalability.

## Architecture Overview

The platform consists of:
- **Frontend**: React application with Nginx
- **Backend**: Node.js API with TypeScript
- **Database**: PostgreSQL with read replicas
- **Cache**: Redis cluster
- **AI Services**: Anthropic Claude integration
- **Monitoring**: Prometheus, Grafana, ELK stack
- **Infrastructure**: Kubernetes on AWS EKS

## Prerequisites

### Required Tools
- Docker >= 20.10.0
- kubectl >= 1.28.0
- Helm >= 3.12.0
- Terraform >= 1.6.0
- AWS CLI >= 2.0.0
- Node.js >= 18.0.0

### AWS Requirements
- AWS Account with appropriate permissions
- Route53 hosted zone (for custom domain)
- ACM SSL certificate
- S3 bucket for Terraform state
- IAM roles for EKS and services

### Secrets Management
- AWS Secrets Manager or HashiCorp Vault
- GPG keys for backup encryption
- API keys (Anthropic, Google OAuth)

## Quick Start

### 1. Environment Setup

```bash
# Clone the repository
git clone https://github.com/your-org/plumbing-ai-platform.git
cd plumbing-ai-platform

# Setup production environment
chmod +x scripts/setup-environment.sh
./scripts/setup-environment.sh production
```

### 2. Configure Secrets

```bash
# Create secrets in AWS Secrets Manager
aws secretsmanager create-secret \
  --name "plumbing-ai/production/database" \
  --description "Database credentials" \
  --secret-string '{"username":"plumbing_user","password":"your_secure_password"}'

aws secretsmanager create-secret \
  --name "plumbing-ai/production/jwt" \
  --description "JWT secret" \
  --secret-string '{"secret":"your_jwt_secret_key"}'

aws secretsmanager create-secret \
  --name "plumbing-ai/production/anthropic" \
  --description "Anthropic API key" \
  --secret-string '{"api_key":"your_anthropic_api_key"}'
```

### 3. Deploy Infrastructure

```bash
cd terraform

# Initialize Terraform
terraform init \
  -backend-config="bucket=your-terraform-state-bucket" \
  -backend-config="key=plumbing-ai/production/terraform.tfstate" \
  -backend-config="region=us-west-2"

# Plan deployment
terraform plan -var-file=environments/production.tfvars -out=production.plan

# Apply infrastructure
terraform apply production.plan
```

### 4. Deploy Application

```bash
# Configure kubectl
aws eks update-kubeconfig --region us-west-2 --name plumbing-ai-production-cluster

# Create namespace
kubectl create namespace plumbing-ai

# Apply Kubernetes manifests
kubectl apply -f k8s/ -n plumbing-ai

# Verify deployment
kubectl get pods -n plumbing-ai
kubectl get services -n plumbing-ai
```

## Detailed Deployment Steps

### Infrastructure Deployment

#### 1. VPC and Networking
```bash
# The Terraform configuration creates:
# - VPC with public/private subnets across 3 AZs
# - NAT Gateways for private subnet internet access
# - Security groups with least privilege access
# - VPC endpoints for AWS services
```

#### 2. EKS Cluster
```bash
# EKS cluster with:
# - Managed node groups with auto-scaling
# - Multiple instance types for cost optimization
# - Pod security standards enforcement
# - AWS Load Balancer Controller
# - EBS CSI driver for persistent storage
```

#### 3. Database (RDS)
```bash
# PostgreSQL RDS instance with:
# - Multi-AZ deployment for high availability
# - Automated backups with point-in-time recovery
# - Performance Insights enabled
# - Parameter groups optimized for workload
# - Read replicas for improved performance
```

#### 4. Cache (ElastiCache)
```bash
# Redis ElastiCache cluster with:
# - Cluster mode enabled for high availability
# - Automatic failover
# - In-transit and at-rest encryption
# - Backup and restore capabilities
```

### Application Deployment

#### 1. Container Images
```bash
# Build and push container images
docker build -t ghcr.io/your-org/plumbing-ai-backend:latest ./backend
docker build -t ghcr.io/your-org/plumbing-ai-frontend:latest ./frontend

docker push ghcr.io/your-org/plumbing-ai-backend:latest
docker push ghcr.io/your-org/plumbing-ai-frontend:latest
```

#### 2. Kubernetes Deployment
```bash
# Apply configurations in order
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/postgres.yaml
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/backend.yaml
kubectl apply -f k8s/frontend.yaml
kubectl apply -f k8s/ingress.yaml
```

#### 3. Database Migration
```bash
# Run database migrations
kubectl run migration-job \
  --image=ghcr.io/your-org/plumbing-ai-backend:latest \
  --restart=Never \
  --namespace=plumbing-ai \
  --command -- npm run db:migrate

# Verify migration
kubectl logs migration-job -n plumbing-ai
```

### Monitoring Setup

#### 1. Prometheus and Grafana
```bash
# Add Helm repositories
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

# Install Prometheus
helm install prometheus prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --create-namespace \
  --values config/prometheus/values.yaml

# Install Grafana dashboards
kubectl apply -f config/grafana/dashboards/ -n monitoring
```

#### 2. Centralized Logging
```bash
# Install ELK stack
helm repo add elastic https://helm.elastic.co
helm install elasticsearch elastic/elasticsearch \
  --namespace logging \
  --create-namespace \
  --values config/elasticsearch/values.yaml

helm install kibana elastic/kibana \
  --namespace logging \
  --values config/kibana/values.yaml

helm install logstash elastic/logstash \
  --namespace logging \
  --values config/logstash/values.yaml
```

### Security Configuration

#### 1. Network Policies
```bash
# Apply network policies for micro-segmentation
kubectl apply -f security/network-policies/ -n plumbing-ai
```

#### 2. Pod Security Standards
```bash
# Enable Pod Security Standards
kubectl label namespace plumbing-ai \
  pod-security.kubernetes.io/enforce=restricted \
  pod-security.kubernetes.io/audit=restricted \
  pod-security.kubernetes.io/warn=restricted
```

#### 3. RBAC Configuration
```bash
# Apply RBAC policies
kubectl apply -f security/rbac/ -n plumbing-ai
```

### Backup and Disaster Recovery

#### 1. Automated Backups
```bash
# Deploy backup CronJobs
kubectl apply -f k8s/backup-cronjob.yaml -n plumbing-ai

# Verify backup configuration
kubectl get cronjobs -n plumbing-ai
```

#### 2. Disaster Recovery Testing
```bash
# Test backup restoration
./scripts/disaster-recovery/restore-database.sh 2024-01-15_03-00-00 database-only

# Verify restoration
kubectl exec -it postgres-0 -n plumbing-ai -- psql -U plumbing_user -d plumbing_ai -c "SELECT COUNT(*) FROM customers;"
```

## Configuration

### Environment Variables

#### Production Environment File
```env
# Production Environment Configuration
NODE_ENV=production
APP_NAME=Plumbing AI Platform

# Database Configuration
DB_HOST=plumbing-ai-postgres.cluster-xyz.us-west-2.rds.amazonaws.com
DB_PORT=5432
DB_NAME=plumbing_ai
DB_USER=plumbing_user
DB_PASSWORD_SECRET_ARN=arn:aws:secretsmanager:us-west-2:123456789:secret:plumbing-ai/database

# Cache Configuration
REDIS_HOST=plumbing-ai-redis.xyz.cache.amazonaws.com
REDIS_PORT=6379
REDIS_PASSWORD_SECRET_ARN=arn:aws:secretsmanager:us-west-2:123456789:secret:plumbing-ai/redis

# AI Configuration
ANTHROPIC_API_KEY_SECRET_ARN=arn:aws:secretsmanager:us-west-2:123456789:secret:plumbing-ai/anthropic

# Security
JWT_SECRET_ARN=arn:aws:secretsmanager:us-west-2:123456789:secret:plumbing-ai/jwt
WEBHOOK_SECRET_ARN=arn:aws:secretsmanager:us-west-2:123456789:secret:plumbing-ai/webhook

# Performance
MAX_CONNECTIONS=200
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=900000

# Monitoring
ENABLE_METRICS=true
METRICS_PORT=9090
LOG_LEVEL=warn
```

### Terraform Variables

#### Production Variables File
```hcl
# Production Configuration
environment = "production"
aws_region  = "us-west-2"

# VPC Configuration
vpc_cidr                 = "10.0.0.0/16"
availability_zone_count  = 3
enable_nat_gateway       = true

# EKS Configuration
eks_cluster_version      = "1.28"
eks_public_access        = true
eks_public_access_cidrs  = ["203.0.113.0/24"]  # Your office IP range

# RDS Configuration
postgres_version               = "15.4"
rds_instance_class            = "db.r5.xlarge"
rds_allocated_storage         = 200
rds_max_allocated_storage     = 2000
rds_multi_az                 = true
rds_backup_retention_period   = 30

# Redis Configuration
redis_version           = "7.0"
redis_node_type        = "cache.r6g.large"
redis_num_nodes        = 2

# Security Configuration
enable_waf             = true
enable_encryption      = true
enable_audit_logging   = true

# Domain Configuration
domain_name = "yourdomain.com"
subdomain   = ""
```

## Scaling and Performance

### Auto-Scaling Configuration

#### Horizontal Pod Autoscaler
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: backend-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: backend
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

#### Cluster Autoscaler
```bash
# Enable cluster autoscaler
kubectl apply -f https://raw.githubusercontent.com/kubernetes/autoscaler/master/cluster-autoscaler/cloudprovider/aws/examples/cluster-autoscaler-autodiscover.yaml

# Configure for your cluster
kubectl patch deployment cluster-autoscaler \
  -n kube-system \
  -p '{"spec":{"template":{"metadata":{"annotations":{"cluster-autoscaler.kubernetes.io/safe-to-evict": "false"}},"spec":{"containers":[{"name":"cluster-autoscaler","command":["./cluster-autoscaler","--v=4","--stderrthreshold=info","--cloud-provider=aws","--skip-nodes-with-local-storage=false","--expander=least-waste","--node-group-auto-discovery=asg:tag=k8s.io/cluster-autoscaler/enabled,k8s.io/cluster-autoscaler/plumbing-ai-production-cluster"],"image":"k8s.gcr.io/autoscaling/cluster-autoscaler:v1.28.0"}]}}}}'
```

### Performance Tuning

#### Database Optimization
```sql
-- Production PostgreSQL configuration
-- In RDS Parameter Group
shared_preload_libraries = 'pg_stat_statements'
max_connections = 200
shared_buffers = '2GB'
effective_cache_size = '6GB'
work_mem = '32MB'
maintenance_work_mem = '512MB'
checkpoint_completion_target = 0.9
```

#### Redis Configuration
```conf
# Production Redis configuration
maxmemory 2gb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
```

## Monitoring and Alerting

### Key Metrics to Monitor

#### Application Metrics
- Response time (95th percentile < 500ms)
- Error rate (< 0.1%)
- Throughput (requests per second)
- Active connections
- Queue depth

#### Business Metrics
- Emergency response time (< 5 minutes)
- Customer satisfaction score (> 4.5/5)
- Technician utilization (60-85%)
- Revenue per hour
- Job completion rate (> 95%)

#### Infrastructure Metrics
- CPU utilization (< 80%)
- Memory utilization (< 85%)
- Disk usage (< 80%)
- Network I/O
- Database connections

### Alert Configuration
```yaml
# Critical alerts (PagerDuty/SMS)
- Emergency response SLA breach
- Database connection failure
- High error rate (> 1%)
- Service unavailability

# Warning alerts (Slack/Email)
- High response time
- Resource utilization
- Failed backup
- Certificate expiration
```

## Security

### Security Checklist

- [ ] All containers run as non-root users
- [ ] Pod Security Standards enforced
- [ ] Network policies implemented
- [ ] Secrets stored in AWS Secrets Manager
- [ ] TLS encryption for all communications
- [ ] Regular security scanning enabled
- [ ] WAF configured and active
- [ ] Audit logging enabled
- [ ] Backup encryption enabled
- [ ] Access controls and RBAC configured

### Compliance

#### SOC 2 Requirements
- Access controls and authentication
- Encryption at rest and in transit
- Audit logging and monitoring
- Incident response procedures
- Regular security assessments

#### GDPR Compliance
- Data encryption and protection
- User consent management
- Data retention policies
- Right to deletion implementation
- Privacy by design principles

## Troubleshooting

### Common Issues

#### Pod Startup Issues
```bash
# Check pod status
kubectl get pods -n plumbing-ai

# Check pod logs
kubectl logs <pod-name> -n plumbing-ai

# Describe pod for events
kubectl describe pod <pod-name> -n plumbing-ai
```

#### Database Connection Issues
```bash
# Test database connectivity
kubectl run db-test \
  --image=postgres:15-alpine \
  --rm -it --restart=Never \
  -- psql -h postgres-service -U plumbing_user -d plumbing_ai

# Check database logs
kubectl logs postgres-0 -n plumbing-ai
```

#### Performance Issues
```bash
# Check resource usage
kubectl top pods -n plumbing-ai
kubectl top nodes

# Check HPA status
kubectl get hpa -n plumbing-ai

# Check metrics
kubectl port-forward svc/prometheus-server 9090:80 -n monitoring
# Access http://localhost:9090
```

### Emergency Procedures

#### Service Outage Response
1. **Assess Impact**: Check monitoring dashboards
2. **Isolate Issue**: Review logs and metrics
3. **Implement Fix**: Deploy hotfix or rollback
4. **Verify Recovery**: Confirm service restoration
5. **Communicate**: Update stakeholders
6. **Post-Mortem**: Document and improve

#### Database Recovery
```bash
# Emergency database restoration
./scripts/disaster-recovery/restore-database.sh <backup-date> database-only

# Verify data integrity
kubectl exec -it postgres-0 -n plumbing-ai -- psql -U plumbing_user -d plumbing_ai -c "SELECT COUNT(*) FROM critical_table;"
```

## Maintenance

### Regular Maintenance Tasks

#### Weekly
- Review monitoring dashboards and alerts
- Check backup success and integrity
- Update dependency security patches
- Review resource utilization and scaling

#### Monthly
- Security vulnerability scanning
- Performance optimization review
- Disaster recovery testing
- Access control audit

#### Quarterly
- Full security assessment
- Capacity planning review
- Cost optimization analysis
- Business continuity testing

### Update Procedures

#### Application Updates
```bash
# Build new version
docker build -t ghcr.io/your-org/plumbing-ai-backend:v1.1.0 ./backend

# Update deployment
kubectl set image deployment/backend backend=ghcr.io/your-org/plumbing-ai-backend:v1.1.0 -n plumbing-ai

# Monitor rollout
kubectl rollout status deployment/backend -n plumbing-ai

# Rollback if needed
kubectl rollout undo deployment/backend -n plumbing-ai
```

#### Infrastructure Updates
```bash
# Update Terraform configuration
terraform plan -var-file=environments/production.tfvars

# Apply changes
terraform apply

# Update Kubernetes configurations
kubectl apply -f k8s/ -n plumbing-ai
```

## Support and Documentation

### Documentation Links
- [Architecture Overview](docs/ARCHITECTURE.md)
- [API Documentation](docs/API.md)
- [Monitoring Guide](docs/MONITORING.md)
- [Security Guide](docs/SECURITY.md)
- [Troubleshooting Guide](docs/TROUBLESHOOTING.md)

### Contact Information
- **Technical Issues**: platform-team@company.com
- **Security Issues**: security@company.com
- **Emergency Contact**: +1-555-EMERGENCY

### Support Escalation
1. **Level 1**: Development team (business hours)
2. **Level 2**: Senior engineers (extended hours)
3. **Level 3**: Architecture team (on-call)
4. **Emergency**: Emergency response team (24/7)

---

## Conclusion

This deployment guide provides a comprehensive approach to deploying the Plumbing AI Platform with enterprise-grade reliability, security, and scalability. Regular monitoring, maintenance, and updates ensure optimal performance and security posture.

For additional support or questions, please refer to the documentation links above or contact the platform team.