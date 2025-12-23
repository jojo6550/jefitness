const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Program = require('./models/Program');

dotenv.config();

const programs = [
    {
        title: 'Upper & Lower Back Program',
        description: 'A targeted program designed to strengthen and mobilize your entire back, improving posture and reducing discomfort.',
        price: 49.99,
        duration: '4 weeks',
        level: 'Beginner',
        frequency: '1-2 Days/Week',
        sessionLength: '30-45 min/session',
        slug: 'upper-lower-back-program',
        features: [
            'Targeted back strengthening exercises',
            'Posture improvement techniques',
            'Mobility and flexibility training',
            'Video demonstrations for each exercise',
            'Progress tracking worksheets'
        ],
        isActive: true
    },
    {
        title: 'Full Body Mobility Drills',
        description: 'Improve posture, flexibility, and joint function from head to toe with these essential mobility drills.',
        price: 79.99,
        duration: '6 weeks',
        level: 'Intermediate',
        frequency: '3-5 Days/Week',
        sessionLength: '20-30 min/session',
        slug: 'full-body-mobility',
        features: [
            'Comprehensive mobility routines',
            'Joint health exercises',
            'Flexibility improvement program',
            'Daily mobility challenges',
            'Lifetime access to program materials'
        ],
        isActive: true
    },
    {
        title: '8-Week EDS-Safe Strength & Fat Loss Program',
        description: 'An 8-week program designed for females with EDS (Ehlers-Danlos Syndrome) and limited equipment, focusing on joint stability, fat loss, and muscle preservation through controlled, low-impact exercises.',
        price: 60.00,
        duration: '8 weeks',
        level: 'Intermediate',
        frequency: '5 Days/Week',
        sessionLength: '45-60 min/session',
        slug: '8-week-eds-safe-strength-fat-loss-program',
        features: [
            'EDS-safe exercises prioritizing joint stability',
            'Phased progression: Stability activation and metabolic muscle tone',
            'Low-impact fat burning with controlled tempo',
            'Unilateral and isometric work for muscle retention',
            'Optional conditioning for additional calorie burn',
            'Nutrition guidance for EDS-specific needs'
        ],
        isActive: true
    },
    {
        title: '9-Week Phased Strength Program',
        description: 'A 9-week phased program that respects fatigue, motor learning, and strength carryover to SBD (Squat, Bench, Deadlift). Includes hypertrophy, strength, and power phases for optimal progression.',
        price: 50.00,
        duration: '9 weeks',
        level: 'Advanced',
        frequency: '4 Days/Week',
        sessionLength: '60-90 min/session',
        slug: '9-week-phased-strength-program',
        features: [
            'Phased progression: Hypertrophy, Strength, Power',
            'Focus on SBD lifts with accessory work',
            'Technique reinforcement and neural efficiency',
            'Autoregulation guidelines for fatigue management',
            'Weekly structure with rest days',
            'Progression model for strength gains'
        ],
        isActive: true
    }
];

async function seedPrograms() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected');

        // Clear existing programs
        await Program.deleteMany({});
        console.log('Cleared existing programs');

        // Insert new programs
        await Program.insertMany(programs);
        console.log('Programs seeded successfully');

        mongoose.connection.close();
        console.log('Database connection closed');
    } catch (err) {
        console.error('Error seeding programs:', err);
        process.exit(1);
    }
}

seedPrograms();