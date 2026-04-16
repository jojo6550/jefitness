const mongoose = require('mongoose');

const User = require('../src/models/User');

async function migrate() {
  const mongoUri = process.env.MONGO_URI;

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  // Ensure all users have stripeCustomerId and billingEnvironment fields
  const result = await User.updateMany(
    {
      $or: [
        { stripeCustomerId: { $exists: false } },
        { billingEnvironment: { $exists: false } },
      ],
    },
    {
      $set: {
        stripeCustomerId: null,
        billingEnvironment: null,
      },
    }
  );

  console.log(`Updated ${result.modifiedCount} users`);

  // Remove stripeSubscriptionId and stripeCheckoutSessionId from User (moved to Subscription)
  const removeResult = await User.updateMany(
    {},
    {
      $unset: {
        stripeSubscriptionId: '',
        stripeCheckoutSessionId: '',
      },
    }
  );

  console.log(`Removed old fields from ${removeResult.modifiedCount} users`);

  await mongoose.connection.close();
  console.log('Migration complete');
}

migrate().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});
