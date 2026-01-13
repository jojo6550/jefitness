const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const User = require('../models/User');
const { auth, blacklistToken } = require('../middleware/auth');

const { logger } = require('../services/logger');

// Middleware to check if user is admin
const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Access denied. Admin role required.' });
    }
    next();
};

// POST /api/notifications - Send notification (Admin only)
router.post('/', [auth, requireAdmin], async (req, res) => {
    try {
        const { title, message, type, priority, isBroadcast, selectedUsers } = req.body;

        if (!title || !message) {
            return res.status(400).json({ msg: 'Title and message are required' });
        }

        let recipients = [];

        if (isBroadcast) {
            // Get all users except admins
            const users = await User.find({ role: 'user' }).select('_id');
            recipients = users.map(user => user._id);
        } else if (selectedUsers && selectedUsers.length > 0) {
            recipients = selectedUsers;
        } else {
            return res.status(400).json({ msg: 'Recipients must be specified or broadcast enabled' });
        }

        const notification = new Notification({
            title,
            message,
            type: type || 'general-announcement',
            priority: priority || 'medium',
            sender: req.user.id,
            recipients,
            isBroadcast
        });

        await notification.save();

        // Send push notifications if users have subscriptions
        await sendPushNotifications(notification, recipients);

        logger.info(`Notification sent by admin ${req.user.email}: ${title}`);

        res.json({
            msg: 'Notification sent successfully',
            notification: {
                id: notification._id,
                title: notification.title,
                message: notification.message,
                type: notification.type,
                priority: notification.priority,
                sentAt: notification.sentAt,
                recipientCount: recipients.length
            }
        });

    } catch (err) {
        logger.error('Error sending notification:', err);
        res.status(500).json({ msg: 'Server error' });
    }
});

// GET /api/notifications - Get user's notifications
router.get('/', auth, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        const notifications = await Notification.find({
            $or: [
                { recipients: req.user.id },
                { isBroadcast: true }
            ]
        })
        .populate('sender', 'firstName lastName email')
        .sort({ sentAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

        const total = await Notification.countDocuments({
            $or: [
                { recipients: req.user.id },
                { isBroadcast: true }
            ]
        });

        // Mark notifications as read
        const unreadIds = notifications
            .filter(n => !n.readBy.some(read => read.user.toString() === req.user.id))
            .map(n => n._id);

        if (unreadIds.length > 0) {
            await Notification.updateMany(
                { _id: { $in: unreadIds } },
                {
                    $push: {
                        readBy: {
                            user: req.user.id,
                            readAt: new Date()
                        }
                    }
                }
            );
        }

        res.json({
            notifications,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (err) {
        logger.error('Error fetching notifications:', err);
        res.status(500).json({ msg: 'Server error' });
    }
});

// GET /api/notifications/admin - Get all notifications for admin
router.get('/admin', [auth, requireAdmin], async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const notifications = await Notification.find({})
            .populate('sender', 'firstName lastName email')
            .sort({ sentAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await Notification.countDocuments();

        res.json({
            notifications,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });

    } catch (err) {
        logger.error('Error fetching admin notifications:', err);
        res.status(500).json({ msg: 'Server error' });
    }
});

// POST /api/notifications/subscribe - Subscribe to push notifications
router.post('/subscribe', auth, async (req, res) => {
    try {
        const { subscription } = req.body;

        if (!subscription) {
            return res.status(400).json({ msg: 'Subscription object is required' });
        }

        await User.findByIdAndUpdate(req.user.id, {
            pushSubscription: subscription
        });

        res.json({ msg: 'Push subscription saved successfully' });

    } catch (err) {
        logger.error('Error saving push subscription:', err);
        res.status(500).json({ msg: 'Server error' });
    }
});

// Helper function to send push notifications
async function sendPushNotifications(notification, recipientIds) {
    try {
        // Get users with push subscriptions
        const users = await User.find({
            _id: { $in: recipientIds },
            pushSubscription: { $exists: true }
        }).select('pushSubscription');

        const webpush = require('web-push');

        // Configure web-push with VAPID keys (you'll need to set these in environment variables)
        if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
            webpush.setVapidDetails(
                'mailto:' + process.env.ADMIN_EMAIL,
                process.env.VAPID_PUBLIC_KEY,
                process.env.VAPID_PRIVATE_KEY
            );

            // Send push notifications
            const pushPromises = users.map(user => {
                if (user.pushSubscription) {
                    return webpush.sendNotification(
                        user.pushSubscription,
                        JSON.stringify({
                            title: notification.title,
                            body: notification.message,
                            icon: '/favicons/android-chrome-192x192.png',
                            badge: '/favicons/favicon-32x32.png',
                            data: {
                                notificationId: notification._id,
                                type: notification.type,
                                priority: notification.priority
                            }
                        })
                    ).catch(err => {
                        logger.warn('Push notification failed for user:', err);
                    });
                }
            });

            await Promise.all(pushPromises);
        }

    } catch (err) {
        logger.error('Error sending push notifications:', err);
    }
}

module.exports = router;
