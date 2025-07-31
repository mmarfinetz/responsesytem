# Staging Environment Configuration for Plumbing AI Platform

# Environment
environment = "staging"
aws_region  = "us-west-2"

# VPC Configuration
vpc_cidr                 = "10.1.0.0/16"
public_subnet_cidrs      = ["10.1.1.0/24", "10.1.2.0/24"]
private_subnet_cidrs     = ["10.1.10.0/24", "10.1.20.0/24"]
database_subnet_cidrs    = ["10.1.11.0/24", "10.1.21.0/24"]
availability_zone_count  = 2
enable_nat_gateway       = true
enable_vpn_gateway       = false

# EKS Configuration
eks_cluster_version      = "1.28"
eks_public_access        = true
eks_public_access_cidrs  = ["0.0.0.0/0"]  # Restrict in production

eks_node_groups = {
  general = {
    instance_types = ["t3.medium"]
    capacity_type  = "ON_DEMAND"
    min_size      = 1
    max_size      = 5
    desired_size  = 2
    disk_size     = 50
    labels = {
      node-type = "general"
    }
    taints = []
  }
  
  compute = {
    instance_types = ["t3.large"]
    capacity_type  = "SPOT"
    min_size      = 0
    max_size      = 3
    desired_size  = 1
    disk_size     = 50
    labels = {
      node-type = "compute"
    }
    taints = [{
      key    = "compute"
      value  = "true"
      effect = "NO_SCHEDULE"
    }]
  }
}

# RDS Configuration (Smaller for staging)
postgres_version               = "15.4"
rds_instance_class            = "db.t3.micro"
rds_allocated_storage         = 20
rds_max_allocated_storage     = 100
rds_backup_retention_period   = 3
rds_backup_window            = "03:00-04:00"
rds_maintenance_window       = "sun:04:00-sun:05:00"
rds_multi_az                 = false  # Single AZ for staging
db_username                  = "plumbing_user"

# Redis Configuration (Smaller for staging)
redis_version                    = "7.0"
redis_node_type                 = "cache.t3.micro"
redis_num_nodes                 = 1
redis_backup_retention_period   = 1
redis_snapshot_window           = "03:00-05:00"
redis_maintenance_window        = "sun:05:00-sun:07:00"

# Security Configuration
enable_waf                  = false  # Disable WAF for staging
enable_shield              = false
enable_encryption          = true
enable_audit_logging       = false

# Monitoring Configuration
enable_monitoring          = true
enable_logging            = true
enable_performance_insights = false  # Disable for cost savings

# Cost Optimization
enable_spot_instances      = true
enable_scheduled_scaling   = false

# Features
enable_cdn                = false  # Disable CDN for staging
enable_auto_scaling       = true
enable_service_mesh       = false
enable_bastion_host       = false
enable_vpn               = false

# Domain Configuration (staging subdomain)
domain_name  = "yourdomain.com"
subdomain    = "staging"

# Backup Configuration
enable_automated_backups = true
backup_retention_days   = 7

# Performance Configuration
enable_query_logging    = true  # Enable for debugging

# SSL Certificate (use staging certificate)
ssl_certificate_arn = ""  # Add staging certificate ARN