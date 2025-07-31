import { Router } from 'express';
import { DatabaseService } from '@/services/DatabaseService';
import { asyncHandler } from '@/middleware/errorHandler';

const router = Router();

// Get business metrics
router.get('/metrics', asyncHandler(async (req, res) => {
  const db = DatabaseService.getInstance();

  const [
    totalCustomers,
    activeJobs,
    pendingQuotes,
    completedJobsThisMonth,
  ] = await Promise.all([
    db('customers').where('isActive', true).count('* as count').first(),
    db('jobs').whereIn('status', ['inquiry', 'quoted', 'approved', 'scheduled', 'in_progress']).count('* as count').first(),
    db('quotes').whereIn('status', ['draft', 'sent']).count('* as count').first(),
    db('jobs').where('status', 'completed')
             .where('completedAt', '>=', new Date(new Date().getFullYear(), new Date().getMonth(), 1))
             .count('* as count').first(),
  ]);

  const metrics = {
    totalCustomers: totalCustomers?.count || 0,
    activeJobs: activeJobs?.count || 0,
    pendingQuotes: pendingQuotes?.count || 0,
    monthlyRevenue: 0, // TODO: Calculate from completed jobs
    customerSatisfaction: 4.8, // TODO: Implement rating system
    averageResponseTime: 15, // TODO: Calculate from conversation data
    jobCompletionRate: 0.95, // TODO: Calculate from job data
    conversionRate: 0.75, // TODO: Calculate quotes to jobs ratio
  };

  res.json(metrics);
}));

export default router;