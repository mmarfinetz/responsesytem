import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { app } from '../app';
import { DatabaseService } from '../services/DatabaseService';
import { DynamicPricingEngine } from '../services/DynamicPricingEngine';
import { PredictiveMaintenanceService } from '../services/PredictiveMaintenanceService';
import { WarrantyManagementService } from '../services/WarrantyManagementService';
import { BusinessRulesService } from '../services/BusinessRulesService';

// Mock external services for controlled testing
jest.mock('../services/DynamicPricingEngine');
jest.mock('../services/PredictiveMaintenanceService');

const MockedDynamicPricingEngine = DynamicPricingEngine as jest.MockedClass<typeof DynamicPricingEngine>;
const MockedPredictiveMaintenanceService = PredictiveMaintenanceService as jest.MockedClass<typeof PredictiveMaintenanceService>;

interface BusinessScenario {
  name: string;
  setup: () => Promise<any>;
  execute: (context: any) => Promise<any>;
  validate: (result: any, context: any) => void;
}

describe('Business Logic Validation Suite', () => {
  let db: DatabaseService;
  let authToken: string;
  let dispatcherToken: string;
  let technicianToken: string;

  beforeAll(async () => {
    db = new DatabaseService();
    await db.connect();

    const knex = await db.getKnex();
    await knex.migrate.latest();

    // Get authentication tokens
    const adminResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@plumbingcompany.com',
        password: 'admin123'
      });
    authToken = adminResponse.body.token;

    const dispatcherResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'dispatcher@plumbingcompany.com',
        password: 'dispatcher123'
      });
    dispatcherToken = dispatcherResponse.body.token;

    const techResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'technician@plumbingcompany.com',
        password: 'tech123'
      });
    technicianToken = techResponse.body.token;
  });

  afterAll(async () => {
    await db.disconnect();
  });

  beforeEach(async () => {
    // Clean test data
    const knex = await db.getKnex();
    const tables = [
      'warranty_claims', 'maintenance_schedules', 'job_materials', 
      'quote_line_items', 'quotes', 'job_status_history', 'jobs',
      'messages', 'conversations', 'customers', 'pricing_rules',
      'business_rules', 'service_agreements'
    ];
    
    for (const table of tables) {
      await knex(table).delete();
    }

    // Setup mocks
    MockedDynamicPricingEngine.prototype.calculatePrice.mockResolvedValue({
      basePrice: 200.00,
      adjustedPrice: 180.00,
      discountApplied: 20.00,
      factors: {
        timeOfDay: 1.0,
        seasonality: 0.95,
        customerHistory: 0.9,
        demandLevel: 1.0,
        urgencyMultiplier: 1.0
      },
      explanation: 'Customer loyalty discount applied'
    });

    MockedPredictiveMaintenanceService.prototype.analyzeMaintenanceNeeds.mockResolvedValue({
      maintenanceScore: 0.75,
      recommendations: [
        {
          equipmentType: 'water_heater',
          maintenanceType: 'inspection',
          priority: 'medium',
          estimatedDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          reason: 'Age-based maintenance schedule'
        }
      ],
      riskFactors: ['equipment_age', 'usage_patterns'],
      predictedFailures: []
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Dynamic Pricing Logic Validation', () => {
    const pricingScenarios: BusinessScenario[] = [
      {
        name: 'Emergency Service Premium Pricing',
        setup: async () => {
          const customer = await request(app)
            .post('/api/customers')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              name: 'Emergency Customer',
              phone: '+15551111111',
              email: 'emergency@test.com',
              address: '123 Emergency St'
            });

          return { customerId: customer.body.id };
        },
        execute: async (context) => {
          // Mock emergency pricing
          MockedDynamicPricingEngine.prototype.calculatePrice.mockResolvedValueOnce({
            basePrice: 200.00,
            adjustedPrice: 300.00,
            surcharge: 100.00,
            factors: {
              timeOfDay: 1.0,
              urgencyMultiplier: 1.5, // 50% emergency premium
              seasonality: 1.0,
              customerHistory: 1.0,
              demandLevel: 1.0
            },
            explanation: 'Emergency service premium applied'
          });

          return await request(app)
            .post('/api/quotes')
            .set('Authorization', `Bearer ${dispatcherToken}`)
            .send({
              customerId: context.customerId,
              description: 'Emergency water leak repair',
              serviceType: 'emergency_repair',
              priority: 'emergency',
              lineItems: [
                {
                  description: 'Emergency pipe repair',
                  quantity: 1,
                  unitPrice: 200.00,
                  category: 'labor'
                }
              ]
            });
        },
        validate: (result, context) => {
          expect(result.status).toBe(201);
          expect(result.body.adjustedTotal).toBe(300.00);
          expect(result.body.pricingFactors.urgencyMultiplier).toBe(1.5);
          expect(result.body.explanation).toContain('emergency');
        }
      },
      {
        name: 'After Hours Pricing Adjustment',
        setup: async () => {
          const customer = await request(app)
            .post('/api/customers')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              name: 'After Hours Customer',
              phone: '+15552222222',
              email: 'afterhours@test.com'
            });

          return { customerId: customer.body.id };
        },
        execute: async (context) => {
          // Mock after-hours pricing (e.g., 25% premium)
          MockedDynamicPricingEngine.prototype.calculatePrice.mockResolvedValueOnce({
            basePrice: 150.00,
            adjustedPrice: 187.50,
            surcharge: 37.50,
            factors: {
              timeOfDay: 1.25, // 25% after-hours premium
              urgencyMultiplier: 1.0,
              seasonality: 1.0,
              customerHistory: 1.0,
              demandLevel: 1.0
            },
            explanation: 'After-hours service premium applied'
          });

          // Simulate scheduling at 10 PM
          const afterHoursDate = new Date();
          afterHoursDate.setHours(22, 0, 0, 0);

          return await request(app)
            .post('/api/quotes')
            .set('Authorization', `Bearer ${dispatcherToken}`)
            .send({
              customerId: context.customerId,
              description: 'After hours drain cleaning',
              serviceType: 'drain_cleaning',
              scheduledDate: afterHoursDate.toISOString(),
              lineItems: [
                {
                  description: 'Drain cleaning service',
                  quantity: 1,
                  unitPrice: 150.00,
                  category: 'labor'
                }
              ]
            });
        },
        validate: (result, context) => {
          expect(result.status).toBe(201);
          expect(result.body.adjustedTotal).toBe(187.50);
          expect(result.body.pricingFactors.timeOfDay).toBe(1.25);
          expect(result.body.explanation).toContain('after-hours');
        }
      },
      {
        name: 'Loyal Customer Discount Application',
        setup: async () => {
          const customer = await request(app)
            .post('/api/customers')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              name: 'Loyal Customer',
              phone: '+15553333333',
              email: 'loyal@test.com',
              totalRevenue: 1500.00,
              totalServices: 8,
              averageRating: 4.8,
              firstServiceDate: new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString()
            });

          return { customerId: customer.body.id };
        },
        execute: async (context) => {
          // Mock loyal customer discount (15% off)
          MockedDynamicPricingEngine.prototype.calculatePrice.mockResolvedValueOnce({
            basePrice: 250.00,
            adjustedPrice: 212.50,
            discountApplied: 37.50,
            factors: {
              timeOfDay: 1.0,
              urgencyMultiplier: 1.0,
              seasonality: 1.0,
              customerHistory: 0.85, // 15% discount
              demandLevel: 1.0
            },
            explanation: 'Loyal customer discount (15%) applied based on service history'
          });

          return await request(app)
            .post('/api/quotes')
            .set('Authorization', `Bearer ${dispatcherToken}`)
            .send({
              customerId: context.customerId,
              description: 'Regular maintenance service',
              serviceType: 'maintenance',
              lineItems: [
                {
                  description: 'Annual maintenance check',
                  quantity: 1,
                  unitPrice: 250.00,
                  category: 'labor'
                }
              ]
            });
        },
        validate: (result, context) => {
          expect(result.status).toBe(201);
          expect(result.body.adjustedTotal).toBe(212.50);
          expect(result.body.discountApplied).toBe(37.50);
          expect(result.body.pricingFactors.customerHistory).toBe(0.85);
          expect(result.body.explanation).toContain('loyal customer');
        }
      }
    ];

    pricingScenarios.forEach(scenario => {
      it(`should handle ${scenario.name}`, async () => {
        const context = await scenario.setup();
        const result = await scenario.execute(context);
        scenario.validate(result, context);
      });
    });

    it('should apply complex multi-factor pricing correctly', async () => {
      // Scenario: Emergency after-hours service for a new customer
      const newCustomer = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'New Emergency Customer',
          phone: '+15554444444',
          email: 'newemergency@test.com'
        });

      // Mock complex pricing calculation
      MockedDynamicPricingEngine.prototype.calculatePrice.mockResolvedValueOnce({
        basePrice: 180.00,
        adjustedPrice: 297.00, // Base * 1.5 (emergency) * 1.1 (after-hours)
        surcharge: 117.00,
        factors: {
          timeOfDay: 1.1, // 10% after-hours
          urgencyMultiplier: 1.5, // 50% emergency
          seasonality: 1.0,
          customerHistory: 1.0, // No discount for new customer
          demandLevel: 1.0
        },
        breakdown: {
          basePrice: 180.00,
          emergencyPremium: 90.00,
          afterHoursPremium: 27.00,
          totalSurcharges: 117.00
        },
        explanation: 'Emergency service (50%) + After-hours premium (10%) applied'
      });

      const complexQuote = await request(app)
        .post('/api/quotes')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          customerId: newCustomer.body.id,
          description: 'Emergency after-hours pipe burst',
          serviceType: 'emergency_repair',
          priority: 'emergency',
          scheduledDate: new Date(new Date().setHours(23, 30, 0, 0)).toISOString(),
          lineItems: [
            {
              description: 'Emergency pipe repair',
              quantity: 1,
              unitPrice: 180.00,
              category: 'labor'
            }
          ]
        });

      expect(complexQuote.status).toBe(201);
      expect(complexQuote.body.adjustedTotal).toBe(297.00);
      expect(complexQuote.body.breakdown.emergencyPremium).toBeDefined();
      expect(complexQuote.body.breakdown.afterHoursPremium).toBeDefined();
      expect(complexQuote.body.pricingFactors.urgencyMultiplier).toBe(1.5);
      expect(complexQuote.body.pricingFactors.timeOfDay).toBe(1.1);
    });
  });

  describe('Scheduling and Resource Optimization', () => {
    it('should optimize technician assignments based on skills and location', async () => {
      // Create customers at different locations
      const customers = await Promise.all([
        request(app).post('/api/customers').set('Authorization', `Bearer ${authToken}`)
          .send({
            name: 'North Customer',
            phone: '+15551111111',
            address: '100 North St',
            city: 'Northside',
            coordinates: { lat: 40.7589, lng: -73.9851 }
          }),
        request(app).post('/api/customers').set('Authorization', `Bearer ${authToken}`)
          .send({
            name: 'South Customer', 
            phone: '+15552222222',
            address: '200 South St',
            city: 'Southside',
            coordinates: { lat: 40.7505, lng: -73.9934 }
          })
      ]);

      // Create technicians with different skills and locations
      const technicians = await Promise.all([
        request(app).post('/api/technicians').set('Authorization', `Bearer ${authToken}`)
          .send({
            id: 'tech_north',
            name: 'North Technician',
            skills: ['general_plumbing', 'drain_cleaning'],
            location: { lat: 40.7580, lng: -73.9855 },
            availability: {
              monday: ['08:00', '17:00'],
              tuesday: ['08:00', '17:00']
            }
          }),
        request(app).post('/api/technicians').set('Authorization', `Bearer ${authToken}`)
          .send({
            id: 'tech_south',
            name: 'South Technician',
            skills: ['water_heater', 'pipe_repair'],
            location: { lat: 40.7510, lng: -73.9940 },
            availability: {
              monday: ['08:00', '17:00'],
              tuesday: ['08:00', '17:00']
            }
          })
      ]);

      // Create jobs requiring different skills
      const jobRequests = [
        {
          customerId: customers[0].body.id,
          serviceType: 'drain_cleaning',
          priority: 'normal',
          preferredDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          estimatedDuration: 90
        },
        {
          customerId: customers[1].body.id,
          serviceType: 'water_heater',
          priority: 'high',
          preferredDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          estimatedDuration: 180
        }
      ];

      // Request optimization
      const optimizationResponse = await request(app)
        .post('/api/scheduling/optimize')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          jobRequests,
          optimizationCriteria: {
            minimizeTravelTime: true,
            matchSkills: true,
            balanceWorkload: true,
            respectPriority: true
          }
        });

      expect(optimizationResponse.status).toBe(200);
      expect(optimizationResponse.body.scheduledJobs).toHaveLength(2);

      const scheduledJobs = optimizationResponse.body.scheduledJobs;

      // Verify skill matching
      const drainJob = scheduledJobs.find((job: any) => job.serviceType === 'drain_cleaning');
      const heaterJob = scheduledJobs.find((job: any) => job.serviceType === 'water_heater');

      expect(drainJob.assignedTechnicianId).toBe('tech_north'); // Has drain_cleaning skill
      expect(heaterJob.assignedTechnicianId).toBe('tech_south'); // Has water_heater skill

      // Verify geographic optimization
      expect(drainJob.travelTime).toBeLessThan(heaterJob.travelTime + 600000); // Reasonable travel time difference
    });

    it('should handle complex scheduling constraints', async () => {
      // Create scenario with multiple constraints
      const customer = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Constraint Customer',
          phone: '+15555555555',
          schedulingPreferences: {
            preferredTimeOfDay: 'morning',
            availableDays: ['monday', 'wednesday', 'friday'],
            blackoutDates: [
              new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // Tomorrow is blackout
            ],
            minimumNotice: 48 // hours
          }
        });

      const technician = await request(app)
        .post('/api/technicians')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          id: 'tech_constrained',
          name: 'Constrained Technician',
          skills: ['general_plumbing'],
          availability: {
            monday: ['09:00', '12:00'], // Limited morning availability
            tuesday: ['13:00', '17:00'],
            wednesday: ['09:00', '17:00'],
            friday: ['09:00', '17:00']
          },
          scheduledJobs: [
            {
              date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // Wednesday
              startTime: '10:00',
              endTime: '12:00'
            }
          ]
        });

      const constrainedJobRequest = {
        customerId: customer.body.id,
        serviceType: 'general_plumbing',
        priority: 'normal',
        estimatedDuration: 120,
        constraints: {
          respectCustomerPreferences: true,
          minimumNotice: true,
          avoidConflicts: true
        }
      };

      const schedulingResponse = await request(app)
        .post('/api/scheduling/find-available-slots')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          jobRequest: constrainedJobRequest,
          technicianId: 'tech_constrained',
          searchWindow: {
            start: new Date().toISOString(),
            end: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
          }
        });

      expect(schedulingResponse.status).toBe(200);
      expect(schedulingResponse.body.availableSlots.length).toBeGreaterThan(0);

      const slots = schedulingResponse.body.availableSlots;
      
      // Verify slots respect all constraints
      slots.forEach((slot: any) => {
        const slotDate = new Date(slot.startTime);
        const dayName = slotDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
        const hour = slotDate.getHours();

        // Should be on allowed days
        expect(['monday', 'wednesday', 'friday']).toContain(dayName);
        
        // Should be morning time (before 12 PM)
        expect(hour).toBeLessThan(12);
        
        // Should respect minimum notice (48 hours)
        expect(slotDate.getTime() - Date.now()).toBeGreaterThan(48 * 60 * 60 * 1000);
      });
    });

    it('should optimize routes for multiple jobs in a day', async () => {
      // Create multiple customers in different locations
      const locations = [
        { name: 'Customer A', lat: 40.7128, lng: -74.0060 }, // NYC
        { name: 'Customer B', lat: 40.7589, lng: -73.9851 }, // Central Park
        { name: 'Customer C', lat: 40.7505, lng: -73.9934 }, // Times Square
        { name: 'Customer D', lat: 40.7614, lng: -73.9776 }  // Upper East Side
      ];

      const customers = await Promise.all(
        locations.map((loc, index) =>
          request(app).post('/api/customers').set('Authorization', `Bearer ${authToken}`)
            .send({
              name: loc.name,
              phone: `+1555${index.toString().padStart(7, '0')}`,
              address: `${index + 1}00 Test St`,
              coordinates: { lat: loc.lat, lng: loc.lng }
            })
        )
      );

      const technician = await request(app)
        .post('/api/technicians')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          id: 'tech_router',
          name: 'Routing Technician',
          skills: ['general_plumbing'],
          homeBase: { lat: 40.7128, lng: -74.0060 }, // Start from Customer A location
          availability: {
            monday: ['08:00', '17:00']
          }
        });

      // Create jobs for all customers on the same day
      const targetDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      targetDate.setHours(8, 0, 0, 0);

      const jobRequests = customers.map((customer, index) => ({
        customerId: customer.body.id,
        serviceType: 'general_plumbing',
        priority: 'normal',
        preferredDate: new Date(targetDate.getTime() + index * 2 * 60 * 60 * 1000).toISOString(), // 2-hour intervals
        estimatedDuration: 90
      }));

      const routeOptimization = await request(app)
        .post('/api/scheduling/optimize-route')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          technicianId: 'tech_router',
          jobRequests,
          date: targetDate.toISOString(),
          optimizationGoals: {
            minimizeTotalTravelTime: true,
            minimizeTotalDistance: true,
            respectTimeWindows: true
          }
        });

      expect(routeOptimization.status).toBe(200);
      expect(routeOptimization.body.optimizedRoute.length).toBe(4);

      const route = routeOptimization.body.optimizedRoute;
      
      // Verify route efficiency
      expect(routeOptimization.body.totalTravelTime).toBeDefined();
      expect(routeOptimization.body.totalDistance).toBeDefined();
      expect(routeOptimization.body.efficiencyScore).toBeGreaterThan(0.8); // 80% efficiency

      // Verify jobs are scheduled in logical geographic order
      const jobTimes = route.map((job: any) => new Date(job.scheduledTime).getTime());
      expect(jobTimes).toEqual(jobTimes.sort((a, b) => a - b)); // Should be in chronological order
    });
  });

  describe('Warranty Management Logic', () => {
    it('should automatically create warranties for completed jobs', async () => {
      const customer = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Warranty Customer',
          phone: '+15556666666',
          email: 'warranty@test.com'
        });

      const job = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          customerId: customer.body.id,
          type: 'service',
          serviceType: 'pipe_repair',
          description: 'Kitchen pipe repair with warranty',
          status: 'assigned',
          assignedTechnicianId: 'tech_001'
        });

      // Complete the job
      const completion = await request(app)
        .patch(`/api/jobs/${job.body.id}/complete`)
        .set('Authorization', `Bearer ${technicianToken}`)
        .send({
          completedAt: new Date().toISOString(),
          workPerformed: 'Replaced faulty pipe section',
          materialsUsed: [
            { name: 'Copper pipe', quantity: 2, cost: 45.00 }
          ],
          warrantyPeriodMonths: 24,
          customerSignature: 'digital_signature'
        });

      expect(completion.status).toBe(200);

      // Verify warranty was created
      const warranties = await request(app)
        .get('/api/warranties')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ customerId: customer.body.id, jobId: job.body.id });

      expect(warranties.status).toBe(200);
      expect(warranties.body.warranties).toHaveLength(1);

      const warranty = warranties.body.warranties[0];
      expect(warranty.warrantyPeriodMonths).toBe(24);
      expect(warranty.status).toBe('active');
      expect(warranty.startDate).toBeDefined();
      expect(warranty.expiryDate).toBeDefined();

      // Verify warranty expiry date is correct (24 months from now)
      const expiryDate = new Date(warranty.expiryDate);
      const expectedExpiry = new Date();
      expectedExpiry.setMonth(expectedExpiry.getMonth() + 24);
      
      expect(Math.abs(expiryDate.getTime() - expectedExpiry.getTime())).toBeLessThan(24 * 60 * 60 * 1000); // Within 24 hours
    });

    it('should handle warranty claims and create follow-up jobs', async () => {
      // Create customer with existing warranty
      const customer = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Warranty Claim Customer',
          phone: '+15557777777',
          email: 'warrantyclaim@test.com'
        });

      const originalJob = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          customerId: customer.body.id,
          type: 'service',
          serviceType: 'water_heater_repair',
          description: 'Water heater thermostat replacement',
          status: 'completed',
          completedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days ago
          totalCost: 350.00,
          warrantyPeriodMonths: 12
        });

      const warranty = await request(app)
        .post('/api/warranties')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          customerId: customer.body.id,
          jobId: originalJob.body.id,
          warrantyType: 'parts_and_labor',
          warrantyPeriodMonths: 12,
          startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          expiryDate: new Date(Date.now() + 11 * 30 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'active'
        });

      // Customer reports warranty issue
      const warrantyClaim = await request(app)
        .post('/api/warranty-claims')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          warrantyId: warranty.body.id,
          customerId: customer.body.id,
          originalJobId: originalJob.body.id,
          claimDescription: 'Water heater thermostat failed again, same issue as before',
          claimType: 'repair_failure',
          reportedAt: new Date().toISOString(),
          customerNotes: 'Water temperature inconsistent just like before repair'
        });

      expect(warrantyClaim.status).toBe(201);
      expect(warrantyClaim.body.status).toBe('submitted');

      // System should automatically validate warranty claim
      const validation = await request(app)
        .post(`/api/warranty-claims/${warrantyClaim.body.id}/validate`)
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          validatedBy: 'dispatcher_001',
          validationNotes: 'Claim within warranty period, similar issue to original repair'
        });

      expect(validation.status).toBe(200);
      expect(validation.body.status).toBe('approved');

      // Should automatically create warranty service job
      const warrantyJobs = await request(app)
        .get('/api/jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ 
          customerId: customer.body.id,
          type: 'warranty_service',
          status: 'scheduled'
        });

      expect(warrantyJobs.status).toBe(200);
      expect(warrantyJobs.body.jobs.length).toBeGreaterThan(0);

      const warrantyJob = warrantyJobs.body.jobs[0];
      expect(warrantyJob.priority).toBe('high'); // Warranty issues are high priority
      expect(warrantyJob.cost).toBe(0); // Warranty work should be free
      expect(warrantyJob.warrantyClaimId).toBe(warrantyClaim.body.id);
      expect(warrantyJob.description).toContain('warranty');
    });

    it('should handle warranty expiration and notifications', async () => {
      // Create warranty that's about to expire
      const customer = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Expiring Warranty Customer',
          phone: '+15558888888',
          email: 'expiring@test.com'
        });

      const expiringWarranty = await request(app)
        .post('/api/warranties')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          customerId: customer.body.id,
          jobId: 'test_job_id',
          warrantyType: 'parts_and_labor',
          warrantyPeriodMonths: 12,
          startDate: new Date(Date.now() - 11 * 30 * 24 * 60 * 60 * 1000).toISOString(), // 11 months ago
          expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
          status: 'active'
        });

      // Run warranty expiration check
      const expirationCheck = await request(app)
        .post('/api/warranties/check-expirations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          checkDate: new Date().toISOString(),
          notificationThreshold: 45 // days
        });

      expect(expirationCheck.status).toBe(200);
      expect(expirationCheck.body.expiringWarranties.length).toBeGreaterThan(0);

      const expiringNotification = expirationCheck.body.expiringWarranties.find(
        (w: any) => w.warrantyId === expiringWarranty.body.id
      );
      expect(expiringNotification).toBeDefined();
      expect(expiringNotification.daysUntilExpiry).toBeLessThan(45);

      // Check that customer notification was triggered
      expect(expirationCheck.body.notificationsSent).toBeGreaterThan(0);
    });
  });

  describe('Emergency Response and Escalation Logic', () => {
    it('should properly classify and escalate emergency situations', async () => {
      const emergencyScenarios = [
        {
          message: 'FLOOD! Water main burst in basement, flooding everywhere!',
          expectedSeverity: 'critical',
          expectedResponseTime: 30, // minutes
          expectedEscalation: true
        },
        {
          message: 'Gas smell coming from water heater, might be dangerous',
          expectedSeverity: 'critical',
          expectedResponseTime: 15, // minutes
          expectedEscalation: true
        },
        {
          message: 'Toilet overflowing and water going everywhere',
          expectedSeverity: 'high',
          expectedResponseTime: 60, // minutes
          expectedEscalation: false
        },
        {
          message: 'No hot water in the house',
          expectedSeverity: 'medium',
          expectedResponseTime: 120, // minutes
          expectedEscalation: false
        }
      ];

      for (const scenario of emergencyScenarios) {
        const customer = await request(app)
          .post('/api/customers')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            name: 'Emergency Test Customer',
            phone: `+1555${Math.random().toString().slice(2, 9)}`,
            email: 'emergency@test.com'
          });

        // Send emergency message
        const emergencyMessage = await request(app)
          .post('/webhooks/google-voice')
          .send({
            message: {
              text: scenario.message,
              phoneNumber: customer.body.phone,
              timestamp: new Date().toISOString(),
              type: 'sms',
              direction: 'inbound'
            },
            eventType: 'message_received'
          });

        expect(emergencyMessage.status).toBe(200);

        // Wait for processing
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Check emergency classification
        const alerts = await request(app)
          .get('/api/emergency/alerts')
          .set('Authorization', `Bearer ${authToken}`)
          .query({ 
            customerId: customer.body.id,
            status: 'active'
          });

        if (scenario.expectedSeverity !== 'medium') {
          expect(alerts.body.alerts.length).toBeGreaterThan(0);
          
          const alert = alerts.body.alerts[0];
          expect(alert.severity).toBe(scenario.expectedSeverity);
          expect(alert.maxResponseTimeMinutes).toBeLessThanOrEqual(scenario.expectedResponseTime);

          if (scenario.expectedEscalation) {
            expect(alert.escalationLevel).toBeGreaterThan(0);
            expect(alert.supervisorNotified).toBe(true);
          }
        }
      }
    });

    it('should handle emergency resource allocation and technician dispatch', async () => {
      // Create emergency situation
      const customer = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Emergency Allocation Customer',
          phone: '+15559999999',
          email: 'allocation@test.com',
          address: '123 Emergency Ave',
          coordinates: { lat: 40.7128, lng: -74.0060 }
        });

      // Create technicians with different emergency capabilities
      const technicians = await Promise.all([
        request(app).post('/api/technicians').set('Authorization', `Bearer ${authToken}`)
          .send({
            id: 'tech_emergency',
            name: 'Emergency Specialist',
            skills: ['emergency_repair', 'water_main', 'gas_leak'],
            emergencyQualified: true,
            location: { lat: 40.7150, lng: -74.0050 }, // Close to customer
            availability: 'on_call'
          }),
        request(app).post('/api/technicians').set('Authorization', `Bearer ${authToken}`)
          .send({
            id: 'tech_regular',
            name: 'Regular Technician',
            skills: ['general_plumbing', 'drain_cleaning'],
            emergencyQualified: false,
            location: { lat: 40.7200, lng: -74.0100 }, // Further from customer
            availability: 'scheduled'
          })
      ]);

      // Trigger emergency
      const emergency = await request(app)
        .post('/api/emergency/create-alert')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          customerId: customer.body.id,
          severity: 'critical',
          serviceType: 'water_main_repair',
          description: 'Water main burst causing street flooding',
          location: customer.body.coordinates,
          reportedAt: new Date().toISOString()
        });

      expect(emergency.status).toBe(201);

      // Request emergency dispatch
      const dispatch = await request(app)
        .post('/api/emergency/dispatch')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          alertId: emergency.body.id,
          dispatchCriteria: {
            prioritizeEmergencyQualified: true,
            minimizeResponseTime: true,
            matchSkills: true
          }
        });

      expect(dispatch.status).toBe(200);
      expect(dispatch.body.assignedTechnicianId).toBe('tech_emergency');
      expect(dispatch.body.estimatedArrivalTime).toBeDefined();
      
      // Emergency qualified technician should be chosen despite potentially longer travel time
      expect(dispatch.body.dispatchReason).toContain('emergency qualified');

      // Verify emergency job was created
      const emergencyJobs = await request(app)
        .get('/api/jobs')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ 
          customerId: customer.body.id,
          type: 'emergency_repair',
          status: 'assigned'
        });

      expect(emergencyJobs.body.jobs.length).toBeGreaterThan(0);
      expect(emergencyJobs.body.jobs[0].assignedTechnicianId).toBe('tech_emergency');
      expect(emergencyJobs.body.jobs[0].priority).toBe('emergency');
    });
  });

  describe('Customer Lifecycle and Relationship Management', () => {
    it('should track customer journey stages and trigger appropriate actions', async () => {
      // New customer journey
      const customer = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Journey Customer',
          phone: '+15550000001',
          email: 'journey@test.com',
          source: 'website_form'
        });

      // Stage 1: Initial Contact
      let journeyStatus = await request(app)
        .get(`/api/customers/${customer.body.id}/journey`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(journeyStatus.body.currentStage).toBe('new_lead');
      expect(journeyStatus.body.stages).toContain('initial_contact');

      // Stage 2: First Service Request
      const firstJob = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          customerId: customer.body.id,
          type: 'estimate',
          serviceType: 'drain_cleaning',
          description: 'Kitchen drain estimate',
          status: 'scheduled'
        });

      journeyStatus = await request(app)
        .get(`/api/customers/${customer.body.id}/journey`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(journeyStatus.body.currentStage).toBe('service_requested');
      expect(journeyStatus.body.stages).toContain('estimate_scheduled');

      // Stage 3: Service Completion
      await request(app)
        .patch(`/api/jobs/${firstJob.body.id}`)
        .set('Authorization', `Bearer ${technicianToken}`)
        .send({
          status: 'completed',
          completedAt: new Date().toISOString(),
          customerRating: 5
        });

      journeyStatus = await request(app)
        .get(`/api/customers/${customer.body.id}/journey`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(journeyStatus.body.currentStage).toBe('active_customer');
      expect(journeyStatus.body.stages).toContain('first_service_complete');
      expect(journeyStatus.body.satisfactionScore).toBe(5);

      // Verify appropriate follow-up actions were triggered
      const followUps = await request(app)
        .get('/api/follow-ups')
        .set('Authorization', `Bearer ${authToken}`)
        .query({ customerId: customer.body.id });

      expect(followUps.body.followUps.length).toBeGreaterThan(0);
      
      const satisfactionSurvey = followUps.body.followUps.find(
        (f: any) => f.type === 'satisfaction_survey'
      );
      expect(satisfactionSurvey).toBeDefined();
    });

    it('should identify and nurture high-value customers', async () => {
      // Create high-value customer profile
      const highValueCustomer = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'High Value Customer',
          phone: '+15550000002',
          email: 'highvalue@test.com',
          customerType: 'commercial',
          totalRevenue: 5000.00,
          totalServices: 12,
          averageRating: 4.9,
          propertyCount: 3
        });

      // Run customer value analysis
      const valueAnalysis = await request(app)
        .post('/api/customers/analyze-value')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          customerId: highValueCustomer.body.id,
          analysisType: 'comprehensive'
        });

      expect(valueAnalysis.status).toBe(200);
      expect(valueAnalysis.body.valueScore).toBeGreaterThan(8.0); // High value score
      expect(valueAnalysis.body.customerTier).toBe('premium');
      expect(valueAnalysis.body.lifetimeValue).toBeGreaterThan(10000);

      // Verify premium customer benefits are applied
      expect(valueAnalysis.body.benefits).toContain('priority_scheduling');
      expect(valueAnalysis.body.benefits).toContain('dedicated_account_manager');
      expect(valueAnalysis.body.benefits).toContain('loyalty_discount');

      // Test premium customer quote pricing
      MockedDynamicPricingEngine.prototype.calculatePrice.mockResolvedValueOnce({
        basePrice: 300.00,
        adjustedPrice: 255.00, // 15% premium customer discount
        discountApplied: 45.00,
        factors: {
          customerHistory: 0.85, // Premium discount
          customerTier: 'premium'
        },
        explanation: 'Premium customer discount (15%) applied'
      });

      const premiumQuote = await request(app)
        .post('/api/quotes')
        .set('Authorization', `Bearer ${dispatcherToken}`)
        .send({
          customerId: highValueCustomer.body.id,
          description: 'Premium customer service',
          lineItems: [
            {
              description: 'Premium service',
              quantity: 1,
              unitPrice: 300.00,
              category: 'labor'
            }
          ]
        });

      expect(premiumQuote.body.adjustedTotal).toBe(255.00);
      expect(premiumQuote.body.customerTier).toBe('premium');
      expect(premiumQuote.body.discountApplied).toBe(45.00);
    });
  });
});