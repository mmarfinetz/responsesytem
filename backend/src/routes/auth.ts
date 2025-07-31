import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import { DatabaseService } from '@/services/DatabaseService';
import { generateToken } from '@/middleware/auth';
import { 
  ValidationError, 
  AuthenticationError, 
  CustomError,
  formatValidationErrors,
  asyncHandler 
} from '@/middleware/errorHandler';
import { logger } from '@/utils/logger';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Login endpoint
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', formatValidationErrors(errors.array()));
  }

  const { email, password } = req.body;
  const db = DatabaseService.getInstance();

  // Find user by email
  const user = await db('users')
    .where({ email, isActive: true })
    .first();

  if (!user) {
    logger.warn('Login attempt with invalid email', { email, ip: req.ip });
    throw new AuthenticationError('Invalid email or password');
  }

  // Verify password
  const isValidPassword = await bcrypt.compare(password, user.passwordHash);
  if (!isValidPassword) {
    logger.warn('Login attempt with invalid password', { 
      email, 
      userId: user.id, 
      ip: req.ip 
    });
    throw new AuthenticationError('Invalid email or password');
  }

  // Update last login time
  await db('users')
    .where({ id: user.id })
    .update({ lastLoginAt: new Date(), updatedAt: new Date() });

  // Generate JWT token
  const token = generateToken({
    sub: user.id,
    email: user.email,
    role: user.role,
  });

  logger.info('User logged in successfully', { 
    userId: user.id, 
    email: user.email, 
    role: user.role 
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    },
  });
}));

// Register endpoint (admin only in production)
router.post('/register', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('firstName').trim().isLength({ min: 1 }).withMessage('First name is required'),
  body('lastName').trim().isLength({ min: 1 }).withMessage('Last name is required'),
  body('role').isIn(['admin', 'technician', 'dispatcher', 'readonly']).withMessage('Valid role is required'),
], asyncHandler(async (req, res) => {
  // In production, you might want to restrict registration to existing admins
  if (process.env.NODE_ENV === 'production') {
    throw new CustomError('Registration is disabled in production', 403);
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', formatValidationErrors(errors.array()));
  }

  const { email, password, firstName, lastName, role } = req.body;
  const db = DatabaseService.getInstance();

  // Check if user already exists
  const existingUser = await db('users')
    .where({ email })
    .first();

  if (existingUser) {
    throw new ValidationError('User with this email already exists');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS || '12'));

  // Create user
  const userId = uuidv4();
  await db('users').insert({
    id: userId,
    email,
    passwordHash,
    firstName,
    lastName,
    role,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  logger.info('New user registered', { 
    userId, 
    email, 
    role,
    registeredBy: req.ip 
  });

  res.status(201).json({
    message: 'User registered successfully',
    user: {
      id: userId,
      email,
      firstName,
      lastName,
      role,
    },
  });
}));

// Logout endpoint (mainly for logging purposes)
router.post('/logout', asyncHandler(async (req, res) => {
  // In a stateless JWT system, logout is mainly client-side
  // But we can log it for security monitoring
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  
  if (token) {
    try {
      const { verifyToken } = require('@/middleware/auth');
      const decoded = verifyToken(token);
      logger.info('User logged out', { 
        userId: decoded.sub || decoded.id,
        email: decoded.email 
      });
    } catch (error) {
      // Invalid token, but that's okay for logout
    }
  }

  res.json({ message: 'Logged out successfully' });
}));

// Verify token endpoint
router.get('/verify', asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    throw new AuthenticationError('No token provided');
  }

  try {
    const { verifyToken } = require('@/middleware/auth');
    const decoded = verifyToken(token);
    
    const db = DatabaseService.getInstance();
    const user = await db('users')
      .where({ id: decoded.sub || decoded.id, isActive: true })
      .first();

    if (!user) {
      throw new AuthenticationError('User not found or inactive');
    }

    res.json({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (error) {
    throw new AuthenticationError('Invalid token');
  }
}));

// Refresh token endpoint
router.post('/refresh', asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    throw new AuthenticationError('No token provided');
  }

  try {
    const { verifyToken } = require('@/middleware/auth');
    const decoded = verifyToken(token);
    
    const db = DatabaseService.getInstance();
    const user = await db('users')
      .where({ id: decoded.sub || decoded.id, isActive: true })
      .first();

    if (!user) {
      throw new AuthenticationError('User not found or inactive');
    }

    // Generate new token
    const newToken = generateToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    logger.info('Token refreshed', { userId: user.id, email: user.email });

    res.json({
      token: newToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  } catch (error) {
    throw new AuthenticationError('Invalid token');
  }
}));

// Password reset request endpoint
router.post('/password-reset-request', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', formatValidationErrors(errors.array()));
  }

  const { email } = req.body;
  const db = DatabaseService.getInstance();

  const user = await db('users')
    .where({ email, isActive: true })
    .first();

  // Always return success to prevent email enumeration
  res.json({ 
    message: 'If an account with that email exists, a password reset link has been sent.' 
  });

  if (user) {
    // In a real implementation, you would:
    // 1. Generate a secure reset token
    // 2. Store it in the database with expiration
    // 3. Send email with reset link
    
    logger.info('Password reset requested', { 
      userId: user.id, 
      email: user.email,
      ip: req.ip 
    });

    // TODO: Implement email service and send reset email
  }
}));

// Get current user profile
router.get('/profile', asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    throw new AuthenticationError('No token provided');
  }

  const { verifyToken } = require('@/middleware/auth');
  const decoded = verifyToken(token);
  
  const db = DatabaseService.getInstance();
  const user = await db('users')
    .where({ id: decoded.sub || decoded.id, isActive: true })
    .first();

  if (!user) {
    throw new AuthenticationError('User not found');
  }

  res.json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
  });
}));

export default router;