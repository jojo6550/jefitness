#!/usr/bin/env node

/**
 * Fix Subscription Flags Script
 * 
 * Fixes subscription mismatches where:
 * - Database shows user has subscription but API returns hasSubscription: false
 * - subscription.isActive is false but should be true
 * - currentPeriodEnd is past but subscription hasn't been marked inactive
 * 
 * Usage:
 *   node scripts/fix-subscription-flags.js              # Dry run (no changes)
 *   node scripts/fix-subscription-flags.js --fix        # Actually make changes
 *   node scripts/fix-subscription-flags.js --email=user@example.com  # Single user
 *   node scripts/fix-subscription-flags.js --verbose    # More detailed output
 */

const mongoose = require('mongoose');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Import User model
const User = require('../src/models/User');

// Command line arguments
const DRY_RUN = !process.argv.includes('--fix');
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');
const EMAIL_ARG = process.argv.find(arg => arg.includes('--email='))?.split('=')[1];
const PLAN_FILTER = process.argv.find(arg => arg.includes('--plan='))?.split('=')[1];

// Statistics
const stats = {
    totalChecked: 0,
    fixed: 0,
    alreadyCorrect: 0,
    noSubscription: 0,
    errors: 0
};

async function connectDB() {
    try {
        const mongoUri =
            process.env.MONGO_URI ||
            process.env.MONGODB_URI ||
            'mongodb://localhost:27017/jefitness';

        await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
            family: 4
        });

        console.log('✅ Connected to database\n');
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error.message);
        return false;
    }
}

function logVerbose(...args) {
    if (VERBOSE) {
        console.log('  [DEBUG]', ...args);
    }
}

function printUserInfo(user, label = 'User') {
    console.log(`\n${label}:`);
    console.log(`  Email: ${user.email}`);
    console.log(`  stripeSubscriptionId: ${user.stripeSubscriptionId || 'N/A'}`);
    console.log(`  subscription.isActive: ${user.subscription.isActive}`);
    console.log(`  subscription.plan: ${user.subscription.plan || 'N/A'}`);
    console.log(`  subscription.currentPeriodEnd: ${user.subscription.currentPeriodEnd ? new Date(user.subscription.currentPeriodEnd).toISOString() : 'N/A'}`);
    console.log(`  subscriptionStatus: ${user.subscriptionStatus}`);
    
    const hasActive = user.hasActiveSubscription();
    console.log(`  hasActiveSubscription(): ${hasActive}`);
    
    if (user.subscription.currentPeriodEnd) {
        const daysLeft = Math.ceil((new Date(user.subscription.currentPeriodEnd) - new Date()) / (1000 * 60 * 60 * 24));
        console.log(`  Days remaining: ${daysLeft}`);
    }
}

async function fixUserSubscription(user) {
    stats.totalChecked++;
    
    // Skip if no stripeSubscriptionId
    if (!user.stripeSubscriptionId) {
        stats.noSubscription++;
        logVerbose(`No stripeSubscriptionId for ${user.email}`);
        return;
    }

    const originalIsActive = user.subscription.isActive;
    const hasActiveBefore = user.hasActiveSubscription();

    // Check if subscription should be active
    const shouldBeActive = user.subscription.isActive && 
        (!user.subscription.currentPeriodEnd || new Date(user.subscription.currentPeriodEnd) > new Date());

    // If shouldBeActive is true but hasActiveSubscription() returns false,
    // the issue is likely with subscription.isActive being false
    if (shouldBeActive && !hasActiveBefore) {
        printUserInfo(user, '🔧 FIXING: subscription.isActive should be true');
        
        if (!DRY_RUN) {
            user.subscription.isActive = true;
            await user.save();
            console.log('  ✅ Fixed: Set subscription.isActive = true');
        } else {
            console.log('  📝 Would fix: Set subscription.isActive = true');
        }
        
        stats.fixed++;
        return;
    }

    // If subscription has expired (currentPeriodEnd is in the past)
    if (user.subscription.currentPeriodEnd && new Date(user.subscription.currentPeriodEnd) < new Date()) {
        if (user.subscription.isActive) {
            printUserInfo(user, '🔧 FIXING: Subscription has expired, should be inactive');
            
            if (!DRY_RUN) {
                user.subscription.isActive = false;
                user.subscriptionStatus = 'expired';
                await user.save();
                console.log('  ✅ Fixed: Set subscription.isActive = false and subscriptionStatus = expired');
            } else {
                console.log('  📝 Would fix: Set subscription.isActive = false and subscriptionStatus = expired');
            }
            
            stats.fixed++;
            return;
        }
    }

    // If everything looks correct
    if (hasActiveBefore === shouldBeActive) {
        stats.alreadyCorrect++;
        logVerbose(`${user.email}: Already correct`);
        return;
    }

    // Edge case: subscription.isActive is true but no currentPeriodEnd
    if (user.subscription.isActive && !user.subscription.currentPeriodEnd) {
        printUserInfo(user, '⚠️ UNUSUAL: subscription.isActive is true but no currentPeriodEnd');
        logVerbose(`${user.email}: Needs manual review`);
        stats.errors++;
        return;
    }

    stats.alreadyCorrect++;
}

async function fixAllSubscriptions() {
    const query = {};
    
    if (EMAIL_ARG) {
        query.email = EMAIL_ARG.toLowerCase();
    }
    
    if (PLAN_FILTER) {
        query['subscription.plan'] = PLAN_FILTER;
    }

    const users = await User.find(query).cursor();
    
    console.log(`\n🔍 Finding users with subscription data...`);
    console.log(`Query: ${JSON.stringify(query)}`);
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'FIX MODE (changes will be made)'}\n`);

    let processed = 0;
    for await (const user of users) {
        processed++;
        
        if (processed % 50 === 0) {
            process.stdout.write('.');
        }
        
        await fixUserSubscription(user);
    }
    
    console.log('\n');
}

function printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 FIX SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total users checked: ${stats.totalChecked}`);
    console.log(`Already correct: ${stats.alreadyCorrect}`);
    console.log(`Fixed: ${stats.fixed}`);
    console.log(`No subscription: ${stats.noSubscription}`);
    console.log(`Errors/Manual review: ${stats.errors}`);
    console.log('='.repeat(60));
    
    if (stats.fixed > 0) {
        console.log(`\n${DRY_RUN ? 'Would fix' : 'Fixed'} ${stats.fixed} user(s)`);
    }
    
    if (DRY_RUN) {
        console.log('\n⚠️  DRY RUN MODE - No changes were made');
        console.log('To apply fixes, run: node scripts/fix-subscription-flags.js --fix\n');
    } else {
        console.log('\n✅ All fixes have been applied');
    }
}

async function main() {
    console.log('\n🔧 Fix Subscription Flags Script');
    console.log('================================\n');
    console.log('Options:');
    console.log('  --fix      Apply fixes (default is dry run)');
    console.log('  --email=   Fix specific user by email');
    console.log('  --plan=    Filter by subscription plan');
    console.log('  --verbose  Show detailed debug output\n');

    const connected = await connectDB();
    if (!connected) process.exit(1);

    try {
        await fixAllSubscriptions();
        printSummary();
        
        if (stats.fixed > 0 && DRY_RUN) {
            console.log('\n💡 To apply these fixes, run:');
            console.log('  node scripts/fix-subscription-flags.js --fix\n');
        }
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('🔒 Database connection closed');
    }
}

process.on('SIGINT', async () => {
    console.log('\n\n⚠️  Operation interrupted');
    await mongoose.connection.close();
    process.exit(0);
});

main();

