# Main Terraform configuration for Plumbing AI Platform
terraform {
  required_version = ">= 1.6.0"
  
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.24"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.12"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  backend "s3" {
    # Backend configuration provided via CLI or backend config file
    encrypt = true
  }
}

# Configure AWS Provider
provider "aws" {
  region = var.aws_region
  
  default_tags {
    tags = {
      Project     = "plumbing-ai-platform"
      Environment = var.environment
      ManagedBy   = "terraform"
      Owner       = "plumbing-ai-team"
    }
  }
}

# Configure Kubernetes Provider
provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
  token                  = data.aws_eks_cluster_auth.cluster.token
}

# Configure Helm Provider
provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
    token                  = data.aws_eks_cluster_auth.cluster.token
  }
}

# Data sources
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

data "aws_eks_cluster_auth" "cluster" {
  name = module.eks.cluster_name
}

# Local values
locals {
  name_prefix = "${var.project_name}-${var.environment}"
  
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
    Owner       = var.owner
  }
  
  # AZ configuration
  azs = slice(data.aws_availability_zones.available.names, 0, var.availability_zone_count)
  
  # Database configuration
  database_name = "plumbing_ai"
  database_port = 5432
  
  # Redis configuration
  redis_port = 6379
  
  # Application ports
  backend_port  = 3000
  frontend_port = 8080
}

# VPC Module
module "vpc" {
  source = "./modules/vpc"
  
  name_prefix               = local.name_prefix
  vpc_cidr                 = var.vpc_cidr
  availability_zones       = local.azs
  public_subnet_cidrs      = var.public_subnet_cidrs
  private_subnet_cidrs     = var.private_subnet_cidrs
  database_subnet_cidrs    = var.database_subnet_cidrs
  enable_nat_gateway       = var.enable_nat_gateway
  enable_vpn_gateway       = var.enable_vpn_gateway
  enable_dns_hostnames     = true
  enable_dns_support       = true
  
  tags = local.common_tags
}

# Security Groups
module "security_groups" {
  source = "./modules/security"
  
  name_prefix = local.name_prefix
  vpc_id      = module.vpc.vpc_id
  vpc_cidr    = var.vpc_cidr
  
  # Port configurations
  backend_port  = local.backend_port
  frontend_port = local.frontend_port
  database_port = local.database_port
  redis_port    = local.redis_port
  
  tags = local.common_tags
}

# EKS Cluster
module "eks" {
  source = "./modules/eks"
  
  cluster_name                    = "${local.name_prefix}-cluster"
  cluster_version                 = var.eks_cluster_version
  vpc_id                         = module.vpc.vpc_id
  subnet_ids                     = module.vpc.private_subnets
  
  # Node group configuration
  node_groups = var.eks_node_groups
  
  # Security
  cluster_endpoint_private_access = true
  cluster_endpoint_public_access  = var.eks_public_access
  cluster_endpoint_public_access_cidrs = var.eks_public_access_cidrs
  
  # Add-ons
  cluster_addons = {
    coredns = {
      most_recent = true
    }
    kube-proxy = {
      most_recent = true
    }
    vpc-cni = {
      most_recent = true
    }
    aws-ebs-csi-driver = {
      most_recent = true
    }
  }
  
  tags = local.common_tags
}

# RDS Database
module "rds" {
  source = "./modules/rds"
  
  identifier                = "${local.name_prefix}-postgres"
  engine                   = "postgres"
  engine_version           = var.postgres_version
  instance_class           = var.rds_instance_class
  allocated_storage        = var.rds_allocated_storage
  max_allocated_storage    = var.rds_max_allocated_storage
  storage_type             = "gp3"
  storage_encrypted        = true
  
  # Database configuration
  db_name                  = local.database_name
  username                 = var.db_username
  password                 = var.db_password
  port                     = local.database_port
  
  # Network configuration
  vpc_id                   = module.vpc.vpc_id
  subnet_ids               = module.vpc.database_subnets
  vpc_security_group_ids   = [module.security_groups.database_sg_id]
  
  # Backup configuration
  backup_retention_period  = var.rds_backup_retention_period
  backup_window           = var.rds_backup_window
  maintenance_window      = var.rds_maintenance_window
  
  # High availability
  multi_az                = var.rds_multi_az
  
  # Monitoring
  monitoring_interval     = 60
  monitoring_role_arn     = aws_iam_role.rds_enhanced_monitoring.arn
  enabled_cloudwatch_logs_exports = ["postgresql"]
  
  # Performance Insights
  performance_insights_enabled = true
  performance_insights_retention_period = 7
  
  # Deletion protection
  deletion_protection     = var.environment == "production" ? true : false
  skip_final_snapshot    = var.environment == "production" ? false : true
  final_snapshot_identifier = var.environment == "production" ? "${local.name_prefix}-final-snapshot" : null
  
  tags = local.common_tags
}

# ElastiCache Redis
module "redis" {
  source = "./modules/redis"
  
  cluster_id                    = "${local.name_prefix}-redis"
  engine_version               = var.redis_version
  node_type                    = var.redis_node_type
  num_cache_nodes              = var.redis_num_nodes
  parameter_group_name         = "default.redis7"
  port                         = local.redis_port
  
  # Network configuration
  subnet_group_name            = aws_elasticache_subnet_group.redis.name
  security_group_ids           = [module.security_groups.redis_sg_id]
  
  # Security
  auth_token                   = var.redis_password
  transit_encryption_enabled   = true
  at_rest_encryption_enabled   = true
  
  # Backup
  snapshot_retention_limit     = var.redis_backup_retention_period
  snapshot_window             = var.redis_snapshot_window
  
  # Maintenance
  maintenance_window          = var.redis_maintenance_window
  
  tags = local.common_tags
}

# Application Load Balancer
module "alb" {
  source = "./modules/alb"
  
  name               = "${local.name_prefix}-alb"
  vpc_id            = module.vpc.vpc_id
  subnets           = module.vpc.public_subnets
  security_groups   = [module.security_groups.alb_sg_id]
  
  # SSL Certificate
  certificate_arn   = var.ssl_certificate_arn
  
  # Target groups for different services
  target_groups = {
    backend = {
      port     = local.backend_port
      protocol = "HTTP"
      path     = "/api/health"
    }
    frontend = {
      port     = local.frontend_port
      protocol = "HTTP"
      path     = "/health"
    }
  }
  
  tags = local.common_tags
}

# ECR Repositories
resource "aws_ecr_repository" "backend" {
  name                 = "${local.name_prefix}/backend"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
  
  encryption_configuration {
    encryption_type = "AES256"
  }
  
  tags = local.common_tags
}

resource "aws_ecr_repository" "frontend" {
  name                 = "${local.name_prefix}/frontend"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
  
  encryption_configuration {
    encryption_type = "AES256"
  }
  
  tags = local.common_tags
}

# ECR Lifecycle Policies
resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Delete untagged images older than 1 day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

resource "aws_ecr_lifecycle_policy" "frontend" {
  repository = aws_ecr_repository.frontend.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus     = "tagged"
          tagPrefixList = ["v"]
          countType     = "imageCountMoreThan"
          countNumber   = 10
        }
        action = {
          type = "expire"
        }
      },
      {
        rulePriority = 2
        description  = "Delete untagged images older than 1 day"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 1
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

# ElastiCache Subnet Group
resource "aws_elasticache_subnet_group" "redis" {
  name       = "${local.name_prefix}-redis-subnet-group"
  subnet_ids = module.vpc.private_subnets
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-redis-subnet-group"
  })
}

# IAM Role for RDS Enhanced Monitoring
resource "aws_iam_role" "rds_enhanced_monitoring" {
  name = "${local.name_prefix}-rds-monitoring-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })
  
  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "rds_enhanced_monitoring" {
  role       = aws_iam_role.rds_enhanced_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# S3 Bucket for backups and assets
resource "aws_s3_bucket" "backups" {
  bucket = "${local.name_prefix}-backups-${random_id.bucket_suffix.hex}"
  
  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-backups"
  })
}

resource "aws_s3_bucket_versioning" "backups" {
  bucket = aws_s3_bucket.backups.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_encryption" "backups" {
  bucket = aws_s3_bucket.backups.id

  server_side_encryption_configuration {
    rule {
      apply_server_side_encryption_by_default {
        sse_algorithm = "AES256"
      }
    }
  }
}

resource "aws_s3_bucket_public_access_block" "backups" {
  bucket = aws_s3_bucket.backups.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "random_id" "bucket_suffix" {
  byte_length = 4
}