const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function updateUserRole(email, role) {
    try {
        // Validate role
        const validRoles = ['user', 'admin', 'trainer'];
        if (!validRoles.includes(role)) {
            throw new Error(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
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

        // Update role
        user.role = role;
        await user.save();

        console.log(`Updated role for ${email} to ${role}`);

    } catch (error) {
        console.error('Update failed:', error.message);
    } finally {
        // Close the connection
        await mongoose.connection.close();
        console.log('Database connection closed');
    }
}

// Get arguments from command line
const [,, email, role] = process.argv;
if (!email || !role) {
    console.error('Usage: node update-user-role.js <email> <role>');
    process.exit(1);
}

updateUserRole(email, role);
