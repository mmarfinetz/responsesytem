#!/usr/bin/env node

/**
 * Admin User Creation Script
 * Creates the initial admin user for the Plumbing AI system
 */

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });

// Import database service
const { DatabaseService } = require('../backend/src/services/DatabaseService');

const colors = {
    red: '\x1b[31m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
    reset: '\x1b[0m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

async function createAdminUser() {
    log('👤 Creating Admin User for Plumbing AI System', 'blue');
    log('=' .repeat(50), 'blue');
    
    try {
        // Initialize database connection
        await DatabaseService.initialize();
        log('✅ Database connection established', 'green');
        
        const db = DatabaseService.getInstance();
        
        // Check if admin user already exists
        const existingAdmin = await db('users')
            .where('email', 'admin@plumbingcompany.com')
            .first();
            
        if (existingAdmin) {
            log('⚠️  Admin user already exists', 'yellow');
            log(`   Email: admin@plumbingcompany.com`, 'yellow');
            log(`   User ID: ${existingAdmin.id}`, 'yellow');
            return;
        }
        
        // Create admin user
        const adminUserId = uuidv4();
        const adminStaffId = uuidv4();
        const hashedPassword = await bcrypt.hash('admin123', 12);
        
        // Start transaction
        await db.transaction(async (trx) => {
            // Create user record
            await trx('users').insert({
                id: adminUserId,
                email: 'admin@plumbingcompany.com',
                password_hash: hashedPassword,
                first_name: 'System',
                last_name: 'Administrator',
                role: 'admin',
                is_active: true,
                created_at: new Date(),
                updated_at: new Date()
            });
            
            // Create staff record
            await trx('staff').insert({
                id: adminStaffId,
                user_id: adminUserId,
                employee_id: 'ADMIN001',
                first_name: 'System',
                last_name: 'Administrator',
                email: 'admin@plumbingcompany.com',
                phone: '+1-555-123-4567',
                role: 'owner',
                status: 'active',
                hire_date: new Date(),
                on_call_available: true,
                emergency_technician: true,
                max_jobs_per_day: 999,
                created_at: new Date(),
                updated_at: new Date()
            });
        });
        
        log('✅ Admin user created successfully!', 'green');
        console.log('');
        log('📋 Login Credentials:', 'blue');
        log(`   Email: admin@plumbingcompany.com`, 'green');
        log(`   Password: admin123`, 'green');
        log(`   Role: Administrator`, 'green');
        console.log('');
        log('🔐 Security Note: Please change the password after first login!', 'yellow');
        
        // Create additional test users
        log('👥 Creating additional test users...', 'blue');
        
        const testUsers = [
            {
                email: 'tech@plumbingcompany.com',
                password: 'tech123',
                firstName: 'John',
                lastName: 'Technician',
                role: 'technician',
                staffRole: 'lead_technician',
                employeeId: 'TECH001'
            },
            {
                email: 'dispatcher@plumbingcompany.com',
                password: 'dispatch123',
                firstName: 'Sarah',
                lastName: 'Dispatcher',
                role: 'dispatcher',
                staffRole: 'dispatcher',
                employeeId: 'DISP001'
            }
        ];
        
        for (const user of testUsers) {
            const userId = uuidv4();
            const staffId = uuidv4();
            const hashedPwd = await bcrypt.hash(user.password, 12);
            
            await db.transaction(async (trx) => {
                await trx('users').insert({
                    id: userId,
                    email: user.email,
                    password_hash: hashedPwd,
                    first_name: user.firstName,
                    last_name: user.lastName,
                    role: user.role,
                    is_active: true,
                    created_at: new Date(),
                    updated_at: new Date()
                });
                
                await trx('staff').insert({
                    id: staffId,
                    user_id: userId,
                    employee_id: user.employeeId,
                    first_name: user.firstName,
                    last_name: user.lastName,
                    email: user.email,
                    phone: `+1-555-${Math.floor(Math.random() * 900) + 100}-${Math.floor(Math.random() * 9000) + 1000}`,
                    role: user.staffRole,
                    status: 'active',
                    hire_date: new Date(),
                    on_call_available: true,
                    emergency_technician: user.staffRole === 'lead_technician',
                    max_jobs_per_day: user.staffRole === 'dispatcher' ? 999 : 8,
                    created_at: new Date(),
                    updated_at: new Date()
                });
            });
            
            log(`   ✅ Created ${user.role}: ${user.email} (password: ${user.password})`, 'green');
        }
        
        console.log('');
        log('🎉 All users created successfully!', 'green');
        console.log('');
        log('📝 User Summary:', 'blue');
        log('   • admin@plumbingcompany.com (admin123) - System Administrator', 'green');
        log('   • tech@plumbingcompany.com (tech123) - Lead Technician', 'green');
        log('   • dispatcher@plumbingcompany.com (dispatch123) - Dispatcher', 'green');
        
    } catch (error) {
        log(`❌ Failed to create admin user: ${error.message}`, 'red');
        console.error(error);
        process.exit(1);
    } finally {
        await DatabaseService.close();
    }
}

// Create sample customer data
async function createSampleData() {
    log('📊 Creating sample customer data...', 'blue');
    
    try {
        const db = DatabaseService.getInstance();
        
        // Check if sample data already exists
        const existingCustomers = await db('customers').count('* as count').first();
        if (existingCustomers.count > 0) {
            log('⚠️  Sample data already exists, skipping...', 'yellow');
            return;
        }
        
        // Sample customers
        const sampleCustomers = [
            {
                id: uuidv4(),
                firstName: 'Robert',
                lastName: 'Johnson',
                email: 'robert.johnson@email.com',
                phone: '+1-555-0101',
                address: '123 Oak Street',
                city: 'Springfield',
                state: 'IL',
                zipCode: '62701',
                customerType: 'residential',
                creditStatus: 'good',
                emergencyServiceApproved: true
            },
            {
                id: uuidv4(),
                firstName: 'Maria',
                lastName: 'Garcia',
                email: 'maria.garcia@email.com',
                phone: '+1-555-0102',
                address: '456 Pine Avenue',
                city: 'Springfield',
                state: 'IL',
                zipCode: '62702',
                customerType: 'residential',
                creditStatus: 'good',
                emergencyServiceApproved: false
            },
            {
                id: uuidv4(),
                firstName: 'David',
                lastName: 'Property Manager',
                email: 'david@propertygroup.com',
                phone: '+1-555-0103',
                businessName: 'Springfield Property Group',
                address: '789 Business Boulevard',
                city: 'Springfield',
                state: 'IL',
                zipCode: '62703',
                customerType: 'property_manager',
                creditStatus: 'good',
                emergencyServiceApproved: true
            }
        ];
        
        // Insert sample customers
        for (const customer of sampleCustomers) {
            await db('customers').insert({
                ...customer,
                first_name: customer.firstName,
                last_name: customer.lastName,
                business_name: customer.businessName,
                customer_type: customer.customerType,
                credit_status: customer.creditStatus,
                emergency_service_approved: customer.emergencyServiceApproved,
                loyalty_points: 0,
                is_active: true,
                created_at: new Date(),
                updated_at: new Date()
            });
            
            log(`   ✅ Created customer: ${customer.firstName} ${customer.lastName}`, 'green');
        }
        
        log('✅ Sample customer data created!', 'green');
        
    } catch (error) {
        log(`❌ Failed to create sample data: ${error.message}`, 'red');
    }
}

async function main() {
    await createAdminUser();
    await createSampleData();
    
    console.log('');
    log('🚀 System is ready for use!', 'green');
    log('   Start the application: npm run dev', 'blue');
    log('   Access dashboard: http://localhost:3000', 'blue');
}

if (require.main === module) {
    main();
}

module.exports = { createAdminUser, createSampleData };