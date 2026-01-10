const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Import User model
const User = require('../src/models/User');

async function setDataProcessingConsent() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
            family: 4
        });

        console.log('Connected to MongoDB');

        // Update all users to have dataProcessingConsent.given = true
        const result = await User.updateMany(
            { 'dataProcessingConsent.given': { $ne: true } }, // Only update if not already true
            {
                $set: {
                    'dataProcessingConsent.given': true,
                    'dataProcessingConsent.givenAt': new Date(),
                    'dataProcessingConsent.ipAddress': 'system_update',
                    'dataProcessingConsent.userAgent': 'consent_migration_script'
                }
            }
        );

        console.log(`Updated ${result.modifiedCount} users with data processing consent`);

        // Also set health data consent for users who might need it
        const healthResult = await User.updateMany(
            { 'healthDataConsent.given': { $ne: true } },
            {
                $set: {
                    'healthDataConsent.given': true,
                    'healthDataConsent.givenAt': new Date(),
                    'healthDataConsent.ipAddress': 'system_update',
                    'healthDataConsent.userAgent': 'consent_migration_script',
                    'healthDataConsent.purpose': 'fitness_tracking'
                }
            }
        );

        console.log(`Updated ${healthResult.modifiedCount} users with health data consent`);

        console.log('Consent migration completed successfully');

    } catch (error) {
        console.error('Error during consent migration:', error);
    } finally {
        // Close the connection
        await mongoose.connection.close();
        console.log('Database connection closed');
    }
}

// Run the script
setDataProcessingConsent();
