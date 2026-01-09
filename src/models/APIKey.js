const mongoose = require('mongoose');
const crypto = require('crypto');

const APIKeySchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true
    },
    hashedKey: {
        type: String,
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    scopes: [{
        type: String,
        enum: ['read', 'write', 'admin', 'medical', 'trainer'],
        required: true
    }],
    expiresAt: {
        type: Date,
        required: true
    },
    lastUsed: {
        type: Date
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true
});

// Index for efficient lookups
APIKeySchema.index({ hashedKey: 1 });
APIKeySchema.index({ userId: 1 });
APIKeySchema.index({ expiresAt: 1 });

// Pre-save middleware to hash the key
APIKeySchema.pre('save', function(next) {
    if (this.isModified('key')) {
        this.hashedKey = crypto.createHash('sha256').update(this.key).digest('hex');
    }
    next();
});

// Static method to generate a new API key
APIKeySchema.statics.generateKey = function() {
    return 'jk_' + crypto.randomBytes(32).toString('hex');
};

// Static method to find and validate API key
APIKeySchema.statics.findByKey = async function(key) {
    const hashedKey = crypto.createHash('sha256').update(key).digest('hex');
    const apiKey = await this.findOne({
        hashedKey,
        isActive: true,
        expiresAt: { $gt: new Date() }
    }).populate('userId');

    if (apiKey) {
        // Update last used timestamp
        apiKey.lastUsed = new Date();
        await apiKey.save();
    }

    return apiKey;
};

// Static method to rotate expired keys
APIKeySchema.statics.rotateExpiredKeys = async function() {
    const expiredKeys = await this.find({
        expiresAt: { $lt: new Date() },
        isActive: true
    });

    for (const key of expiredKeys) {
        key.isActive = false;
        await key.save();
    }

    return expiredKeys.length;
};

module.exports = mongoose.model('APIKey', APIKeySchema);
