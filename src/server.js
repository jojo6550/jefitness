const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const cron = require('node-cron');
const helmet = require('helmet');
const path = require('path');
const morgan = require('morgan');
const WebSocket = require('ws');

dotenv.config();

const PORT = process.env.PORT || 5000;

const app = express();

// Initialize cache service
const cacheService = require('./services/cache');
//cacheService.connect();

// Trust proxy for accurate IP identification (required for Render deployment)
app.set('trust proxy', 1);

// Import security middleware
const securityHeaders = require('./middleware/securityHeaders');
const { corsOptions } = require('./middleware/corsConfig');
const { sanitizeInput } = require('./middleware/sanitizeInput');
const { requestLogger } = require('./middleware/requestLogger');
const { errorHandler } = require('./middleware/errorHandler');
const { requireDataProcessingConsent, requireHealthDataConsent, checkDataRestriction } = require('./middleware/consent');

// -----------------------------
// Enhanced Security Headers with Helmet
// -----------------------------
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'", 
        "https://cdn.jsdelivr.net",
        "https://cdnjs.cloudflare.com"
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://cdn.jsdelivr.net",
        "https://fonts.googleapis.com",
        "https://cdnjs.cloudflare.com"
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
        "https://cdn.jsdelivr.net"
      ],
      connectSrc: [
        "'self'",
        "https://api.mailjet.com",
        "https://cdn.jsdelivr.net"
      ],
      imgSrc: [
        "'self'",
        "data:",
        "https://via.placeholder.com",
        "https://cdn.jsdelivr.net"
      ],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
      blockAllMixedContent: []
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  frameguard: { action: "deny" },
  permittedCrossDomainPolicies: { permittedPolicies: "none" }
}));

// -----------------------------
// Middleware
// -----------------------------
// Request logging
app.use(requestLogger);

// Security headers
app.use(securityHeaders);

// Logging
app.use(morgan('combined'));

// Body parsing
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ limit: '10kb', extended: false }));

// Input sanitization
app.use(sanitizeInput);

// CORS with enhanced security
app.use(cors(corsOptions));

// Cache control middleware
const cacheControl = require('./middleware/cacheControl');
app.use(cacheControl);

// Cache version utility
const { getFileHash, invalidateCache } = require('./utils/cacheVersion');

// Serve static files
app.use(express.static("public"));

// -----------------------------
// MongoDB Connection
// -----------------------------
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      family: 4
    });
    console.log('MongoDB Connected successfully');

    mongoose.set('debug', (collectionName, method, query, doc) => {
      const start = Date.now();
      setImmediate(() => {
        const duration = Date.now() - start;
        if (duration > 100) {
          console.log(`Slow Query: ${collectionName}.${method} took ${duration}ms - Query: ${JSON.stringify(query)}`);
        }
      });
    });

    mongoose.connection.on('disconnected', () => console.log('MongoDB disconnected'));
    mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected'));
    mongoose.connection.on('error', (err) => console.error('MongoDB connection error:', err));

  } catch (err) {
    console.error(`Error: ${JSON.stringify(err)} | Context: MongoDB Connection`);
    process.exit(1);
  }
};
if (process.env.NODE_ENV !== 'test') {
  connectDB();
  invalidateCache();
}

// -----------------------------
// Rate Limiters
// -----------------------------
const { apiLimiter } = require('./middleware/rateLimiter');

// -----------------------------
// Routes with API Versioning
// -----------------------------
const auth = require('./middleware/auth');
const versioning = require('./middleware/versioning');

app.use('/api/v1/auth', versioning, require('./routes/auth'));
app.use('/api/v1/sleep', auth, requireDataProcessingConsent, requireHealthDataConsent, checkDataRestriction, apiLimiter, versioning, require('./routes/sleep'));
app.use('/api/v1/clients', auth, requireDataProcessingConsent, checkDataRestriction, apiLimiter, versioning, require('./routes/clients'));
app.use('/api/v1/logs', auth, requireDataProcessingConsent, requireHealthDataConsent, checkDataRestriction, apiLimiter, versioning, require('./routes/logs'));
app.use('/api/v1/appointments', auth, requireDataProcessingConsent, checkDataRestriction, apiLimiter, versioning, require('./routes/appointments'));
app.use('/api/v1/users', auth, requireDataProcessingConsent, checkDataRestriction, apiLimiter, versioning, require('./routes/users'));
app.use('/api/v1/nutrition', auth, requireDataProcessingConsent, requireHealthDataConsent, checkDataRestriction, apiLimiter, versioning, require('./routes/nutrition'));
app.use('/api/v1/notifications', auth, requireDataProcessingConsent, checkDataRestriction, apiLimiter, versioning, require('./routes/notifications'));
app.use('/api/v1/programs', apiLimiter, versioning, require('./routes/programs'));
app.use('/api/v1/cart', auth, requireDataProcessingConsent, checkDataRestriction, apiLimiter, versioning, require('./routes/cart'));
app.use('/api/v1/orders', auth, requireDataProcessingConsent, checkDataRestriction, apiLimiter, versioning, require('./routes/orders'));
app.use('/api/v1/medical-documents', auth, requireDataProcessingConsent, requireHealthDataConsent, checkDataRestriction, apiLimiter, versioning, require('./routes/medical-documents'));
app.use('/api/v1/chat', auth, requireDataProcessingConsent, sanitizeInput, checkDataRestriction, apiLimiter, versioning, require('./routes/chat'));
app.use('/api/v1/trainer', auth, requireDataProcessingConsent, checkDataRestriction, apiLimiter, versioning, require('./routes/trainer'));
app.use('/api/v1/gdpr', auth, requireDataProcessingConsent, checkDataRestriction, apiLimiter, versioning, require('./routes/gdpr'));

// Backward compatibility - redirect old routes to v1
app.use('/api/auth', (req, res) => res.redirect(307, '/api/v1/auth' + req.path.replace('/api/auth', '')));
app.use('/api/sleep', auth, (req, res) => res.redirect(307, '/api/v1/sleep' + req.path.replace('/api/sleep', '')));
app.use('/api/clients', auth, (req, res) => res.redirect(307, '/api/v1/clients' + req.path.replace('/api/clients', '')));
app.use('/api/logs', auth, (req, res) => res.redirect(307, '/api/v1/logs' + req.path.replace('/api/logs', '')));
app.use('/api/appointments', auth, (req, res) => res.redirect(307, '/api/v1/appointments' + req.path.replace('/api/appointments', '')));
app.use('/api/users', auth, (req, res) => res.redirect(307, '/api/v1/users' + req.path.replace('/api/users', '')));
app.use('/api/nutrition', auth, (req, res) => res.redirect(307, '/api/v1/nutrition' + req.path.replace('/api/nutrition', '')));
app.use('/api/notifications', auth, (req, res) => res.redirect(307, '/api/v1/notifications' + req.path.replace('/api/notifications', '')));
app.use('/api/programs', (req, res) => res.redirect(307, '/api/v1/programs' + req.path.replace('/api/programs', '')));
app.use('/api/cart', auth, (req, res) => res.redirect(307, '/api/v1/cart' + req.path.replace('/api/cart', '')));
app.use('/api/orders', auth, (req, res) => res.redirect(307, '/api/v1/orders' + req.path.replace('/api/orders', '')));
app.use('/api/medical-documents', auth, (req, res) => res.redirect(307, '/api/v1/medical-documents' + req.path.replace('/api/medical-documents', '')));
app.use('/api/trainer', auth, (req, res) => res.redirect(307, '/api/v1/trainer' + req.path.replace('/api/trainer', '')));

// Serve frontend for SPA routes
app.use((req, res) => {
  res.sendFile(path.resolve(__dirname, '..', 'public', 'index.html'));
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: 'Endpoint not found',
      path: req.path,
      method: req.method
    }
  });
});

// -----------------------------
// Global Error Handling Middleware
// MUST be last middleware in the chain
// -----------------------------
app.use(errorHandler);

// -----------------------------
// Cleanup Job (Unverified Users)
// -----------------------------
const User = require('./models/User');
cron.schedule(process.env.CRON_SCHEDULE || '*/30 * * * *', async () => {
  const maxRetries = 3;
  let attempt = 0;

  while (attempt < maxRetries) {
    try {
      const cleanupTime = parseInt(process.env.CLEANUP_TIME, 10) || 30;
      const thirtyMinutesAgo = new Date(Date.now() - cleanupTime * 60 * 1000);
      const result = await User.deleteMany({
        isEmailVerified: false,
        createdAt: { $lt: thirtyMinutesAgo }
      });

      if (result.deletedCount > 0) {
        console.log(`Cleanup job: Deleted ${result.deletedCount} unverified accounts older than ${cleanupTime} minutes`);
      }
      break;
    } catch (err) {
      attempt++;
      if (attempt >= maxRetries) {
        console.error(`Cleanup job failed after ${attempt} attempts: ${err.stack}`);
      } else {
        console.warn(`Cleanup attempt ${attempt} failed, retrying...`);
        await new Promise(resolve => setTimeout(resolve, attempt * 2000));
      }
    }
  }
});

// -----------------------------
// Backup and Archiving Jobs
// -----------------------------
cron.schedule('0 2 * * *', () => {
  console.log('Starting daily database backup...');
  const { exec } = require('child_process');
  exec('node scripts/backup.js', (error, stdout, stderr) => {
    if (error) console.error(`Backup failed: ${error.message}`);
    if (stderr) console.error(`Backup stderr: ${stderr}`);
    console.log(`Backup completed: ${stdout}`);
  });
});

cron.schedule('0 3 1 * *', () => {
  console.log('Starting monthly data archiving...');
  const { exec } = require('child_process');
  exec('node scripts/archive.js', (error, stdout, stderr) => {
    if (error) console.error(`Archiving failed: ${error.message}`);
    if (stderr) console.error(`Archiving stderr: ${stderr}`);
    console.log(`Archiving completed: ${stdout}`);
  });
});

// -----------------------------
// GDPR/HIPAA Compliance Jobs
// -----------------------------
cron.schedule('0 1 1 */6 *', async () => {
  console.log('Starting bi-annual data retention cleanup...');
  try {
    const complianceService = require('./services/compliance');
    const result = await complianceService.performDataRetentionCleanup();
    console.log('Data retention cleanup completed:', result);
  } catch (error) {
    console.error('Data retention cleanup failed:', error.message);
  }
});

// -----------------------------
// WebSocket Server Setup for Chat
// -----------------------------
const ChatMessage = require('./models/Chat');

// Only start server if this file is run directly (not required in tests)
if (require.main === module) {
  const server = app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
  const wss = new WebSocket.Server({ server });

// Store connected clients with their user info
const clients = new Map();

// Message limiting: track consecutive user messages per conversation
const messageLimits = new Map(); // key: 'userId-receiverId', value: { count: number, lastReplyFromReceiver: boolean }

wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection');

  // Extract token from query params
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  if (!token) {
    ws.close(1008, 'Authentication required');
    return;
  }

  // Verify token and get user info (simplified - in real app use proper JWT verification)
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.user.id;
    const userRole = decoded.user.role;

    // Store client connection
    clients.set(userId, { ws, userId, userRole });

    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data);
        await handleChatMessage(ws, userId, userRole, message);
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    ws.on('close', () => {
      console.log(`WebSocket connection closed for user ${userId}`);
      clients.delete(userId);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for user ${userId}:`, error);
      clients.delete(userId);
    });

  } catch (error) {
    console.error('WebSocket authentication failed:', error);
    ws.close(1008, 'Invalid token');
  }
});

async function handleChatMessage(ws, senderId, senderRole, message) {
  const { type, receiverId, receiverRole, content } = message;

  if (type !== 'chat_message') return;

  // Validate receiver
  if (!receiverId || !receiverRole) {
    ws.send(JSON.stringify({ type: 'error', message: 'Receiver information required' }));
    return;
  }

  // Determine message type
  let messageType;
  if (senderRole === 'user' && receiverRole === 'admin') {
    messageType = 'user_to_admin';
  } else if (senderRole === 'user' && receiverRole === 'trainer') {
    messageType = 'user_to_trainer';
  } else if (senderRole === 'admin' && receiverRole === 'user') {
    messageType = 'admin_to_user';
  } else if (senderRole === 'trainer' && receiverRole === 'user') {
    messageType = 'trainer_to_user';
  } else {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid conversation type' }));
    return;
  }

  // Check message limit for user-to-admin/trainer conversations
  if (senderRole === 'user') {
    const limitKey = `${senderId}-${receiverId}`;
    let limitData = messageLimits.get(limitKey) || { count: 0, lastReplyFromReceiver: true };

    if (!limitData.lastReplyFromReceiver && limitData.count >= 3) {
      ws.send(JSON.stringify({ type: 'error', message: 'Message limit reached. Please wait for a reply.' }));
      console.log(`Chat action logged: Message blocked for user ${senderId} - limit reached`);
      return;
    }

    // Reset count if receiver replied
    if (limitData.lastReplyFromReceiver) {
      limitData.count = 0;
      limitData.lastReplyFromReceiver = false;
    }

    limitData.count++;
    messageLimits.set(limitKey, limitData);
  }

  // Save message to database
  try {
    const chatMessage = new ChatMessage({
      senderId,
      receiverId,
      message: content,
      messageType
    });
    await chatMessage.save();

    // Send to receiver if online
    const receiverClient = clients.get(receiverId);
    if (receiverClient) {
      receiverClient.ws.send(JSON.stringify({
        type: 'chat_message',
        message: {
          id: chatMessage._id,
          senderId,
          receiverId,
          message: content,
          timestamp: chatMessage.timestamp,
          messageType,
          isRead: false
        }
      }));

      // Mark as read if receiver is online
      chatMessage.isRead = true;
      await chatMessage.save();
    }

    // Confirm to sender
    ws.send(JSON.stringify({
      type: 'message_sent',
      message: {
        id: chatMessage._id,
        senderId,
        receiverId,
        message: content,
        timestamp: chatMessage.timestamp,
        messageType
      }
    }));

    // Reset limit if this is a reply from admin/trainer
    if (senderRole === 'admin' || senderRole === 'trainer') {
      const limitKey = `${receiverId}-${senderId}`;
      const limitData = messageLimits.get(limitKey);
      if (limitData) {
        limitData.lastReplyFromReceiver = true;
        messageLimits.set(limitKey, limitData);
      }
    }

    console.log(`Chat action logged: Message sent from ${senderId} to ${receiverId} (${messageType})`);

  } catch (error) {
    console.error('Error saving chat message:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to send message' }));
  }
}

}

module.exports = app;
