// models/User.js
const mongoose = require('mongoose');
const encrypt = require('mongoose-encryption');

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
    password: {
        type: String,
        required: true,
        minlength: [8, 'Password must be at least 8 characters long']
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    lastLoggedIn: { type: Date },
    role: {
        type: String,
        enum: ['user', 'admin', 'trainer'],
        default: 'user'
    },
    // Optional profile fields
    dob: {
        type: Date,
        validate: {
            validator: function(value) {
                return value <= new Date() && value >= new Date('1900-01-01');
            },
            message: 'Date of birth must be in the past and after 1900'
        }
    },
    gender: { type: String, enum: ['male', 'female'] }, // Removed 'other' and 'Prefer not to say'
    phone: {
        type: String,
        match: [/^\+?[\d\s\-\(\)]+$/, 'Please enter a valid phone number']
    },
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
    emailVerificationExpires: { type: Date },

    // Password reset fields
    resetToken: { type: String },
    resetExpires: { type: Date },

    // Account lockout fields
    failedLoginAttempts: { type: Number, default: 0 },
    lockoutUntil: { type: Date },

    // Assigned Programs for visibility control
    assignedPrograms: [
        {
            programId: { type: mongoose.Schema.Types.ObjectId, ref: 'Program' },
            assignedAt: { type: Date, default: Date.now }
        }
    ],
 
    // Push notification subscription
    pushSubscription: { type: Object },

    // Medical documents and health information
    hasMedical: { type: Boolean, default: false },
    medicalConditions: { type: String, default: null },
    medicalDocuments: [
        {
            filename: { type: String, required: true },
            originalName: { type: String },
            size: { type: Number },
            uploadedAt: { type: Date, default: Date.now },
            mimeType: { type: String }
        }
    ],

    // Onboarding tracking
    onboardingCompleted: { type: Boolean, default: false },
    onboardingCompletedAt: { type: Date },

    // GDPR/HIPAA Compliance Fields
    dataProcessingConsent: {
        given: { type: Boolean, default: false },
        givenAt: { type: Date },
        version: { type: String, default: '1.0' },
        ipAddress: { type: String },
        userAgent: { type: String }
    },

    healthDataConsent: {
        given: { type: Boolean, default: false },
        givenAt: { type: Date },
        version: { type: String, default: '1.0' },
        ipAddress: { type: String },
        userAgent: { type: String },
        purpose: { type: String, enum: ['fitness_tracking', 'medical_monitoring', 'research'], default: 'fitness_tracking' }
    },

    marketingConsent: {
        given: { type: Boolean, default: false },
        givenAt: { type: Date },
        withdrawnAt: { type: Date },
        version: { type: String, default: '1.0' },
        ipAddress: { type: String },
        userAgent: { type: String }
    },

    dataRetentionOverride: {
        requested: { type: Boolean, default: false },
        requestedAt: { type: Date },
        reason: { type: String },
        approved: { type: Boolean, default: false },
        approvedAt: { type: Date },
        approvedBy: { type: String }
    },

    dataSubjectRights: {
        accessRequested: { type: Boolean, default: false },
        accessRequestedAt: { type: Date },
        accessProvidedAt: { type: Date },
        rectificationRequested: { type: Boolean, default: false },
        rectificationRequestedAt: { type: Date },
        erasureRequested: { type: Boolean, default: false },
        erasureRequestedAt: { type: Date },
        erasureCompletedAt: { type: Date },
        portabilityRequested: { type: Boolean, default: false },
        portabilityRequestedAt: { type: Date },
        portabilityCompletedAt: { type: Date },
        objectionRequested: { type: Boolean, default: false },
        objectionRequestedAt: { type: Date },
        restrictionRequested: { type: Boolean, default: false },
        restrictionRequestedAt: { type: Date }
    },

    auditLog: [{
        action: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        ipAddress: { type: String },
        userAgent: { type: String },
        details: { type: mongoose.Schema.Types.Mixed }
    }],

    // ===== STRIPE SUBSCRIPTION FIELDS =====
    // Stripe customer ID - links user to Stripe account
    stripeCustomerId: { type: String, unique: true, sparse: true },
    
    // Current subscription details - Stripe is source of truth
    stripeSubscriptionId: { type: String }, // Stripe subscription ID
    subscriptionStatus: {
        type: String,
        enum: ['active', 'inactive', 'canceled', 'past_due', 'unpaid', 'trialing', 'expired', 'cancelled', 'free'],
        default: 'inactive'
    },
    subscriptionType: { type: String }, // e.g., "1 Month", "3 Months", "6 Months", "12 Months"
    stripePriceId: { type: String }, // Stripe Price ID for current plan
    
    // Subscription period tracking - from Stripe webhooks
    currentPeriodStart: { type: Date },
    currentPeriodEnd: { type: Date },
    
    // Legacy fields for backward compatibility
    subscriptionPlan: { 
        type: String,
        enum: ['free', '1-month', '3-month', '6-month', '12-month'],
        default: 'free'
    },
    
    // Billing environment tracking
    billingEnvironment: {
        type: String,
        enum: ['test', 'production'],
        default: 'test'
    },
    
    // Subscription metadata
    stripeCheckoutSessionId: { type: String },
    
    // Cancellation tracking
    cancelAtPeriodEnd: { type: Boolean, default: false }
});

// Database indexes for optimization
UserSchema.index({ role: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ isEmailVerified: 1 });
UserSchema.index({ 'assignedPrograms.programId': 1 });
UserSchema.index({ stripeSubscriptionId: 1 });
UserSchema.index({ subscriptionStatus: 1 });
UserSchema.index({ currentPeriodEnd: 1 }); // For efficient subscription expiry checks

/**
 * Instance method to check if user has an active subscription
 * @returns {boolean} True if subscription is active and not expired
 */
UserSchema.methods.hasActiveSubscription = function() {
    // Check subscription status
    if (this.subscriptionStatus !== 'active' && this.subscriptionStatus !== 'trialing') {
        return false;
    }
    
    // Check if subscription period is still valid
    if (this.currentPeriodEnd && new Date() > this.currentPeriodEnd) {
        return false;
    }
    
    return true;
};

/**
 * Instance method to get formatted subscription info for display
 * @returns {object} Formatted subscription information
 */
UserSchema.methods.getSubscriptionInfo = function() {
    if (!this.hasActiveSubscription()) {
        return {
            hasSubscription: false,
            status: 'inactive',
            message: 'No active subscription'
        };
    }
    
    return {
        hasSubscription: true,
        status: this.subscriptionStatus,
        type: this.subscriptionType || 'Unknown',
        displayText: `Active Plan: ${this.subscriptionType || 'Unknown'}`,
        expiresAt: this.currentPeriodEnd,
        renewsAt: this.cancelAtPeriodEnd ? null : this.currentPeriodEnd
    };
};

// Encrypt sensitive fields
const encKey = process.env.ENCRYPTION_KEY;
if (encKey) {
    UserSchema.plugin(encrypt, {
        encryptionKey: encKey,
        signingKey: process.env.SIGNING_KEY || encKey,
        encryptedFields: [
            'medicalConditions',
            'goals',
            'reason',
            'phone',
            'dob',
            'gender',
            'startWeight',
            'currentWeight',
            'nutritionLogs',
            'sleepLogs'
        ],
        excludeFromEncryption: [
            'password', // Already hashed
            'email',
            'firstName',
            'lastName',
            'role',
            'isEmailVerified',
            'createdAt',
            'lastLoggedIn',
            'activityStatus',
            'hasMedical',
            'onboardingCompleted',
            'onboardingCompletedAt',
            'subscriptionStatus',
            'subscriptionType',
            'stripeSubscriptionId',
            'stripeCustomerId'
        ]
    });
}

module.exports = mongoose.model('User', UserSchema);
