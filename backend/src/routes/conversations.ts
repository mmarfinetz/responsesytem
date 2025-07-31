import { Router } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { DatabaseService } from '@/services/DatabaseService';
import { 
  ValidationError, 
  NotFoundError,
  formatValidationErrors,
  asyncHandler 
} from '@/middleware/errorHandler';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/utils/logger';

const router = Router();

// Get all conversations with filtering
router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['active', 'resolved', 'archived']),
  query('priority').optional().isIn(['low', 'medium', 'high', 'emergency']),
  query('platform').optional().isIn(['google_voice', 'sms', 'email', 'web_chat']),
  query('customerId').optional().isUUID(),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid query parameters', formatValidationErrors(errors.array()));
  }

  const {
    page = 1,
    limit = 20,
    status,
    priority,
    platform,
    customerId,
    sortBy = 'lastMessageAt',
    sortOrder = 'desc'
  } = req.query as any;

  const db = DatabaseService.getInstance();
  let query = db('conversations')
    .select(
      'conversations.*',
      'customers.firstName',
      'customers.lastName',
      db.raw('COUNT(messages.id) as messageCount'),
      db.raw('COUNT(CASE WHEN messages.direction = "inbound" AND messages.status != "read" THEN 1 END) as unreadCount')
    )
    .leftJoin('customers', 'conversations.customerId', 'customers.id')
    .leftJoin('messages', 'conversations.id', 'messages.conversationId')
    .groupBy('conversations.id');

  // Apply filters
  if (status) query = query.where('conversations.status', status);
  if (priority) query = query.where('conversations.priority', priority);
  if (platform) query = query.where('conversations.platform', platform);
  if (customerId) query = query.where('conversations.customerId', customerId);

  // Get total count
  const countQuery = query.clone();
  const totalResult = await countQuery.count('* as total').first();
  const total = totalResult?.total || 0;

  // Apply sorting and pagination
  query = query.orderBy(`conversations.${sortBy}`, sortOrder)
              .limit(limit)
              .offset((page - 1) * limit);

  const conversations = await query;

  const numericPage = parseInt(String(page));
  const numericLimit = parseInt(String(limit));
  const numericTotal = parseInt(String(total));
  
  res.json({
    data: conversations,
    pagination: {
      page: numericPage,
      limit: numericLimit,
      total: numericTotal,
      pages: Math.ceil(numericTotal / numericLimit),
      hasNext: numericPage * numericLimit < numericTotal,
      hasPrev: numericPage > 1,
    },
  });
}));

// Get conversation by ID with messages
router.get('/:id', [
  param('id').isUUID().withMessage('Valid conversation ID is required'),
], asyncHandler(async (req, res) => {
  const { id } = req.params;
  const db = DatabaseService.getInstance();

  const conversation = await db('conversations')
    .select(
      'conversations.*',
      'customers.firstName',
      'customers.lastName',
      'customers.email',
      'customers.address'
    )
    .leftJoin('customers', 'conversations.customerId', 'customers.id')
    .where('conversations.id', id)
    .first();

  if (!conversation) {
    throw new NotFoundError('Conversation');
  }

  // Get messages
  const messages = await db('messages')
    .where('conversationId', id)
    .orderBy('sentAt', 'asc');

  res.json({
    ...conversation,
    messages,
  });
}));

// Create new conversation
router.post('/', [
  body('phoneNumber').isMobilePhone('any').withMessage('Valid phone number is required'),
  body('platform').isIn(['google_voice', 'sms', 'email', 'web_chat']).withMessage('Valid platform required'),
  body('priority').optional().isIn(['low', 'medium', 'high', 'emergency']),
  body('customerId').optional().isUUID(),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', formatValidationErrors(errors.array()));
  }

  const { phoneNumber, platform, priority = 'medium', customerId } = req.body;
  const db = DatabaseService.getInstance();

  // If no customerId provided, try to find customer by phone
  let resolvedCustomerId = customerId;
  if (!resolvedCustomerId) {
    const customer = await db('customers')
      .where('phone', phoneNumber)
      .where('isActive', true)
      .first();
    
    if (customer) {
      resolvedCustomerId = customer.id;
    }
  }

  const conversationId = uuidv4();
  const newConversation = {
    id: conversationId,
    customerId: resolvedCustomerId || null,
    phoneNumber,
    platform,
    status: 'active',
    priority,
    lastMessageAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db('conversations').insert(newConversation);

  logger.info('Conversation created', {
    conversationId,
    phoneNumber,
    platform,
    customerId: resolvedCustomerId,
  });

  res.status(201).json(newConversation);
}));

// Update conversation
router.put('/:id', [
  param('id').isUUID().withMessage('Valid conversation ID is required'),
  body('status').optional().isIn(['active', 'resolved', 'archived']),
  body('priority').optional().isIn(['low', 'medium', 'high', 'emergency']),
  body('summary').optional().isString().trim(),
  body('customerId').optional().isUUID(),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', formatValidationErrors(errors.array()));
  }

  const { id } = req.params;
  const updateData = req.body;
  const db = DatabaseService.getInstance();

  const conversation = await db('conversations')
    .where('id', id)
    .first();

  if (!conversation) {
    throw new NotFoundError('Conversation');
  }

  await db('conversations')
    .where('id', id)
    .update({
      ...updateData,
      updatedAt: new Date(),
    });

  const updatedConversation = await db('conversations')
    .where('id', id)
    .first();

  res.json(updatedConversation);
}));

// Add message to conversation
router.post('/:id/messages', [
  param('id').isUUID().withMessage('Valid conversation ID is required'),
  body('content').isString().trim().isLength({ min: 1 }).withMessage('Message content is required'),
  body('direction').isIn(['inbound', 'outbound']).withMessage('Valid direction required'),
  body('messageType').optional().isIn(['text', 'voice', 'image', 'video', 'file']),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', formatValidationErrors(errors.array()));
  }

  const { id } = req.params;
  const { content, direction, messageType = 'text', metadata } = req.body;
  const db = DatabaseService.getInstance();

  // Verify conversation exists
  const conversation = await db('conversations')
    .where('id', id)
    .first();

  if (!conversation) {
    throw new NotFoundError('Conversation');
  }

  const messageId = uuidv4();
  const newMessage = {
    id: messageId,
    conversationId: id,
    direction,
    content,
    messageType,
    platform: conversation.platform,
    status: direction === 'outbound' ? 'sent' : 'read',
    metadata: metadata ? JSON.stringify(metadata) : null,
    sentAt: new Date(),
    createdAt: new Date(),
  };

  await db('messages').insert(newMessage);

  // Update conversation's lastMessageAt
  await db('conversations')
    .where('id', id)
    .update({
      lastMessageAt: new Date(),
      updatedAt: new Date(),
    });

  logger.info('Message added to conversation', {
    conversationId: id,
    messageId,
    direction,
    messageType,
  });

  res.status(201).json(newMessage);
}));

// Mark messages as read
router.patch('/:id/messages/read', [
  param('id').isUUID().withMessage('Valid conversation ID is required'),
], asyncHandler(async (req, res) => {
  const { id } = req.params;
  const db = DatabaseService.getInstance();

  const conversation = await db('conversations')
    .where('id', id)
    .first();

  if (!conversation) {
    throw new NotFoundError('Conversation');
  }

  const updatedCount = await db('messages')
    .where('conversationId', id)
    .where('direction', 'inbound')
    .where('status', '!=', 'read')
    .update({ status: 'read' });

  res.json({ 
    message: 'Messages marked as read',
    updatedCount 
  });
}));

export default router;