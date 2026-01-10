const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const User = require('./models/User');

dotenv.config();

async function createUser(email, role, firstName = 'Default', lastName = 'User') {
    try {
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            console.log(`User with email ${email} already exists`);
            return;
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('password123', salt);

        // Create user
        const user = new User({
            firstName,
            lastName,
            email,
            password: hashedPassword,
            role,
            isEmailVerified: true,
            onboardingCompleted: true
        });

        await user.save();
        console.log(`Created ${role} user: ${email}`);
    } catch (error) {
        console.error(`Error creating user ${email}:`, error);
    }
}

async function seedUsers() {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
            family: 4
        });
        console.log('MongoDB Connected successfully');

        // Create trainer users
        await createUser('trainer1@jefitness.com', 'trainer', 'John', 'Doe');
        await createUser('trainer2@jefitness.com', 'trainer', 'Jane', 'Smith');
        await createUser('trainer3@jefitness.com', 'trainer', 'Mike', 'Johnson');

        // Create admin user if needed
        await createUser('admin@jefitness.com', 'admin', 'Admin', 'User');

        console.log('Users seeded successfully');
        mongoose.connection.close();
        console.log('Database connection closed');
    } catch (err) {
        console.error('Error seeding users:', err);
        process.exit(1);
    }
}

// Allow command line arguments
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.length >= 2) {
        // Create single user from command line
        const [email, role, firstName, lastName] = args;
        mongoose.connect(process.env.MONGO_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
            family: 4
        }).then(async () => {
            await createUser(email, role, firstName, lastName);
            mongoose.connection.close();
        }).catch(err => {
            console.error('Database connection error:', err);
            process.exit(1);
        });
    } else {
        // Seed default users
        seedUsers();
    }
}

module.exports = { createUser, seedUsers };
