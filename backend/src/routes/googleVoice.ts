import express, { Request, Response, NextFunction } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { GoogleVoiceAuthService } from '../services/GoogleVoiceAuthService';
import { GoogleVoiceApiClient } from '../services/GoogleVoiceApiClient';
import { DatabaseService } from '../services/DatabaseService';
import { GoogleOAuthTokenModel, GoogleVoiceSyncStatusModel } from '../models/GoogleVoiceModels';
import { logger } from '../utils/logger';
import { AuthenticatedRequest } from '../middleware/auth';
import { 
  ValidationError,
  NotFoundError,
  formatValidationErrors,
  asyncHandler 
} from '../middleware/errorHandler';

const router = express.Router();

// Initialize services
const db = new DatabaseService();
const authService = new GoogleVoiceAuthService(db);
const apiClient = new GoogleVoiceApiClient(authService, db);
const tokenModel = new GoogleOAuthTokenModel(db);
const syncModel = new GoogleVoiceSyncStatusModel(db);

// Validation middleware
const validateResult = (req: Request, res: Response, next: NextFunction): void => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: errors.array()
    });
    return;
  }
  next();
};

// Error handling middleware for Google Voice routes
const handleGoogleVoiceError = (error: any, res: Response, operation: string): void => {
  logger.error(`Google Voice ${operation} failed`, {
    error: error.message,
    stack: error.stack,
    status: error.status
  });

  const statusCode = error.status || 500;
  const message = error.message || `${operation} failed`;

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
};

/**
 * GET /api/google-voice/auth/url
 * Generate OAuth2 authorization URL for Google Voice setup
 */
router.get('/auth/url', [
  query('loginHint').optional().isEmail().withMessage('Login hint must be a valid email'),
  query('prompt').optional().isIn(['none', 'consent', 'select_account']).withMessage('Invalid prompt value'),
  validateResult
], asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const { loginHint, prompt } = req.query;
    const { url, pkce } = authService.generateAuthUrl(userId, {
      loginHint: loginHint as string,
      prompt: prompt as any
    });

    // Store PKCE challenge in session or cache (implement based on your session management)
    req.session = { ...req.session, pkce };

    return res.json({
      success: true,
      data: {
        authUrl: url,
        state: pkce.state
      }
    });
  } catch (error) {
    return handleGoogleVoiceError(error, res, 'generate authorization URL');
  }
}));

/**
 * POST /api/google-voice/auth/callback
 * Handle OAuth2 callback and exchange code for tokens
 */
router.post('/auth/callback', [
  body('code').notEmpty().withMessage('Authorization code is required'),
  body('state').notEmpty().withMessage('State parameter is required'),
  validateResult
], asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code, state } = req.body;
    const pkce = req.session?.pkce;

    if (!pkce || !pkce.codeVerifier) {
      return res.status(400).json({
        success: false,
        message: 'PKCE challenge not found in session'
      });
    }

    const tokens = await authService.exchangeCodeForTokens(code, state, pkce.codeVerifier);

    // Clear PKCE from session
    delete req.session?.pkce;

    // Validate token scopes
    const scopeValidation = authService.validateTokenScopes(tokens);
    if (!scopeValidation.valid) {
      logger.warn('Google Voice authorization missing required scopes', {
        tokenId: tokens.id,
        missing: scopeValidation.missing
      });
    }

    return res.json({
      success: true,
      data: {
        tokenId: tokens.id,
        email: tokens.email,
        scopes: tokens.scopes,
        scopeValidation
      }
    });
  } catch (error) {
    return handleGoogleVoiceError(error, res, 'OAuth callback');
  }
}));

/**
 * GET /api/google-voice/auth/status
 * Check authentication status for current user
 */
router.get('/auth/status', asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const tokens = await tokenModel.findByUserId(userId);
    const hasValidAccess = await authService.hasValidAccess(userId);

    const tokenSummary = tokens.map(token => ({
      id: token.id,
      email: token.email,
      isActive: token.isActive,
      expiresAt: token.expiresAt,
      scopes: token.scopes,
      refreshCount: token.refreshCount,
      hasError: !!token.errorMessage,
      scopeValidation: authService.validateTokenScopes(token)
    }));

    return res.json({
      success: true,
      data: {
        hasValidAccess,
        tokenCount: tokens.length,
        tokens: tokenSummary
      }
    });
  } catch (error) {
    return handleGoogleVoiceError(error, res, 'check authentication status');
  }
}));

/**
 * DELETE /api/google-voice/auth/revoke/:tokenId
 * Revoke Google Voice access token
 */
router.delete('/auth/revoke/:tokenId', [
  param('tokenId').isUUID().withMessage('Invalid token ID'),
  validateResult
], asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tokenId } = req.params;
    const userId = req.user?.id;

    // Verify token belongs to user
    const token = await tokenModel.findById(tokenId);
    if (!token || token.userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Token not found'
      });
    }

    await authService.revokeTokens(tokenId);

    return res.json({
      success: true,
      message: 'Token revoked successfully'
    });
  } catch (error) {
    return handleGoogleVoiceError(error, res, 'revoke token');
  }
}));

/**
 * GET /api/google-voice/numbers/:tokenId
 * Get Google Voice numbers for authenticated account
 */
router.get('/numbers/:tokenId', [
  param('tokenId').isUUID().withMessage('Invalid token ID'),
  validateResult
], asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tokenId } = req.params;
    const userId = req.user?.id;

    // Verify token belongs to user
    const token = await tokenModel.findById(tokenId);
    if (!token || token.userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Token not found'
      });
    }

    const numbers = await apiClient.getVoiceNumbers(tokenId);

    return res.json({
      success: true,
      data: { numbers }
    });
  } catch (error) {
    return handleGoogleVoiceError(error, res, 'get Voice numbers');
  }
}));

/**
 * GET /api/google-voice/messages/:tokenId
 * Get messages from Google Voice
 */
router.get('/messages/:tokenId', [
  param('tokenId').isUUID().withMessage('Invalid token ID'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('pageToken').optional().isString(),
  query('phoneNumber').optional().isMobilePhone('any'),
  query('startTime').optional().isISO8601(),
  query('endTime').optional().isISO8601(),
  query('messageType').optional().isIn(['sms', 'mms', 'voicemail']),
  query('status').optional().isIn(['read', 'unread']),
  validateResult
], asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tokenId } = req.params;
    const userId = req.user?.id;

    // Verify token belongs to user
    const token = await tokenModel.findById(tokenId);
    if (!token || token.userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Token not found'
      });
    }

    const options = {
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      pageToken: req.query.pageToken as string,
      phoneNumber: req.query.phoneNumber as string,
      startTime: req.query.startTime ? new Date(req.query.startTime as string) : undefined,
      endTime: req.query.endTime ? new Date(req.query.endTime as string) : undefined,
      messageType: req.query.messageType as any,
      status: req.query.status as any
    };

    const result = await apiClient.getMessages(tokenId, options);

    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    return handleGoogleVoiceError(error, res, 'get messages');
  }
}));

/**
 * POST /api/google-voice/messages/:tokenId/send
 * Send a message via Google Voice
 */
router.post('/messages/:tokenId/send', [
  param('tokenId').isUUID().withMessage('Invalid token ID'),
  body('to').isMobilePhone('any').withMessage('Valid phone number is required'),
  body('text').notEmpty().withMessage('Message text is required'),
  body('from').optional().isMobilePhone('any').withMessage('From number must be valid phone number'),
  validateResult
], asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tokenId } = req.params;
    const { to, text, from } = req.body;
    const userId = req.user?.id;

    // Verify token belongs to user
    const token = await tokenModel.findById(tokenId);
    if (!token || token.userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Token not found'
      });
    }

    const sentMessage = await apiClient.sendMessage(tokenId, { to, text, from });

    return res.json({
      success: true,
      data: { message: sentMessage }
    });
  } catch (error) {
    return handleGoogleVoiceError(error, res, 'send message');
  }
}));

/**
 * GET /api/google-voice/contacts/:tokenId
 * Get contacts from Google Voice
 */
router.get('/contacts/:tokenId', [
  param('tokenId').isUUID().withMessage('Invalid token ID'),
  validateResult
], asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tokenId } = req.params;
    const userId = req.user?.id;

    // Verify token belongs to user
    const token = await tokenModel.findById(tokenId);
    if (!token || token.userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Token not found'
      });
    }

    const contacts = await apiClient.getContacts(tokenId);

    return res.json({
      success: true,
      data: { contacts }
    });
  } catch (error) {
    return handleGoogleVoiceError(error, res, 'get contacts');
  }
}));

/**
 * GET /api/google-voice/calls/:tokenId
 * Get call history from Google Voice
 */
router.get('/calls/:tokenId', [
  param('tokenId').isUUID().withMessage('Invalid token ID'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('pageToken').optional().isString(),
  query('phoneNumber').optional().isMobilePhone('any'),
  query('startTime').optional().isISO8601(),
  query('endTime').optional().isISO8601(),
  validateResult
], asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tokenId } = req.params;
    const userId = req.user?.id;

    // Verify token belongs to user
    const token = await tokenModel.findById(tokenId);
    if (!token || token.userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Token not found'
      });
    }

    const options = {
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
      pageToken: req.query.pageToken as string,
      phoneNumber: req.query.phoneNumber as string,
      startTime: req.query.startTime ? new Date(req.query.startTime as string) : undefined,
      endTime: req.query.endTime ? new Date(req.query.endTime as string) : undefined
    };

    const result = await apiClient.getCalls(tokenId, options);

    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    return handleGoogleVoiceError(error, res, 'get calls');
  }
}));

/**
 * POST /api/google-voice/sync/:tokenId/start
 * Start message synchronization
 */
router.post('/sync/:tokenId/start', [
  param('tokenId').isUUID().withMessage('Invalid token ID'),
  body('syncType').isIn(['initial', 'incremental', 'manual']).withMessage('Invalid sync type'),
  body('startDate').optional().isISO8601().withMessage('Start date must be valid ISO8601 date'),
  body('endDate').optional().isISO8601().withMessage('End date must be valid ISO8601 date'),
  validateResult
], asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tokenId } = req.params;
    const { syncType, startDate, endDate } = req.body;
    const userId = req.user?.id;

    // Verify token belongs to user
    const token = await tokenModel.findById(tokenId);
    if (!token || token.userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Token not found'
      });
    }

    // Check if sync is already running
    const runningSyncs = await syncModel.findRunning();
    const existingSync = runningSyncs.find(sync => sync.tokenId === tokenId);
    
    if (existingSync) {
      return res.status(409).json({
        success: false,
        message: 'Sync already in progress',
        data: { syncId: existingSync.id }
      });
    }

    // Create sync status record
    const syncStatus = await syncModel.create({
      tokenId,
      syncType,
      status: 'pending',
      messagesProcessed: 0,
      messagesTotal: 0,
      conversationsCreated: 0,
      conversationsUpdated: 0,
      customersCreated: 0,
      customersMatched: 0,
      metadata: {
        startDate,
        endDate,
        initiatedBy: userId
      }
    });

    // TODO: Trigger background sync process
    // This would typically be handled by a job queue like Bull or Agenda
    logger.info('Sync initiated', { syncId: syncStatus.id, tokenId, syncType });

    return res.json({
      success: true,
      data: {
        syncId: syncStatus.id,
        status: syncStatus.status,
        message: 'Sync initiated successfully'
      }
    });
  } catch (error) {
    return handleGoogleVoiceError(error, res, 'start sync');
  }
}));

/**
 * GET /api/google-voice/sync/:tokenId/status
 * Get synchronization status
 */
router.get('/sync/:tokenId/status', [
  param('tokenId').isUUID().withMessage('Invalid token ID'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  validateResult
], asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tokenId } = req.params;
    const userId = req.user?.id;

    // Verify token belongs to user
    const token = await tokenModel.findById(tokenId);
    if (!token || token.userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Token not found'
      });
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
    const syncStatuses = await syncModel.findByTokenId(tokenId, limit);

    return res.json({
      success: true,
      data: { syncStatuses }
    });
  } catch (error) {
    return handleGoogleVoiceError(error, res, 'get sync status');
  }
}));

/**
 * GET /api/google-voice/test/:tokenId
 * Test Google Voice API connectivity and permissions
 */
router.get('/test/:tokenId', [
  param('tokenId').isUUID().withMessage('Invalid token ID'),
  validateResult
], asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { tokenId } = req.params;
    const userId = req.user?.id;

    // Verify token belongs to user
    const token = await tokenModel.findById(tokenId);
    if (!token || token.userId !== userId) {
      return res.status(404).json({
        success: false,
        message: 'Token not found'
      });
    }

    const testResults = {
      tokenValid: false,
      scopesValid: false,
      apiConnectivity: false,
      voiceNumbers: [] as any[],
      recentMessages: 0,
      errors: [] as string[]
    };

    try {
      // Test 1: Token validity
      await authService.getValidAccessToken(tokenId);
      testResults.tokenValid = true;
    } catch (error) {
      testResults.errors.push(`Token validation failed: ${(error as Error).message}`);
    }

    try {
      // Test 2: Scope validation
      const scopeValidation = authService.validateTokenScopes(token);
      testResults.scopesValid = scopeValidation.valid;
      if (!scopeValidation.valid) {
        testResults.errors.push(`Missing scopes: ${scopeValidation.missing.join(', ')}`);
      }
    } catch (error) {
      testResults.errors.push(`Scope validation failed: ${(error as Error).message}`);
    }

    try {
      // Test 3: API connectivity - get Voice numbers
      const numbers = await apiClient.getVoiceNumbers(tokenId);
      testResults.voiceNumbers = numbers;
      testResults.apiConnectivity = true;
    } catch (error) {
      testResults.errors.push(`API connectivity failed: ${(error as Error).message}`);
    }

    try {
      // Test 4: Recent messages count
      const messages = await apiClient.getMessages(tokenId, { limit: 10 });
      testResults.recentMessages = messages.messages.length;
    } catch (error) {
      testResults.errors.push(`Message retrieval failed: ${(error as Error).message}`);
    }

    const overallSuccess = testResults.tokenValid && testResults.scopesValid && testResults.apiConnectivity;

    return res.json({
      success: overallSuccess,
      data: testResults,
      message: overallSuccess ? 'All tests passed' : 'Some tests failed'
    });
  } catch (error) {
    return handleGoogleVoiceError(error, res, 'test connectivity');
  }
}));

export default router;