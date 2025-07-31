#!/bin/bash
# Environment Setup Script for Plumbing AI Platform
# This script sets up development, staging, and production environments

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_FILE="/tmp/plumbing-ai-setup.log"

# Default values
ENVIRONMENT="${1:-development}"
SKIP_DEPS="${SKIP_DEPS:-false}"
FORCE_SETUP="${FORCE_SETUP:-false}"
DRY_RUN="${DRY_RUN:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to log messages
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local color=""
    
    case "$level" in
        "ERROR") color="$RED" ;;
        "WARN") color="$YELLOW" ;;
        "INFO") color="$GREEN" ;;
        "DEBUG") color="$BLUE" ;;
    esac
    
    echo -e "${color}[$timestamp] [$level] $message${NC}" | tee -a "$LOG_FILE"
}

# Function to display usage
usage() {
    cat << EOF
Usage: $0 [environment] [options]

Environments:
    development     Setup local development environment
    staging         Setup staging environment
    production      Setup production environment

Options:
    SKIP_DEPS=true      Skip dependency installation
    FORCE_SETUP=true    Force setup even if environment exists
    DRY_RUN=true        Show what would be done without executing

Examples:
    $0 development
    SKIP_DEPS=true $0 staging
    DRY_RUN=true $0 production
EOF
}

# Function to check prerequisites
check_prerequisites() {
    log "INFO" "Checking prerequisites for $ENVIRONMENT environment..."
    
    local missing_tools=()
    
    # Check required tools
    local required_tools=(
        "node:Node.js"
        "npm:NPM"
        "docker:Docker"
        "kubectl:Kubernetes CLI"
        "helm:Helm"
    )
    
    if [[ "$ENVIRONMENT" != "development" ]]; then
        required_tools+=(
            "aws:AWS CLI"
            "terraform:Terraform"
        )
    fi
    
    for tool_info in "${required_tools[@]}"; do
        local tool="${tool_info%%:*}"
        local name="${tool_info##*:}"
        
        if ! command -v "$tool" &> /dev/null; then
            missing_tools+=("$name ($tool)")
        fi
    done
    
    # Check Node.js version
    if command -v node &> /dev/null; then
        local node_version=$(node -v | sed 's/v//')
        local required_version="18.0.0"
        
        if ! version_compare "$node_version" "$required_version"; then
            missing_tools+=("Node.js >= $required_version (current: $node_version)")
        fi
    fi
    
    if [[ ${#missing_tools[@]} -gt 0 ]]; then
        log "ERROR" "Missing required tools:"
        for tool in "${missing_tools[@]}"; do
            log "ERROR" "  - $tool"
        done
        
        log "INFO" "Installation commands:"
        log "INFO" "  Node.js: https://nodejs.org/"
        log "INFO" "  Docker: https://docs.docker.com/get-docker/"
        log "INFO" "  kubectl: curl -LO https://dl.k8s.io/release/\$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
        log "INFO" "  Helm: curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash"
        
        if [[ "$ENVIRONMENT" != "development" ]]; then
            log "INFO" "  AWS CLI: https://aws.amazon.com/cli/"
            log "INFO" "  Terraform: https://www.terraform.io/downloads"
        fi
        
        exit 1
    fi
    
    log "INFO" "All prerequisites met"
}

# Function to compare versions
version_compare() {
    local version1="$1"
    local version2="$2"
    
    # Simple version comparison (works for semantic versioning)
    printf '%s\n%s\n' "$version1" "$version2" | sort -V -C
}

# Function to setup development environment
setup_development() {
    log "INFO" "Setting up development environment..."
    
    # Create development environment file
    if [[ ! -f "$PROJECT_ROOT/.env.development" || "$FORCE_SETUP" == "true" ]]; then
        log "INFO" "Creating development environment file..."
        
        if [[ "$DRY_RUN" == "true" ]]; then
            log "INFO" "[DRY RUN] Would create .env.development"
        else
            cat > "$PROJECT_ROOT/.env.development" << 'EOF'
# Development Environment Configuration
NODE_ENV=development
APP_NAME=Plumbing AI Platform (Dev)
APP_VERSION=1.0.0-dev

# Database Configuration (Docker)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=plumbing_ai_dev
DB_USER=plumbing_dev
DB_PASSWORD=dev_password_123

# Redis Configuration (Docker)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=dev_redis_123

# JWT Configuration
JWT_SECRET=dev_jwt_secret_change_in_production
JWT_EXPIRES_IN=24h

# API Keys (Development)
ANTHROPIC_API_KEY=your_development_anthropic_api_key
GOOGLE_OAUTH_CLIENT_ID=your_dev_google_oauth_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_dev_google_oauth_client_secret
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/auth/google/callback

# Webhook Configuration
WEBHOOK_SECRET=dev_webhook_secret_123

# Logging Configuration
LOG_LEVEL=debug
LOG_FILE_PATH=./logs

# Development URLs
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:3000

# Feature Flags (Development)
ENABLE_DEBUG_MODE=true
ENABLE_HOT_RELOAD=true
ENABLE_MOCK_DATA=true
ENABLE_CORS=true

# Performance Configuration
MAX_CONNECTIONS=50
CONNECTION_TIMEOUT=5000
RATE_LIMIT_MAX=1000
RATE_LIMIT_WINDOW_MS=900000
EOF
        fi
    fi
    
    # Install dependencies
    if [[ "$SKIP_DEPS" != "true" ]]; then
        install_dependencies_dev
    fi
    
    # Setup development database
    setup_development_database
    
    # Create development Docker compose override
    create_docker_compose_override_dev
    
    log "INFO" "Development environment setup complete!"
    log "INFO" "To start development:"
    log "INFO" "  1. Start services: docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d"
    log "INFO" "  2. Install dependencies: npm run setup"
    log "INFO" "  3. Start development: npm run dev"
}

# Function to setup staging environment
setup_staging() {
    log "INFO" "Setting up staging environment..."
    
    # Verify AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log "ERROR" "AWS credentials not configured. Run 'aws configure' first."
        exit 1
    fi
    
    # Create staging environment file
    if [[ ! -f "$PROJECT_ROOT/.env.staging" || "$FORCE_SETUP" == "true" ]]; then
        log "INFO" "Creating staging environment template..."
        
        if [[ "$DRY_RUN" == "true" ]]; then
            log "INFO" "[DRY RUN] Would create .env.staging"
        else
            cat > "$PROJECT_ROOT/.env.staging" << 'EOF'
# Staging Environment Configuration
NODE_ENV=staging
APP_NAME=Plumbing AI Platform (Staging)
APP_VERSION=1.0.0

# Database Configuration (RDS)
DB_HOST=staging-postgres.amazonaws.com
DB_PORT=5432
DB_NAME=plumbing_ai_staging
DB_USER=plumbing_staging
DB_PASSWORD=change_this_secure_password

# Redis Configuration (ElastiCache)
REDIS_HOST=staging-redis.amazonaws.com
REDIS_PORT=6379
REDIS_PASSWORD=change_this_redis_password

# JWT Configuration
JWT_SECRET=change_this_jwt_secret_for_staging
JWT_EXPIRES_IN=24h

# API Keys (Staging)
ANTHROPIC_API_KEY=your_staging_anthropic_api_key
GOOGLE_OAUTH_CLIENT_ID=your_staging_google_oauth_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_staging_google_oauth_client_secret
GOOGLE_OAUTH_REDIRECT_URI=https://staging.plumbing-ai.yourdomain.com/auth/google/callback

# Webhook Configuration
WEBHOOK_SECRET=change_this_webhook_secret

# Logging Configuration
LOG_LEVEL=info
LOG_FILE_PATH=/app/logs

# Staging URLs
FRONTEND_URL=https://staging.plumbing-ai.yourdomain.com
BACKEND_URL=https://api.staging.plumbing-ai.yourdomain.com

# Feature Flags (Staging)
ENABLE_DEBUG_MODE=false
ENABLE_MONITORING=true
ENABLE_BACKUPS=true

# Performance Configuration
MAX_CONNECTIONS=100
CONNECTION_TIMEOUT=30000
RATE_LIMIT_MAX=500
RATE_LIMIT_WINDOW_MS=900000

# Monitoring
SLACK_WEBHOOK_URL=your_slack_webhook_url_for_staging
GRAFANA_PASSWORD=change_this_grafana_password
EOF
        fi
    fi
    
    # Deploy staging infrastructure
    deploy_staging_infrastructure
    
    # Setup staging Kubernetes configuration
    setup_staging_kubernetes
    
    log "INFO" "Staging environment setup complete!"
    log "INFO" "Update .env.staging with actual values and deploy:"
    log "INFO" "  1. Update environment variables in .env.staging"
    log "INFO" "  2. Deploy infrastructure: cd terraform && terraform apply -var-file=environments/staging.tfvars"
    log "INFO" "  3. Deploy application: kubectl apply -f k8s/ -n plumbing-ai-staging"
}

# Function to setup production environment
setup_production() {
    log "INFO" "Setting up production environment..."
    
    # Extra confirmation for production
    if [[ "$FORCE_SETUP" != "true" && "$DRY_RUN" != "true" ]]; then
        echo
        log "WARN" "You are setting up a PRODUCTION environment!"
        log "WARN" "This will create real infrastructure and may incur costs."
        echo
        read -p "Are you sure you want to continue? (yes/no): " -r response
        
        case "$response" in
            [yY][eE][sS])
                log "INFO" "Production setup confirmed"
                ;;
            *)
                log "INFO" "Production setup cancelled"
                exit 0
                ;;
        esac
    fi
    
    # Verify AWS credentials and permissions
    if ! aws sts get-caller-identity &> /dev/null; then
        log "ERROR" "AWS credentials not configured. Run 'aws configure' first."
        exit 1
    fi
    
    # Check for production-specific permissions
    local account_id=$(aws sts get-caller-identity --query Account --output text)
    log "INFO" "Setting up production in AWS account: $account_id"
    
    # Create production environment file
    if [[ ! -f "$PROJECT_ROOT/.env.production" || "$FORCE_SETUP" == "true" ]]; then
        log "INFO" "Creating production environment template..."
        
        if [[ "$DRY_RUN" == "true" ]]; then
            log "INFO" "[DRY RUN] Would create .env.production"
        else
            cat > "$PROJECT_ROOT/.env.production" << 'EOF'
# Production Environment Configuration
NODE_ENV=production
APP_NAME=Plumbing AI Platform
APP_VERSION=1.0.0

# Database Configuration (RDS Multi-AZ)
DB_HOST=production-postgres.amazonaws.com
DB_PORT=5432
DB_NAME=plumbing_ai
DB_USER=plumbing_prod
DB_PASSWORD=use_aws_secrets_manager

# Redis Configuration (ElastiCache Cluster)
REDIS_HOST=production-redis.amazonaws.com
REDIS_PORT=6379
REDIS_PASSWORD=use_aws_secrets_manager

# JWT Configuration
JWT_SECRET=use_aws_secrets_manager
JWT_EXPIRES_IN=24h

# API Keys (Production)
ANTHROPIC_API_KEY=use_aws_secrets_manager
GOOGLE_OAUTH_CLIENT_ID=use_aws_secrets_manager
GOOGLE_OAUTH_CLIENT_SECRET=use_aws_secrets_manager
GOOGLE_OAUTH_REDIRECT_URI=https://plumbing-ai.yourdomain.com/auth/google/callback

# Webhook Configuration
WEBHOOK_SECRET=use_aws_secrets_manager

# Logging Configuration
LOG_LEVEL=warn
LOG_FILE_PATH=/app/logs

# Production URLs
FRONTEND_URL=https://plumbing-ai.yourdomain.com
BACKEND_URL=https://api.plumbing-ai.yourdomain.com

# Feature Flags (Production)
ENABLE_DEBUG_MODE=false
ENABLE_MONITORING=true
ENABLE_BACKUPS=true
ENABLE_WAF=true
ENABLE_ENCRYPTION=true

# Performance Configuration
MAX_CONNECTIONS=200
CONNECTION_TIMEOUT=30000
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=900000

# Monitoring
SLACK_WEBHOOK_URL=use_aws_secrets_manager
GRAFANA_PASSWORD=use_aws_secrets_manager

# Security
ENABLE_AUDIT_LOGGING=true
ENABLE_INTRUSION_DETECTION=true
BACKUP_RETENTION_DAYS=30
EOF
        fi
    fi
    
    # Deploy production infrastructure
    deploy_production_infrastructure
    
    # Setup production Kubernetes configuration
    setup_production_kubernetes
    
    # Setup production monitoring
    setup_production_monitoring
    
    log "INFO" "Production environment setup complete!"
    log "WARN" "IMPORTANT: Replace all 'use_aws_secrets_manager' values with AWS Secrets Manager references"
    log "INFO" "Next steps:"
    log "INFO" "  1. Configure AWS Secrets Manager with production secrets"
    log "INFO" "  2. Update Terraform variables with actual values"
    log "INFO" "  3. Deploy infrastructure: cd terraform && terraform apply -var-file=environments/production.tfvars"
    log "INFO" "  4. Deploy application with blue-green deployment strategy"
    log "INFO" "  5. Configure DNS and SSL certificates"
    log "INFO" "  6. Run security audit and penetration testing"
}

# Function to install development dependencies
install_dependencies_dev() {
    log "INFO" "Installing development dependencies..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "INFO" "[DRY RUN] Would install dependencies"
        return 0
    fi
    
    # Install root dependencies
    cd "$PROJECT_ROOT"
    npm install
    
    # Install backend dependencies
    cd "$PROJECT_ROOT/backend"
    npm install
    
    # Install frontend dependencies
    cd "$PROJECT_ROOT/frontend"
    npm install
    
    # Install development tools globally
    npm install -g nodemon concurrently
    
    log "INFO" "Dependencies installed successfully"
}

# Function to setup development database
setup_development_database() {
    log "INFO" "Setting up development database..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "INFO" "[DRY RUN] Would setup development database"
        return 0
    fi
    
    # Start database services with Docker
    cd "$PROJECT_ROOT"
    
    if ! docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d postgres redis; then
        log "WARN" "Failed to start database services with Docker Compose"
        log "INFO" "Attempting to start services manually..."
        
        # Start PostgreSQL
        if ! docker run -d \
            --name plumbing-ai-postgres-dev \
            -e POSTGRES_DB=plumbing_ai_dev \
            -e POSTGRES_USER=plumbing_dev \
            -e POSTGRES_PASSWORD=dev_password_123 \
            -p 5432:5432 \
            postgres:15-alpine; then
            log "ERROR" "Failed to start PostgreSQL container"
            return 1
        fi
        
        # Start Redis
        if ! docker run -d \
            --name plumbing-ai-redis-dev \
            -p 6379:6379 \
            redis:7-alpine redis-server --requirepass dev_redis_123; then
            log "ERROR" "Failed to start Redis container"
            return 1
        fi
    fi
    
    # Wait for services to be ready
    log "INFO" "Waiting for database services to be ready..."
    sleep 10
    
    # Run database migrations
    cd "$PROJECT_ROOT/backend"
    npm run db:migrate
    
    # Seed development data
    npm run db:seed
    
    log "INFO" "Development database setup complete"
}

# Function to create Docker Compose override for development
create_docker_compose_override_dev() {
    log "INFO" "Creating Docker Compose override for development..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "INFO" "[DRY RUN] Would create docker-compose.dev.yml"
        return 0
    fi
    
    cat > "$PROJECT_ROOT/docker-compose.dev.yml" << 'EOF'
# Docker Compose override for development environment
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
      target: development
    volumes:
      - ./backend/src:/app/src
      - ./backend/package.json:/app/package.json
      - ./backend/tsconfig.json:/app/tsconfig.json
      - backend_node_modules:/app/node_modules
    environment:
      - NODE_ENV=development
      - CHOKIDAR_USEPOLLING=true
    command: npm run dev
    ports:
      - "3000:3000"
      - "9229:9229"  # Debug port

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      target: development
    volumes:
      - ./frontend/src:/app/src
      - ./frontend/public:/app/public
      - ./frontend/package.json:/app/package.json
      - ./frontend/vite.config.ts:/app/vite.config.ts
      - frontend_node_modules:/app/node_modules
    environment:
      - NODE_ENV=development
      - VITE_API_URL=http://localhost:3000
    command: npm run dev
    ports:
      - "5173:5173"

  postgres:
    environment:
      - POSTGRES_DB=plumbing_ai_dev
      - POSTGRES_USER=plumbing_dev
      - POSTGRES_PASSWORD=dev_password_123
    ports:
      - "5432:5432"
    volumes:
      - postgres_dev_data:/var/lib/postgresql/data

  redis:
    command: redis-server --requirepass dev_redis_123
    ports:
      - "6379:6379"
    volumes:
      - redis_dev_data:/data

volumes:
  backend_node_modules:
  frontend_node_modules:
  postgres_dev_data:
  redis_dev_data:
EOF
}

# Function to deploy staging infrastructure
deploy_staging_infrastructure() {
    log "INFO" "Deploying staging infrastructure..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "INFO" "[DRY RUN] Would deploy staging infrastructure"
        return 0
    fi
    
    cd "$PROJECT_ROOT/terraform"
    
    # Initialize Terraform
    terraform init \
        -backend-config="bucket=plumbing-ai-terraform-state" \
        -backend-config="key=staging/terraform.tfstate" \
        -backend-config="region=us-west-2"
    
    # Plan deployment
    terraform plan -var-file=environments/staging.tfvars -out=staging-plan
    
    # Apply with approval
    if [[ "$FORCE_SETUP" == "true" ]]; then
        terraform apply -auto-approve staging-plan
    else
        terraform apply staging-plan
    fi
    
    log "INFO" "Staging infrastructure deployed successfully"
}

# Function to deploy production infrastructure
deploy_production_infrastructure() {
    log "INFO" "Deploying production infrastructure..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "INFO" "[DRY RUN] Would deploy production infrastructure"
        return 0
    fi
    
    cd "$PROJECT_ROOT/terraform"
    
    # Initialize Terraform
    terraform init \
        -backend-config="bucket=plumbing-ai-terraform-state" \
        -backend-config="key=production/terraform.tfstate" \
        -backend-config="region=us-west-2"
    
    # Plan deployment
    terraform plan -var-file=environments/production.tfvars -out=production-plan
    
    # Require explicit approval for production
    log "WARN" "Review the Terraform plan carefully before proceeding!"
    terraform show production-plan
    
    if [[ "$FORCE_SETUP" == "true" ]]; then
        terraform apply -auto-approve production-plan
    else
        echo
        read -p "Apply this Terraform plan to PRODUCTION? (yes/no): " -r response
        case "$response" in
            [yY][eE][sS])
                terraform apply production-plan
                ;;
            *)
                log "INFO" "Production deployment cancelled"
                exit 0
                ;;
        esac
    fi
    
    log "INFO" "Production infrastructure deployed successfully"
}

# Function to setup staging Kubernetes
setup_staging_kubernetes() {
    log "INFO" "Setting up staging Kubernetes configuration..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "INFO" "[DRY RUN] Would setup staging Kubernetes"
        return 0
    fi
    
    # Update kubeconfig
    aws eks update-kubeconfig --region us-west-2 --name plumbing-ai-staging-cluster
    
    # Create namespace
    kubectl create namespace plumbing-ai-staging --dry-run=client -o yaml | kubectl apply -f -
    
    # Apply configurations
    kubectl apply -f "$PROJECT_ROOT/k8s/" -n plumbing-ai-staging
    
    log "INFO" "Staging Kubernetes configuration applied"
}

# Function to setup production Kubernetes
setup_production_kubernetes() {
    log "INFO" "Setting up production Kubernetes configuration..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "INFO" "[DRY RUN] Would setup production Kubernetes"
        return 0
    fi
    
    # Update kubeconfig
    aws eks update-kubeconfig --region us-west-2 --name plumbing-ai-production-cluster
    
    # Create namespace
    kubectl create namespace plumbing-ai --dry-run=client -o yaml | kubectl apply -f -
    
    # Apply configurations
    kubectl apply -f "$PROJECT_ROOT/k8s/" -n plumbing-ai
    
    log "INFO" "Production Kubernetes configuration applied"
}

# Function to setup production monitoring
setup_production_monitoring() {
    log "INFO" "Setting up production monitoring..."
    
    if [[ "$DRY_RUN" == "true" ]]; then
        log "INFO" "[DRY RUN] Would setup production monitoring"
        return 0
    fi
    
    # Install monitoring namespace
    kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
    
    # Install Prometheus using Helm
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo update
    
    helm install prometheus prometheus-community/kube-prometheus-stack \
        --namespace monitoring \
        --values "$PROJECT_ROOT/config/prometheus/values.yaml" \
        --wait
    
    log "INFO" "Production monitoring setup complete"
}

# Function to cleanup environment
cleanup_environment() {
    local env="$1"
    
    log "INFO" "Cleaning up $env environment..."
    
    case "$env" in
        "development")
            docker-compose -f docker-compose.yml -f docker-compose.dev.yml down -v
            docker container prune -f
            docker volume prune -f
            ;;
        "staging"|"production")
            if [[ "$DRY_RUN" != "true" ]]; then
                log "WARN" "Cleanup for $env environment requires manual intervention"
                log "INFO" "To cleanup $env:"
                log "INFO" "  1. Delete Kubernetes resources: kubectl delete namespace plumbing-ai-${env}"
                log "INFO" "  2. Destroy Terraform infrastructure: terraform destroy -var-file=environments/${env}.tfvars"
            fi
            ;;
    esac
}

# Function to validate environment
validate_environment() {
    local env="$1"
    
    log "INFO" "Validating $env environment..."
    
    case "$env" in
        "development")
            # Check if services are running
            if docker-compose -f docker-compose.yml -f docker-compose.dev.yml ps | grep -q "Up"; then
                log "INFO" "Development services are running"
            else
                log "WARN" "Development services are not running"
            fi
            ;;
        "staging"|"production")
            # Check Kubernetes cluster connectivity
            if kubectl cluster-info &> /dev/null; then
                log "INFO" "Kubernetes cluster is accessible"
            else
                log "ERROR" "Cannot connect to Kubernetes cluster"
                return 1
            fi
            
            # Check if namespace exists
            if kubectl get namespace "plumbing-ai${env:+-$env}" &> /dev/null; then
                log "INFO" "Namespace exists"
            else
                log "WARN" "Namespace does not exist"
            fi
            ;;
    esac
}

# Main function
main() {
    # Create log file
    mkdir -p "$(dirname "$LOG_FILE")"
    touch "$LOG_FILE"
    
    log "INFO" "Starting Plumbing AI Platform environment setup"
    log "INFO" "Environment: $ENVIRONMENT"
    log "INFO" "Dry run: $DRY_RUN"
    log "INFO" "Force setup: $FORCE_SETUP"
    log "INFO" "Skip dependencies: $SKIP_DEPS"
    
    # Validate environment parameter
    case "$ENVIRONMENT" in
        "development"|"staging"|"production")
            ;;
        "cleanup")
            cleanup_environment "${2:-development}"
            exit 0
            ;;
        "validate")
            validate_environment "${2:-development}"
            exit 0
            ;;
        *)
            log "ERROR" "Invalid environment: $ENVIRONMENT"
            usage
            exit 1
            ;;
    esac
    
    # Check prerequisites
    check_prerequisites
    
    # Setup environment
    case "$ENVIRONMENT" in
        "development")
            setup_development
            ;;
        "staging")
            setup_staging
            ;;
        "production")
            setup_production
            ;;
    esac
    
    # Validate setup
    validate_environment "$ENVIRONMENT"
    
    log "INFO" "Environment setup completed successfully!"
    log "INFO" "Log file: $LOG_FILE"
}

# Script execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [[ $# -eq 0 ]]; then
        usage
        exit 1
    fi
    main "$@"
fi