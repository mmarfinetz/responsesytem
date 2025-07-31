import { Router } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { DatabaseService } from '@/services/DatabaseService';
import { 
  ValidationError, 
  NotFoundError,
  formatValidationErrors,
  asyncHandler 
} from '@/middleware/errorHandler';
import { Customer, CustomerFilters, CreateCustomerRequest, UpdateCustomerRequest } from '../../../shared/types';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/utils/logger';

const router = Router();

// Get all customers with filtering and pagination
router.get('/', [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('search').optional().isString().trim(),
  query('isActive').optional().isBoolean(),
  query('city').optional().isString().trim(),
  query('state').optional().isString().trim(),
  query('hasJobs').optional().isBoolean(),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid query parameters', formatValidationErrors(errors.array()));
  }

  const {
    page = 1,
    limit = 20,
    search,
    isActive,
    city,
    state,
    hasJobs,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query as any;

  const db = DatabaseService.getInstance();
  let query = db('customers')
    .select(
      'customers.*',
      db.raw('COUNT(DISTINCT jobs.id) as jobCount')
    )
    .leftJoin('jobs', 'customers.id', 'jobs.customerId')
    .groupBy('customers.id');

  // Apply filters
  if (search) {
    query = query.where(function() {
      this.where('firstName', 'like', `%${search}%`)
          .orWhere('lastName', 'like', `%${search}%`)
          .orWhere('email', 'like', `%${search}%`)
          .orWhere('phone', 'like', `%${search}%`);
    });
  }

  if (isActive !== undefined) {
    query = query.where('customers.isActive', isActive);
  }

  if (city) {
    query = query.where('customers.city', 'like', `%${city}%`);
  }

  if (state) {
    query = query.where('customers.state', state);
  }

  if (hasJobs !== undefined) {
    if (hasJobs) {
      query = query.having(db.raw('COUNT(DISTINCT jobs.id)'), '>', 0);
    } else {
      query = query.having(db.raw('COUNT(DISTINCT jobs.id)'), '=', 0);
    }
  }

  // Get total count for pagination
  const countQuery = query.clone();
  const totalResult = await countQuery.count('* as total').first();
  const total = totalResult?.total || 0;

  // Apply sorting and pagination
  query = query.orderBy(`customers.${sortBy}`, sortOrder)
              .limit(limit)
              .offset((page - 1) * limit);

  const customers = await query;

  const numericPage = parseInt(String(page));
  const numericLimit = parseInt(String(limit));
  const numericTotal = parseInt(String(total));
  
  res.json({
    data: customers,
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

// Get customer by ID
router.get('/:id', [
  param('id').isUUID().withMessage('Valid customer ID is required'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid parameters', formatValidationErrors(errors.array()));
  }

  const { id } = req.params;
  const db = DatabaseService.getInstance();

  const customer = await db('customers')
    .select(
      'customers.*',
      db.raw('COUNT(DISTINCT jobs.id) as jobCount'),
      db.raw('COUNT(DISTINCT properties.id) as propertyCount')
    )
    .leftJoin('jobs', 'customers.id', 'jobs.customerId')
    .leftJoin('properties', 'customers.id', 'properties.customerId')
    .where('customers.id', id)
    .groupBy('customers.id')
    .first();

  if (!customer) {
    throw new NotFoundError('Customer');
  }

  // Get recent jobs
  const recentJobs = await db('jobs')
    .where('customerId', id)
    .orderBy('createdAt', 'desc')
    .limit(5);

  // Get properties
  const properties = await db('properties')
    .where('customerId', id)
    .where('isActive', true);

  res.json({
    ...customer,
    recentJobs,
    properties,
  });
}));

// Create new customer
router.post('/', [
  body('firstName').trim().isLength({ min: 1 }).withMessage('First name is required'),
  body('lastName').trim().isLength({ min: 1 }).withMessage('Last name is required'),
  body('phone').isMobilePhone('any').withMessage('Valid phone number is required'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Valid email required'),
  body('address').optional().isString().trim(),
  body('city').optional().isString().trim(),
  body('state').optional().isString().trim(),
  body('zipCode').optional().isPostalCode('US').withMessage('Valid ZIP code required'),
  body('notes').optional().isString().trim(),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', formatValidationErrors(errors.array()));
  }

  const customerData: CreateCustomerRequest = req.body;
  const db = DatabaseService.getInstance();

  // Check for existing customer with same phone
  const existingCustomer = await db('customers')
    .where('phone', customerData.phone)
    .first();

  if (existingCustomer) {
    throw new ValidationError('Customer with this phone number already exists');
  }

  const customerId = uuidv4();
  const newCustomer = {
    id: customerId,
    ...customerData,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db('customers').insert(newCustomer);

  logger.info('Customer created', {
    customerId,
    firstName: customerData.firstName,
    lastName: customerData.lastName,
    phone: customerData.phone,
  });

  res.status(201).json(newCustomer);
}));

// Update customer
router.put('/:id', [
  param('id').isUUID().withMessage('Valid customer ID is required'),
  body('firstName').optional().trim().isLength({ min: 1 }).withMessage('First name cannot be empty'),
  body('lastName').optional().trim().isLength({ min: 1 }).withMessage('Last name cannot be empty'),
  body('phone').optional().isMobilePhone('any').withMessage('Valid phone number is required'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Valid email required'),
  body('address').optional().isString().trim(),
  body('city').optional().isString().trim(),
  body('state').optional().isString().trim(),
  body('zipCode').optional().isPostalCode('US').withMessage('Valid ZIP code required'),
  body('notes').optional().isString().trim(),
  body('isActive').optional().isBoolean(),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', formatValidationErrors(errors.array()));
  }

  const { id } = req.params;
  const updateData: UpdateCustomerRequest = req.body;
  const db = DatabaseService.getInstance();

  // Check if customer exists
  const existingCustomer = await db('customers')
    .where('id', id)
    .first();

  if (!existingCustomer) {
    throw new NotFoundError('Customer');
  }

  // If phone is being updated, check for conflicts
  if (updateData.phone && updateData.phone !== existingCustomer.phone) {
    const phoneConflict = await db('customers')
      .where('phone', updateData.phone)
      .where('id', '!=', id)
      .first();

    if (phoneConflict) {
      throw new ValidationError('Phone number is already in use by another customer');
    }
  }

  const updatedCustomer = {
    ...updateData,
    updatedAt: new Date(),
  };

  await db('customers')
    .where('id', id)
    .update(updatedCustomer);

  logger.info('Customer updated', {
    customerId: id,
    updatedFields: Object.keys(updateData),
  });

  // Return updated customer
  const customer = await db('customers')
    .where('id', id)
    .first();

  res.json(customer);
}));

// Delete customer (soft delete)
router.delete('/:id', [
  param('id').isUUID().withMessage('Valid customer ID is required'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid parameters', formatValidationErrors(errors.array()));
  }

  const { id } = req.params;
  const db = DatabaseService.getInstance();

  const customer = await db('customers')
    .where('id', id)
    .first();

  if (!customer) {
    throw new NotFoundError('Customer');
  }

  // Check for active jobs
  const activeJobs = await db('jobs')
    .where('customerId', id)
    .whereIn('status', ['inquiry', 'quoted', 'approved', 'scheduled', 'in_progress'])
    .count('* as count')
    .first();

  const jobCount = activeJobs?.count ? parseInt(String(activeJobs.count)) : 0;
  if (jobCount > 0) {
    throw new ValidationError('Cannot delete customer with active jobs');
  }

  // Soft delete
  await db('customers')
    .where('id', id)
    .update({
      isActive: false,
      updatedAt: new Date(),
    });

  logger.info('Customer soft deleted', { customerId: id });

  res.json({ message: 'Customer deleted successfully' });
}));

// Get customer's conversation history
router.get('/:id/conversations', [
  param('id').isUUID().withMessage('Valid customer ID is required'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Invalid parameters', formatValidationErrors(errors.array()));
  }

  const { id } = req.params;
  const db = DatabaseService.getInstance();

  // Verify customer exists
  const customer = await db('customers')
    .where('id', id)
    .first();

  if (!customer) {
    throw new NotFoundError('Customer');
  }

  const conversations = await db('conversations')
    .select(
      'conversations.*',
      db.raw('COUNT(messages.id) as messageCount')
    )
    .leftJoin('messages', 'conversations.id', 'messages.conversationId')
    .where('conversations.customerId', id)
    .groupBy('conversations.id')
    .orderBy('conversations.lastMessageAt', 'desc');

  res.json(conversations);
}));

export default router;