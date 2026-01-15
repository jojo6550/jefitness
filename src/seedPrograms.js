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
        title: 'Complete Weight Loss Program',
        slug: 'weight_loss',
        author: 'JE Fitness Team',
        goals: 'Lose weight sustainably through structured workouts and nutrition guidance',
        description: 'A comprehensive 12-week program designed to help you achieve your weight loss goals through evidence-based training methods and nutritional strategies.',
        tags: ['weight-loss', 'nutrition', 'beginner-friendly', 'cardio'],
        difficulty: 'beginner',
        duration: '12 weeks',
        features: [
            'Customized meal plans',
            'Progressive workout routines',
            'Weekly check-ins and progress tracking',
            'Access to private community',
            'Lifetime access to program materials'
        ]
    },
    {
        title: 'Muscle Building Mastery',
        slug: 'muscle_building',
        author: 'JE Fitness Team',
        goals: 'Build lean muscle mass and increase strength with proven hypertrophy training',
        description: 'An advanced 16-week muscle building program focusing on compound movements and progressive overload principles.',
        tags: ['muscle-building', 'strength', 'advanced', 'hypertrophy'],
        difficulty: 'advanced',
        duration: '16 weeks',
        features: [
            'Detailed exercise demonstrations',
            'Progressive overload tracking',
            'Supplement recommendations',
            'Recovery protocols',
            'Nutrition timing strategies'
        ]
    },
    {
        title: 'Athletic Performance Enhancement',
        slug: 'athletic_performance',
        author: 'JE Fitness Team',
        goals: 'Improve overall athletic performance, speed, agility, and power',
        description: 'A sport-specific training program designed for athletes looking to enhance their performance across multiple fitness domains.',
        tags: ['athletic-performance', 'speed', 'agility', 'power', 'intermediate'],
        difficulty: 'intermediate',
        duration: '10 weeks',
        features: [
            'Sport-specific drills',
            'Plyometric training',
            'Speed and agility work',
            'Flexibility and mobility routines',
            'Performance testing protocols'
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