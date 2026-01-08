const mongoose = require('mongoose');
const User = require('../models/User');
const Program = require('../models/Program');
require('dotenv').config();

async function assignProgramToUser(email, programId) {
    try {
        // Validate programId format
        if (!mongoose.Types.ObjectId.isValid(programId)) {
            throw new Error('Invalid program ID format');
        }

        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/jefitness', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('Connected to MongoDB');

        // Find user by email
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            throw new Error(`User with email ${email} not found`);
        }

        // Find program by ID
        const program = await Program.findById(programId);
        if (!program) {
            throw new Error(`Program with ID ${programId} not found`);
        }

        // Check if program is already assigned
        const alreadyAssigned = user.assignedPrograms.some(
            assigned => assigned.programId.toString() === programId
        );

        if (alreadyAssigned) {
            console.log(`Program "${program.title}" is already assigned to ${email}`);
            return;
        }

        // Assign program to user
        user.assignedPrograms.push({
            programId: programId,
            assignedAt: new Date()
        });

        await user.save();

        console.log(`Successfully assigned program "${program.title}" to ${email}`);

    } catch (error) {
        console.error('Assignment failed:', error.message);
        process.exit(1);
    } finally {
        // Close the connection
        await mongoose.connection.close();
        console.log('Database connection closed');
    }
}

// Get arguments from command line
const [,, email, programId] = process.argv;
if (!email || !programId) {
    console.error('Usage: node assign-program-to-user.js <user-email> <program-id>');
    console.error('Example: node assign-program-to-user.js user@example.com 507f1f77bcf86cd799439011');
    process.exit(1);
}

assignProgramToUser(email, programId);
