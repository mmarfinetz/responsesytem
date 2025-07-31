# Container Security Hardening Guide for Plumbing AI Platform

## Overview

This document outlines the security hardening measures implemented for containers in the Plumbing AI Platform to ensure robust protection against security threats.

## Container Base Image Security

### Base Image Selection
- **Use Official Images**: Only use official images from trusted registries
- **Minimal Base Images**: Prefer Alpine Linux or distroless images
- **Regular Updates**: Keep base images up-to-date with security patches

```dockerfile
# Good: Use official Alpine image
FROM node:18-alpine

# Better: Use distroless for production
FROM gcr.io/distroless/nodejs18-debian11
```

### Image Scanning
- **Vulnerability Scanning**: All images scanned with Trivy and Grype
- **Continuous Monitoring**: Automated scanning in CI/CD pipeline
- **Registry Security**: Container registry with built-in security scanning

## Runtime Security Configuration

### User and Permissions
```dockerfile
# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Switch to non-root user
USER nextjs
```

### Kubernetes Security Context
```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 1001
  runAsGroup: 1001
  fsGroup: 1001
  allowPrivilegeEscalation: false
  readOnlyRootFilesystem: true
  capabilities:
    drop:
      - ALL
    add:
      - NET_BIND_SERVICE
```

## File System Security

### Read-Only Root Filesystem
- All containers run with read-only root filesystem
- Writable volumes mounted only where necessary
- Temporary directories use tmpfs volumes

```yaml
volumeMounts:
- name: tmp-volume
  mountPath: /tmp
- name: app-logs
  mountPath: /app/logs
volumes:
- name: tmp-volume
  emptyDir: {}
- name: app-logs
  persistentVolumeClaim:
    claimName: app-logs-pvc
```

### File Permissions
```dockerfile
# Set proper file permissions
RUN chmod -R 755 /app && \
    chown -R nextjs:nodejs /app

# Remove unnecessary files
RUN rm -rf /tmp/* /var/tmp/* /var/cache/apk/*
```

## Network Security

### Network Policies
- Ingress and egress traffic controlled by Kubernetes NetworkPolicies
- Zero-trust network model implementation
- Service mesh integration for additional security

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: plumbing-ai-network-policy
spec:
  podSelector:
    matchLabels:
      app: plumbing-ai-platform
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          name: plumbing-ai
    ports:
    - protocol: TCP
      port: 3000
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          name: plumbing-ai
    ports:
    - protocol: TCP
      port: 5432  # PostgreSQL
    - protocol: TCP
      port: 6379  # Redis
```

### TLS/SSL Configuration
- All inter-service communication encrypted with TLS
- Certificate management with cert-manager
- HTTPS enforcement for all external traffic

## Resource Constraints

### Resource Limits
```yaml
resources:
  requests:
    memory: "512Mi"
    cpu: "250m"
  limits:
    memory: "2Gi"
    cpu: "1000m"
```

### Pod Disruption Budgets
```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: backend-pdb
spec:
  minAvailable: 2
  selector:
    matchLabels:
      app: plumbing-ai-platform
      component: backend
```

## Secrets Management

### Secret Storage
- All secrets stored in Kubernetes Secrets or external secret management
- No plaintext secrets in environment variables
- Secret rotation policies implemented

```yaml
env:
- name: DB_PASSWORD
  valueFrom:
    secretKeyRef:
      name: plumbing-ai-secrets
      key: DB_PASSWORD
```

### External Secrets Integration
```yaml
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-secrets-manager
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-west-2
      auth:
        jwt:
          serviceAccountRef:
            name: external-secrets-sa
```

## Health and Monitoring

### Health Checks
```yaml
livenessProbe:
  httpGet:
    path: /api/health
    port: 3000
  initialDelaySeconds: 60
  periodSeconds: 30
  timeoutSeconds: 10
  failureThreshold: 3

readinessProbe:
  httpGet:
    path: /api/health/ready
    port: 3000
  initialDelaySeconds: 30
  periodSeconds: 10
  timeoutSeconds: 5
  failureThreshold: 3
```

### Security Monitoring
- Runtime security monitoring with Falco
- Container behavior analysis
- Anomaly detection and alerting

## Compliance and Auditing

### CIS Kubernetes Benchmark
- Pod Security Standards enforcement
- RBAC implementation
- Network segmentation
- Audit logging enabled

### SOC 2 Compliance
- Access controls and authentication
- Encryption at rest and in transit
- Monitoring and logging
- Incident response procedures

## Container Registry Security

### Image Signing
```bash
# Sign container images
docker trust sign plumbing-ai/backend:v1.0.0

# Verify signatures
docker trust inspect plumbing-ai/backend:v1.0.0
```

### Registry Access Control
- Role-based access to container registry
- Multi-factor authentication required
- Regular access review and cleanup

## Security Scanning Integration

### Automated Scanning
```yaml
# Trivy scanner configuration
trivy:
  ignoreUnfixed: true
  severity: HIGH,CRITICAL
  format: sarif
  output: trivy-results.sarif
```

### Vulnerability Management
- Automated vulnerability tracking
- Priority-based remediation
- Integration with security team workflows

## Runtime Protection

### AppArmor/SELinux
```yaml
annotations:
  container.apparmor.security.beta.kubernetes.io/backend: runtime/default
```

### Seccomp Profiles
```yaml
securityContext:
  seccompProfile:
    type: RuntimeDefault
```

### Privileged Container Prevention
```yaml
# Pod Security Policy (deprecated) or Pod Security Standards
securityContext:
  privileged: false
  allowPrivilegeEscalation: false
  runAsNonRoot: true
  capabilities:
    drop:
      - ALL
```

## Incident Response

### Security Incident Handling
1. **Detection**: Automated alerts for security events
2. **Containment**: Immediate pod isolation and traffic blocking
3. **Investigation**: Log analysis and forensic data collection
4. **Recovery**: Clean deployment and system restoration
5. **Lessons Learned**: Post-incident review and process improvement

### Emergency Procedures
```bash
# Emergency container isolation
kubectl label pod suspicious-pod-123 quarantine=true

# Network isolation
kubectl apply -f security/quarantine-network-policy.yaml

# Force pod restart
kubectl delete pod suspicious-pod-123
```

## Security Testing

### Container Security Tests
```bash
# Run container security tests
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image plumbing-ai/backend:latest

# Kubernetes security benchmark
kube-bench run --targets node,policies,managedservices
```

### Penetration Testing
- Regular security assessments
- Container escape testing
- Network segmentation validation
- Access control verification

## Best Practices Summary

1. **Principle of Least Privilege**: Containers run with minimal permissions
2. **Defense in Depth**: Multiple layers of security controls
3. **Zero Trust**: No implicit trust between components
4. **Continuous Monitoring**: Real-time security monitoring and alerting
5. **Regular Updates**: Automated security updates and patching
6. **Incident Preparedness**: Documented response procedures
7. **Compliance**: Adherence to security standards and regulations

## Security Checklist

- [ ] All containers run as non-root users
- [ ] Read-only root filesystems implemented
- [ ] Resource limits and requests configured
- [ ] Network policies restrict traffic
- [ ] Secrets properly managed
- [ ] Health checks configured
- [ ] Security scanning integrated
- [ ] Monitoring and alerting active
- [ ] Backup and recovery tested
- [ ] Incident response procedures documented
- [ ] Compliance requirements met
- [ ] Security training completed

## Maintenance and Updates

### Regular Security Reviews
- Monthly security posture assessment
- Quarterly penetration testing
- Annual security audit
- Continuous compliance monitoring

### Update Procedures
1. Security patch assessment
2. Testing in staging environment
3. Gradual rollout to production
4. Monitoring and validation
5. Rollback procedures if needed

This security hardening guide ensures that the Plumbing AI Platform maintains the highest security standards throughout its deployment and operation lifecycle.