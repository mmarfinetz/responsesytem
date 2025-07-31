import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

export async function seed(knex: Knex): Promise<void> {
  // Clear existing data
  await knex('quote_line_items').del();
  await knex('quotes').del();
  await knex('ai_responses').del();
  await knex('webhooks').del();
  await knex('messages').del();
  await knex('jobs').del();
  await knex('conversations').del();
  await knex('properties').del();
  await knex('customers').del();
  await knex('users').del();

  // Create admin user
  const adminId = uuidv4();
  await knex('users').insert({
    id: adminId,
    email: 'admin@plumbingcompany.com',
    passwordHash: await bcrypt.hash('admin123', 10),
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Create technician user
  const technicianId = uuidv4();
  await knex('users').insert({
    id: technicianId,
    email: 'tech@plumbingcompany.com',
    passwordHash: await bcrypt.hash('tech123', 10),
    firstName: 'John',
    lastName: 'Technician',
    role: 'technician',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Create sample customers
  const customer1Id = uuidv4();
  const customer2Id = uuidv4();
  const customer3Id = uuidv4();

  await knex('customers').insert([
    {
      id: customer1Id,
      firstName: 'Sarah',
      lastName: 'Johnson',
      email: 'sarah.johnson@email.com',
      phone: '+1234567890',
      address: '123 Main Street',
      city: 'Springfield',
      state: 'IL',
      zipCode: '62701',
      notes: 'Preferred customer, quick response needed',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: customer2Id,
      firstName: 'Mike',
      lastName: 'Davis',
      email: 'mike.davis@email.com',
      phone: '+1234567891',
      address: '456 Oak Avenue',
      city: 'Springfield',
      state: 'IL',
      zipCode: '62702',
      notes: 'Commercial property owner',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: customer3Id,
      firstName: 'Emma',
      lastName: 'Wilson',
      email: 'emma.wilson@email.com',
      phone: '+1234567892',
      address: '789 Pine Road',
      city: 'Springfield',
      state: 'IL',
      zipCode: '62703',
      notes: 'New customer, first-time service',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);

  // Create sample properties
  const property1Id = uuidv4();
  const property2Id = uuidv4();
  const property3Id = uuidv4();

  await knex('properties').insert([
    {
      id: property1Id,
      customerId: customer1Id,
      address: '123 Main Street',
      city: 'Springfield',
      state: 'IL',
      zipCode: '62701',
      propertyType: 'residential',
      notes: 'Single family home, built 1995',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: property2Id,
      customerId: customer2Id,
      address: '456 Oak Avenue',
      city: 'Springfield',
      state: 'IL',
      zipCode: '62702',
      propertyType: 'commercial',
      notes: 'Office building, 3 floors',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: property3Id,
      customerId: customer3Id,
      address: '789 Pine Road',
      city: 'Springfield',
      state: 'IL',
      zipCode: '62703',
      propertyType: 'residential',
      notes: 'Apartment, 2nd floor',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);

  // Create sample conversations
  const conversation1Id = uuidv4();
  const conversation2Id = uuidv4();
  const conversation3Id = uuidv4();

  await knex('conversations').insert([
    {
      id: conversation1Id,
      customerId: customer1Id,
      phoneNumber: '+1234567890',
      platform: 'google_voice',
      status: 'active',
      priority: 'high',
      summary: 'Kitchen sink drain clogged, needs immediate attention',
      lastMessageAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: conversation2Id,
      customerId: customer2Id,
      phoneNumber: '+1234567891',
      platform: 'sms',
      status: 'resolved',
      priority: 'medium',
      summary: 'Scheduled maintenance for office building restrooms',
      lastMessageAt: new Date(Date.now() - 86400000), // 1 day ago
      createdAt: new Date(Date.now() - 86400000),
      updatedAt: new Date(),
    },
    {
      id: conversation3Id,
      customerId: customer3Id,
      phoneNumber: '+1234567892',
      platform: 'google_voice',
      status: 'active',
      priority: 'medium',
      summary: 'Water heater installation inquiry',
      lastMessageAt: new Date(Date.now() - 3600000), // 1 hour ago
      createdAt: new Date(Date.now() - 3600000),
      updatedAt: new Date(),
    },
  ]);

  // Create sample messages
  const message1Id = uuidv4();
  const message2Id = uuidv4();
  const message3Id = uuidv4();
  const message4Id = uuidv4();

  await knex('messages').insert([
    {
      id: message1Id,
      conversationId: conversation1Id,
      direction: 'inbound',
      content: 'Hi, my kitchen sink is completely backed up and water won\'t drain at all. Can someone come out today?',
      messageType: 'text',
      platform: 'google_voice',
      status: 'read',
      sentAt: new Date(Date.now() - 1800000), // 30 minutes ago
      createdAt: new Date(Date.now() - 1800000),
    },
    {
      id: message2Id,
      conversationId: conversation1Id,
      direction: 'outbound',
      content: 'Hello Sarah! I understand you have a clogged kitchen sink. We can definitely help with that today. Our next available slot is 2:00 PM. Would that work for you?',
      messageType: 'text',
      platform: 'google_voice',
      status: 'delivered',
      sentAt: new Date(Date.now() - 1500000), // 25 minutes ago
      createdAt: new Date(Date.now() - 1500000),
    },
    {
      id: message3Id,
      conversationId: conversation3Id,
      direction: 'inbound',
      content: 'I need to replace my old water heater. Can you give me an estimate for a 50-gallon gas unit?',
      messageType: 'text',
      platform: 'google_voice',
      status: 'read',
      sentAt: new Date(Date.now() - 3600000), // 1 hour ago
      createdAt: new Date(Date.now() - 3600000),
    },
    {
      id: message4Id,
      conversationId: conversation3Id,
      direction: 'outbound',
      content: 'Hi Emma! I\'d be happy to help with your water heater replacement. For a 50-gallon gas unit, our estimate typically ranges from $1,200-$1,800 including installation. I can schedule a technician to visit and provide an exact quote. What\'s your availability this week?',
      messageType: 'text',
      platform: 'google_voice',
      status: 'sent',
      sentAt: new Date(Date.now() - 3300000), // 55 minutes ago
      createdAt: new Date(Date.now() - 3300000),
    },
  ]);

  // Create sample jobs
  const job1Id = uuidv4();
  const job2Id = uuidv4();
  const job3Id = uuidv4();

  await knex('jobs').insert([
    {
      id: job1Id,
      customerId: customer1Id,
      propertyId: property1Id,
      conversationId: conversation1Id,
      title: 'Kitchen Sink Drain Cleaning',
      description: 'Customer reports kitchen sink completely backed up, water not draining. Likely needs drain cleaning or possible pipe repair.',
      serviceType: 'drain_cleaning',
      status: 'scheduled',
      priority: 'high',
      scheduledAt: new Date(Date.now() + 7200000), // 2 hours from now
      estimatedDuration: 90,
      notes: 'Customer available after 2 PM, prefer same-day service',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: job2Id,
      customerId: customer2Id,
      propertyId: property2Id,
      conversationId: conversation2Id,
      title: 'Office Building Restroom Maintenance',
      description: 'Quarterly maintenance service for office building restrooms including inspection and minor repairs.',
      serviceType: 'maintenance',
      status: 'completed',
      priority: 'medium',
      scheduledAt: new Date(Date.now() - 172800000), // 2 days ago
      completedAt: new Date(Date.now() - 86400000), // 1 day ago
      estimatedDuration: 180,
      actualDuration: 165,
      notes: 'All restrooms serviced, minor faucet repair in 2nd floor restroom',
      createdAt: new Date(Date.now() - 259200000), // 3 days ago
      updatedAt: new Date(),
    },
    {
      id: job3Id,
      customerId: customer3Id,
      propertyId: property3Id,
      conversationId: conversation3Id,
      title: 'Water Heater Replacement',
      description: 'Replace old water heater with 50-gallon gas unit. Customer needs estimate and scheduling.',
      serviceType: 'water_heater',
      status: 'inquiry',
      priority: 'medium',
      estimatedDuration: 240,
      notes: 'Customer requested quote for 50-gallon gas unit, needs scheduling for estimate',
      createdAt: new Date(Date.now() - 3600000),
      updatedAt: new Date(),
    },
  ]);

  // Create sample quotes
  const quote1Id = uuidv4();
  const quote2Id = uuidv4();

  await knex('quotes').insert([
    {
      id: quote1Id,
      jobId: job1Id,
      quoteNumber: 'Q-2024-001',
      status: 'sent',
      subtotal: 150.00,
      tax: 12.00,
      total: 162.00,
      validUntil: new Date(Date.now() + 604800000), // 1 week from now
      notes: 'Standard drain cleaning service, includes 30-day guarantee',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: quote2Id,
      jobId: job3Id,
      quoteNumber: 'Q-2024-002',
      status: 'draft',
      subtotal: 1500.00,
      tax: 120.00,
      total: 1620.00,
      validUntil: new Date(Date.now() + 1209600000), // 2 weeks from now
      notes: 'Water heater replacement including disposal of old unit, 10-year warranty',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);

  // Create quote line items
  await knex('quote_line_items').insert([
    {
      id: uuidv4(),
      quoteId: quote1Id,
      description: 'Drain cleaning service - kitchen sink',
      quantity: 1,
      unitPrice: 120.00,
      total: 120.00,
      itemType: 'labor',
      createdAt: new Date(),
    },
    {
      id: uuidv4(),
      quoteId: quote1Id,
      description: 'Service call fee',
      quantity: 1,
      unitPrice: 30.00,
      total: 30.00,
      itemType: 'fee',
      createdAt: new Date(),
    },
    {
      id: uuidv4(),
      quoteId: quote2Id,
      description: '50-gallon gas water heater',
      quantity: 1,
      unitPrice: 800.00,
      total: 800.00,
      itemType: 'parts',
      createdAt: new Date(),
    },
    {
      id: uuidv4(),
      quoteId: quote2Id,
      description: 'Water heater installation labor',
      quantity: 4,
      unitPrice: 150.00,
      total: 600.00,
      itemType: 'labor',
      createdAt: new Date(),
    },
    {
      id: uuidv4(),
      quoteId: quote2Id,
      description: 'Disposal of old water heater',
      quantity: 1,
      unitPrice: 50.00,
      total: 50.00,
      itemType: 'fee',
      createdAt: new Date(),
    },
    {
      id: uuidv4(),
      quoteId: quote2Id,
      description: 'Installation materials and fittings',
      quantity: 1,
      unitPrice: 50.00,
      total: 50.00,
      itemType: 'materials',
      createdAt: new Date(),
    },
  ]);

  // Create sample AI responses
  await knex('ai_responses').insert([
    {
      id: uuidv4(),
      conversationId: conversation1Id,
      messageId: message2Id,
      prompt: 'Customer has a clogged kitchen sink and needs same-day service. Respond professionally and offer scheduling options.',
      response: 'Hello Sarah! I understand you have a clogged kitchen sink. We can definitely help with that today. Our next available slot is 2:00 PM. Would that work for you?',
      model: 'claude-3-sonnet-20240229',
      tokens: 45,
      confidence: 0.92,
      intent: 'schedule_service',
      entities: JSON.stringify({
        serviceType: 'drain_cleaning',
        urgency: 'same_day',
        timeSlot: '2:00 PM'
      }),
      approved: true,
      edited: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: uuidv4(),
      conversationId: conversation3Id,
      messageId: message4Id,
      prompt: 'Customer needs water heater replacement quote for 50-gallon gas unit. Provide helpful response with pricing range and next steps.',
      response: 'Hi Emma! I\'d be happy to help with your water heater replacement. For a 50-gallon gas unit, our estimate typically ranges from $1,200-$1,800 including installation. I can schedule a technician to visit and provide an exact quote. What\'s your availability this week?',
      model: 'claude-3-sonnet-20240229',
      tokens: 58,
      confidence: 0.89,
      intent: 'provide_estimate',
      entities: JSON.stringify({
        serviceType: 'water_heater',
        waterHeaterSize: '50_gallon',
        waterHeaterType: 'gas',
        priceRange: '$1,200-$1,800'
      }),
      approved: true,
      edited: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]);

  console.log('✅ Sample data seeded successfully');
}