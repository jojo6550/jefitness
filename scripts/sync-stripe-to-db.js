require('dotenv').config();
const mongoose = require('mongoose');

const Stripe = require('stripe');

const StripePlan = require('../src/models/StripePlan');

async function connectDB() {
  try {
    const uri = process.env.MONGO_URI;
    await mongoose.connect(uri);
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
}

async function syncStripeToDB({ skipConnect = false } = {}) {
  if (!skipConnect) await connectDB();

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) {
    console.error('❌ STRIPE_SECRET_KEY missing');
    process.exit(1);
  }

  const stripe = Stripe(stripeSecret);

  try {
    console.log('🔄 Fetching active recurring prices from Stripe...');

    const stripePrices = await stripe.prices.list({
      active: true,
      type: 'recurring',
      expand: ['data.product'],
      limit: 100,
    });

    console.log(`📥 Found ${stripePrices.data.length} active recurring prices`);

    const stripePriceIds = new Set();
    let created = 0,
      updated = 0;

    for (const price of stripePrices.data) {
      if (!price.product || typeof price.product !== 'object') {
        console.warn(`⚠️ Skipping price ${price.id} - no product data`);
        continue;
      }

      const product = price.product;
      const planData = {
        stripePriceId: price.id,
        stripeProductId: product.id,
        name: product.name,
        description: product.description,
        lookupKey:
          price.lookup_key ||
          `${Math.max(1, price.recurring.interval_count || 1)}-${price.recurring.interval}`,
        unitAmount: price.unit_amount,
        currency: price.currency,
        interval: price.recurring.interval,
        intervalCount: Math.max(1, price.recurring.interval_count || 1),
        active: price.active,
        type: price.type,
        nickname:
          price.nickname ||
          price.lookup_key ||
          `${Math.max(1, price.recurring.interval_count || 1)}-${price.recurring.interval}`,
        metadata: { ...product.metadata, ...price.metadata },
        productImages: product.images || [],
        lastSyncedAt: new Date(),
      };

      stripePriceIds.add(price.id);

      const result = await StripePlan.findOneAndUpdate(
        { stripePriceId: price.id },
        { $set: planData },
        { upsert: true, new: true }
      );

      if (result.upserted) {
        created++;
        console.log(`➕ Created: ${planData.name} (${price.id})`);
      } else {
        updated++;
      }
    }

    // Cleanup inactive/missing
    const dbPlans = await StripePlan.find({
      stripePriceId: { $nin: Array.from(stripePriceIds) },
    });
    let removed = 0,
      archived = 0;

    for (const plan of dbPlans) {
      if (plan.active === false) {
        archived++;
      } else {
        await StripePlan.deleteOne({ _id: plan._id });
        console.log(`🗑️ Removed: ${plan.name} (${plan.stripePriceId})`);
        removed++;
      }
    }

    console.log(
      `✅ Sync complete! Created: ${created}, Updated: ${updated}, Removed: ${removed}, Archived: ${archived}`
    );
    console.log(
      `📊 Active plans in DB: ${await StripePlan.countDocuments({ active: true })}`
    );
  } catch (error) {
    console.error('❌ Sync error:', error.message);
    process.exit(1);
  } finally {
    if (!skipConnect) await mongoose.connection.close();
  }
}

if (require.main === module) {
  syncStripeToDB();
}

module.exports = { syncStripeToDB };
