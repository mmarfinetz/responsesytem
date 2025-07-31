# Outputs for Plumbing AI Platform Infrastructure

# VPC Outputs
output "vpc_id" {
  description = "ID of the VPC"
  value       = module.vpc.vpc_id
}

output "vpc_cidr_block" {
  description = "CIDR block of the VPC"
  value       = module.vpc.vpc_cidr_block
}

output "public_subnets" {
  description = "List of public subnet IDs"
  value       = module.vpc.public_subnets
}

output "private_subnets" {
  description = "List of private subnet IDs"
  value       = module.vpc.private_subnets
}

output "database_subnets" {
  description = "List of database subnet IDs"
  value       = module.vpc.database_subnets
}

# EKS Outputs
output "eks_cluster_id" {
  description = "EKS cluster ID"
  value       = module.eks.cluster_id
}

output "eks_cluster_name" {
  description = "EKS cluster name"
  value       = module.eks.cluster_name
}

output "eks_cluster_arn" {
  description = "EKS cluster ARN"
  value       = module.eks.cluster_arn
}

output "eks_cluster_endpoint" {
  description = "EKS cluster endpoint"
  value       = module.eks.cluster_endpoint
}

output "eks_cluster_version" {
  description = "EKS cluster Kubernetes version"
  value       = module.eks.cluster_version
}

output "eks_cluster_certificate_authority_data" {
  description = "Base64 encoded certificate data required to communicate with the cluster"
  value       = module.eks.cluster_certificate_authority_data
}

output "eks_node_groups" {
  description = "EKS node groups"
  value       = module.eks.node_groups
}

output "eks_oidc_issuer_url" {
  description = "The URL on the EKS cluster OIDC Issuer"
  value       = module.eks.cluster_oidc_issuer_url
}

# RDS Outputs
output "rds_instance_id" {
  description = "RDS instance ID"
  value       = module.rds.db_instance_id
}

output "rds_instance_arn" {
  description = "RDS instance ARN"
  value       = module.rds.db_instance_arn
}

output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = module.rds.db_instance_endpoint
  sensitive   = true
}

output "rds_port" {
  description = "RDS instance port"
  value       = module.rds.db_instance_port
}

output "rds_database_name" {
  description = "RDS database name"
  value       = module.rds.db_instance_name
}

output "rds_username" {
  description = "RDS database username"
  value       = module.rds.db_instance_username
  sensitive   = true
}

# Redis Outputs
output "redis_cluster_id" {
  description = "Redis cluster ID"
  value       = module.redis.cluster_id
}

output "redis_endpoint" {
  description = "Redis endpoint"
  value       = module.redis.primary_endpoint_address
  sensitive   = true
}

output "redis_port" {
  description = "Redis port"
  value       = module.redis.port
}

# Load Balancer Outputs
output "alb_id" {
  description = "Application Load Balancer ID"
  value       = module.alb.lb_id
}

output "alb_arn" {
  description = "Application Load Balancer ARN"
  value       = module.alb.lb_arn
}

output "alb_dns_name" {
  description = "Application Load Balancer DNS name"
  value       = module.alb.lb_dns_name
}

output "alb_zone_id" {
  description = "Application Load Balancer zone ID"
  value       = module.alb.lb_zone_id
}

output "alb_target_groups" {
  description = "Application Load Balancer target groups"
  value       = module.alb.target_group_arns
}

# ECR Outputs
output "ecr_backend_repository_url" {
  description = "Backend ECR repository URL"
  value       = aws_ecr_repository.backend.repository_url
}

output "ecr_frontend_repository_url" {
  description = "Frontend ECR repository URL"
  value       = aws_ecr_repository.frontend.repository_url
}

output "ecr_backend_registry_id" {
  description = "Backend ECR registry ID"
  value       = aws_ecr_repository.backend.registry_id
}

output "ecr_frontend_registry_id" {
  description = "Frontend ECR registry ID"
  value       = aws_ecr_repository.frontend.registry_id
}

# Security Group Outputs
output "database_security_group_id" {
  description = "Database security group ID"
  value       = module.security_groups.database_sg_id
}

output "redis_security_group_id" {
  description = "Redis security group ID"
  value       = module.security_groups.redis_sg_id
}

output "alb_security_group_id" {
  description = "ALB security group ID"
  value       = module.security_groups.alb_sg_id
}

output "eks_security_group_id" {
  description = "EKS security group ID"
  value       = module.security_groups.eks_sg_id
}

# S3 Outputs
output "backup_bucket_id" {
  description = "Backup S3 bucket ID"
  value       = aws_s3_bucket.backups.id
}

output "backup_bucket_arn" {
  description = "Backup S3 bucket ARN"
  value       = aws_s3_bucket.backups.arn
}

# IAM Outputs
output "rds_monitoring_role_arn" {
  description = "RDS enhanced monitoring role ARN"
  value       = aws_iam_role.rds_enhanced_monitoring.arn
}

# Networking Information
output "nat_gateway_ids" {
  description = "List of NAT Gateway IDs"
  value       = module.vpc.natgw_ids
}

output "internet_gateway_id" {
  description = "Internet Gateway ID"
  value       = module.vpc.igw_id
}

# DNS and Domain Information
output "name_servers" {
  description = "Name servers for the hosted zone"
  value       = var.domain_name != "" ? aws_route53_zone.main[0].name_servers : []
}

output "hosted_zone_id" {
  description = "Route53 hosted zone ID"
  value       = var.domain_name != "" ? aws_route53_zone.main[0].zone_id : ""
}

# Application URLs
output "application_url" {
  description = "Application URL"
  value       = var.domain_name != "" ? (var.subdomain != "" ? "https://${var.subdomain}.${var.domain_name}" : "https://${var.domain_name}") : module.alb.lb_dns_name
}

output "api_url" {
  description = "API URL" 
  value       = var.domain_name != "" ? (var.subdomain != "" ? "https://api.${var.subdomain}.${var.domain_name}" : "https://api.${var.domain_name}") : "${module.alb.lb_dns_name}/api"
}

# Environment Information
output "environment" {
  description = "Environment name"
  value       = var.environment
}

output "aws_region" {
  description = "AWS region"
  value       = var.aws_region
}

output "availability_zones" {
  description = "Availability zones used"
  value       = local.azs
}

# Resource ARNs for external tools
output "resource_arns" {
  description = "Map of resource ARNs for external tools"
  value = {
    eks_cluster = module.eks.cluster_arn
    rds_instance = module.rds.db_instance_arn
    redis_cluster = module.redis.arn
    alb = module.alb.lb_arn
    vpc = module.vpc.vpc_arn
    backup_bucket = aws_s3_bucket.backups.arn
  }
}

# Connection strings (for application configuration)
output "database_connection_info" {
  description = "Database connection information"
  value = {
    host     = module.rds.db_instance_endpoint
    port     = module.rds.db_instance_port
    database = module.rds.db_instance_name
    username = module.rds.db_instance_username
  }
  sensitive = true
}

output "redis_connection_info" {
  description = "Redis connection information"
  value = {
    host = module.redis.primary_endpoint_address
    port = module.redis.port
  }
  sensitive = true
}

# Kubernetes configuration
output "kubeconfig_command" {
  description = "Command to configure kubectl"
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${module.eks.cluster_name}"
}

# Monitoring endpoints
output "monitoring_endpoints" {
  description = "Monitoring service endpoints"
  value = {
    prometheus = var.enable_monitoring ? "http://prometheus.monitoring.svc.cluster.local:9090" : ""
    grafana    = var.enable_monitoring ? "http://grafana.monitoring.svc.cluster.local:3000" : ""
    kibana     = var.enable_logging ? "http://kibana.logging.svc.cluster.local:5601" : ""
  }
}

# Tags applied to resources
output "common_tags" {
  description = "Common tags applied to all resources"
  value       = local.common_tags
}