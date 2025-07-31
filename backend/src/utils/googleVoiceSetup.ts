import readline from 'readline';
import fs from 'fs/promises';
import path from 'path';
import { googleVoiceConfig } from '../config/googleVoice';
import { DatabaseService } from '../services/DatabaseService';
import { GoogleVoiceAuthService } from '../services/GoogleVoiceAuthService';
import { GoogleVoiceApiClient } from '../services/GoogleVoiceApiClient';
import { logger } from './logger';

export interface SetupStep {
  id: string;
  title: string;
  description: string;
  required: boolean;
  completed: boolean;
  error?: string;
}

export interface SetupResult {
  success: boolean;
  steps: SetupStep[];
  errors: string[];
  warnings: string[];
  nextSteps: string[];
}

export class GoogleVoiceSetupWizard {
  private rl: readline.Interface;
  private db: DatabaseService;
  private authService: GoogleVoiceAuthService;
  private apiClient: GoogleVoiceApiClient;
  private steps: SetupStep[] = [];

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    this.db = new DatabaseService();
    this.authService = new GoogleVoiceAuthService(this.db);
    this.apiClient = new GoogleVoiceApiClient(this.authService, this.db);
    
    this.initializeSteps();
  }

  private initializeSteps(): void {
    this.steps = [
      {
        id: 'environment',
        title: 'Environment Configuration',
        description: 'Check and validate environment variables',
        required: true,
        completed: false
      },
      {
        id: 'database',
        title: 'Database Setup',
        description: 'Initialize database and run migrations',
        required: true,
        completed: false
      },
      {
        id: 'google_credentials',
        title: 'Google Cloud Setup',
        description: 'Configure Google Cloud Console and OAuth credentials',
        required: true,
        completed: false
      },
      {
        id: 'oauth_test',
        title: 'OAuth Flow Test',
        description: 'Test OAuth2 authorization flow',
        required: true,
        completed: false
      },
      {
        id: 'api_permissions',
        title: 'API Permissions',
        description: 'Verify Google Voice API access and permissions',
        required: true,
        completed: false
      },
      {
        id: 'webhook_setup',
        title: 'Webhook Configuration',
        description: 'Set up webhook endpoints for real-time updates',
        required: false,
        completed: false
      }
    ];
  }

  /**
   * Run the complete setup wizard
   */
  async runSetup(): Promise<SetupResult> {
    console.log('\n🎉 Welcome to Google Voice Integration Setup Wizard!');
    console.log('This wizard will help you configure Google Voice integration for your plumbing CRM.\n');

    const result: SetupResult = {
      success: false,
      steps: [],
      errors: [],
      warnings: [],
      nextSteps: []
    };

    try {
      // Run each setup step
      for (const step of this.steps) {
        console.log(`\n📋 ${step.title}`);
        console.log(`   ${step.description}`);
        
        try {
          await this.runStep(step);
          step.completed = true;
          console.log(`   ✅ ${step.title} completed successfully`);
        } catch (error) {
          step.error = error instanceof Error ? error.message : 'Unknown error';
          step.completed = false;
          console.log(`   ❌ ${step.title} failed: ${step.error}`);
          
          if (step.required) {
            result.errors.push(`Required step failed: ${step.title} - ${step.error}`);
          } else {
            result.warnings.push(`Optional step failed: ${step.title} - ${step.error}`);
          }
        }
      }

      result.steps = [...this.steps];
      result.success = this.steps.every(step => step.completed || !step.required);

      // Generate next steps
      result.nextSteps = this.generateNextSteps(result);

      // Display summary
      this.displaySummary(result);

    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : 'Setup failed');
    } finally {
      this.rl.close();
    }

    return result;
  }

  /**
   * Run a specific setup step
   */
  private async runStep(step: SetupStep): Promise<void> {
    switch (step.id) {
      case 'environment':
        await this.checkEnvironment();
        break;
      case 'database':
        await this.setupDatabase();
        break;
      case 'google_credentials':
        await this.setupGoogleCredentials();
        break;
      case 'oauth_test':
        await this.testOAuthFlow();
        break;
      case 'api_permissions':
        await this.verifyApiPermissions();
        break;
      case 'webhook_setup':
        await this.setupWebhooks();
        break;
      default:
        throw new Error(`Unknown setup step: ${step.id}`);
    }
  }

  /**
   * Step 1: Check environment configuration
   */
  private async checkEnvironment(): Promise<void> {
    const config = googleVoiceConfig.getConfigSummary();
    const issues: string[] = [];

    // Check required environment variables
    if (!config.oauth.hasClientId) {
      issues.push('GOOGLE_CLIENT_ID is missing');
    }
    if (!config.oauth.hasClientSecret) {
      issues.push('GOOGLE_CLIENT_SECRET is missing');
    }
    if (!config.oauth.hasRedirectUri) {
      issues.push('GOOGLE_REDIRECT_URI is missing');
    }

    // Check security configuration
    if (!config.security.hasCustomEncryptionKey) {
      issues.push('TOKEN_ENCRYPTION_KEY should be set to a secure random string');
    }
    if (!config.security.hasCustomSessionSecret) {
      issues.push('SESSION_SECRET should be set to a secure random string');
    }

    if (issues.length > 0) {
      throw new Error(`Environment issues found: ${issues.join(', ')}`);
    }

    console.log('   ✓ All required environment variables are set');
    console.log(`   ✓ API timeout: ${config.api.timeout}ms`);
    console.log(`   ✓ Sync batch size: ${config.sync.batchSize}`);
  }

  /**
   * Step 2: Setup database
   */
  private async setupDatabase(): Promise<void> {
    try {
      await DatabaseService.initialize();
      console.log('   ✓ Database connection established');

      // Check if Google Voice tables exist
      const knex = await this.db.getKnex();
      const hasTokenTable = await knex.schema.hasTable('google_oauth_tokens');
      const hasSyncTable = await knex.schema.hasTable('google_voice_sync_status');

      if (!hasTokenTable || !hasSyncTable) {
        throw new Error('Google Voice tables not found. Please run database migrations first.');
      }

      console.log('   ✓ Google Voice database tables found');
    } catch (error) {
      throw new Error(`Database setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Step 3: Guide through Google Cloud setup
   */
  private async setupGoogleCredentials(): Promise<void> {
    console.log('\n   Google Cloud Console Setup:');
    console.log('   1. Go to https://console.cloud.google.com/');
    console.log('   2. Create a new project or select existing project');
    console.log('   3. Enable the Google Voice API');
    console.log('   4. Create OAuth 2.0 credentials');
    console.log('   5. Add authorized redirect URIs');
    
    const hasCredentials = await this.askYesNo('   Have you completed the Google Cloud setup?');
    if (!hasCredentials) {
      throw new Error('Google Cloud setup not completed');
    }

    // Verify credentials are properly configured
    const config = googleVoiceConfig.getOAuthConfig();
    if (!config.clientId || !config.clientSecret || !config.redirectUri) {
      throw new Error('Google OAuth credentials not properly configured');
    }

    console.log('   ✓ Google OAuth credentials configured');
  }

  /**
   * Step 4: Test OAuth flow
   */
  private async testOAuthFlow(): Promise<void> {
    console.log('   Testing OAuth2 authorization flow...');
    
    // Create a test user ID
    const testUserId = 'setup-test-user';
    
    try {
      // Generate auth URL
      const { url } = this.authService.generateAuthUrl(testUserId);
      console.log(`   ✓ Authorization URL generated: ${url.substring(0, 50)}...`);
      
      // Note: In a real setup, we would open this URL and handle the callback
      // For now, we just verify URL generation works
      console.log('   ⚠️  Manual OAuth testing required - use the test endpoint in your API');
      
    } catch (error) {
      throw new Error(`OAuth flow test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Step 5: Verify API permissions
   */
  private async verifyApiPermissions(): Promise<void> {
    console.log('   Checking Google Voice API permissions...');
    
    // This step requires an active token, so we'll just verify configuration
    const scopes = googleVoiceConfig.getAllScopes();
    console.log(`   ✓ Required scopes configured: ${scopes.length} scopes`);
    console.log(`   ⚠️  API permission verification requires active OAuth token`);
    console.log('   Use the /api/google-voice/test/{tokenId} endpoint after authentication');
  }

  /**
   * Step 6: Setup webhooks (optional)
   */
  private async setupWebhooks(): Promise<void> {
    const enableWebhooks = await this.askYesNo('   Do you want to enable webhook support for real-time updates?');
    
    if (enableWebhooks) {
      console.log('   Webhook setup:');
      console.log('   1. Configure webhook endpoints in your Google Cloud project');
      console.log('   2. Set up ngrok or similar for local development');
      console.log('   3. Update webhook URLs in Google Cloud Console');
      console.log('   ✓ Webhook configuration guidance provided');
    } else {
      console.log('   ✓ Webhooks disabled - polling will be used for updates');
    }
  }

  /**
   * Generate next steps based on setup results
   */
  private generateNextSteps(result: SetupResult): string[] {
    const nextSteps: string[] = [];

    if (result.success) {
      nextSteps.push('1. Start your application server');
      nextSteps.push('2. Use /api/google-voice/auth/url to begin OAuth flow');
      nextSteps.push('3. Complete OAuth authorization in browser');
      nextSteps.push('4. Use /api/google-voice/auth/callback to exchange code for tokens');
      nextSteps.push('5. Test API connectivity with /api/google-voice/test/{tokenId}');
      nextSteps.push('6. Begin message synchronization with /api/google-voice/sync/{tokenId}/start');
    } else {
      nextSteps.push('1. Fix the failed setup steps above');
      nextSteps.push('2. Re-run the setup wizard');
      nextSteps.push('3. Check the documentation for troubleshooting tips');
    }

    return nextSteps;
  }

  /**
   * Display setup summary
   */
  private displaySummary(result: SetupResult): void {
    console.log('\n' + '='.repeat(60));
    console.log('📊 SETUP SUMMARY');
    console.log('='.repeat(60));

    // Display step results
    result.steps.forEach(step => {
      const status = step.completed ? '✅' : (step.required ? '❌' : '⚠️');
      console.log(`${status} ${step.title}: ${step.completed ? 'Completed' : 'Failed'}`);
      if (step.error) {
        console.log(`   Error: ${step.error}`);
      }
    });

    console.log('');

    // Display overall result
    if (result.success) {
      console.log('🎉 Setup completed successfully!');
    } else {
      console.log('⚠️  Setup completed with issues');
    }

    // Display errors and warnings
    if (result.errors.length > 0) {
      console.log('\n❌ Errors:');
      result.errors.forEach(error => console.log(`   • ${error}`));
    }

    if (result.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      result.warnings.forEach(warning => console.log(`   • ${warning}`));
    }

    // Display next steps
    console.log('\n📋 Next Steps:');
    result.nextSteps.forEach(step => console.log(`   ${step}`));

    console.log('\n' + '='.repeat(60));
  }

  /**
   * Ask yes/no question
   */
  private async askYesNo(question: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.rl.question(`${question} (y/n): `, (answer) => {
        resolve(answer.toLowerCase().startsWith('y'));
      });
    });
  }

  /**
   * Ask for text input
   */
  private async askQuestion(question: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(`${question}: `, (answer) => {
        resolve(answer.trim());
      });
    });
  }
}

/**
 * Create environment file template
 */
export async function createEnvTemplate(): Promise<void> {
  const template = `# Google Voice Integration Configuration

# Google OAuth2 Credentials (from Google Cloud Console)
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3001/api/google-voice/auth/callback

# Security Keys (generate secure random strings)
TOKEN_ENCRYPTION_KEY=your_secure_token_encryption_key_here
SESSION_SECRET=your_secure_session_secret_here

# Google Voice API Configuration (optional - defaults provided)
# GOOGLE_VOICE_API_TIMEOUT=30000
# GOOGLE_VOICE_SYNC_BATCH_SIZE=50
# GOOGLE_VOICE_SYNC_INTERVAL_MINUTES=15
# GOOGLE_VOICE_MAX_HISTORY_DAYS=365

# Rate Limiting (optional - defaults provided)
# GOOGLE_VOICE_REQUESTS_PER_MINUTE=60
# GOOGLE_VOICE_REQUESTS_PER_HOUR=1000
# GOOGLE_VOICE_REQUESTS_PER_DAY=10000

# Feature Flags (optional - defaults to false)
# GOOGLE_VOICE_ENABLE_WEBHOOKS=true
# GOOGLE_VOICE_ENABLE_CONTACT_SYNC=true
# GOOGLE_VOICE_ENABLE_CALL_HISTORY=true
# GOOGLE_VOICE_ENABLE_VOICEMAIL_TRANSCRIPTION=true
# GOOGLE_VOICE_ENABLE_MESSAGE_SEARCH=true

# Development Settings
NODE_ENV=development
`;

  const envPath = path.join(process.cwd(), '.env.google-voice.template');
  await fs.writeFile(envPath, template);
  
  console.log(`Environment template created: ${envPath}`);
  console.log('Copy this to .env and fill in your actual values');
}

/**
 * Test utilities for development
 */
export class GoogleVoiceTestUtils {
  /**
   * Generate test configuration for development
   */
  static getTestConfig() {
    return {
      testUserId: 'test-user-123',
      testPhoneNumber: '+1234567890',
      testMessage: 'This is a test message from the plumbing CRM system',
      mockResponses: {
        authSuccess: {
          access_token: 'mock_access_token',
          refresh_token: 'mock_refresh_token',
          expires_in: 3600,
          scope: 'voice.readonly voice.v1'
        },
        messagesResponse: {
          messages: [
            {
              id: 'msg_123',
              threadId: 'thread_456',
              text: 'Hi, I need help with my kitchen faucet',
              timestamp: new Date().toISOString(),
              phoneNumber: '+1234567890',
              direction: 'inbound',
              type: 'sms'
            }
          ],
          nextPageToken: 'next_page_token'
        }
      }
    };
  }

  /**
   * Create mock data for testing
   */
  static async createMockData(db: DatabaseService): Promise<void> {
    const knex = await db.getKnex();
    
    // Insert mock customer
    await knex('customers').insert({
      id: 'test-customer-123',
      firstName: 'John',
      lastName: 'Doe',
      phone: '+1234567890',
      email: 'john.doe@example.com',
      address: '123 Main St',
      city: 'Anytown',
      state: 'CA',
      zipCode: '12345',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }).onConflict('id').ignore();

    logger.info('Mock test data created');
  }

  /**
   * Clean up test data
   */
  static async cleanupMockData(db: DatabaseService): Promise<void> {
    const knex = await db.getKnex();
    
    await knex('google_oauth_tokens').where('userId', 'test-user-123').del();
    await knex('customers').where('id', 'test-customer-123').del();
    
    logger.info('Mock test data cleaned up');
  }

  /**
   * Validate API response format
   */
  static validateApiResponse(response: any, expectedFields: string[]): boolean {
    for (const field of expectedFields) {
      if (!(field in response)) {
        logger.error(`Missing field in API response: ${field}`);
        return false;
      }
    }
    return true;
  }
}

// CLI command handler
if (require.main === module) {
  const command = process.argv[2];
  
  switch (command) {
    case 'setup':
      new GoogleVoiceSetupWizard().runSetup()
        .then(result => {
          process.exit(result.success ? 0 : 1);
        })
        .catch(error => {
          console.error('Setup failed:', error);
          process.exit(1);
        });
      break;
      
    case 'create-env':
      createEnvTemplate()
        .then(() => {
          console.log('Environment template created successfully');
          process.exit(0);
        })
        .catch(error => {
          console.error('Failed to create environment template:', error);
          process.exit(1);
        });
      break;
      
    default:
      console.log('Usage:');
      console.log('  npm run setup-google-voice setup    - Run setup wizard');
      console.log('  npm run setup-google-voice create-env - Create .env template');
      process.exit(1);
  }
}

export { GoogleVoiceSetupWizard, GoogleVoiceTestUtils };