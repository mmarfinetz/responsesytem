import { Router } from 'express';
import { body, query, param, validationResult } from 'express-validator';
import { DatabaseService } from '@/services/DatabaseService';
import { 
  ValidationError, 
  NotFoundError,
  formatValidationErrors,
  asyncHandler 
} from '@/middleware/errorHandler';
import { CreateJobRequest, UpdateJobRequest } from '../../../shared/types';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '@/utils/logger';

const router = Router();

// Get all jobs with filtering
router.get('/', [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('status').optional().isIn(['inquiry', 'quoted', 'approved', 'scheduled', 'in_progress', 'completed', 'cancelled', 'on_hold']),
  query('serviceType').optional().isString(),
  query('priority').optional().isIn(['low', 'medium', 'high', 'emergency']),
  query('customerId').optional().isUUID(),
], asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    status,
    serviceType,
    priority,
    customerId,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = req.query as any;

  const db = DatabaseService.getInstance();
  let query = db('jobs')
    .select(
      'jobs.*',
      'customers.firstName',
      'customers.lastName',
      'customers.phone',
      'properties.address as propertyAddress'
    )
    .leftJoin('customers', 'jobs.customerId', 'customers.id')
    .leftJoin('properties', 'jobs.propertyId', 'properties.id');

  // Apply filters
  if (status) query = query.where('jobs.status', status);
  if (serviceType) query = query.where('jobs.serviceType', serviceType);
  if (priority) query = query.where('jobs.priority', priority);
  if (customerId) query = query.where('jobs.customerId', customerId);

  // Get total count
  const countQuery = query.clone();
  const totalResult = await countQuery.count('* as total').first();
  const total = totalResult?.total || 0;

  // Apply sorting and pagination
  query = query.orderBy(`jobs.${sortBy}`, sortOrder)
              .limit(limit)
              .offset((page - 1) * limit);

  const jobs = await query;

  const numericPage = parseInt(String(page));
  const numericLimit = parseInt(String(limit));
  const numericTotal = parseInt(String(total));
  
  res.json({
    data: jobs,
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

// Create new job
router.post('/', [
  body('customerId').isUUID().withMessage('Valid customer ID is required'),
  body('title').trim().isLength({ min: 1 }).withMessage('Job title is required'),
  body('description').trim().isLength({ min: 1 }).withMessage('Job description is required'),
  body('serviceType').isIn(['drain_cleaning', 'pipe_repair', 'faucet_repair', 'toilet_repair', 'water_heater', 'emergency_plumbing', 'installation', 'inspection', 'maintenance', 'other']),
  body('priority').optional().isIn(['low', 'medium', 'high', 'emergency']),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', formatValidationErrors(errors.array()));
  }

  const jobData: CreateJobRequest = req.body;
  const db = DatabaseService.getInstance();

  // Verify customer exists
  const customer = await db('customers')
    .where('id', jobData.customerId)
    .where('isActive', true)
    .first();

  if (!customer) {
    throw new NotFoundError('Customer');
  }

  const jobId = uuidv4();
  const newJob = {
    id: jobId,
    ...jobData,
    status: 'inquiry',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db('jobs').insert(newJob);

  logger.info('Job created', {
    jobId,
    customerId: jobData.customerId,
    serviceType: jobData.serviceType,
    title: jobData.title,
  });

  res.status(201).json(newJob);
}));

export default router;