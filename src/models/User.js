// models/User.js
const mongoose = require('mongoose');

const NutritionLogSchema = new mongoose.Schema({
    id: { type: Number, required: true },
    date: { type: String, required: true },
    mealType: { type: String, required: true },
    foodItem: { type: String, required: true },
    calories: { type: Number, required: true },
    protein: { type: Number, required: true },
    carbs: { type: Number, required: true },
    fats: { type: Number, required: true }
});

const UserSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: {
        type: String,
        required: [true, 'Email is required'], // Custom error message
        unique: true,
        lowercase: true, // Store emails in lowercase for consistency
        trim: true, // Remove leading/trailing whitespace
        // --- ADDED EMAIL REGEX VALIDATION ---
        match: [
            /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
            'Please fill a valid email address' // Custom error message for validation failure
        ]
    },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    lastLoggedIn: { type: Date },
    role: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
    },
    // Optional profile fields
    dob: { type: Date },
    gender: { type: String, enum: ['male', 'female'] }, // Removed 'other' and 'Prefer not to say'
    phone: { type: String },
    activityStatus: { type: String, enum: ['active', 'inactive', 'on-break'], default: 'active' },
    startWeight: { type: Number },
    currentWeight: { type: Number },
    goals: { type: String },
    reason: { type: String },

    // New nutrition logs field
    nutritionLogs: [NutritionLogSchema],

    // New sleep logs field
    sleepLogs: {
        type: [
            {
                date: { type: Date, required: true },
                hoursSlept: { type: Number, required: true, min: 0, max: 24 }
            }
        ],
        default: []
    },

    // New schedule field to store weekly plans and last reset timestamp
    schedule: {
        lastReset: { type: Date, default: Date.now },
        plans: [
            {
                day: { type: String, required: true }, // e.g., 'monday'
                planTitles: [{ type: String }], // Array of plan titles for the day
                notes: { type: String }
            }
        ]
    },

    // Email verification fields
    isEmailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String },
    emailVerificationExpires: { type: Date }
});

module.exports = mongoose.model('User', UserSchema);
