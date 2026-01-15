const mongoose = require('mongoose');

const UserActionLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  action: {
    type: String,
    required: true,
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  ipAddress: {
    type: String,
    index: true
  },
  userAgent: {
    type: String
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Compound indexes for efficient querying
UserActionLogSchema.index({ userId: 1, timestamp: -1 });
UserActionLogSchema.index({ userId: 1, action: 1, timestamp: -1 });
UserActionLogSchema.index({ action: 1, timestamp: -1 });

// Static method to get logs for a user with pagination
UserActionLogSchema.statics.getUserLogs = function(userId, limit = 50, skip = 0) {
  return this.find({ userId })
    .sort({ timestamp: -1 })
    .limit(limit)
    .skip(skip)
    .lean();
};

// Static method to log an action
UserActionLogSchema.statics.logAction = function(userId, action, ipAddress, userAgent, details = {}) {
  return this.create({
    userId,
    action,
    ipAddress,
    userAgent,
    details
  });
};

// Static method to clean old logs (keep only last N days)
UserActionLogSchema.statics.cleanOldLogs = function(daysToKeep = 365) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  return this.deleteMany({
    timestamp: { $lt: cutoffDate }
  });
};

module.exports = mongoose.model('UserActionLog', UserActionLogSchema);
