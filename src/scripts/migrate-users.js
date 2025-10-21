const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function migrateUsers() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/jefitness', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('Connected to MongoDB');

        // Find all users where isEmailVerified is not set or is false
        const usersToUpdate = await User.find({
            $or: [
                { isEmailVerified: { $exists: false } },
                { isEmailVerified: false }
            ]
        });

        console.log(`Found ${usersToUpdate.length} users to update`);

        // Update each user
        for (const user of usersToUpdate) {
            user.isEmailVerified = true;
            // Clear any existing verification tokens
            user.emailVerificationToken = undefined;
            user.emailVerificationExpires = undefined;
            await user.save();
            console.log(`Updated user: ${user.email}`);
        }

        console.log('Migration completed successfully');

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        // Close the connection
        await mongoose.connection.close();
        console.log('Database connection closed');
    }
}

// Run the migration
migrateUsers();
