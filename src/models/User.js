// models/User.js
const mongoose = require('mongoose');

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
});

module.exports = mongoose.model('User', UserSchema);
