require('dotenv').config();
const express = require('express');
const Stripe = require('stripe');
const mongoose = require('mongoose');
const StripePlan = require('../src/models/StripePlan');

async function connectDB() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/jefitness');
  console.log('✅ DB connected for webhook');
}

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const webhookSecret =
  process.env.STRIPE_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_PLANS_SECRET;

const app = express();
app.use(express.raw({ type: 'application/json' }));

// Partial sync single price
async function syncSinglePrice(priceId) {
  try {
    const price = await stripe.prices.retrieve(priceId, { expand: ['product'] });
    if (price.type !== 'recurring' || !price.active) {
      await StripePlan.updateOne({ stripePriceId: priceId }, { active: false });
      console.log(`📂 Archived inactive price: ${priceId}`);
      return;
    }

    if (!price.product?.id) return console.warn('No product:', priceId);

    const product = price.product;
    const planData = {
      stripePriceId: price.id,
      stripeProductId: product.id,
      name: product.name,
      description: product.description,
      lookupKey: price.lookup_key || null,
      unitAmount: price.unit_amount,
      currency: price.currency,
      interval: price.recurring.interval,
      intervalCount: price.recurring.interval_count || 1,
      active: true,
      type: price.type,
      nickname: price.nickname || null,
      metadata: { ...product.metadata, ...price.metadata },
      productImages: product.images || [],
      lastSyncedAt: new Date(),
    };

    await StripePlan.findOneAndUpdate(
      { stripePriceId: priceId },
      { $set: planData },
      { upsert: true }
    );
    console.log(`🔄 Synced price: ${planData.name} (${priceId})`);
  } catch (error) {
    console.error('Webhook sync error:', error.message);
  }
}

app.post(
  '/webhook/plans',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('Webhook signature error:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log(`📨 Webhook: ${event.type}`);

    switch (event.type) {
      case 'price.created':
      case 'price.updated':
        await syncSinglePrice(event.data.object.id);
        break;
      case 'price.deleted':
        await StripePlan.updateOne(
          { stripePriceId: event.data.object.id },
          { active: false }
        );
        break;
      case 'product.updated':
        // Resync all prices for this product
        const prices = await stripe.prices.list({
          product: event.data.object.id,
          active: true,
        });
        for (const price of prices.data) {
          await syncSinglePrice(price.id);
        }
        break;
    }

    res.json({ received: true });
  }
);

const port = process.env.PORT || 3001;
app.listen(port, async () => {
  await connectDB();
  console.log(`🌐 Webhook server on port ${port}`);
  console.log('Set STRIPE_WEBHOOK_PLANS_SECRET and use ngrok http 3001 for testing');
  console.log(
    'Add to existing server.js: app.use("/api/webhook/plans", require("./scripts/add-webhook-support"));'
  );
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await mongoose.connection.close();
  process.exit(0);
});
