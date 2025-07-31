import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

export async function seed(knex: Knex): Promise<void> {
  // Clear enhanced data (preserve existing core data)
  await knex('emergency_routing').del();
  await knex('equipment').del();
  await knex('audit_logs').del();
  await knex('business_config').del();
  await knex('maintenance_schedules').del();
  await knex('warranty_claims').del();
  await knex('warranties').del();
  await knex('service_history').del();
  await knex('staff').del();

  console.log('✅ Cleared enhanced tables');

  // ============================================================================
  // BUSINESS CONFIGURATION
  // ============================================================================
  
  const businessConfigData = [
    {
      id: uuidv4(),
      key: 'business_info',
      value: JSON.stringify({
        name: 'Premier Plumbing Solutions',
        phone: '+15551234567',
        email: 'info@premierplumbing.com',
        address: '123 Main Street, Springfield, IL 62701',
        website: 'https://premierplumbing.com',
        licenseNumber: 'IL-PLUMB-12345'
      }),
      description: 'Basic business information',
      category: 'business_info',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: uuidv4(),
      key: 'service_hours',
      value: JSON.stringify({
        monday: { open: '07:00', close: '18:00' },
        tuesday: { open: '07:00', close: '18:00' },
        wednesday: { open: '07:00', close: '18:00' },
        thursday: { open: '07:00', close: '18:00' },
        friday: { open: '07:00', close: '18:00' },
        saturday: { open: '08:00', close: '16:00' },
        sunday: { closed: true }
      }),
      description: 'Regular business hours',
      category: 'service_hours',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: uuidv4(),
      key: 'emergency_hours',
      value: JSON.stringify({
        available: true,
        surcharge: 1.5,
        responseTime: 60,
        coverage: '24/7'
      }),
      description: 'Emergency service configuration',
      category: 'emergency_settings',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: uuidv4(),
      key: 'service_area',
      value: JSON.stringify({
        centerLatitude: 39.7817,
        centerLongitude: -89.6501,
        radiusMiles: 25,
        emergencyRadiusMiles: 35,
        allowedZipCodes: ['62701', '62702', '62703', '62704', '62711', '62712', '62713']
      }),
      description: 'Service area configuration for Springfield, IL',
      category: 'service_area',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: uuidv4(),
      key: 'pricing_guidelines',
      value: JSON.stringify({
        drain_cleaning: { min: 100, max: 300, hourlyRate: 95 },
        pipe_repair: { min: 150, max: 800, hourlyRate: 95 },
        faucet_repair: { min: 75, max: 250, hourlyRate: 95 },
        toilet_repair: { min: 100, max: 400, hourlyRate: 95 },
        water_heater: { min: 800, max: 3500, hourlyRate: 95 },
        emergency_plumbing: { min: 200, max: 1500, hourlyRate: 140 },
        installation: { min: 200, max: 2000, hourlyRate: 95 },
        inspection: { min: 150, max: 350, hourlyRate: 95 },
        maintenance: { min: 100, max: 500, hourlyRate: 85 }
      }),
      description: 'Service pricing guidelines',
      category: 'pricing',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  await knex('business_config').insert(businessConfigData);
  console.log('✅ Inserted business configuration');

  // ============================================================================
  // STAFF DATA
  // ============================================================================
  
  // Get existing users to link staff
  const existingUsers = await knex('users').select('*');
  const adminUser = existingUsers.find(u => u.role === 'admin');
  const techUser = existingUsers.find(u => u.role === 'technician');

  // Create additional staff users
  const staffUsers = [
    {
      id: uuidv4(),
      email: 'mike.senior@premierplumbing.com',
      passwordHash: await bcrypt.hash('tech123', 10),
      firstName: 'Mike',
      lastName: 'Senior',
      role: 'technician',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: uuidv4(),
      email: 'sarah.dispatcher@premierplumbing.com',
      passwordHash: await bcrypt.hash('dispatch123', 10),
      firstName: 'Sarah',
      lastName: 'Wilson',
      role: 'dispatcher',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: uuidv4(),
      email: 'tom.apprentice@premierplumbing.com',
      passwordHash: await bcrypt.hash('apprentice123', 10),
      firstName: 'Tom',
      lastName: 'Martinez',
      role: 'technician',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  await knex('users').insert(staffUsers);

  // Create staff records
  const staffData = [
    {
      id: uuidv4(),
      userId: adminUser?.id || uuidv4(),
      employeeId: 'EMP001',
      firstName: adminUser?.firstName || 'Admin',
      lastName: adminUser?.lastName || 'User',
      email: adminUser?.email || 'admin@premierplumbing.com',
      phone: '+15551234567',
      role: 'owner',
      status: 'active',
      hireDate: new Date('2020-01-01'),
      certifications: JSON.stringify([
        'Master Plumber License IL-MP-12345',
        'Backflow Prevention Certification',
        'OSHA 30 Safety Certification'
      ]),
      specialties: JSON.stringify(['all_services', 'complex_repairs', 'commercial']),
      serviceAreas: JSON.stringify(['62701', '62702', '62703', '62704']),
      onCallAvailable: true,
      emergencyTechnician: true,
      hourlyRate: 125.00,
      emergencyRate: 185.00,
      maxJobsPerDay: 6,
      workSchedule: JSON.stringify({
        monday: { start: '07:00', end: '18:00', available: true },
        tuesday: { start: '07:00', end: '18:00', available: true },
        wednesday: { start: '07:00', end: '18:00', available: true },
        thursday: { start: '07:00', end: '18:00', available: true },
        friday: { start: '07:00', end: '18:00', available: true },
        saturday: { start: '08:00', end: '16:00', available: true },
        sunday: { available: false }
      }),
      notes: 'Owner and lead technician, handles complex commercial jobs',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: uuidv4(),
      userId: techUser?.id || staffUsers[0].id,
      employeeId: 'EMP002',
      firstName: techUser?.firstName || 'John',
      lastName: techUser?.lastName || 'Technician',
      email: techUser?.email || 'tech@premierplumbing.com',
      phone: '+15551234568',
      role: 'lead_technician',
      status: 'active',
      hireDate: new Date('2021-03-15'),
      certifications: JSON.stringify([
        'Journeyman Plumber License IL-JP-67890',
        'Water Heater Specialist Certification',
        'Drain Cleaning Specialist'
      ]),
      specialties: JSON.stringify(['water_heater', 'drain_cleaning', 'emergency_repairs']),
      serviceAreas: JSON.stringify(['62701', '62702', '62703', '62711']),
      onCallAvailable: true,
      emergencyTechnician: true,
      hourlyRate: 95.00,
      emergencyRate: 140.00,
      maxJobsPerDay: 8,
      workSchedule: JSON.stringify({
        monday: { start: '07:00', end: '17:00', available: true },
        tuesday: { start: '07:00', end: '17:00', available: true },
        wednesday: { start: '07:00', end: '17:00', available: true },
        thursday: { start: '07:00', end: '17:00', available: true },
        friday: { start: '07:00', end: '17:00', available: true },
        saturday: { start: '08:00', end: '14:00', available: true },
        sunday: { available: false }
      }),
      notes: 'Experienced technician, specializes in water heaters and emergency calls',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: uuidv4(),
      userId: staffUsers[0].id,
      employeeId: 'EMP003',
      firstName: 'Mike',
      lastName: 'Senior',
      email: 'mike.senior@premierplumbing.com',
      phone: '+15551234569',
      role: 'technician',
      status: 'active',
      hireDate: new Date('2019-08-01'),
      certifications: JSON.stringify([
        'Journeyman Plumber License IL-JP-11111',
        'Backflow Prevention Tester',
        'Pipe Relining Specialist'
      ]),
      specialties: JSON.stringify(['pipe_repair', 'repiping', 'fixture_installation']),
      serviceAreas: JSON.stringify(['62702', '62703', '62704', '62712']),
      onCallAvailable: false,
      emergencyTechnician: false,
      hourlyRate: 90.00,
      emergencyRate: 135.00,
      maxJobsPerDay: 7,
      workSchedule: JSON.stringify({
        monday: { start: '08:00', end: '16:30', available: true },
        tuesday: { start: '08:00', end: '16:30', available: true },
        wednesday: { start: '08:00', end: '16:30', available: true },
        thursday: { start: '08:00', end: '16:30', available: true },
        friday: { start: '08:00', end: '16:30', available: true },
        saturday: { available: false },
        sunday: { available: false }
      }),
      notes: 'Senior technician with pipe repair expertise',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: uuidv4(),
      userId: staffUsers[1].id,
      employeeId: 'EMP004',
      firstName: 'Sarah',
      lastName: 'Wilson',
      email: 'sarah.dispatcher@premierplumbing.com',
      phone: '+15551234570',
      role: 'dispatcher',
      status: 'active',
      hireDate: new Date('2022-01-10'),
      certifications: JSON.stringify([
        'Customer Service Certification',
        'Emergency Dispatch Training'
      ]),
      specialties: JSON.stringify(['scheduling', 'customer_service', 'emergency_triage']),
      serviceAreas: JSON.stringify(['all']),
      onCallAvailable: true,
      emergencyTechnician: false,
      hourlyRate: 22.00,
      maxJobsPerDay: 50, // Dispatcher can handle many scheduling tasks
      workSchedule: JSON.stringify({
        monday: { start: '06:30', end: '18:30', available: true },
        tuesday: { start: '06:30', end: '18:30', available: true },
        wednesday: { start: '06:30', end: '18:30', available: true },
        thursday: { start: '06:30', end: '18:30', available: true },
        friday: { start: '06:30', end: '18:30', available: true },
        saturday: { start: '07:00', end: '16:00', available: true },
        sunday: { available: false }
      }),
      notes: 'Primary dispatcher, handles scheduling and customer communication',
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: uuidv4(),
      userId: staffUsers[2].id,
      employeeId: 'EMP005',
      firstName: 'Tom',
      lastName: 'Martinez',
      email: 'tom.apprentice@premierplumbing.com',
      phone: '+15551234571',
      role: 'apprentice',
      status: 'active',
      hireDate: new Date('2023-06-01'),
      certifications: JSON.stringify([
        'Plumbing Apprentice Registration',
        'Basic Safety Certification'
      ]),
      specialties: JSON.stringify(['basic_repairs', 'maintenance', 'installations']),
      serviceAreas: JSON.stringify(['62701', '62702', '62703']),
      onCallAvailable: false,
      emergencyTechnician: false,
      hourlyRate: 25.00,
      maxJobsPerDay: 6,
      workSchedule: JSON.stringify({
        monday: { start: '07:30', end: '16:00', available: true },
        tuesday: { start: '07:30', end: '16:00', available: true },
        wednesday: { start: '07:30', end: '16:00', available: true },
        thursday: { start: '07:30', end: '16:00', available: true },
        friday: { start: '07:30', end: '16:00', available: true },
        saturday: { available: false },
        sunday: { available: false }
      }),
      notes: 'Apprentice, works under supervision, learning all aspects of plumbing',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  await knex('staff').insert(staffData);
  console.log('✅ Inserted staff data');

  // Get staff IDs for further use
  const staff = await knex('staff').select('*');
  const leadTech = staff.find(s => s.role === 'lead_technician');
  const seniorTech = staff.find(s => s.role === 'technician');
  const dispatcher = staff.find(s => s.role === 'dispatcher');

  // ============================================================================
  // ENHANCED CUSTOMER DATA
  // ============================================================================
  
  // Get existing customers to enhance
  const customers = await knex('customers').select('*');
  
  // Update existing customers with enhanced data
  for (let i = 0; i < customers.length; i++) {
    const customer = customers[i];
    const enhancedData = {
      businessName: i === 1 ? 'Davis Property Management LLC' : null,
      contactTitle: i === 1 ? 'Property Manager' : null,
      alternatePhone: `+1234567${890 + i + 10}`,
      accessInstructions: i === 0 ? 'Gate code: 1234, key under mat' : 
                         i === 1 ? 'Security desk in lobby, mention Premier Plumbing' :
                         'Ring doorbell, usually home weekends',
      emergencyServiceApproved: i < 2,
      creditLimit: i === 1 ? 5000.00 : null,
      creditStatus: 'good',
      customerType: i === 1 ? 'commercial' : 'residential',
      preferences: JSON.stringify({
        communicationMethod: 'sms',
        schedulingPreference: 'morning',
        paymentMethod: 'card',
        specialInstructions: 'Call before arrival'
      }),
      latitude: 39.7817 + (Math.random() - 0.5) * 0.1,
      longitude: -89.6501 + (Math.random() - 0.5) * 0.1,
      loyaltyPoints: Math.floor(Math.random() * 500),
      lastServiceDate: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000)
    };

    await knex('customers').where('id', customer.id).update(enhancedData);
  }

  // Add more diverse customers
  const additionalCustomers = [
    {
      id: uuidv4(),
      firstName: 'Robert',
      lastName: 'Thompson',
      email: 'robert.thompson@email.com',
      phone: '+15551234893',
      address: '456 Elm Street',
      city: 'Springfield',
      state: 'IL',
      zipCode: '62704',
      businessName: null,
      contactTitle: null,
      alternatePhone: '+15551234894',
      accessInstructions: 'Basement entrance on side of house, door is usually unlocked',
      emergencyServiceApproved: true,
      creditLimit: null,
      creditStatus: 'good',
      customerType: 'residential',
      preferences: JSON.stringify({
        communicationMethod: 'phone',
        schedulingPreference: 'afternoon',
        paymentMethod: 'check'
      }),
      latitude: 39.7912,
      longitude: -89.6445,
      loyaltyPoints: 150,
      lastServiceDate: new Date('2024-01-15'),
      notes: 'Elderly customer, prefers phone calls, has mobility issues',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: uuidv4(),
      firstName: 'Maria',
      lastName: 'Rodriguez',
      email: 'maria.rodriguez@restaurante.com',
      phone: '+15551234895',
      address: '789 Commercial Blvd',
      city: 'Springfield',
      state: 'IL',
      zipCode: '62702',
      businessName: 'Maria\'s Authentic Mexican Restaurant',
      contactTitle: 'Owner',
      alternatePhone: '+15551234896',
      accessInstructions: 'Use back entrance during business hours, front entrance after hours',
      emergencyServiceApproved: true,
      creditLimit: 3000.00,
      creditStatus: 'good',
      customerType: 'commercial',
      preferences: JSON.stringify({
        communicationMethod: 'sms',
        schedulingPreference: 'early_morning',
        paymentMethod: 'invoice',
        specialInstructions: 'Avoid lunch rush (11:30-2:00) and dinner rush (5:30-8:00)'
      }),
      latitude: 39.7756,
      longitude: -89.6389,
      loyaltyPoints: 75,
      lastServiceDate: new Date('2023-11-22'),
      notes: 'Commercial kitchen, grease trap issues, emergency line hookup',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  await knex('customers').insert(additionalCustomers);
  console.log('✅ Enhanced customer data');

  // ============================================================================
  // EQUIPMENT DATA
  // ============================================================================
  
  // Get all properties to add equipment
  const properties = await knex('properties').select('*');
  const equipmentData = [];

  properties.forEach(property => {
    // Add typical residential equipment
    if (property.propertyType === 'residential') {
      equipmentData.push(
        {
          id: uuidv4(),
          propertyId: property.id,
          equipmentType: 'water_heater',
          brand: 'Rheem',
          model: 'XE50T06ST45U1',
          serialNumber: `WH${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          installationDate: new Date('2019-03-15'),
          warrantyExpiration: new Date('2025-03-15'),
          ageYears: 5,
          condition: 'good',
          location: 'Basement',
          specifications: JSON.stringify({
            capacity: '50 gallons',
            fuelType: 'gas',
            efficiency: '0.67 UEF',
            dimensions: '22.25" x 60.25"'
          }),
          maintenanceNotes: 'Last flushed 6 months ago, anode rod replaced 2 years ago',
          lastServiceDate: new Date('2023-08-15'),
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: uuidv4(),
          propertyId: property.id,
          equipmentType: 'sump_pump',
          brand: 'Wayne',
          model: 'CDU980E',
          serialNumber: `SP${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          installationDate: new Date('2021-05-10'),
          warrantyExpiration: new Date('2024-05-10'),
          ageYears: 3,
          condition: 'excellent',
          location: 'Basement sump pit',
          specifications: JSON.stringify({
            horsepower: '3/4 HP',
            capacity: '4200 GPH',
            headLift: '25 feet',
            switchType: 'Vertical'
          }),
          maintenanceNotes: 'Tested during last heavy rain, working perfectly',
          lastServiceDate: new Date('2024-03-01'),
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      );
    }

    // Add commercial equipment for commercial properties
    if (property.propertyType === 'commercial') {
      equipmentData.push(
        {
          id: uuidv4(),
          propertyId: property.id,
          equipmentType: 'water_heater',
          brand: 'A.O. Smith',
          model: 'BTH-120',
          serialNumber: `CWH${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          installationDate: new Date('2020-08-01'),
          warrantyExpiration: new Date('2026-08-01'),
          ageYears: 4,
          condition: 'good',
          location: 'Mechanical room',
          specifications: JSON.stringify({
            capacity: '120 gallons',
            fuelType: 'gas',
            efficiency: '0.80 UEF',
            dimensions: '25" x 76"',
            inputBTU: '199,000'
          }),
          maintenanceNotes: 'Commercial unit, quarterly maintenance scheduled',
          lastServiceDate: new Date('2024-02-01'),
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      );
    }
  });

  await knex('equipment').insert(equipmentData);
  console.log('✅ Inserted equipment data');

  // ============================================================================
  // SERVICE HISTORY DATA
  // ============================================================================
  
  // Get all customers for service history
  const allCustomers = await knex('customers').select('*');
  const allProperties = await knex('properties').select('*');
  const existingJobs = await knex('jobs').select('*');

  const serviceHistoryData = [];

  // Create service history for completed jobs
  const completedJobs = existingJobs.filter(job => job.status === 'completed');
  
  completedJobs.forEach(job => {
    const property = allProperties.find(p => p.id === job.propertyId);
    if (property) {
      serviceHistoryData.push({
        id: uuidv4(),
        customerId: job.customerId,
        propertyId: job.propertyId,
        jobId: job.id,
        technician: seniorTech?.id || staff[0].id,
        serviceDate: job.completedAt || new Date(),
        serviceType: job.serviceType,
        workPerformed: `${job.title} - ${job.description}. Work completed successfully with customer satisfaction.`,
        partsUsed: JSON.stringify([
          { name: 'Faucet aerator', quantity: 2, cost: 15.00 },
          { name: 'Pipe sealant', quantity: 1, cost: 8.50 }
        ]),
        equipmentServiced: JSON.stringify([
          { type: 'faucet', location: 'kitchen', condition: 'repaired' }
        ]),
        laborHours: job.actualDuration ? job.actualDuration / 60 : 2.5,
        totalCost: Math.random() * 300 + 100,
        warrantyCovered: false,
        recommendations: 'Consider upgrading to touchless faucet for better hygiene and water conservation',
        beforeCondition: JSON.stringify({
          issues: ['Dripping faucet', 'Low water pressure'],
          severity: 'moderate'
        }),
        afterCondition: JSON.stringify({
          status: 'fully functional',
          improvements: ['No dripping', 'Restored water pressure']
        }),
        serviceOutcome: 'completed',
        notes: 'Customer very satisfied with service quality and timeliness',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
  });

  // Add historical service records
  allCustomers.forEach((customer, index) => {
    const customerProperties = allProperties.filter(p => p.customerId === customer.id);
    
    customerProperties.forEach(property => {
      // Add 2-3 historical services per property
      for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
        const serviceDate = new Date(Date.now() - Math.random() * 365 * 2 * 24 * 60 * 60 * 1000);
        const serviceTypes = ['drain_cleaning', 'pipe_repair', 'faucet_repair', 'maintenance'];
        const serviceType = serviceTypes[Math.floor(Math.random() * serviceTypes.length)];
        
        serviceHistoryData.push({
          id: uuidv4(),
          customerId: customer.id,
          propertyId: property.id,
          jobId: uuidv4(), // Would be linked to actual job in real scenario
          technician: staff[Math.floor(Math.random() * Math.min(3, staff.length))].id,
          serviceDate,
          serviceType,
          workPerformed: getServiceDescription(serviceType),
          partsUsed: JSON.stringify(getTypicalParts(serviceType)),
          equipmentServiced: JSON.stringify([
            { type: getEquipmentType(serviceType), location: getRandomLocation(), condition: 'serviced' }
          ]),
          laborHours: 1 + Math.random() * 3,
          totalCost: getServiceCost(serviceType),
          warrantyCovered: Math.random() < 0.2,
          recommendations: getRecommendations(serviceType),
          beforeCondition: JSON.stringify({
            issues: getTypicalIssues(serviceType),
            severity: Math.random() < 0.3 ? 'high' : Math.random() < 0.5 ? 'moderate' : 'low'
          }),
          afterCondition: JSON.stringify({
            status: 'resolved',
            improvements: ['Issue resolved', 'System functioning normally']
          }),
          serviceOutcome: Math.random() < 0.95 ? 'completed' : 'partial',
          notes: 'Service completed to customer satisfaction',
          createdAt: serviceDate,
          updatedAt: serviceDate
        });
      }
    });
  });

  await knex('service_history').insert(serviceHistoryData);
  console.log('✅ Inserted service history data');

  // ============================================================================
  // WARRANTY DATA
  // ============================================================================
  
  // Create warranties for recent service work
  const recentServices = serviceHistoryData.filter(
    service => new Date(service.serviceDate) > new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
  );

  const warrantyData = [];
  
  recentServices.forEach((service, index) => {
    // Add warranty for services that typically come with warranties
    if (['water_heater', 'installation', 'pipe_repair'].includes(service.serviceType) && Math.random() < 0.7) {
      const warrantyTypes = ['parts', 'labor', 'full_service'];
      const warrantyType = warrantyTypes[Math.floor(Math.random() * warrantyTypes.length)];
      const durationMonths = warrantyType === 'parts' ? 12 : warrantyType === 'labor' ? 6 : 12;
      
      warrantyData.push({
        id: uuidv4(),
        customerId: service.customerId,
        propertyId: service.propertyId,
        serviceHistoryId: service.id,
        warrantyNumber: `W-2024-${String(index + 1).padStart(4, '0')}`,
        warrantyType,
        description: getWarrantyDescription(service.serviceType, warrantyType),
        startDate: service.serviceDate,
        endDate: new Date(new Date(service.serviceDate).getTime() + durationMonths * 30 * 24 * 60 * 60 * 1000),
        durationMonths,
        status: 'active',
        termsAndConditions: JSON.stringify({
          coverage: getWarrantyCoverage(service.serviceType),
          exclusions: ['Normal wear and tear', 'Damage from misuse', 'Acts of nature'],
          requirements: ['Regular maintenance', 'Use of approved parts only']
        }),
        warrantyValue: service.totalCost * 0.8,
        transferable: service.serviceType === 'water_heater',
        claimInstructions: 'Contact Premier Plumbing at (555) 123-4567 to initiate warranty claim',
        createdAt: service.serviceDate,
        updatedAt: service.serviceDate
      });
    }
  });

  await knex('warranties').insert(warrantyData);
  console.log('✅ Inserted warranty data');

  // ============================================================================
  // MAINTENANCE SCHEDULES
  // ============================================================================
  
  const maintenanceScheduleData = [];
  
  // Add maintenance schedules for commercial customers
  const commercialCustomers = allCustomers.filter(c => c.customerType === 'commercial');
  
  commercialCustomers.forEach(customer => {
    const customerProperties = allProperties.filter(p => p.customerId === customer.id);
    
    customerProperties.forEach(property => {
      // Quarterly maintenance for commercial properties
      maintenanceScheduleData.push({
        id: uuidv4(),
        customerId: customer.id,
        propertyId: property.id,
        name: 'Quarterly Plumbing Inspection',
        description: 'Comprehensive quarterly inspection of all plumbing systems, fixtures, and equipment',
        serviceType: 'general_inspection',
        frequency: 'quarterly',
        nextServiceDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), // 45 days from now
        lastServiceDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
        estimatedDuration: 180,
        estimatedCost: 250.00,
        autoSchedule: true,
        advanceNotificationDays: 14,
        status: 'active',
        preferredTechnician: seniorTech?.id,
        serviceNotes: JSON.stringify({
          checkItems: [
            'All faucets and fixtures',
            'Water pressure throughout building',
            'Hot water system operation',
            'Drain flow and potential blockages',
            'Visible pipe condition',
            'Toilet operation and seals'
          ],
          specialInstructions: 'Coordinate with property manager, avoid busy hours'
        }),
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Grease trap cleaning for restaurants
      if (customer.businessName && customer.businessName.toLowerCase().includes('restaurant')) {
        maintenanceScheduleData.push({
          id: uuidv4(),
          customerId: customer.id,
          propertyId: property.id,
          name: 'Grease Trap Cleaning',
          description: 'Monthly grease trap cleaning and maintenance for commercial kitchen',
          serviceType: 'grease_trap_cleaning',
          frequency: 'monthly',
          nextServiceDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days from now
          lastServiceDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
          estimatedDuration: 90,
          estimatedCost: 150.00,
          autoSchedule: true,
          advanceNotificationDays: 7,
          status: 'active',
          preferredTechnician: leadTech?.id,
          serviceNotes: JSON.stringify({
            checkItems: [
              'Grease trap level and condition',
              'Trap mechanism operation',
              'Drainage lines from kitchen',
              'Waste disposal compliance'
            ],
            specialInstructions: 'Schedule during off-hours when possible, coordinate with kitchen manager'
          }),
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    });
  });

  // Add annual water heater maintenance for residential customers
  const residentialCustomers = allCustomers.filter(c => c.customerType === 'residential');
  
  residentialCustomers.forEach(customer => {
    const customerProperties = allProperties.filter(p => p.customerId === customer.id);
    
    customerProperties.forEach(property => {
      if (Math.random() < 0.4) { // 40% of residential customers have maintenance plans
        maintenanceScheduleData.push({
          id: uuidv4(),
          customerId: customer.id,
          propertyId: property.id,
          name: 'Annual Water Heater Maintenance',
          description: 'Annual water heater inspection, flushing, and maintenance service',
          serviceType: 'water_heater_maintenance',
          frequency: 'annual',
          nextServiceDate: new Date(Date.now() + Math.random() * 200 * 24 * 60 * 60 * 1000), // Random date within 200 days
          lastServiceDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
          estimatedDuration: 120,
          estimatedCost: 180.00,
          autoSchedule: true,
          advanceNotificationDays: 14,
          status: 'active',
          preferredTechnician: leadTech?.id,
          serviceNotes: JSON.stringify({
            checkItems: [
              'Water heater operation and efficiency',
              'Anode rod condition',
              'Tank flushing',
              'Temperature and pressure relief valve',
              'Venting system inspection',
              'Energy efficiency assessment'
            ],
            specialInstructions: 'Customer prefers morning appointments'
          }),
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    });
  });

  await knex('maintenance_schedules').insert(maintenanceScheduleData);
  console.log('✅ Inserted maintenance schedule data');

  // ============================================================================
  // EMERGENCY ROUTING CONFIGURATION
  // ============================================================================
  
  const emergencyRoutingData = [
    {
      id: uuidv4(),
      name: 'Emergency After Hours',
      description: 'Emergency calls received outside business hours',
      conditions: JSON.stringify({
        timeCondition: 'after_hours',
        priority: ['emergency', 'high'],
        serviceTypes: ['emergency_plumbing', 'water_heater', 'pipe_repair']
      }),
      primaryTechnician: leadTech?.id,
      backupTechnician: staff[0]?.id,
      notificationList: JSON.stringify([
        { type: 'sms', recipient: leadTech?.phone },
        { type: 'call', recipient: staff[0]?.phone },
        { type: 'email', recipient: 'emergency@premierplumbing.com' }
      ]),
      responseTimeMinutes: 60,
      emergencyRate: 140.00,
      autoAssign: true,
      isActive: true,
      priority: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: uuidv4(),
      name: 'Commercial Emergency',
      description: 'Emergency calls from commercial customers',
      conditions: JSON.stringify({
        customerType: 'commercial',
        priority: ['emergency', 'high'],
        businessHours: 'any'
      }),
      primaryTechnician: staff[0]?.id,
      backupTechnician: leadTech?.id,
      notificationList: JSON.stringify([
        { type: 'sms', recipient: staff[0]?.phone },
        { type: 'sms', recipient: dispatcher?.phone },
        { type: 'email', recipient: 'commercial@premierplumbing.com' }
      ]),
      responseTimeMinutes: 45,
      emergencyRate: 150.00,
      autoAssign: true,
      isActive: true,
      priority: 2,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    {
      id: uuidv4(),
      name: 'Water Heater Emergency',
      description: 'Emergency water heater issues requiring immediate response',
      conditions: JSON.stringify({
        serviceTypes: ['water_heater', 'emergency_plumbing'],
        keywords: ['no hot water', 'water heater leaking', 'water heater not working'],
        priority: ['emergency', 'high']
      }),
      primaryTechnician: leadTech?.id,
      backupTechnician: seniorTech?.id,
      notificationList: JSON.stringify([
        { type: 'sms', recipient: leadTech?.phone },
        { type: 'call', recipient: leadTech?.phone }
      ]),
      responseTimeMinutes: 90,
      emergencyRate: 140.00,
      autoAssign: false,
      isActive: true,
      priority: 3,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  await knex('emergency_routing').insert(emergencyRoutingData);
  console.log('✅ Inserted emergency routing configuration');

  console.log('🎉 Comprehensive plumbing CRM data seeded successfully!');
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getServiceDescription(serviceType: string): string {
  const descriptions = {
    drain_cleaning: 'Professional drain cleaning using cable machine and hydro-jetting. Cleared blockage and restored proper drainage flow.',
    pipe_repair: 'Repaired damaged pipe section using professional grade materials. Pressure tested system to ensure no leaks.',
    faucet_repair: 'Repaired kitchen faucet including cartridge replacement and handle adjustment. Restored proper water flow and eliminated dripping.',
    maintenance: 'Comprehensive plumbing system maintenance including inspection of all fixtures, pressure testing, and preventive care.',
    water_heater: 'Water heater service including flushing, anode rod inspection, and efficiency testing. System operating optimally.',
    installation: 'Professional installation of new plumbing fixture with proper connections and code compliance.',
    toilet_repair: 'Toilet repair including flapper replacement, chain adjustment, and seal inspection. Proper flush operation restored.'
  };
  return descriptions[serviceType] || 'Professional plumbing service completed to customer satisfaction.';
}

function getTypicalParts(serviceType: string): Array<{name: string, quantity: number, cost: number}> {
  const parts = {
    drain_cleaning: [
      { name: 'Drain cleaning cable', quantity: 1, cost: 25.00 }
    ],
    pipe_repair: [
      { name: 'Copper pipe section', quantity: 1, cost: 15.00 },
      { name: 'Pipe fittings', quantity: 2, cost: 8.00 },
      { name: 'Pipe sealant', quantity: 1, cost: 6.00 }
    ],
    faucet_repair: [
      { name: 'Faucet cartridge', quantity: 1, cost: 35.00 },
      { name: 'O-rings', quantity: 1, cost: 5.00 }
    ],
    maintenance: [
      { name: 'Inspection supplies', quantity: 1, cost: 10.00 }
    ],
    water_heater: [
      { name: 'Anode rod', quantity: 1, cost: 45.00 },
      { name: 'Water heater elements', quantity: 2, cost: 25.00 }
    ]
  };
  return parts[serviceType] || [];
}

function getEquipmentType(serviceType: string): string {
  const equipment = {
    drain_cleaning: 'drain',
    pipe_repair: 'pipe',
    faucet_repair: 'faucet',
    water_heater: 'water_heater',
    toilet_repair: 'toilet'
  };
  return equipment[serviceType] || 'plumbing_fixture';
}

function getRandomLocation(): string {
  const locations = ['Kitchen', 'Master Bathroom', 'Guest Bathroom', 'Basement', 'Utility Room', 'Laundry Room'];
  return locations[Math.floor(Math.random() * locations.length)];
}

function getServiceCost(serviceType: string): number {
  const costs = {
    drain_cleaning: 120 + Math.random() * 100,
    pipe_repair: 200 + Math.random() * 300,
    faucet_repair: 100 + Math.random() * 150,
    maintenance: 80 + Math.random() * 100,
    water_heater: 150 + Math.random() * 200,
    installation: 250 + Math.random() * 400,
    toilet_repair: 120 + Math.random() * 180
  };
  return Math.round((costs[serviceType] || 150) * 100) / 100;
}

function getRecommendations(serviceType: string): string {
  const recommendations = {
    drain_cleaning: 'Consider preventive drain maintenance every 6 months to avoid future blockages.',
    pipe_repair: 'Monitor for signs of additional pipe aging. Consider repiping consultation if issues persist.',
    faucet_repair: 'Upgrade to water-efficient fixtures for long-term savings and reliability.',
    maintenance: 'Continue annual maintenance plan to prevent costly emergency repairs.',
    water_heater: 'Consider water heater replacement if unit is over 8 years old for improved efficiency.',
    installation: 'Register new installation for warranty coverage and schedule first maintenance.',
    toilet_repair: 'Consider toilet replacement if repairs become frequent.'
  };
  return recommendations[serviceType] || 'Continue regular maintenance for optimal performance.';
}

function getTypicalIssues(serviceType: string): string[] {
  const issues = {
    drain_cleaning: ['Slow drainage', 'Complete blockage', 'Gurgling sounds'],
    pipe_repair: ['Visible leak', 'Water damage', 'Reduced water pressure'],
    faucet_repair: ['Constant dripping', 'Low water pressure', 'Handle difficult to turn'],
    maintenance: ['General wear', 'Preventive inspection needed'],
    water_heater: ['Insufficient hot water', 'Strange noises', 'Pilot light issues'],
    installation: ['New installation required'],
    toilet_repair: ['Running continuously', 'Weak flush', 'Water level issues']
  };
  return issues[serviceType] || ['General maintenance needed'];
}

function getWarrantyDescription(serviceType: string, warrantyType: string): string {
  const descriptions = {
    water_heater: `${warrantyType === 'parts' ? 'Parts' : warrantyType === 'labor' ? 'Labor' : 'Full'} warranty on water heater service and installation`,
    installation: `${warrantyType === 'parts' ? 'Parts' : warrantyType === 'labor' ? 'Labor' : 'Full'} warranty on new installation work`,
    pipe_repair: `${warrantyType === 'parts' ? 'Parts' : warrantyType === 'labor' ? 'Labor' : 'Full'} warranty on pipe repair work`
  };
  return descriptions[serviceType] || `${warrantyType} warranty on plumbing service`;
}

function getWarrantyCoverage(serviceType: string): string[] {
  const coverage = {
    water_heater: ['Water heater operation', 'Installation workmanship', 'Related components'],
    installation: ['Installation workmanship', 'Proper operation', 'Leak-free connections'],
    pipe_repair: ['Repair integrity', 'No leaks at repair site', 'Proper water pressure']
  };
  return coverage[serviceType] || ['Service workmanship', 'Proper operation'];
}