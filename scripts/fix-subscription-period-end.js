#!/usr/bin/env node

/**
 * Fix Subscription Period End Dates Script
 *
 * Fixes incorrect currentPeriodEnd dates for subscriptions by recalculating
 * them based on the plan duration and currentPeriodStart date.
 *
 * Usage:
 *   node scripts/fix-subscription-period-end.js              # Dry run (no changes)
 *   node scripts/fix-subscription-period-end.js --fix        # Actually make changes
 *   node scripts/fix-subscription-period-end.js --plan=12-month  # Fix only 12-month plans
 *   node scripts/fix-subscription-period-end.js --verbose    # More detailed output
 */

const mongoose = require('mongoose');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Import models
const Subscription = require('../src/models/Subscription');

// Command line arguments
const DRY_RUN = !process.argv.includes('--fix');
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');
const PLAN_FILTER = process.argv.find(arg => arg.includes('--plan='))?.split('=')[1];

// Statistics
const stats = {
    totalChecked: 0,
    fixed: 0,
    alreadyCorrect: 0,
    errors: 0
};

function logVerbose(...args) {
    if (VERBOSE) {
        console.log('  [DEBUG]', ...args);
    }
}

function printSubscriptionInfo(subscription, label = 'Subscription') {
    console.log(`\n${label}:`);
    console.log(`  ID: ${subscription._id}`);
    console.log(`  Plan: ${subscription.plan}`);
    console.log(`  Status: ${subscription.status}`);
    console.log(`  Current Period Start: ${subscription.currentPeriodStart ? new Date(subscription.currentPeriodStart).toISOString() : 'N/A'}`);
    console.log(`  Current Period End: ${subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toISOString() : 'N/A'}`);
    console.log(`  Stripe Subscription ID: ${subscription.stripeSubscriptionId}`);

    if (subscription.currentPeriodStart && subscription.currentPeriodEnd) {
        const actualDays = Math.ceil((new Date(subscription.currentPeriodEnd) - new Date(subscription.currentPeriodStart)) / (1000 * 60 * 60 * 24));
        console.log(`  Actual Duration: ${actualDays} days`);
    }
}

function calculateCorrectPeriodEnd(plan, currentPeriodStart) {
    if (!currentPeriodStart) {
        throw new Error('No currentPeriodStart date available');
    }

    const startDate = new Date(currentPeriodStart);
    const correctEndDate = calculateSubscriptionEndDate(plan, startDate);

    return correctEndDate;
}

async function fixSubscriptionPeriodEnd(subscription) {
    stats.totalChecked++;

    try {
        const currentEndDate = new Date(subscription.currentPeriodEnd);
        const correctEndDate = calculateCorrectPeriodEnd(subscription.plan, subscription.currentPeriodStart);

        const currentDays = Math.ceil((currentEndDate - new Date(subscription.currentPeriodStart)) / (1000 * 60 * 60 * 24));
        // Calculate expected days using proper date arithmetic
        const expectedEndDate = calculateSubscriptionEndDate(subscription.plan, subscription.currentPeriodStart);
        const correctDays = Math.ceil((expectedEndDate - new Date(subscription.currentPeriodStart)) / (1000 * 60 * 60 * 24));

        // Check if the period end is already correct (within 1 day tolerance)
        const diffDays = Math.abs((correctEndDate - currentEndDate) / (1000 * 60 * 60 * 24));

        if (diffDays <= 1) {
            stats.alreadyCorrect++;
            logVerbose(`Subscription ${subscription._id}: Already correct (${currentDays} days)`);
            return;
        }

        printSubscriptionInfo(subscription, '🔧 FIXING: Incorrect period end');
        console.log(`  Expected Duration: ${correctDays} days`);
        console.log(`  Current Duration: ${currentDays} days`);
        console.log(`  Difference: ${diffDays.toFixed(1)} days`);
        console.log(`  Correct End Date: ${correctEndDate.toISOString()}`);

        if (!DRY_RUN) {
            subscription.currentPeriodEnd = correctEndDate;
            await subscription.save();
            console.log('  ✅ Fixed: Updated currentPeriodEnd');
        } else {
            console.log('  📝 Would fix: Update currentPeriodEnd');
        }

        stats.fixed++;
    } catch (error) {
        console.error(`❌ Error fixing subscription ${subscription._id}:`, error.message);
        stats.errors++;
    }
}

async function fixAllSubscriptionPeriodEnds() {
    const query = {};
    if (PLAN_FILTER) {
        query.plan = PLAN_FILTER;
    }

    const subscriptions = await Subscription.find(query).sort({ createdAt: -1 });

    console.log(`\n🔍 Found ${subscriptions.length} subscription(s) to check...`);
    console.log(`Query: ${JSON.stringify(query)}`);
    console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'FIX MODE (changes will be made)'}\n`);

    for (const subscription of subscriptions) {
        await fixSubscriptionPeriodEnd(subscription);
    }
}

function printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 FIX SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total subscriptions checked: ${stats.totalChecked}`);
    console.log(`Already correct: ${stats.alreadyCorrect}`);
    console.log(`Fixed: ${stats.fixed}`);
    console.log(`Errors: ${stats.errors}`);
    console.log('='.repeat(60));

    if (stats.fixed > 0) {
        console.log(`\n${DRY_RUN ? 'Would fix' : 'Fixed'} ${stats.fixed} subscription(s)`);
    }

    if (DRY_RUN) {
        console.log('\n⚠️  DRY RUN MODE - No changes were made');
        console.log('To apply fixes, run: node scripts/fix-subscription-period-end.js --fix\n');
    } else {
        console.log('\n✅ All fixes have been applied');
    }
}

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

async function main() {
    console.log('\n🔧 Fix Subscription Period End Dates Script');
    console.log('===========================================\n');
    console.log('Options:');
    console.log('  --fix         Apply fixes (default is dry run)');
    console.log('  --plan=       Fix only specific plan (e.g., --plan=12-month)');
    console.log('  --verbose     Show detailed debug output\n');

    const connected = await connectDB();
    if (!connected) process.exit(1);

    try {
        await fixAllSubscriptionPeriodEnds();
        printSummary();

        if (stats.fixed > 0 && DRY_RUN) {
            console.log('\n💡 To apply these fixes, run:');
            console.log('  node scripts/fix-subscription-period-end.js --fix\n');
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
