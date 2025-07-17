// models/User.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    // --- NEW ROLE FIELD ---
    role: {
        type: String,
        enum: ['user', 'admin'], // Define allowed roles
        default: 'user' // Default role for new signups
    },
    // Existing profile fields
    dob: { type: Date }, // Date of Birth
    gender: { type: String, enum: ['male', 'female', 'other', 'Prefer not to say'] },
    phone: { type: String },
    activityStatus: { type: String, enum: ['active', 'inactive', 'on-break'], default: 'active' },
    startWeight: { type: Number }, // in lbs
    currentWeight: { type: Number }, // in lbs
    goals: { type: String }, // Fitness Goals
    reason: { type: String }, // Reason for Joining
    profilePicture: { type: String, default: './images/default-avatar.png' } // URL to profile image
});

module.exports = mongoose.model('User', UserSchema);
