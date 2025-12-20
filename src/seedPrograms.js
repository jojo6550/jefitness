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
        title: '12 Week Strength Programme',
        description: 'By Jamin Johnson – A 12-week phased program to build real strength, lose fat slowly, and avoid CNS burnout with structured progression.',
        price: 129.99,
        duration: '12 weeks',
        level: 'Advanced',
        frequency: '5 Days/Week',
        sessionLength: '60-90 min/session',
        slug: '12-week-strength-program',
        features: [
            'Structured 12-week progression plan',
            'Advanced strength training techniques',
            'Fat loss optimization strategies',
            'CNS recovery protocols',
            'Personalized workout tracking',
            'Nutrition guidance included'
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