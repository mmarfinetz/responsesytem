import { Router } from 'express';
import { body, param, validationResult } from 'express-validator';
import { DatabaseService } from '@/services/DatabaseService';
import { 
  ValidationError, 
  NotFoundError,
  formatValidationErrors,
  asyncHandler 
} from '@/middleware/errorHandler';
import { CreateQuoteRequest } from '../../../shared/types';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Create quote
router.post('/', [
  body('jobId').isUUID().withMessage('Valid job ID is required'),
  body('validUntil').isISO8601().toDate().withMessage('Valid expiration date required'),
  body('lineItems').isArray({ min: 1 }).withMessage('At least one line item required'),
  body('lineItems.*.description').trim().isLength({ min: 1 }).withMessage('Line item description required'),
  body('lineItems.*.quantity').isFloat({ min: 0.01 }).withMessage('Valid quantity required'),
  body('lineItems.*.unitPrice').isFloat({ min: 0 }).withMessage('Valid unit price required'),
  body('lineItems.*.itemType').isIn(['labor', 'parts', 'materials', 'fee']).withMessage('Valid item type required'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Validation failed', formatValidationErrors(errors.array()));
  }

  const { jobId, validUntil, notes, lineItems }: CreateQuoteRequest = req.body;
  const db = DatabaseService.getInstance();

  // Verify job exists
  const job = await db('jobs').where('id', jobId).first();
  if (!job) {
    throw new NotFoundError('Job');
  }

  await db.transaction(async (trx) => {
    // Calculate totals
    const subtotal = lineItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    const tax = subtotal * 0.08; // 8% tax rate - should be configurable
    const total = subtotal + tax;

    // Generate quote number
    const quoteCount = await trx('quotes').count('* as count').first();
    const countValue = parseInt(String(quoteCount?.count || 0));
    const quoteNumber = `Q-${new Date().getFullYear()}-${String(countValue + 1).padStart(3, '0')}`;

    const quoteId = uuidv4();
    const newQuote = {
      id: quoteId,
      jobId,
      quoteNumber,
      status: 'draft',
      subtotal,
      tax,
      total,
      validUntil,
      notes,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await trx('quotes').insert(newQuote);

    // Insert line items
    const lineItemsWithIds = lineItems.map(item => ({
      id: uuidv4(),
      quoteId,
      ...item,
      total: item.quantity * item.unitPrice,
      createdAt: new Date(),
    }));

    await trx('quote_line_items').insert(lineItemsWithIds);

    res.status(201).json({
      ...newQuote,
      lineItems: lineItemsWithIds,
    });
  });
}));

export default router;