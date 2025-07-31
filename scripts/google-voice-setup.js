#!/usr/bin/env node

/**
 * Google Voice Integration Setup Script
 * This script helps configure Google Voice integration for the Plumbing AI system
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { google } = require('googleapis');

// Colors for console output
const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
    reset: '\x1b[0m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, resolve);
    });
}

async function main() {
    log('🔧 Google Voice Integration Setup for Plumbing AI', 'blue');
    log('=' .repeat(60), 'blue');
    
    console.log('\nThis script will help you set up Google Voice integration.');
    console.log('You\'ll need credentials from Google Cloud Console.\n');
    
    try {
        // Check if .env file exists
        const envPath = path.join(__dirname, '../backend/.env');
        if (!fs.existsSync(envPath)) {
            log('❌ Backend .env file not found. Please run setup-development.sh first.', 'red');
            process.exit(1);
        }
        
        // Read current .env file
        const envContent = fs.readFileSync(envPath, 'utf8');
        const envLines = envContent.split('\n');
        
        log('📋 Current Google Voice Configuration:', 'yellow');
        console.log('');
        
        // Show current Google Voice config
        const googleVoiceFields = [
            'GOOGLE_CLIENT_ID',
            'GOOGLE_CLIENT_SECRET',
            'GOOGLE_REDIRECT_URI',
            'GOOGLE_VOICE_EMAIL',
            'GOOGLE_VOICE_PASSWORD'
        ];
        
        const currentConfig = {};
        googleVoiceFields.forEach(field => {
            const line = envLines.find(line => line.startsWith(`${field}=`));
            const value = line ? line.split('=')[1] : '';
            currentConfig[field] = value;
            
            if (value && !value.startsWith('your-')) {
                log(`  ✅ ${field}: ${value.substring(0, 20)}${value.length > 20 ? '...' : ''}`, 'green');
            } else {
                log(`  ❌ ${field}: Not configured`, 'red');
            }
        });
        
        console.log('');
        
        // Check if user wants to update configuration
        const updateConfig = await askQuestion('Do you want to update the Google Voice configuration? (y/n): ');
        
        if (updateConfig.toLowerCase() === 'y') {
            console.log('\n📝 Please provide your Google Cloud Console credentials:');
            console.log('   Get these from: https://console.cloud.google.com/apis/credentials\n');
            
            // Get Google OAuth credentials
            const clientId = await askQuestion('Google Client ID: ');
            const clientSecret = await askQuestion('Google Client Secret: ');
            
            // Update .env file
            let updatedEnvContent = envContent;
            
            updatedEnvContent = updatedEnvContent.replace(
                /GOOGLE_CLIENT_ID=.*/,
                `GOOGLE_CLIENT_ID=${clientId}`
            );
            
            updatedEnvContent = updatedEnvContent.replace(
                /GOOGLE_CLIENT_SECRET=.*/,
                `GOOGLE_CLIENT_SECRET=${clientSecret}`
            );
            
            // Write updated .env file
            fs.writeFileSync(envPath, updatedEnvContent);
            
            log('✅ Google Voice credentials updated in .env file', 'green');
        }
        
        // Validate OAuth setup
        console.log('\n🔍 Validating OAuth setup...');
        
        const finalEnvContent = fs.readFileSync(envPath, 'utf8');
        const clientIdMatch = finalEnvContent.match(/GOOGLE_CLIENT_ID=(.+)/);
        const clientSecretMatch = finalEnvContent.match(/GOOGLE_CLIENT_SECRET=(.+)/);
        
        if (!clientIdMatch || !clientSecretMatch || 
            clientIdMatch[1].startsWith('your-') || 
            clientSecretMatch[1].startsWith('your-')) {
            log('❌ Google OAuth credentials not properly configured', 'red');
            console.log('\nPlease ensure you have:');
            console.log('1. Created a Google Cloud Project');
            console.log('2. Enabled the Gmail API (Google Voice uses Gmail API)');
            console.log('3. Created OAuth 2.0 credentials');
            console.log('4. Added http://localhost:3001/auth/google/callback as redirect URI');
        } else {
            log('✅ Google OAuth credentials configured', 'green');
            
            // Test OAuth flow
            console.log('\n🧪 Testing OAuth configuration...');
            
            const oauth2Client = new google.auth.OAuth2(
                clientIdMatch[1],
                clientSecretMatch[1],
                'http://localhost:3001/auth/google/callback'
            );
            
            const authUrl = oauth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: [
                    'https://www.googleapis.com/auth/gmail.readonly',
                    'https://www.googleapis.com/auth/gmail.send',
                    'https://mail.google.com/'
                ]
            });
            
            console.log('\n🔗 To complete setup, you\'ll need to authorize the application:');
            console.log(`   ${authUrl}\n`);
            
            console.log('This URL will be used in the application\'s OAuth flow.');
        }
        
        // Show next steps
        console.log('\n📋 Next Steps:');
        console.log('1. Start the development server: npm run dev');
        console.log('2. Navigate to http://localhost:3000');
        console.log('3. Go to Settings > Integrations > Google Voice');
        console.log('4. Click "Connect Google Account" and complete OAuth flow');
        console.log('5. Test by sending a message to your Google Voice number');
        
        // Create integration test script
        const testScriptPath = path.join(__dirname, 'test-google-voice.js');
        const testScript = `#!/usr/bin/env node

/**
 * Google Voice Integration Test Script
 * Run this after completing OAuth setup to test the integration
 */

const axios = require('axios');

async function testIntegration() {
    console.log('🧪 Testing Google Voice Integration...');
    
    try {
        // Test health endpoint
        const healthResponse = await axios.get('http://localhost:3001/health');
        console.log('✅ Backend is running');
        
        // Test Google Voice status
        const voiceResponse = await axios.get('http://localhost:3001/api/google-voice/status', {
            headers: {
                'Authorization': 'Bearer dev-api-key-for-frontend-backend-communication'
            }
        });
        
        if (voiceResponse.data.connected) {
            console.log('✅ Google Voice is connected');
            console.log(\`   Phone Number: \${voiceResponse.data.phoneNumber}\`);
        } else {
            console.log('❌ Google Voice not connected');
            console.log('   Please complete OAuth flow in the web interface');
        }
        
    } catch (error) {
        console.log('❌ Integration test failed:');
        console.log(\`   \${error.message}\`);
        console.log('\\nMake sure the backend server is running: npm run dev:backend');
    }
}

if (require.main === module) {
    testIntegration();
}

module.exports = { testIntegration };
`;
        
        fs.writeFileSync(testScriptPath, testScript);
        fs.chmodSync(testScriptPath, '755');
        
        log('\n✅ Setup complete! Integration test script created at scripts/test-google-voice.js', 'green');
        
    } catch (error) {
        log(`❌ Setup failed: ${error.message}`, 'red');
        process.exit(1);
    } finally {
        rl.close();
    }
}

if (require.main === module) {
    main();
}