#!/bin/bash

# Plumbing Voice AI - Development Setup Script
# This script sets up the development environment automatically

set -e  # Exit on any error

echo "🚀 Setting up Plumbing Voice AI Development Environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running from correct directory
if [[ ! -f "package.json" ]]; then
    print_error "Please run this script from the voicebot root directory"
    exit 1
fi

# Check prerequisites
print_status "Checking prerequisites..."

# Check Node.js version
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//')
REQUIRED_VERSION="18.0.0"

if ! node -p "process.exit(require('semver').gte('$NODE_VERSION', '$REQUIRED_VERSION') ? 0 : 1)" 2>/dev/null; then
    print_error "Node.js version $NODE_VERSION is not supported. Please install Node.js 18+."
    exit 1
fi

print_success "Node.js version $NODE_VERSION is supported"

# Check npm
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed."
    exit 1
fi

# Check Docker (optional)
if command -v docker &> /dev/null; then
    print_success "Docker is available for containerized services"
    DOCKER_AVAILABLE=true
else
    print_warning "Docker not found. You'll need to install PostgreSQL and Redis manually."
    DOCKER_AVAILABLE=false
fi

# Install dependencies
print_status "Installing dependencies..."
npm install

# Copy environment files if they don't exist
print_status "Setting up environment configuration..."

if [[ ! -f "backend/.env" ]]; then
    cp backend/.env.example backend/.env
    print_success "Created backend/.env from example"
else
    print_status "backend/.env already exists, skipping..."
fi

if [[ ! -f "frontend/.env" ]]; then
    cp frontend/.env.example frontend/.env
    print_success "Created frontend/.env from example"
else
    print_status "frontend/.env already exists, skipping..."
fi

# Create necessary directories
print_status "Creating necessary directories..."
mkdir -p backend/logs backend/uploads frontend/dist

# Set up database
print_status "Setting up database..."

if [[ "$DOCKER_AVAILABLE" == true ]]; then
    # Use Docker for database services
    print_status "Starting database services with Docker..."
    
    # Check if services are already running
    if docker-compose -f docker-compose.dev.yml ps | grep -q "voicebot-postgres.*Up"; then
        print_status "PostgreSQL is already running"
    else
        docker-compose -f docker-compose.dev.yml up -d postgres redis
        print_status "Waiting for database to be ready..."
        sleep 10
    fi
    
    # Wait for PostgreSQL to be ready
    timeout=60
    while ! docker-compose -f docker-compose.dev.yml exec -T postgres pg_isready -U voicebot -d voicebot &> /dev/null; do
        if [[ $timeout -eq 0 ]]; then
            print_error "PostgreSQL failed to start within 60 seconds"
            exit 1
        fi
        sleep 2
        ((timeout--))
    done
    print_success "PostgreSQL is ready"
    
else
    # Manual setup instructions
    print_warning "Docker not available. Please ensure PostgreSQL and Redis are running:"
    echo "  PostgreSQL: Create database 'voicebot' with user 'voicebot' password 'voicebot123'"
    echo "  Redis: Should be running on localhost:6379"
    echo ""
    echo "Or install Docker and run: docker-compose -f docker-compose.dev.yml up -d postgres redis"
fi

# Run database migrations
print_status "Running database migrations..."
npm run db:migrate

# Seed database with sample data
print_status "Seeding database with sample data..."
npm run db:seed

print_success "Database setup complete!"

# Generate development certificates (for HTTPS)
print_status "Setting up development SSL certificates..."
mkdir -p nginx/ssl

if [[ ! -f "nginx/ssl/localhost.pem" ]]; then
    # Generate self-signed certificate for development
    openssl req -x509 -newkey rsa:4096 -keyout nginx/ssl/localhost-key.pem -out nginx/ssl/localhost.pem -days 365 -nodes -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost" 2>/dev/null || print_warning "OpenSSL not available, skipping SSL certificate generation"
fi

# Create startup script
print_status "Creating startup scripts..."

cat > start-dev.sh << 'EOF'
#!/bin/bash
echo "🚀 Starting Plumbing Voice AI Development Environment..."

# Start database services if using Docker
if command -v docker-compose &> /dev/null && [[ -f "docker-compose.dev.yml" ]]; then
    echo "Starting database services..."
    docker-compose -f docker-compose.dev.yml up -d postgres redis
    sleep 5
fi

# Start the application
echo "Starting backend and frontend..."
npm run dev
EOF

chmod +x start-dev.sh

# Final setup verification
print_status "Verifying setup..."

# Check if backend starts successfully
timeout 10s npm run dev:backend > /dev/null 2>&1 &
BACKEND_PID=$!
sleep 5

if kill -0 $BACKEND_PID 2>/dev/null; then
    print_success "Backend starts successfully"
    kill $BACKEND_PID
else
    print_warning "Backend may have startup issues, check logs"
fi

# Print final instructions
echo ""
echo "🎉 Development environment setup complete!"
echo ""
echo "Next steps:"
echo "1. Add your credentials to backend/.env:"
echo "   - GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (from Google Cloud Console)"
echo "   - ANTHROPIC_API_KEY (from Anthropic Console)"
echo ""
echo "2. Start the development environment:"
echo "   ./start-dev.sh"
echo "   or"
echo "   npm run dev"
echo ""
echo "3. Access the application:"
echo "   - Frontend: http://localhost:3000"
echo "   - Backend API: http://localhost:3001"
echo "   - Health Check: http://localhost:3001/health"
echo ""
echo "4. Default login credentials:"
echo "   - Email: admin@plumbingcompany.com"
echo "   - Password: admin123"
echo ""
echo "For production deployment, see docs/deployment-runbook.md"

print_success "Setup completed successfully! 🚀"