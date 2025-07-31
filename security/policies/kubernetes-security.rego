# Kubernetes Security Policies for Plumbing AI Platform
package kubernetes.security

# Default deny all violations
default deny = false

# Security Context Policies
deny[msg] {
    input.kind == "Pod"
    input.spec.securityContext.runAsRoot == true
    msg := "Containers must not run as root user"
}

deny[msg] {
    input.kind == "Deployment"
    container := input.spec.template.spec.containers[_]
    not container.securityContext.runAsNonRoot
    msg := sprintf("Container '%s' must run as non-root user", [container.name])
}

deny[msg] {
    input.kind == "Deployment"
    container := input.spec.template.spec.containers[_]
    container.securityContext.allowPrivilegeEscalation == true
    msg := sprintf("Container '%s' must not allow privilege escalation", [container.name])
}

deny[msg] {
    input.kind == "Deployment"
    container := input.spec.template.spec.containers[_]
    not container.securityContext.readOnlyRootFilesystem
    msg := sprintf("Container '%s' must have read-only root filesystem", [container.name])
}

# Resource Limits Policies
deny[msg] {
    input.kind == "Deployment"
    container := input.spec.template.spec.containers[_]
    not container.resources.limits.memory
    msg := sprintf("Container '%s' must have memory limits", [container.name])
}

deny[msg] {
    input.kind == "Deployment"
    container := input.spec.template.spec.containers[_]
    not container.resources.limits.cpu
    msg := sprintf("Container '%s' must have CPU limits", [container.name])
}

deny[msg] {
    input.kind == "Deployment"
    container := input.spec.template.spec.containers[_]
    not container.resources.requests.memory
    msg := sprintf("Container '%s' must have memory requests", [container.name])
}

deny[msg] {
    input.kind == "Deployment"
    container := input.spec.template.spec.containers[_]
    not container.resources.requests.cpu
    msg := sprintf("Container '%s' must have CPU requests", [container.name])
}

# Image Security Policies
deny[msg] {
    input.kind == "Deployment"
    container := input.spec.template.spec.containers[_]
    endswith(container.image, ":latest")
    msg := sprintf("Container '%s' must not use 'latest' image tag", [container.name])
}

deny[msg] {
    input.kind == "Deployment"
    container := input.spec.template.spec.containers[_]
    not contains(container.image, ":")
    msg := sprintf("Container '%s' must specify image tag", [container.name])
}

deny[msg] {
    input.kind == "Deployment"
    container := input.spec.template.spec.containers[_]
    container.imagePullPolicy != "Always"
    container.imagePullPolicy != "IfNotPresent"
    msg := sprintf("Container '%s' must have valid imagePullPolicy", [container.name])
}

# Network Security Policies
deny[msg] {
    input.kind == "Service"
    input.spec.type == "LoadBalancer"
    not input.metadata.annotations["service.beta.kubernetes.io/aws-load-balancer-ssl-cert"]
    msg := "LoadBalancer services must use SSL certificates"
}

deny[msg] {
    input.kind == "Ingress"
    input.spec.tls == null
    msg := "Ingress must use TLS encryption"
}

# Storage Security Policies
deny[msg] {
    input.kind == "PersistentVolume"
    input.spec.accessModes[_] == "ReadWriteMany"
    not input.metadata.labels["encryption"] == "enabled"
    msg := "ReadWriteMany volumes should be encrypted"
}

# Secret Management Policies
deny[msg] {
    input.kind == "Pod"
    env := input.spec.containers[_].env[_]
    contains(lower(env.name), "password")
    env.value
    msg := "Passwords must not be stored as plain text environment variables"
}

deny[msg] {
    input.kind == "Pod"
    env := input.spec.containers[_].env[_]
    contains(lower(env.name), "secret")
    env.value
    msg := "Secrets must not be stored as plain text environment variables"
}

deny[msg] {
    input.kind == "Pod"
    env := input.spec.containers[_].env[_]
    contains(lower(env.name), "key")
    env.value
    msg := "API keys must not be stored as plain text environment variables"
}

# Capabilities and Privileged Access
deny[msg] {
    input.kind == "Pod"
    input.spec.containers[_].securityContext.privileged == true
    msg := "Containers must not run in privileged mode"
}

deny[msg] {
    input.kind == "Deployment"
    container := input.spec.template.spec.containers[_]
    container.securityContext.capabilities.add[_] == "SYS_ADMIN"
    msg := sprintf("Container '%s' must not have SYS_ADMIN capability", [container.name])
}

deny[msg] {
    input.kind == "Deployment"
    container := input.spec.template.spec.containers[_]
    container.securityContext.capabilities.add[_] == "NET_ADMIN"
    msg := sprintf("Container '%s' must not have NET_ADMIN capability", [container.name])
}

# Pod Security Standards
deny[msg] {
    input.kind == "Pod"
    input.spec.hostNetwork == true
    msg := "Pods must not use host network"
}

deny[msg] {
    input.kind == "Pod"
    input.spec.hostPID == true
    msg := "Pods must not use host PID namespace"
}

deny[msg] {
    input.kind == "Pod"
    input.spec.hostIPC == true
    msg := "Pods must not use host IPC namespace"
}

# Volume Mount Security
deny[msg] {
    input.kind == "Pod"
    volume := input.spec.volumes[_]
    volume.hostPath.path == "/"
    msg := "Pods must not mount root filesystem"
}

deny[msg] {
    input.kind == "Pod"
    volume := input.spec.volumes[_]
    startswith(volume.hostPath.path, "/var/run/docker.sock")
    msg := "Pods must not mount Docker socket"
}

# Service Account Security
deny[msg] {
    input.kind == "Pod"
    input.spec.automountServiceAccountToken == true
    not input.spec.serviceAccountName
    msg := "Pods with automountServiceAccountToken must specify serviceAccountName"
}

# Label and Annotation Requirements
required_labels := ["app", "version", "component"]

deny[msg] {
    input.kind == "Deployment"
    missing_labels := [label | label := required_labels[_]; not input.metadata.labels[label]]
    count(missing_labels) > 0
    msg := sprintf("Deployment must have required labels: %v", [missing_labels])
}

# Health Check Requirements
deny[msg] {
    input.kind == "Deployment"
    container := input.spec.template.spec.containers[_]
    not container.livenessProbe
    msg := sprintf("Container '%s' must have liveness probe", [container.name])
}

deny[msg] {
    input.kind == "Deployment"
    container := input.spec.template.spec.containers[_]
    not container.readinessProbe
    msg := sprintf("Container '%s' must have readiness probe", [container.name])
}

# Resource Quotas and Limits
deny[msg] {
    input.kind == "Namespace"
    not input.metadata.name == "kube-system"
    not input.metadata.name == "kube-public"
    not [rq | rq := data.kubernetes.resourcequotas[_]; rq.metadata.namespace == input.metadata.name][0]
    msg := "Namespace must have ResourceQuota defined"
}

# Admission Controller Policies
deny[msg] {
    input.kind == "Pod"
    container := input.spec.containers[_]
    container.securityContext.runAsUser == 0
    msg := sprintf("Container '%s' must not run as UID 0", [container.name])
}

# Network Policy Requirements
deny[msg] {
    input.kind == "Namespace"
    input.metadata.name != "kube-system"
    input.metadata.name != "kube-public"
    not [np | np := data.kubernetes.networkpolicies[_]; np.metadata.namespace == input.metadata.name][0]
    msg := "Namespace should have NetworkPolicy defined for network segmentation"
}

# Custom Plumbing AI specific policies
deny[msg] {
    input.kind == "Deployment"
    contains(input.metadata.name, "plumbing-ai")
    container := input.spec.template.spec.containers[_]
    not container.env[_].name == "NODE_ENV"
    msg := "Plumbing AI containers must have NODE_ENV environment variable"
}

deny[msg] {
    input.kind == "Service"
    contains(input.metadata.name, "plumbing-ai")
    input.spec.type == "LoadBalancer"
    not input.metadata.annotations["prometheus.io/scrape"]
    msg := "Plumbing AI services must be configured for Prometheus monitoring"
}

# Database Security Policies
deny[msg] {
    input.kind == "Deployment"
    contains(input.metadata.name, "postgres")
    container := input.spec.template.spec.containers[_]
    env := container.env[_]
    env.name == "POSTGRES_PASSWORD"
    env.value
    msg := "Database passwords must use secrets, not plain text"
}

deny[msg] {
    input.kind == "Service"
    contains(input.metadata.name, "postgres")
    input.spec.type == "LoadBalancer"
    msg := "Database services must not be exposed via LoadBalancer"
}

# Helper functions
contains(string, substr) {
    indexof(string, substr) != -1
}

startswith(string, prefix) {
    indexof(string, prefix) == 0
}

endswith(string, suffix) {
    suffix_len := count(suffix)
    string_len := count(string)
    suffix_len <= string_len
    substring(string, string_len - suffix_len, suffix_len) == suffix
}

lower(string) = result {
    result := to_number(string)
} else = result {
    result := sprintf("%s", [string])
}