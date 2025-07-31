# Plumbing Voice AI Integration System

A comprehensive AI-powered voice communication system designed specifically for plumbing businesses. This system integrates with Google Voice API, uses Claude AI for intelligent response generation, and provides a complete CRM solution for managing customers, jobs, quotes, and service workflows.

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   React         │    │   Express.js     │    │   SQLite        │
│   Frontend      │◄──►│   Backend API    │◄──►│   Database      │
│   (Port 3000)   │    │   (Port 3001)    │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │   External APIs  │
                       │  • Google Voice  │
                       │  • Claude AI     │
                       │  • Webhooks      │
                       └──────────────────┘
```

## 🚀 Features

### Core Business Features
- **Customer Management**: Complete customer database with contact info, service history, and multiple properties
- **Conversation Tracking**: Real-time message threading across multiple communication channels
- **Job Workflow**: End-to-end job management from inquiry to completion
- **Quote Generation**: Line-item quotes with automatic calculations and approval workflows
- **Service History**: Complete service records with warranty tracking and maintenance schedules

### AI Integration
- **Claude AI Integration**: Intelligent response generation with business context awareness
- **Intent Recognition**: Automatic classification of customer inquiries (emergency, routine, estimate, etc.)
- **Smart Routing**: Automatic prioritization based on urgency and service type
- **Response Drafting**: AI-generated responses ready for review and sending

### Google Voice Integration
- **Real-time Webhooks**: Instant processing of incoming calls and messages
- **Message Threading**: Automatic conversation grouping and customer identification
- **Multi-channel Support**: SMS, MMS, voice calls, and voicemail transcription
- **Call Recording**: Automatic recording and transcription of customer calls

### Dashboard & Analytics
- **Real-time Dashboard**: Live metrics and KPIs for business performance
- **Customer Insights**: Service history, communication preferences, and satisfaction scores
- **Performance Analytics**: Response times, conversion rates, and job completion metrics
- **Revenue Tracking**: Monthly/quarterly revenue analysis and forecasting

## 📋 Prerequisites

- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 9.0.0 or higher
- **Database**: SQLite (included) or PostgreSQL for production
- **API Keys**: 
  - Anthropic API key for Claude AI
  - Google Cloud credentials for Voice API

## 🛠️ Installation & Setup

### 1. Clone and Install Dependencies

```bash
# Clone the repository
git clone <repository-url>
cd plumbing-voice-ai

# Install all dependencies (root, backend, and frontend)
npm run setup
```

### 2. Environment Configuration

#### Backend Environment (./backend/.env)
```bash
# Copy the example file
cp backend/.env.example backend/.env

# Edit with your actual values:
# - JWT_SECRET: Generate a secure random string
# - ANTHROPIC_API_KEY: Your Claude AI API key
# - GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET: Google Cloud credentials
# - Database configuration (SQLite by default)
```

#### Frontend Environment (./frontend/.env)
```bash
# Copy the example file
cp frontend/.env.example frontend/.env

# Edit with your configuration:
# - VITE_API_URL: Backend API URL (default: http://localhost:3001)
# - VITE_API_KEY: Must match backend API key
```

### 3. Database Setup

```bash
# Run database migrations
npm run db:migrate

# Seed with sample data
npm run db:seed
```

### 4. Start Development Servers

```bash
# Start both backend and frontend in development mode
npm run dev

# Or start individually:
npm run dev:backend    # Backend only (port 3001)
npm run dev:frontend   # Frontend only (port 3000)
```

The application will be available at:
- **Frontend Dashboard**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **API Documentation**: http://localhost:3001/health

## 🔐 Authentication

### Default Login Credentials

For development and testing, use these sample credentials:

```
Email: admin@plumbingcompany.com
Password: admin123

Email: tech@plumbingcompany.com  
Password: tech123
```

### User Roles

- **Admin**: Full system access, user management, business configuration
- **Technician**: Job management, customer interaction, quote creation
- **Dispatcher**: Conversation management, scheduling, customer support
- **Readonly**: View-only access to dashboard and reports

## 📁 Project Structure

```
plumbing-voice-ai/
├── backend/                    # Express.js API server
│   ├── src/
│   │   ├── routes/            # API endpoints
│   │   ├── services/          # Business logic
│   │   ├── models/            # Database models
│   │   ├── middleware/        # Auth, validation, etc.
│   │   ├── utils/             # Helper functions
│   │   └── app.ts             # Main server file
│   ├── scripts/               # Database migration/seed scripts
│   └── package.json
├── frontend/                   # React dashboard
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   ├── pages/             # Main application views
│   │   ├── hooks/             # Custom React hooks
│   │   ├── services/          # API integration
│   │   └── types/             # TypeScript definitions
│   └── package.json
├── database/
│   ├── migrations/            # Database schema changes
│   └── seeders/               # Sample data
├── shared/
│   └── types/                 # Shared TypeScript types
└── docs/                      # Additional documentation
```

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/verify` - Token verification
- `POST /api/auth/refresh` - Token refresh

### Customers
- `GET /api/customers` - List customers (with filtering/pagination)
- `POST /api/customers` - Create new customer
- `GET /api/customers/:id` - Get customer details
- `PUT /api/customers/:id` - Update customer
- `DELETE /api/customers/:id` - Soft delete customer

### Conversations
- `GET /api/conversations` - List conversations
- `POST /api/conversations` - Create conversation
- `GET /api/conversations/:id` - Get conversation with messages
- `POST /api/conversations/:id/messages` - Add message
- `PATCH /api/conversations/:id/messages/read` - Mark as read

### Jobs
- `GET /api/jobs` - List jobs (with filtering)
- `POST /api/jobs` - Create new job
- `GET /api/jobs/:id` - Get job details
- `PUT /api/jobs/:id` - Update job
- `DELETE /api/jobs/:id` - Delete job

### Quotes
- `GET /api/quotes` - List quotes
- `POST /api/quotes` - Create quote with line items
- `GET /api/quotes/:id` - Get quote details
- `PUT /api/quotes/:id` - Update quote

### AI Integration
- `POST /api/ai/generate-response` - Generate AI response for conversation

### Webhooks
- `POST /webhooks/google-voice` - Google Voice webhook endpoint

### Analytics
- `GET /api/analytics/metrics` - Business performance metrics

## 🎯 Business Workflow

### 1. Customer Inquiry
1. Customer calls or texts business number
2. Google Voice webhook triggers message processing
3. System identifies existing customer or creates new record
4. AI analyzes message content and determines intent
5. Priority level assigned (emergency, routine, estimate)

### 2. AI Response Generation
1. System gathers customer context (history, preferences, current jobs)
2. Claude AI generates contextually appropriate response
3. Response includes suggested actions and follow-up questions
4. Staff reviews and approves/edits response before sending

### 3. Job Creation & Management
1. Staff converts inquiry into job record
2. Job assigned service type, priority, and estimated duration
3. Customer scheduling and technician assignment
4. Real-time status updates throughout job lifecycle

### 4. Quote & Billing
1. Quote generated with line-item pricing
2. Customer approval tracking
3. Job completion and billing
4. Service warranty and follow-up scheduling

## 🧪 Testing

```bash
# Run all tests
npm run test

# Run backend tests only
npm run test --workspace=backend

# Run frontend tests only  
npm run test --workspace=frontend

# Run with coverage
npm run test -- --coverage
```

## 🚀 Production Deployment

### Environment Preparation

1. **Database Migration**: Switch to PostgreSQL for production
2. **Environment Variables**: Update all production API keys and secrets
3. **Security**: Enable HTTPS, configure CORS properly
4. **Monitoring**: Set up logging and error tracking

### Build Commands

```bash
# Build both frontend and backend
npm run build

# Start production server
npm start
```

### Deployment Checklist

- [ ] Database migrations completed
- [ ] Environment variables configured
- [ ] SSL certificates installed
- [ ] Google Voice webhook URLs updated
- [ ] API rate limits configured
- [ ] Backup strategy implemented
- [ ] Monitoring and alerting enabled

## 📊 Performance Considerations

### Database Optimization
- **Indexing**: All foreign keys and frequently queried fields are indexed
- **Connection Pooling**: Configured for optimal concurrent usage
- **Query Optimization**: Uses efficient joins and pagination

### API Performance
- **Rate Limiting**: Protects against abuse and ensures fair usage
- **Caching**: Implements strategic caching for frequently accessed data
- **Compression**: Reduces payload sizes for faster response times

### Frontend Optimization
- **Code Splitting**: Lazy loads routes and components
- **Asset Optimization**: Minified bundles and optimized images
- **State Management**: Efficient React Query for server state

## 🔒 Security Features

### Authentication & Authorization
- **JWT Tokens**: Secure stateless authentication
- **Role-based Access**: Granular permissions by user role
- **Session Management**: Automatic token refresh and expiration

### Data Protection
- **Input Validation**: Comprehensive validation on all inputs
- **SQL Injection Prevention**: Parameterized queries with Knex.js
- **XSS Protection**: Content Security Policy and input sanitization

### API Security
- **Rate Limiting**: Prevents abuse and DDoS attacks
- **CORS Configuration**: Restricts cross-origin requests
- **Request Logging**: Comprehensive audit trail

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

For technical support or business inquiries:
- **Email**: support@plumbingvoiceai.com
- **Documentation**: [Full API Documentation](docs/api.md)
- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)

---

**Built with ❤️ for the plumbing industry**