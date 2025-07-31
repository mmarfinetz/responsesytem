# 🚀 Plumbing Voice AI - Quick Setup Guide

This guide will get your Plumbing Voice AI system up and running in development mode.

## ⚡ Quick Start (5 minutes)

### 1. **Run the Automated Setup**
```bash
cd /Users/mitch/Desktop/bot/voicebot
./scripts/setup-development.sh
```

This script automatically:
- ✅ Installs all dependencies
- ✅ Sets up PostgreSQL and Redis with Docker
- ✅ Creates environment files
- ✅ Runs database migrations
- ✅ Creates admin users and sample data

### 2. **Add Your API Credentials**

Edit `backend/.env` and add your actual API keys:

```bash
# Get from https://console.anthropic.com/
ANTHROPIC_API_KEY=sk-ant-your_actual_api_key_here

# Get from https://console.cloud.google.com/apis/credentials
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

### 3. **Start the System**
```bash
npm run dev
```

### 4. **Access the Application**
- **Dashboard**: http://localhost:3000
- **API**: http://localhost:3001
- **Health Check**: http://localhost:3001/health

### 5. **Login with Default Credentials**
- **Email**: `admin@plumbingcompany.com`
- **Password**: `admin123`

---

## 🔑 Required Credentials

You need these API keys to fully use the system:

### **Anthropic Claude AI** (Required)
1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Create account and get API key
3. Add to `backend/.env`: `ANTHROPIC_API_KEY=sk-ant-your_key`

### **Google Cloud OAuth** (Required for Google Voice)
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create project and enable Gmail API
3. Create OAuth 2.0 credentials
4. Add redirect URI: `http://localhost:3001/auth/google/callback`
5. Add to `backend/.env`:
   ```
   GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your_client_secret
   ```

### **Optional Integrations**
- **Google Maps**: For technician routing
- **Twilio**: For production SMS (alternative to Google Voice)
- **Stripe**: For payment processing

---

## 🗄️ Database Setup

The system uses **PostgreSQL** with the following default configuration:

```
Database: voicebot
Username: voicebot  
Password: voicebot123
Host: localhost
Port: 5432
```

**With Docker** (Automatic):
```bash
# Docker starts automatically with setup script
docker-compose -f docker-compose.dev.yml up -d postgres redis
```

**Manual PostgreSQL Setup**:
```bash
# Install PostgreSQL
brew install postgresql  # macOS
# or apt-get install postgresql  # Ubuntu

# Create database
createdb voicebot
createuser voicebot --pwprompt  # password: voicebot123
```

---

## 🔧 Google Voice Integration Setup

### Option 1: Interactive Setup Script
```bash
./scripts/google-voice-setup.js
```

### Option 2: Manual Setup
1. **Google Cloud Console**:
   - Create OAuth 2.0 credentials
   - Enable Gmail API
   - Add redirect URI: `http://localhost:3001/auth/google/callback`

2. **In the Application**:
   - Go to Settings → Integrations → Google Voice
   - Click "Connect Google Account"
   - Complete OAuth flow

3. **Test Integration**:
   ```bash
   ./scripts/test-google-voice.js
   ```

---

## 🎯 System Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   React         │    │   Express.js     │    │   PostgreSQL    │
│   Frontend      │◄──►│   Backend API    │◄──►│   Database      │
│   (Port 3000)   │    │   (Port 3001)    │    │   (Port 5432)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                               │
                               ▼
                    ┌──────────────────┐    ┌─────────────────┐
                    │      Redis       │    │  External APIs  │
                    │   (Port 6379)    │    │ • Claude AI     │
                    │                  │    │ • Google Voice  │
                    └──────────────────┘    └─────────────────┘
```

---

## 👤 Default User Accounts

| Email | Password | Role | Access |
|-------|----------|------|---------|
| `admin@plumbingcompany.com` | `admin123` | Administrator | Full system access |
| `tech@plumbingcompany.com` | `tech123` | Technician | Job management, mobile app |
| `dispatcher@plumbingcompany.com` | `dispatch123` | Dispatcher | Conversation management |

**⚠️ Change passwords after first login!**

---

## 🔍 Troubleshooting

### **Backend won't start**
```bash
# Check database connection
npm run db:migrate

# Check logs
npm run dev:backend
```

### **Frontend won't start**
```bash
# Check if backend is running first
curl http://localhost:3001/health

# Restart frontend
npm run dev:frontend
```

### **Database connection failed**
```bash
# Start database services
docker-compose -f docker-compose.dev.yml up -d postgres redis

# Or check manual PostgreSQL setup
pg_isready -h localhost -p 5432
```

### **Google Voice not working**
1. Verify OAuth credentials in `backend/.env`
2. Check redirect URI matches exactly
3. Run `./scripts/google-voice-setup.js`
4. Complete OAuth flow in web interface

### **AI responses not working**
1. Verify `ANTHROPIC_API_KEY` in `backend/.env`
2. Check API key is valid at [Anthropic Console](https://console.anthropic.com/)
3. Monitor usage and billing limits

---

## 📚 Next Steps

1. **Configure Your Business**:
   - Update business information in `backend/.env`
   - Set service area and pricing rules
   - Configure emergency response settings

2. **Import Customer Data**:
   - Use the admin dashboard to import existing customers
   - Set up customer properties and equipment

3. **Train AI Responses**:
   - Review and edit AI-generated responses
   - Build your knowledge base of common scenarios

4. **Mobile Setup**:
   - Install the PWA on technician devices
   - Test GPS and camera functionality

5. **Production Deployment**:
   - See `docs/deployment-runbook.md` for production setup
   - Configure SSL, domain, and external databases

---

## 🆘 Support & Documentation

- **API Documentation**: http://localhost:3001/api/docs (when running)
- **Health Check**: http://localhost:3001/health
- **System Monitoring**: http://localhost:3000/system-monitoring
- **Troubleshooting Guide**: `docs/troubleshooting/system-troubleshooting-guide.md`

---

## 🛡️ Security Notes

- Default credentials are for development only
- Change all passwords before production use
- Keep API keys secure and never commit them to version control
- Enable 2FA for production admin accounts
- Regular security updates are automatically checked

**🎉 Your Plumbing AI system is ready to revolutionize your customer service!**