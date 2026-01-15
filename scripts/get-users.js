/**
 * get-users.js
 *
 * Flexible MongoDB user query script (ARGS REQUIRED).
 *
 * Supports:
 * - Arg chaining (AND logic)
 * - Specific user lookup
 * - Wildcards (*)
 * - Boolean flags
 *
 * Examples:
 *  node scripts/get-users.js --role=trainer
 *  node scripts/get-users.js --role=trainer --isEmailVerified=true
 *  node scripts/get-users.js --email=*gmail* --role=user
 *  node scripts/get-users.js --name=jos --role=trainer
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

// --------------------
// Constants
// --------------------
const USAGE = `
Usage:
  node scripts/get-users.js [filters]

Examples:
  node scripts/get-users.js --role=trainer
  node scripts/get-users.js --role=trainer --isEmailVerified=true
  node scripts/get-users.js --email=*gmail* --role=user
  node scripts/get-users.js --name=jos --role=trainer

Notes:
  - Multiple flags are AND'ed together
  - Wildcards (*) are supported
  - At least one filter is required
`;

// --------------------
// MongoDB Connection
// --------------------
async function connectDB() {
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is missing in .env');
  }
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ MongoDB connected\n');
}

// --------------------
// Arg Parsing
// --------------------
function parseArgs(argv) {
  const args = {};
  argv.forEach(arg => {
    if (!arg.startsWith('--')) return;
    const [key, value] = arg.replace('--', '').split('=');
    args[key] = value;
  });
  return args;
}

// --------------------
// Filter Builder
// --------------------
function buildFilterFromArgs(args) {
  const filter = {};

  for (const [key, value] of Object.entries(args)) {
    if (!value) continue;

    if (value.includes('*')) {
      filter[key] = new RegExp(value.replace(/\*/g, '.*'), 'i');
      continue;
    }

    if (value === 'true' || value === 'false') {
      filter[key] = value === 'true';
      continue;
    }

    filter[key] = value;
  }

  return filter;
}

// --------------------
// Queries
// --------------------
async function getUserByIdOrEmail(identifier) {
  if (mongoose.Types.ObjectId.isValid(identifier)) {
    return User.findById(identifier);
  }
  return User.findOne({ email: identifier.toLowerCase() });
}

async function getUsersByFilter(filter) {
  return User.find(filter);
}

// --------------------
// Output Formatter
// --------------------
function printUsers(users) {
  if (!users.length) {
    console.log('⚠️  No users found.\n');
    return;
  }

  console.log(`📊 Found ${users.length} user(s)\n`);

  users.forEach((user, index) => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`👤 User #${index + 1}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // --------------------
    // Core Info
    // --------------------
    console.log(`ID:               ${user._id}`);
    console.log(
      `Name:             ${(user.firstName || '')} ${(user.lastName || '')}`.trim()
    );
    console.log(`Email:            ${user.email}`);
    console.log(`Role:             ${user.role}`);
    console.log(`Email Verified:   ${user.isEmailVerified ? 'Yes' : 'No'}`);
    console.log(`Active:           ${user.isActive !== false ? 'Yes' : 'No'}`);
    console.log(`Created At:       ${user.createdAt?.toISOString() || 'N/A'}`);

    // --------------------
    // Stripe Info
    // --------------------
    console.log('\n💳 Stripe');
    console.log(`Customer ID:      ${user.stripeCustomerId || '—'}`);
    console.log(`Payment Method:   ${user.defaultPaymentMethod || '—'}`);

    // --------------------
    // Subscription Info
    // --------------------
    const sub = user.subscription || {};

    console.log('\n📦 Subscription');
    console.log(`Status:           ${sub.status || 'none'}`);
    console.log(`Plan:             ${sub.planName || sub.planId || '—'}`);
    console.log(`Interval:         ${sub.interval || '—'}`);
    console.log(
      `Current Period:   ${
        sub.currentPeriodEnd
          ? new Date(sub.currentPeriodEnd).toISOString()
          : '—'
      }`
    );
    console.log(
      `Cancel At Period: ${sub.cancelAtPeriodEnd ? 'Yes' : 'No'}`
    );

    console.log('');
  });
}

// --------------------
// Runner
// --------------------
async function run() {
  const rawArgs = process.argv.slice(2);

  if (!rawArgs.length) {
    console.log(USAGE);
    process.exit(0);
  }

  const args = parseArgs(rawArgs);

  if (!Object.keys(args).length) {
    console.log(USAGE);
    process.exit(0);
  }

  await connectDB();

  let users = [];

  if (args.id || args.email) {
    const identifier = args.id || args.email;
    const user = await getUserByIdOrEmail(identifier);
    users = user ? [user] : [];
  } else {
    const filter = buildFilterFromArgs(args);

    if (args.name) {
      filter.$or = [
        { firstName: new RegExp(args.name, 'i') },
        { lastName: new RegExp(args.name, 'i') }
      ];
      delete filter.name;
    }

    users = await getUsersByFilter(filter);
  }

  printUsers(users);

  await mongoose.disconnect();
  process.exit(0);
}

// --------------------
// Execute
// --------------------
run().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
