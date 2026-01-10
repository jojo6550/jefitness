const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const ChatMessage = require('../models/Chat');

// GET /api/chat/history/:userId - Get chat history with a specific user
router.get('/history/:userId', auth, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const otherUserId = req.params.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    // Find messages between current user and the other user
    const messages = await ChatMessage.find({
      $or: [
        { senderId: currentUserId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: currentUserId }
      ]
    })
    .sort({ timestamp: -1 })
    .limit(limit)
    .skip((page - 1) * limit)
    .populate('senderId', 'firstName lastName email role')
    .populate('receiverId', 'firstName lastName email role');

    // Mark messages as read if they were sent to current user
    await ChatMessage.updateMany(
      { senderId: otherUserId, receiverId: currentUserId, isRead: false },
      { isRead: true }
    );

    res.json({
      messages: messages.reverse(), // Reverse to show oldest first
      pagination: {
        page,
        limit,
        hasMore: messages.length === limit
      }
    });

    console.log(`Chat action logged: History retrieved for conversation between ${currentUserId} and ${otherUserId}`);

  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/chat/conversations - Get list of conversations for current user
router.get('/conversations', auth, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const currentUserRole = req.user.role;

    // Find all unique conversation partners
    const conversations = await ChatMessage.aggregate([
      {
        $match: {
          $or: [
            { senderId: currentUserId },
            { receiverId: currentUserId }
          ]
        }
      },
      {
        $sort: { timestamp: -1 }
      },
      {
        $group: {
          _id: {
            $cond: {
              if: { $eq: ['$senderId', currentUserId] },
              then: '$receiverId',
              else: '$senderId'
            }
          },
          lastMessage: { $first: '$$ROOT' },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$receiverId', currentUserId] },
                    { $eq: ['$isRead', false] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'partner'
        }
      },
      {
        $unwind: '$partner'
      },
      {
        $project: {
          partnerId: '$_id',
          partnerName: {
            $concat: ['$partner.firstName', ' ', '$partner.lastName']
          },
          partnerEmail: '$partner.email',
          partnerRole: '$partner.role',
          lastMessage: 1,
          unreadCount: 1
        }
      }
    ]);

    res.json({ conversations });

    console.log(`Chat action logged: Conversations retrieved for user ${currentUserId}`);

  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// POST /api/chat/mark-read/:userId - Mark all messages from a user as read
router.post('/mark-read/:userId', auth, async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const otherUserId = req.params.userId;

    const result = await ChatMessage.updateMany(
      { senderId: otherUserId, receiverId: currentUserId, isRead: false },
      { isRead: true }
    );

    res.json({
      success: true,
      markedAsRead: result.modifiedCount
    });

    console.log(`Chat action logged: ${result.modifiedCount} messages marked as read for user ${currentUserId} from ${otherUserId}`);

  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

// GET /api/chat/unread-count - Get total unread message count
router.get('/unread-count', auth, async (req, res) => {
  try {
    const currentUserId = req.user.id;

    const count = await ChatMessage.countDocuments({
      receiverId: currentUserId,
      isRead: false
    });

    res.json({ unreadCount: count });

  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({ msg: 'Server error' });
  }
});

module.exports = router;
