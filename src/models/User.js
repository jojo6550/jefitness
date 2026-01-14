const mongoose = require('mongoose');
const encrypt = require('mongoose-encryption');
const Subscription = require('./Subscription'); // <--- needed for methods

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

const SleepLogSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  hoursSlept: { type: Number, required: true, min: 0, max: 24 }
});

const UserSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address']
  },
  password: { type: String, required: true, minlength: [8, 'Password must be at least 8 characters long'] },
  lastLoggedIn: { type: Date },
  role: { type: String, enum: ['user', 'admin', 'trainer'], default: 'user' },
  dob: {
    type: Date,
    validate: {
      validator: v => v <= new Date() && v >= new Date('1900-01-01'),
      message: 'Date of birth must be in the past and after 1900'
    }
  },
  gender: { type: String, enum: ['male', 'female'] },
  phone: { type: String, match: [/^\+?[\d\s\-\(\)]+$/, 'Please enter a valid phone number'] },
  activityStatus: { type: String, enum: ['active', 'inactive', 'on-break'], default: 'active' },
  startWeight: { type: Number },
  currentWeight: { type: Number },
  goals: { type: String },
  reason: { type: String },
  nutritionLogs: [NutritionLogSchema],
  sleepLogs: { type: [SleepLogSchema], default: [] },
  schedule: {
    lastReset: { type: Date, default: Date.now },
    plans: [{ day: { type: String, required: true }, planTitles: [{ type: String }], notes: { type: String } }]
  },
  isEmailVerified: { type: Boolean, default: false },
  emailVerificationToken: { type: String },
  emailVerificationExpires: { type: Date },
  resetToken: { type: String },
  resetExpires: { type: Date },
  failedLoginAttempts: { type: Number, default: 0 },
  lockoutUntil: { type: Date },
  assignedPrograms: [{ programId: { type: mongoose.Schema.Types.ObjectId, ref: 'Program' }, assignedAt: { type: Date, default: Date.now } }],
  pushSubscription: { type: Object },
  hasMedical: { type: Boolean, default: false },
  medicalConditions: { type: String, default: null },
  medicalDocuments: [{
    filename: { type: String, required: true },
    originalName: { type: String },
    size: { type: Number },
    uploadedAt: { type: Date, default: Date.now },
    mimeType: { type: String }
  }],
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
  stripeCustomerId: { type: String, unique: true, sparse: true },
  billingEnvironment: { type: String, enum: ['test', 'production'], default: 'test' },
  stripeCheckoutSessionId: { type: String },
  auditLog: [{
    action: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    ipAddress: { type: String },
    userAgent: { type: String },
    details: { type: mongoose.Schema.Types.Mixed }
  }]
}, { timestamps: true });

// Indexes
UserSchema.index({ role: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ isEmailVerified: 1 });
UserSchema.index({ 'assignedPrograms.programId': 1 }, { sparse: true });

// --------------------
// Subscription Methods
// --------------------
UserSchema.methods.getActiveSubscription = async function() {
  if (!this._id) return null;
  return await Subscription.findOne({
    userId: this._id,
    status: 'active',
    currentPeriodEnd: { $gte: new Date() }
  }).sort({ currentPeriodEnd: -1 });
};

UserSchema.methods.hasActiveSubscription = async function() {
  const activeSub = await this.getActiveSubscription();
  return !!activeSub;
};

UserSchema.methods.getSubscriptionInfo = async function() {
  const activeSub = await this.getActiveSubscription();
  if (!activeSub) {
    return { hasSubscription: false, plan: null, expiresAt: null, message: 'No active subscription' };
  }
  return { hasSubscription: true, plan: activeSub.plan, expiresAt: activeSub.currentPeriodEnd, displayText: `Active Plan: ${activeSub.plan}` };
};

// --------------------
// Encryption
// --------------------
const encKey = process.env.ENCRYPTION_KEY;
if (encKey) {
  UserSchema.plugin(encrypt, {
    encryptionKey: encKey,
    signingKey: process.env.SIGNING_KEY || encKey,
    encryptedFields: [
      'medicalConditions', 'goals', 'reason', 'phone', 'dob', 'gender',
      'startWeight', 'currentWeight', 'nutritionLogs', 'sleepLogs'
    ],
    excludeFromEncryption: [
      'password', 'email', 'firstName', 'lastName', 'role',
      'isEmailVerified', 'createdAt', 'lastLoggedIn', 'activityStatus',
      'hasMedical', 'stripeCustomerId'
    ]
  });
}

module.exports = mongoose.model('User', UserSchema);
