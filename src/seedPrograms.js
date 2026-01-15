/**
 * Seed Programs Script
 * 
 * This script seeds the database with sample programs that are dynamically loaded
 * from environment variables for Stripe product and price IDs.
 * 
 * Usage: node src/seedPrograms.js
 * 
 * Environment Variables Required:
 * - STRIPE_PROGRAM_PRODUCT_<SLUG> (e.g., STRIPE_PROGRAM_PRODUCT_WEIGHT_LOSS)
 * - STRIPE_PROGRAM_PRICE_<SLUG> (e.g., STRIPE_PROGRAM_PRICE_WEIGHT_LOSS)
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Program = require('./models/Program');

// Sample programs data
const samplePrograms = [
    {
        title: '9-Week Phased Strength Program',
        slug: '9_week_phased_strength_jamin_johnson',
        author: 'Jamin Johnson',
        goals: 'Increase hypertrophy, strength, and power with a phased approach for main lifts and accessories',
        description: `
A 9-week structured program with progressive phases for hypertrophy, strength, and power.
Includes Squat, Bench, Deadlift (SBD) focus, full accessory and core work, and mini-deloads for recovery.
RPE-based progression and autoregulation are built in for optimal performance.
        `,
        tags: ['strength', 'hypertrophy', 'power', 'SBD', 'accessory', 'core', '9-weeks'],
        difficulty: 'intermediate',
        duration: '9 weeks',
        features: [
            'Phase 1: Hypertrophy (Weeks 1–3) – 6–8 reps, moderate load, focused accessory & core',
            'Phase 2: Strength (Weeks 4–6) – 2–5 reps on main lifts, back-offs, heavier accessory work',
            'Phase 3: Power (Weeks 7–9) – Explosive lifts, speed work, peak exposure on main lifts',
            'Autoregulated progression with RPE tracking',
            'Mini-deloads after each phase to manage fatigue',
            'Core systematically included daily',
            'Posterior chain emphasized for balanced development'
        ]
    }


];

async function seedPrograms() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000
        });
        console.log('✅ Connected to MongoDB');

        // Clear existing programs (optional - comment out if you want to keep existing ones)
        const deleteResult = await Program.deleteMany({});
        console.log(`🗑️ Deleted ${deleteResult.deletedCount} existing programs`);

        // Seed programs with dynamic Stripe IDs from environment
        const programsToSeed = [];
        
        for (const programData of samplePrograms) {
            const productIdKey = `STRIPE_PROGRAM_PRODUCT_${programData.slug.toUpperCase()}`;
            const priceIdKey = `STRIPE_PROGRAM_PRICE_${programData.slug.toUpperCase()}`;
            
            const stripeProductId = process.env[productIdKey];
            const stripePriceId = process.env[priceIdKey];

            if (!stripeProductId || !stripePriceId) {
                console.warn(`⚠️ Skipping ${programData.title}: Missing ${!stripeProductId ? productIdKey : priceIdKey} in environment`);
                continue;
            }

            programsToSeed.push({
                ...programData,
                stripeProductId,
                stripePriceId,
                isActive: true
            });
        }

        if (programsToSeed.length === 0) {
            console.error('❌ No programs to seed. Please set environment variables for Stripe product and price IDs.');
            console.log('\nRequired environment variables format:');
            console.log('STRIPE_PROGRAM_PRODUCT_<SLUG>=prod_xxxxx');
            console.log('STRIPE_PROGRAM_PRICE_<SLUG>=price_xxxxx');
            console.log('\nExample:');
            console.log('STRIPE_PROGRAM_PRODUCT_WEIGHT_LOSS=prod_xxxxx');
            console.log('STRIPE_PROGRAM_PRICE_WEIGHT_LOSS=price_xxxxx');
            process.exit(1);
        }

        const result = await Program.insertMany(programsToSeed);
        console.log(`✅ Seeded ${result.length} programs successfully`);

        result.forEach(program => {
            console.log(`  - ${program.title} (${program.slug})`);
        });

        console.log('\n📝 Programs are now available in the marketplace!');
        
    } catch (error) {
        console.error('❌ Error seeding programs:', error);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('✅ Database connection closed');
    }
}

// Run the seed function
seedPrograms();