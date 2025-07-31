# Production Environment Configuration for Plumbing AI Platform

# Environment
environment = "production"
aws_region  = "us-west-2"

# VPC Configuration
vpc_cidr                 = "10.0.0.0/16"
public_subnet_cidrs      = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
private_subnet_cidrs     = ["10.0.10.0/24", "10.0.20.0/24", "10.0.30.0/24"]
database_subnet_cidrs    = ["10.0.11.0/24", "10.0.21.0/24", "10.0.31.0/24"]
availability_zone_count  = 3
enable_nat_gateway       = true
enable_vpn_gateway       = false

# EKS Configuration
eks_cluster_version      = "1.28"
eks_public_access        = true
eks_public_access_cidrs  = ["203.0.113.0/24"]  # Replace with your office/admin IP range

eks_node_groups = {
  general = {
    instance_types = ["t3.large", "t3.xlarge"]
    capacity_type  = "ON_DEMAND"
    min_size      = 3
    max_size      = 15
    desired_size  = 5
    disk_size     = 100
    labels = {
      node-type = "general"
    }
    taints = []
  }
  
  compute = {
    instance_types = ["c5.large", "c5.xlarge"]
    capacity_type  = "SPOT"
    min_size      = 0
    max_size      = 10
    desired_size  = 2
    disk_size     = 100
    labels = {
      node-type = "compute"
    }
    taints = [{
      key    = "compute"  
      value  = "true"
      effect = "NO_SCHEDULE"
    }]
  }
  
  memory_optimized = {
    instance_types = ["r5.large", "r5.xlarge"]
    capacity_type  = "ON_DEMAND"
    min_size      = 0
    max_size      = 5
    desired_size  = 1
    disk_size     = 100
    labels = {
      node-type = "memory-optimized"
    }
    taints = [{
      key    = "memory-optimized"
      value  = "true"
      effect = "NO_SCHEDULE"
    }]
  }
}

# RDS Configuration (Production sizing)
postgres_version               = "15.4"
rds_instance_class            = "db.r5.xlarge"
rds_allocated_storage         = 200
rds_max_allocated_storage     = 2000
rds_backup_retention_period   = 30
rds_backup_window            = "03:00-04:00"
rds_maintenance_window       = "sun:04:00-sun:05:00"
rds_multi_az                 = true  # High availability
db_username                  = "plumbing_user"

# Redis Configuration (Production sizing)
redis_version                    = "7.0"
redis_node_type                 = "cache.r6g.large"
redis_num_nodes                 = 2
redis_backup_retention_period   = 7
redis_snapshot_window           = "03:00-05:00"
redis_maintenance_window        = "sun:05:00-sun:07:00"

# Security Configuration
enable_waf                  = true
enable_shield              = true  # Enable for DDoS protection
enable_encryption          = true
enable_audit_logging       = true

# Monitoring Configuration
enable_monitoring          = true
enable_logging            = true
enable_performance_insights = true

# Cost Optimization (Production balance)
enable_spot_instances      = true  # Use spot for non-critical workloads
enable_scheduled_scaling   = true  # Scale based on predictable patterns

# Features
enable_cdn                = true
enable_auto_scaling       = true
enable_service_mesh       = false  # Enable if needed for microservices
enable_bastion_host       = false  # Use AWS Session Manager instead
enable_vpn               = false

# Domain Configuration
domain_name  = "yourdomain.com"
subdomain    = ""  # Main domain for production

# Backup Configuration
enable_automated_backups = true
backup_retention_days   = 30

# Performance Configuration
enable_query_logging    = false  # Disable to reduce overhead

# SSL Certificate (production certificate)
ssl_certificate_arn = ""  # Add production certificate ARN

# Compliance Settings
enable_encryption = true

# Resource Limits (Production)
# These would be used in modules for setting appropriate limits