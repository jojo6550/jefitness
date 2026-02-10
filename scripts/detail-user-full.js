#!/usr/bin/env node

/**
 * Detailed User Information Script
 *
 * Retrieves and displays EVERYTHING about a user from the database.
 * Run with: node scripts/detail-user-full.js <email|id>
 *
 * Options via env:
 *   - FORMAT=text|json (default: text)
 *   - SECTIONS=profile,subs,appointments,logs,medical,audit,notifications (default: all)
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

// Import Models
const User = require('../src/models/User');
const Appointment = require('../src/models/Appointment');
const Subscription = require('../src/models/Subscription');
const Notification = require('../src/models/Notification');
const Log = require('../src/models/Log');
const Purchase = require('../src/models/Purchase');

const FORMAT = process.env.FORMAT || 'text';
const SECTIONS = process.env.SECTIONS ? process.env.SECTIONS.split(',') : ['all'];

async function connectDB() {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/jefitness';
    try {
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to database');
    } catch (err) {
        console.error('❌ DB Connection Error:', err.message);
        process.exit(1);
    }
}

async function getFullUserData(identifier) {
    let query = {};
    if (mongoose.Types.ObjectId.isValid(identifier)) {
        query = { _id: identifier };
    } else {
        query = { email: identifier.toLowerCase() };
    }

    const user = await User.findOne(query).select('+tokenVersion +password').lean();
    if (!user) return null;

    const userId = user._id;
    const data = { profile: user };

    // Fetch related data in parallel
    const [subs, appointments, notifications, logs, purchases] = await Promise.all([
        Subscription.find({ userId }).sort({ createdAt: -1 }).lean(),
        Appointment.find({ $or: [{ clientId: userId }, { trainerId: userId }] }).sort({ date: -1 }).lean(),
        Notification.find({ userId }).sort({ createdAt: -1 }).limit(50).lean(),
        Log.find({ userId }).sort({ timestamp: -1 }).limit(100).lean(),
        Purchase.find({ userId }).sort({ createdAt: -1 }).lean()
    ]);

    data.subscriptions = subs;
    data.appointments = appointments;
    data.notifications = notifications;
    data.auditLogs = logs;
    data.purchases = purchases;

    return data;
}

function printSection(title, content) {
    console.log(`\n=== ${title.toUpperCase()} ===`);
    if (!content || (Array.isArray(content) && content.length === 0)) {
        console.log('No data found.');
        return;
    }
    console.log(JSON.stringify(content, null, 2));
}

function printText(data) {
    const { profile, subscriptions, appointments, notifications, auditLogs, purchases } = data;

    console.log('\n' + '='.repeat(80));
    console.log(`FULL DATA EXPORT: ${profile.firstName} ${profile.lastName} (${profile.email})`);
    console.log('='.repeat(80));

    if (SECTIONS.includes('all') || SECTIONS.includes('profile')) {
        console.log('\n👤 PROFILE');
        console.log(`  ID:            ${profile._id}`);
        console.log(`  Role:          ${profile.role}`);
        console.log(`  Verified:      ${profile.isEmailVerified ? '✅' : '❌'}`);
        console.log(`  Status:        ${profile.activityStatus}`);
        console.log(`  Created:       ${profile.createdAt}`);
        console.log(`  Last Login:    ${profile.lastLoggedIn || 'N/A'}`);
        console.log(`  Stripe ID:     ${profile.stripeCustomerId || 'N/A'}`);
        
        console.log('\n⚖️ CONSENTS');
        console.log(`  Data Processing: ${profile.dataProcessingConsent?.given ? '✅' : '❌'} (${profile.dataProcessingConsent?.givenAt || 'N/A'})`);
        console.log(`  Health Data:     ${profile.healthDataConsent?.given ? '✅' : '❌'} (${profile.healthDataConsent?.givenAt || 'N/A'})`);
    }

    if (SECTIONS.includes('all') || SECTIONS.includes('subs')) {
        console.log('\n💳 SUBSCRIPTIONS');
        if (subscriptions.length === 0) console.log('  None');
        subscriptions.forEach(s => {
            console.log(`  - [${s.status.toUpperCase()}] ${s.plan} | Ends: ${s.currentPeriodEnd} | ID: ${s.stripeSubscriptionId}`);
        });
    }

    if (SECTIONS.includes('all') || SECTIONS.includes('appointments')) {
        console.log('\n📅 APPOINTMENTS');
        if (appointments.length === 0) console.log('  None');
        appointments.forEach(a => {
            const type = a.clientId.toString() === profile._id.toString() ? 'Client' : 'Trainer';
            console.log(`  - ${a.date.toISOString().split('T')[0]} @ ${a.time} | Status: ${a.status} | As: ${type}`);
        });
    }

    if (SECTIONS.includes('all') || SECTIONS.includes('logs')) {
        console.log(`\n🏋️ WORKOUT LOGS (${profile.workoutLogs?.length || 0} entries)`);
        if (!profile.workoutLogs?.length) console.log('  None');
        profile.workoutLogs?.slice(0, 5).forEach(l => {
            console.log(`  - ${l.date.toISOString().split('T')[0]}: ${l.workoutName} (${l.exercises.length} exercises)`);
        });
    }

    if (SECTIONS.includes('all') || SECTIONS.includes('medical')) {
        console.log(`\n🏥 MEDICAL DOCUMENTS (${profile.medicalDocuments?.length || 0})`);
        if (!profile.medicalDocuments?.length) console.log('  None');
        profile.medicalDocuments?.forEach(doc => {
            console.log(`  - ${doc.originalName} (${(doc.size / 1024).toFixed(1)} KB) | Uploaded: ${doc.uploadedAt}`);
        });
    }

    if (SECTIONS.includes('all') || SECTIONS.includes('purchases')) {
        console.log(`\n🛒 PURCHASES (${purchases.length})`);
        if (purchases.length === 0) console.log('  None');
        purchases.forEach(p => {
            console.log(`  - ${p.createdAt}: ${p.productName || 'Product'} | $${p.amount || 0} | Status: ${p.status}`);
        });
    }

    if (SECTIONS.includes('all') || SECTIONS.includes('audit')) {
        console.log(`\n🛡️ AUDIT LOGS (Last 10 of ${auditLogs.length})`);
        if (auditLogs.length === 0) console.log('  None');
        auditLogs.slice(0, 10).forEach(l => {
            console.log(`  - ${l.timestamp}: ${l.message} [${l.category}]`);
        });
    }

    console.log('\n' + '='.repeat(80));
}

async function main() {
    const identifier = process.argv[2];
    if (!identifier) {
        console.log('Usage: node scripts/detail-user-full.js <email|id>');
        process.exit(1);
    }

    await connectDB();

    try {
        const data = await getFullUserData(identifier);
        if (!data) {
            console.log(`❌ User not found: ${identifier}`);
            return;
        }

        if (FORMAT === 'json') {
            console.log(JSON.stringify(data, null, 2));
        } else {
            printText(data);
        }
    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await mongoose.connection.close();
    }
}

main();
