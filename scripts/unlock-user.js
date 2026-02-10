/**
 * Utility script to manually unlock a user account by email.
 * Resets failed login attempts and clears the lockout timestamp.
 * 
 * Usage: node scripts/unlock-user.js user@example.com
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const User = require('../src/models/User');

async function unlockUser() {
    const email = process.argv[2];

    if (!email) {
        console.error('Please provide an email address.');
        console.log('Usage: node scripts/unlock-user.js <email>');
        process.exit(1);
    }

    try {
        console.log(`Connecting to database...`);
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected successfully.');

        const user = await User.findOne({ email: email.toLowerCase().trim() });

        if (!user) {
            console.error(`User not found: ${email}`);
            process.exit(1);
        }

        console.log(`Current status for ${user.email}:`);
        console.log(`- Failed login attempts: ${user.failedLoginAttempts}`);
        console.log(`- Lockout until: ${user.lockoutUntil || 'Not locked'}`);

        // Reset lock fields
        user.failedLoginAttempts = 0;
        user.lockoutUntil = undefined;

        await user.save();

        console.log('\nSUCCESS: User account unlocked successfully.');
        console.log(`- Failed login attempts reset to: ${user.failedLoginAttempts}`);
        console.log(`- Lockout cleared.`);

    } catch (error) {
        console.error('Error unlocking user:', error.message);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
}

unlockUser();