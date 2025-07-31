import { google } from 'googleapis';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from './DatabaseService';
import { logger } from '../utils/logger';

export interface OAuthTokens {
  id: string;
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  expiresAt: Date;
  scopes: string[];
  tokenType: string;
  isActive: boolean;
  lastRefreshedAt?: Date;
  refreshCount: number;
  errorMessage?: string;
}

export interface AuthorizationUrlOptions {
  state?: string;
  scopes?: string[];
  loginHint?: string;
  prompt?: 'none' | 'consent' | 'select_account';
}

export interface PKCEChallenge {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
  state: string;
}

export class GoogleVoiceAuthService {
  private oauth2Client: any;
  private db: DatabaseService;
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  
  // Required scopes for Google Voice functionality
  private static readonly REQUIRED_SCOPES = [
    'https://www.googleapis.com/auth/voice.v1',
    'https://www.googleapis.com/auth/voice.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile'
  ];

  // Optional scopes for enhanced functionality
  private static readonly OPTIONAL_SCOPES = [
    'https://www.googleapis.com/auth/contacts.readonly',
    'https://www.googleapis.com/auth/calendar.readonly'
  ];

  constructor(db: DatabaseService) {
    this.db = db;
    this.clientId = process.env.GOOGLE_CLIENT_ID || '';
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
    this.redirectUri = process.env.GOOGLE_REDIRECT_URI || '';

    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      throw new Error('Missing required Google OAuth2 configuration. Please set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI environment variables.');
    }

    this.oauth2Client = new google.auth.OAuth2(
      this.clientId,
      this.clientSecret,
      this.redirectUri
    );

    // Set up token refresh handler
    this.oauth2Client.on('tokens', async (tokens: any) => {
      await this.handleTokenRefresh(tokens);
    });
  }

  /**
   * Generate PKCE challenge for secure OAuth2 flow
   */
  generatePKCEChallenge(): PKCEChallenge {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    
    const state = crypto.randomBytes(16).toString('hex');

    return {
      codeVerifier,
      codeChallenge,
      codeChallengeMethod: 'S256',
      state
    };
  }

  /**
   * Generate authorization URL for OAuth2 flow
   */
  generateAuthUrl(userId: string, options: AuthorizationUrlOptions = {}): { url: string; pkce: PKCEChallenge } {
    const pkce = this.generatePKCEChallenge();
    const scopes = options.scopes || [...GoogleVoiceAuthService.REQUIRED_SCOPES, ...GoogleVoiceAuthService.OPTIONAL_SCOPES];
    
    const state = JSON.stringify({
      userId,
      pkceState: pkce.state,
      timestamp: Date.now()
    });

    const url = this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      state: Buffer.from(state).toString('base64'),
      code_challenge: pkce.codeChallenge,
      code_challenge_method: pkce.codeChallengeMethod,
      login_hint: options.loginHint,
      prompt: options.prompt || 'consent',
      include_granted_scopes: true
    });

    logger.info('Generated OAuth authorization URL', { 
      userId, 
      scopes: scopes.length,
      hasLoginHint: !!options.loginHint 
    });

    return { url, pkce };
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(
    code: string, 
    state: string, 
    codeVerifier: string
  ): Promise<OAuthTokens> {
    try {
      // Validate and decode state
      const decodedState = JSON.parse(Buffer.from(state, 'base64').toString());
      const { userId, pkceState, timestamp } = decodedState;

      // Validate state timestamp (15 minutes max)
      if (Date.now() - timestamp > 15 * 60 * 1000) {
        throw new Error('Authorization state expired');
      }

      // Set code verifier for PKCE
      this.oauth2Client.codeVerifier = codeVerifier;

      // Exchange code for tokens
      const { tokens } = await this.oauth2Client.getToken(code);
      
      if (!tokens.access_token || !tokens.refresh_token) {
        throw new Error('Invalid token response from Google');
      }

      // Get user info to identify the Google account
      this.oauth2Client.setCredentials(tokens);
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      
      if (!userInfo.data.email) {
        throw new Error('Unable to retrieve user email from Google');
      }

      // Calculate expiration time
      const expiresAt = new Date(Date.now() + (tokens.expiry_date || 3600) * 1000);

      // Store tokens in database
      const tokenRecord: Omit<OAuthTokens, 'id'> = {
        userId,
        email: userInfo.data.email,
        accessToken: this.encryptToken(tokens.access_token),
        refreshToken: this.encryptToken(tokens.refresh_token),
        idToken: tokens.id_token ? this.encryptToken(tokens.id_token) : undefined,
        expiresAt,
        scopes: tokens.scope?.split(' ') || [],
        tokenType: tokens.token_type || 'Bearer',
        isActive: true,
        refreshCount: 0
      };

      const tokenId = await this.storeTokens(tokenRecord);

      logger.info('Successfully exchanged authorization code for tokens', {
        userId,
        email: userInfo.data.email,
        tokenId,
        scopes: tokenRecord.scopes.length
      });

      return { id: tokenId, ...tokenRecord };

    } catch (error) {
      logger.error('Failed to exchange authorization code for tokens', {
        error: error instanceof Error ? error.message : 'Unknown error',
        code: code.substring(0, 10) + '...'
      });
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(tokenId: string): Promise<OAuthTokens> {
    try {
      const tokens = await this.getTokens(tokenId);
      if (!tokens || !tokens.isActive) {
        throw new Error('Token not found or inactive');
      }

      // Set refresh token and attempt refresh
      this.oauth2Client.setCredentials({
        refresh_token: this.decryptToken(tokens.refreshToken)
      });

      const { credentials } = await this.oauth2Client.refreshAccessToken();
      
      if (!credentials.access_token) {
        throw new Error('Failed to refresh access token');
      }

      // Update token record
      const updatedTokens = {
        ...tokens,
        accessToken: this.encryptToken(credentials.access_token),
        expiresAt: new Date(credentials.expiry_date || Date.now() + 3600 * 1000),
        lastRefreshedAt: new Date(),
        refreshCount: tokens.refreshCount + 1,
        errorMessage: undefined
      };

      await this.updateTokens(tokenId, updatedTokens);

      logger.info('Successfully refreshed access token', {
        tokenId,
        email: tokens.email,
        refreshCount: updatedTokens.refreshCount
      });

      return updatedTokens;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Mark token as having an error
      await this.markTokenError(tokenId, errorMessage);
      
      logger.error('Failed to refresh access token', {
        tokenId,
        error: errorMessage
      });
      
      throw error;
    }
  }

  /**
   * Get valid access token, refreshing if necessary
   */
  async getValidAccessToken(tokenId: string): Promise<string> {
    let tokens = await this.getTokens(tokenId);
    
    if (!tokens || !tokens.isActive) {
      throw new Error('Token not found or inactive');
    }

    // Check if token needs refresh (refresh 5 minutes before expiry)
    const needsRefresh = new Date(Date.now() + 5 * 60 * 1000) >= tokens.expiresAt;
    
    if (needsRefresh) {
      tokens = await this.refreshAccessToken(tokenId);
    }

    return this.decryptToken(tokens.accessToken);
  }

  /**
   * Revoke OAuth tokens
   */
  async revokeTokens(tokenId: string): Promise<void> {
    try {
      const tokens = await this.getTokens(tokenId);
      if (!tokens) {
        throw new Error('Token not found');
      }

      // Revoke token with Google
      const accessToken = this.decryptToken(tokens.accessToken);
      await this.oauth2Client.revokeToken(accessToken);

      // Mark as inactive in database
      await this.deactivateTokens(tokenId);

      logger.info('Successfully revoked OAuth tokens', {
        tokenId,
        email: tokens.email
      });

    } catch (error) {
      logger.error('Failed to revoke OAuth tokens', {
        tokenId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Get all active tokens for a user
   */
  async getUserTokens(userId: string): Promise<OAuthTokens[]> {
    try {
      const knex = await DatabaseService.getInstance();
      const rows = await knex('google_oauth_tokens')
        .where({ userId, isActive: true })
        .orderBy('createdAt', 'desc');

      return rows.map(this.mapTokenRow);
    } catch (error) {
      logger.error('Failed to get user tokens', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Validate token scopes against required scopes
   */
  validateTokenScopes(tokens: OAuthTokens): { valid: boolean; missing: string[] } {
    const requiredScopes = GoogleVoiceAuthService.REQUIRED_SCOPES;
    const grantedScopes = tokens.scopes || [];
    const missing = requiredScopes.filter(scope => !grantedScopes.includes(scope));
    
    return {
      valid: missing.length === 0,
      missing
    };
  }

  /**
   * Check if user has valid Google Voice access
   */
  async hasValidAccess(userId: string): Promise<boolean> {
    try {
      const tokens = await this.getUserTokens(userId);
      if (tokens.length === 0) return false;

      for (const token of tokens) {
        const validation = this.validateTokenScopes(token);
        if (validation.valid) {
          // Try to get a valid access token
          try {
            await this.getValidAccessToken(token.id);
            return true;
          } catch {
            continue;
          }
        }
      }

      return false;
    } catch (error) {
      logger.error('Failed to check valid access', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }

  // Private helper methods
  
  private async storeTokens(tokens: Omit<OAuthTokens, 'id'>): Promise<string> {
    const knex = await DatabaseService.getInstance();
    const id = uuidv4();
    
    // Check if token already exists for this user/email combination
    const existing = await knex('google_oauth_tokens')
      .where({ userId: tokens.userId, email: tokens.email })
      .first();

    if (existing) {
      // Update existing token
      await knex('google_oauth_tokens')
        .where({ id: existing.id })
        .update({
          ...tokens,
          updatedAt: new Date()
        });
      return existing.id;
    } else {
      // Insert new token
      await knex('google_oauth_tokens').insert({
        id,
        ...tokens,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      return id;
    }
  }

  private async getTokens(tokenId: string): Promise<OAuthTokens | null> {
    const knex = await DatabaseService.getInstance();
    const row = await knex('google_oauth_tokens')
      .where({ id: tokenId })
      .first();

    return row ? this.mapTokenRow(row) : null;
  }

  private async updateTokens(tokenId: string, tokens: Partial<OAuthTokens>): Promise<void> {
    const knex = await DatabaseService.getInstance();
    await knex('google_oauth_tokens')
      .where({ id: tokenId })
      .update({
        ...tokens,
        updatedAt: new Date()
      });
  }

  private async deactivateTokens(tokenId: string): Promise<void> {
    const knex = await DatabaseService.getInstance();
    await knex('google_oauth_tokens')
      .where({ id: tokenId })
      .update({
        isActive: false,
        updatedAt: new Date()
      });
  }

  private async markTokenError(tokenId: string, errorMessage: string): Promise<void> {
    const knex = await DatabaseService.getInstance();
    await knex('google_oauth_tokens')
      .where({ id: tokenId })
      .update({
        errorMessage,
        updatedAt: new Date()
      });
  }

  private mapTokenRow(row: any): OAuthTokens {
    return {
      id: row.id,
      userId: row.userId,
      email: row.email,
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      idToken: row.idToken,
      expiresAt: new Date(row.expiresAt),
      scopes: Array.isArray(row.scopes) ? row.scopes : JSON.parse(row.scopes || '[]'),
      tokenType: row.tokenType,
      isActive: row.isActive,
      lastRefreshedAt: row.lastRefreshedAt ? new Date(row.lastRefreshedAt) : undefined,
      refreshCount: row.refreshCount || 0,
      errorMessage: row.errorMessage
    };
  }

  private async handleTokenRefresh(tokens: any): Promise<void> {
    // This is called automatically when tokens are refreshed
    logger.debug('OAuth2 client fired token refresh event', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiryDate: tokens.expiry_date
    });
  }

  private encryptToken(token: string): string {
    // Use environment variable for encryption key
    const key = process.env.TOKEN_ENCRYPTION_KEY || 'default-key-change-in-production';
    const cipher = crypto.createCipher('aes-256-cbc', key);
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  private decryptToken(encryptedToken: string): string {
    const key = process.env.TOKEN_ENCRYPTION_KEY || 'default-key-change-in-production';
    const decipher = crypto.createDecipher('aes-256-cbc', key);
    let decrypted = decipher.update(encryptedToken, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}