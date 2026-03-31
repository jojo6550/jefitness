#!/usr/bin/env node
require('dotenv').config();
const mongoose = require('mongoose');

const StripePlan = require('../src/models/StripePlan');

const { syncStripeToDB } = require('./sync-stripe-to-db');

async function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/jefitness';
  await mongoose.connect(uri);
  console.log('✅ DB connected');
}

const commands = process.argv.slice(2);

async function main() {
  try {
    const cmd = commands[0];

    switch (cmd) {
      case 'sync':
        console.log('🚀 Full sync...');
        await syncStripeToDB();
        break;

      case 'list':
        await connectDB();
        const plans = await StripePlan.find({ active: true })
          .sort({ unitAmount: 1 })
          .lean();
        console.log(`📋 ${plans.length} active plans:\n`);
        console.table(
          plans.map(p => ({
            ID: p.stripePriceId.slice(-8),
            Lookup: p.lookupKey || '-',
            Plan: p.name,
            Price: `$${(p.unitAmount / 100).toFixed(2)} ${p.currency?.toUpperCase()}`,
            Interval: `${p.interval}${p.intervalCount > 1 ? ` x${p.intervalCount}` : ''}`,
            Synced: p.lastSyncedAt.toISOString().split('T')[0],
          }))
        );
        await mongoose.connection.close();
        break;

      case 'remove':
        if (!commands[1])
          return (
            console.error('❌ node cli-commands.js remove <priceId>'),
            process.exit(1)
          );
        await connectDB();
        const res = await StripePlan.deleteOne({ stripePriceId: commands[1] });
        console.log(
          res.deletedCount ? `🗑️ Removed ${commands[1]}` : `ℹ️ Not found: ${commands[1]}`
        );
        break;

      case 'add-lookup':
        if (commands.length !== 3)
          return (
            console.error('❌ node cli-commands.js add-lookup <key> <priceId>'),
            process.exit(1)
          );
        await connectDB();
        const upd = await StripePlan.updateOne(
          { stripePriceId: commands[2] },
          { $set: { lookupKey: commands[1] } }
        );
        console.log(
          upd.matchedCount
            ? `✅ lookupKey "${commands[1]}" → ${commands[2]}`
            : `ℹ️ Not found: ${commands[2]}`
        );
        break;

      default:
        console.log(
          'Commands:\n  sync\n  list\n  remove <priceId>\n  add-lookup <key> <priceId>',
        );
        process.exit(0);
    }
  } catch (err) {
    console.error('❌', err.message);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState === 1) await mongoose.connection.close();
  }
}

main();
