const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    message: {
        type: String,
        required: true,
        trim: true,
        maxlength: 500
    },
    type: {
        type: String,
        enum: ['general-announcement', 'admin-alert', 'appointment-reminder', 'workout-update'],
        default: 'general-announcement'
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high', 'urgent'],
        default: 'medium'
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    recipients: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    isBroadcast: {
        type: Boolean,
        default: false
    },
    sentAt: {
        type: Date,
        default: Date.now
    },
    readBy: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        readAt: {
            type: Date,
            default: Date.now
        }
    }],
    status: {
        type: String,
        enum: ['sent', 'failed'],
        default: 'sent'
    }
});

// Index for efficient queries
NotificationSchema.index({ sentAt: -1 });
NotificationSchema.index({ recipients: 1 });
NotificationSchema.index({ 'readBy.user': 1 });

module.exports = mongoose.model('Notification', NotificationSchema);
