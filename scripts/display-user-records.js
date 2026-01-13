#!/usr/bin/env node

/**
 * Display User Records Script (List Format)
 *
 * Displays user email and subscription data from the database.
 * Run with: node scripts/display-user-records.js [email]
 *
 * Options:
 *   - By email: node scripts/display-user-records.js user@example.com
 *   - All users: node scripts/display-user-records.js
 *   - JSON output: FORMAT=json node scripts/display-user-records.js
 *   - Detailed output: FORMAT=detailed node scripts/display-user-records.js
 */

const mongoose = require('mongoose');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Import User model
const User = require('../src/models/User');

// Output format options
const FORMAT = process.env.FORMAT || 'list';
const LIMIT = parseInt(process.env.LIMIT, 10) || 50;
const SKIP = parseInt(process.env.SKIP, 10) || 0;

// Fields to display (used for queries)
const DISPLAY_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'role',
  'stripeCustomerId',
  'billingEnvironment',
  'subscription.isActive',
  'subscription.plan',
  'subscription.stripeSubscriptionId',
  'subscription.stripePriceId',
  'subscription.currentPeriodStart',
  'subscription.currentPeriodEnd',
  'subscriptionStatus',
  'createdAt'
];

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
    console.error('💡 Make sure MongoDB is running and MONGO_URI is set in your .env file');
    return false;
  }
}

/**
 * LIST FORMATTER
 */
function formatAsList(users) {
  return users
    .map((user, index) => {
      const get = path =>
        path.split('.').reduce((v, k) => v?.[k], user) ?? '—';

      const lines = [];

      lines.push('='.repeat(80));
      lines.push(`👤 User #${index + 1}`);
      lines.push('='.repeat(80));

      lines.push(`Name:              ${get('firstName')} ${get('lastName')}`);
      lines.push(`Email:             ${get('email')}`);
      lines.push(`Role:              ${get('role')}`);
      lines.push(`Created At:        ${get('createdAt')}`);

      lines.push('');
      lines.push('💳 Billing');
      lines.push(`  Stripe Customer: ${get('stripeCustomerId')}`);
      lines.push(`  Environment:     ${get('billingEnvironment')}`);

      lines.push('');
      lines.push('📅 Subscription');
      lines.push(`  Active:           ${get('subscription.isActive') ? 'Yes' : 'No'}`);
      lines.push(`  Has Subscription: ${get('subscription.isActive') ? 'Yes' : 'No'}`);
      
      // Get subscription status - check multiple sources
      let status = get('subscriptionStatus');
      if (!status || status === '—') {
        status = get('subscription.isActive') ? 'active' : 'inactive';
      }
      lines.push(`  Status:           ${status}`);
      lines.push(`  Plan:             ${get('subscription.plan')}`);
      lines.push(`  Subscription ID:  ${get('subscription.stripeSubscriptionId')}`);
      lines.push(`  Price ID:         ${get('subscription.stripePriceId')}`);

      if (get('subscription.currentPeriodStart') !== '—') {
        lines.push(
          `  Period Start:    ${new Date(
            get('subscription.currentPeriodStart')
          ).toLocaleDateString()}`
        );
      }

      if (get('subscription.currentPeriodEnd') !== '—') {
        const end = new Date(get('subscription.currentPeriodEnd'));
        const daysLeft = Math.max(
          0,
          Math.ceil((end - new Date()) / (1000 * 60 * 60 * 24))
        );

        lines.push(`  Period End:      ${end.toLocaleDateString()}`);
        lines.push(`  Days Remaining:  ${daysLeft}`);
      }

      return lines.join('\n');
    })
    .join('\n\n');
}

function formatAsJSON(users) {
  return JSON.stringify(users, null, 2);
}

function formatAsDetailed(users) {
  return users
    .map((user, index) => {
      const lines = [];

      lines.push('='.repeat(80));
      lines.push(`User #${index + 1}: ${user.firstName} ${user.lastName}`);
      lines.push('='.repeat(80));

      lines.push('\n📧 EMAIL INFORMATION');
      lines.push('-'.repeat(50));
      lines.push(`Email:        ${user.email}`);
      lines.push(`Role:         ${user.role}`);
      lines.push(`Created:      ${user.createdAt}`);

      lines.push('\n💳 STRIPE CUSTOMER');
      lines.push('-'.repeat(50));
      lines.push(`Customer ID:  ${user.stripeCustomerId || 'N/A'}`);
      lines.push(`Environment:  ${user.billingEnvironment || 'N/A'}`);

      const sub = user.subscription || {};
      lines.push('\n📅 SUBSCRIPTION DETAILS');
      lines.push('-'.repeat(50));
      lines.push(`Active:       ${sub.isActive ? '✅ Yes' : '❌ No'}`);
      lines.push(`Has Subscription: ${sub.isActive ? '✅ Yes' : '❌ No'}`);
      // Get subscription status - check multiple sources
      let subStatus = user.subscriptionStatus;
      if (!subStatus || subStatus === '—') {
        subStatus = sub.isActive ? 'active' : 'inactive';
      }
      lines.push(`Status:       ${subStatus}`);
      lines.push(`Plan:         ${sub.plan || 'None'}`);
      lines.push(`Sub ID:       ${sub.stripeSubscriptionId || 'N/A'}`);
      lines.push(`Price ID:     ${sub.stripePriceId || 'N/A'}`);

      if (sub.currentPeriodStart) {
        lines.push(
          `Start Date:   ${new Date(sub.currentPeriodStart).toLocaleDateString()}`
        );
      }

      if (sub.currentPeriodEnd) {
        const endDate = new Date(sub.currentPeriodEnd);
        const daysRemaining = Math.max(
          0,
          Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24))
        );
        lines.push(`End Date:     ${endDate.toLocaleDateString()}`);
        lines.push(`Days Left:    ${daysRemaining}`);
      }

      return lines.join('\n');
    })
    .join('\n\n');
}

async function displayUserByEmail(email) {
  const user = await User.findOne({ email: email.toLowerCase() });

  if (!user) {
    console.log(`❌ User not found with email: ${email}`);
    return 0;
  }

  console.log(`Found 1 user matching: ${email}\n`);

  if (FORMAT === 'json') {
    console.log(formatAsJSON([user]));
  } else if (FORMAT === 'detailed') {
    console.log(formatAsDetailed([user]));
  } else {
    console.log(formatAsList([user]));
  }

  return 1;
}

async function displayAllUsers() {
  const query = {};

  if (process.env.ROLE) {
    query.role = process.env.ROLE;
  }

  if (process.env.ACTIVE_SUBSCRIPTION === 'true') {
    query['subscription.isActive'] = true;
  }

  const total = await User.countDocuments(query);

  const users = await User.find(query)
    .select(DISPLAY_FIELDS.join(' '))
    .skip(SKIP)
    .limit(LIMIT)
    .sort({ createdAt: -1 });

  console.log(`Found ${total} users matching criteria`);
  console.log(`Showing ${users.length} users (skip: ${SKIP}, limit: ${LIMIT})\n`);

  if (users.length === 0) {
    console.log('No users found matching the criteria.');
    return 0;
  }

  if (FORMAT === 'json') {
    console.log(formatAsJSON(users));
  } else if (FORMAT === 'detailed') {
    console.log(formatAsDetailed(users));
  } else {
    console.log(formatAsList(users));
  }

  console.log('\n' + '-'.repeat(60));
  console.log('SUBSCRIPTION SUMMARY');
  console.log('-'.repeat(60));

  const summary = await User.aggregate([
    {
      $group: {
        _id: '$role',
        count: { $sum: 1 },
        activeSubs: {
          $sum: { $cond: ['$subscription.isActive', 1, 0] }
        }
      }
    }
  ]);

  summary.forEach(s => {
    console.log(
      `  ${s._id}: ${s.count} total (${s.activeSubs} with active subscription)`
    );
  });

  const totalActive = await User.countDocuments({
    'subscription.isActive': true
  });

  console.log(`\nTotal users with active subscription: ${totalActive}`);

  return users.length;
}

async function main() {
  console.log('\n🔄 Display User Records Script');
  console.log('Focus: Email and Subscription Data\n');

  console.log('Options:');
  console.log('  - FORMAT=list|json|detailed');
  console.log('  - LIMIT=n');
  console.log('  - SKIP=n');
  console.log('  - ROLE=user|admin|trainer');
  console.log('  - ACTIVE_SUBSCRIPTION=true\n');

  const connected = await connectDB();
  if (!connected) process.exit(1);

  try {
    const emailArg = process.argv[2];
    const count = emailArg
      ? await displayUserByEmail(emailArg)
      : await displayAllUsers();

    console.log(`\n✅ Displayed ${count} user record(s)`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔒 Database connection closed');
  }
}

process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Operation interrupted');
  await mongoose.connection.close();
  process.exit(0);
});

main();
