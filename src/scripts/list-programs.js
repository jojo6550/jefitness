const mongoose = require('mongoose');
const Program = require('../models/Program');
require('dotenv').config();

async function listPrograms() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/jefitness', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('Connected to MongoDB');

        // Find all programs
        const programs = await Program.find({}).select('_id title duration level');

        if (programs.length === 0) {
            console.log('No programs found in the database.');
            return;
        }

        console.log('\nAvailable Programs:');
        console.log('==================');

        programs.forEach(program => {
            console.log(`ID: ${program._id}`);
            console.log(`Title: ${program.title}`);
            console.log(`Duration: ${program.duration}`);
            console.log(`Level: ${program.level}`);
            console.log('------------------');
        });

    } catch (error) {
        console.error('Error listing programs:', error.message);
    } finally {
        // Close the connection
        await mongoose.connection.close();
        console.log('Database connection closed');
    }
}

listPrograms();
