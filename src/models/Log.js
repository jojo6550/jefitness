const mongoose = require('mongoose');

const LogSchema = new mongoose.Schema({
    timestamp: {
        type: Date,
        required: true,
        default: Date.now
    },
    level: {
        type: String,
        required: true,
        enum: ['error', 'warn', 'info', 'http', 'debug']
    },
    category: {
        type: String,
        required: true,
        enum: ['general', 'admin', 'user', 'security', 'auth']
    },
    message: {
        type: String,
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    ip: {
        type: String,
        default: null
    },
    userAgent: {
        type: String,
        default: null
    },
    requestId: {
        type: String,
        default: null
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    stack: {
        type: String,
        default: null
    }
}, {
    timestamps: true
});

// Index for efficient querying
LogSchema.index({ timestamp: -1 });
LogSchema.index({ level: 1, timestamp: -1 });
LogSchema.index({ category: 1, timestamp: -1 });
LogSchema.index({ userId: 1, timestamp: -1 });

// Static method to clean old logs (keep only last 30 days)
LogSchema.statics.cleanOldLogs = function(daysToKeep = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    return this.deleteMany({
        timestamp: { $lt: cutoffDate }
    });
};

// Static method to get log statistics
LogSchema.statics.getLogStats = function(startDate, endDate) {
    return this.aggregate([
        {
            $match: {
                timestamp: {
                    $gte: startDate,
                    $lte: endDate
                }
            }
        },
        {
            $group: {
                _id: {
                    level: '$level',
                    category: '$category',
                    date: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: '$timestamp'
                        }
                    }
                },
                count: { $sum: 1 }
            }
        },
        {
            $sort: { '_id.date': -1, count: -1 }
        }
    ]);
};

module.exports = mongoose.model('Log', LogSchema);
