const mongoose = require('mongoose');
const encrypt = require('mongoose-encryption');
const bcrypt = require('bcryptjs');

const WorkoutSetSchema = new mongoose.Schema({
  setNumber: { type: Number, required: true, min: 1 },
  reps: { type: Number, required: true, min: 0 },
  weight: { type: Number, required: true, min: 0 },
  rpe: { type: Number, min: 1, max: 10 },
  completed: { type: Boolean, default: true }
}, { _id: false });

const WorkoutExerciseSchema = new mongoose.Schema({
  exerciseName: { type: String, required: true, trim: true },
  sets: { type: [WorkoutSetSchema], required: true, validate: [arr => arr.length > 0, 'At least one set is required'] }
}, { _id: false });

const WorkoutLogSchema = new mongoose.Schema({
  date: { type: Date, required: true, default: Date.now },
  programId: { type: mongoose.Schema.Types.ObjectId, ref: 'Program' },
  workoutName: { type: String, required: true, trim: true },
  exercises: { type: [WorkoutExerciseSchema], required: true, validate: [arr => arr.length > 0, 'At least one exercise is required'] },
  totalVolume: { type: Number, default: 0 },
  duration: { type: Number, min: 0 },
  notes: { type: String, trim: true, maxlength: 500 },
  deletedAt: { type: Date }
});

// Virtual to calculate total volume on save
WorkoutLogSchema.pre('save', function(next) {
  if (this.exercises) {
    this.totalVolume = this.exercises.reduce((total, exercise) => {
      const exerciseVolume = exercise.sets.reduce((setTotal, set) => {
        return setTotal + (set.reps * set.weight);
      }, 0);
      return total + exerciseVolume;
    }, 0);
  }
  next();
});

const UserSchema = new mongoose.Schema({
  firstName: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: [100, 'First name too long']
  },
  lastName: { 
    type: String, 
    required: true,
    trim: true,
    maxlength: [100, 'Last name too long']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: [255, 'Email too long'],
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address']
  },
  password: { 
    type: String, 
    required: true, 
    minlength: [8, 'Password must be at least 8 characters long'],
    select: false // SECURITY: Don't include password in queries by default
  },
  // SECURITY: Token versioning for invalidating all user tokens on password change or security events
  // Increment this value to invalidate all existing JWTs for this user
  tokenVersion: {
    type: Number,
    default: 0,
    select: false // SECURITY: Don't expose token version in regular queries
  },
  lastLoggedIn: { type: Date },
  role: { 
    type: String, 
    enum: ['user', 'admin', 'trainer'], 
    default: 'user',
    // SECURITY: Prevent role escalation via mass assignment
    immutable: false
  },
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
  height: { type: Number },
  weight: { type: Number },
  goals: { type: String },
  reason: { type: String },
  workoutLogs: { type: [WorkoutLogSchema], default: [] },
  schedule: {
    lastReset: { type: Date, default: Date.now },
    plans: [{ day: { type: String, required: true }, planTitles: [{ type: String }], notes: { type: String } }]
  },
  isEmailVerified: { type: Boolean, default: false },
  emailVerificationToken: { type: String },
  emailVerificationExpires: { type: Date },
  passwordResetToken: { type: String },
  resetPasswordExpires: { type: Date },
  failedLoginAttempts: { type: Number, default: 0 },
  lockoutUntil: { type: Date },
  assignedPrograms: [{ programId: { type: mongoose.Schema.Types.ObjectId, ref: 'Program' }, assignedAt: { type: Date, default: Date.now } }],
  purchasedPrograms: [{
    programId: { type: mongoose.Schema.Types.ObjectId, ref: 'Program' },
    purchasedAt: { type: Date, default: Date.now },
    stripeCheckoutSessionId: { type: String },
    stripePriceId: { type: String },
    amountPaid: { type: Number }
  }],
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
  }],
  dataSubjectRights: {
    accessRequested: { type: Boolean, default: false },
    accessRequestedAt: { type: Date },
    accessProvidedAt: { type: Date },
    rectificationRequested: { type: Boolean, default: false },
    rectificationRequestedAt: { type: Date },
    rectificationCompletedAt: { type: Date },
    erasureRequested: { type: Boolean, default: false },
    erasureRequestedAt: { type: Date },
    erasureCompletedAt: { type: Date },
    portabilityRequested: { type: Boolean, default: false },
    portabilityRequestedAt: { type: Date },
    portabilityCompletedAt: { type: Date },
    objectionRequested: { type: Boolean, default: false },
    objectionRequestedAt: { type: Date },
    objectionCompletedAt: { type: Date },
    restrictionRequested: { type: Boolean, default: false },
    restrictionRequestedAt: { type: Date },
    restrictionCompletedAt: { type: Date }
  },
  privacySettings: {
    marketingEmails: { type: Boolean, default: false },
    dataAnalytics: { type: Boolean, default: true },
    thirdPartySharing: { type: Boolean, default: false }
  },
  dataDeletedAt: { type: Date },
  deletionReason: { type: String }
}, { timestamps: true });

// --------------------
// Password Hashing
// --------------------
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// --------------------
// Password Comparison
// --------------------
UserSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (err) {
    throw err;
  }
};

// --------------------
// OTP Methods
// --------------------
UserSchema.methods.generateOTP = function() {
  return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit
};

UserSchema.methods.hashOTP = async function(otp) {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(otp, salt);
};

UserSchema.methods.compareOTP = async function(candidateOTP) {
  if (!this.emailVerificationToken || !this.emailVerificationExpires) {
    return false;
  }
  if (this.emailVerificationExpires < new Date()) {
    return false; // Expired
  }
  return await bcrypt.compare(candidateOTP, this.emailVerificationToken);
};


// Indexes
UserSchema.index({ role: 1 });
UserSchema.index({ createdAt: -1 });
UserSchema.index({ isEmailVerified: 1 });
UserSchema.index({ 'assignedPrograms.programId': 1 }, { sparse: true });
UserSchema.index({ 'purchasedPrograms.programId': 1 }, { sparse: true });
UserSchema.index({ 'workoutLogs.date': -1 }, { sparse: true });
UserSchema.index({ 'workoutLogs.exercises.exerciseName': 1 }, { sparse: true });

// --------------------
// Subscription Methods (Lazy Loading)
// --------------------
UserSchema.methods.getActiveSubscription = async function() {
  const Subscription = require('./Subscription');
  if (!this._id) return null;
  // Use DB status as the source of truth — do not filter on currentPeriodEnd.
  // Period dates can be stale (e.g. Stripe test mode compresses billing cycles),
  // so date-based expiry checks can produce false negatives for active subscriptions.
  const ACTIVE_STATUSES = ['active', 'trialing', 'past_due', 'paused', 'incomplete'];
  return await Subscription.findOne({
    userId: this._id,
    status: { $in: ACTIVE_STATUSES }
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
const { getEncryptionConfig, isEncryptionEnabled } = require('../utils/encryptionConfig');

if (isEncryptionEnabled()) {
  try {
    const encryptionConfig = getEncryptionConfig();
    if (encryptionConfig && encryptionConfig.encryptionKey) {
      try {
        const key = encryptionConfig.encryptionKey;
        let keyBuffer;
        // Support both hex (64 chars) and base64 encryption keys
        if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
          keyBuffer = Buffer.from(key, 'hex');
        } else {
          keyBuffer = Buffer.from(key, 'base64');
        }

        if (keyBuffer.length === 32) {
          UserSchema.plugin(encrypt, encryptionConfig);
        } else {
          console.warn(`⚠️ User model: Encryption key must be exactly 32 bytes. Found ${keyBuffer.length} bytes.`);
        }
      } catch (e) {
        console.warn('⚠️ User model: Invalid encryption key format. Encryption disabled for this model.');
      }
    }
  } catch (err) {
    console.error('Failed to initialize encryption plugin for User model:', err.message);
  }
}

module.exports = mongoose.model('User', UserSchema);
