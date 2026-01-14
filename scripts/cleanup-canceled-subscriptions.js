#!/usr/bin/env node

/**
 * Cleanup Canceled Subscriptions Script
 *
 * This script removes canceled subscriptions from the database that are older than a specified retention period.
 * This helps prevent database bloat and improves performance by removing unnecessary records.
 *
 * Usage: node scripts/cleanup-canceled-subscriptions.js [--dry-run] [--retention-days=30]
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import models
const Subscription = require('../src/models/Subscription');
const logger = require('../src/services/logger');

const DEFAULT_RETENTION_DAYS = 30;

async function cleanupCanceledSubscriptions(options = {}) {
  const { dryRun = false, retentionDays = DEFAULT_RETENTION_DAYS } = options;

  try {
    // Connect to database
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    console.log('Connected to MongoDB');

    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    console.log(`Finding canceled subscriptions older than ${retentionDays} days (${cutoffDate.toISOString()})`);

    // Find canceled subscriptions older than retention period
    const query = {
      status: 'canceled',
      canceledAt: { $lt: cutoffDate }
    };

    const canceledSubscriptions = await Subscription.find(query).select('_id stripeSubscriptionId canceledAt userId');

    if (canceledSubscriptions.length === 0) {
      console.log('No canceled subscriptions found for cleanup');
      return { deletedCount: 0, subscriptions: [] };
    }

    console.log(`Found ${canceledSubscriptions.length} canceled subscriptions to clean up`);

    if (dryRun) {
      console.log('DRY RUN - Would delete the following subscriptions:');
      canceledSubscriptions.forEach(sub => {
        console.log(`- ID: ${sub._id}, Stripe ID: ${sub.stripeSubscriptionId}, Canceled: ${sub.canceledAt}, User: ${sub.userId}`);
      });
      return { deletedCount: 0, subscriptions: canceledSubscriptions.map(s => s._id) };
    }

    // Perform deletion
    const result = await Subscription.deleteMany(query);

    console.log(`Successfully deleted ${result.deletedCount} canceled subscriptions`);

    // Log the cleanup action
    logger.info('Canceled subscriptions cleanup completed', {
      deletedCount: result.deletedCount,
      retentionDays,
      cutoffDate: cutoffDate.toISOString(),
      dryRun
    });

    return {
      deletedCount: result.deletedCount,
      subscriptions: canceledSubscriptions.map(s => s._id)
    };

  } catch (error) {
    console.error('Error during cleanup:', error);
    logger.error('Canceled subscriptions cleanup failed', {
      error: error.message,
      stack: error.stack,
      retentionDays,
      dryRun
    });
    throw error;
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const options = {};

  // Parse command line arguments
  args.forEach(arg => {
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--retention-days=')) {
      const days = parseInt(arg.split('=')[1]);
      if (!isNaN(days) && days > 0) {
        options.retentionDays = days;
      }
    }
  });

  try {
    const result = await cleanupCanceledSubscriptions(options);

    if (options.dryRun) {
      console.log(`\nDRY RUN COMPLETE: Would have deleted ${result.subscriptions.length} subscriptions`);
    } else {
      console.log(`\nCLEANUP COMPLETE: Deleted ${result.deletedCount} canceled subscriptions`);
    }

    process.exit(0);
  } catch (error) {
    console.error('Cleanup script failed:', error.message);
    process.exit(1);
  }
}

// Export for use as module
module.exports = { cleanupCanceledSubscriptions };

// Run if called directly
if (require.main === module) {
  main();
}
