/**
 * MOBILE CSP CONFIGURATION FOR src/server.js
 * 
 * Replace the helmet contentSecurityPolicy section in src/server.js with this updated version
 * to support Capacitor mobile apps while maintaining security
 */

// Updated helmet configuration with mobile support
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: [
        "'self'",
        "capacitor://",      // Capacitor mobile app schema
        "file://"             // Local file access for mobile
      ],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",   // Required for inline scripts in HTML
        "capacitor://",
        "file://",
        "https://cdn.jsdelivr.net",
        "https://cdnjs.cloudflare.com"
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",   // Required for inline styles
        "capacitor://",
        "file://",
        "https://cdn.jsdelivr.net",
        "https://fonts.googleapis.com",
        "https://cdnjs.cloudflare.com"
      ],
      fontSrc: [
        "'self'",
        "capacitor://",
        "file://",
        "https://fonts.gstatic.com",
        "https://cdn.jsdelivr.net"
      ],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "capacitor://",
        "file://",
        "https://via.placeholder.com",
        "https://cdn.jsdelivr.net"
      ],
      connectSrc: [
        "'self'",
        "capacitor://",
        "file://",
        "ws://",              // WebSocket support
        "wss://",             // Secure WebSocket
        "http://localhost:10000",           // Local development
        "http://127.0.0.1:10000",           // Local development
        "http://10.0.2.2:10000",            // Android emulator
        "https://api.jefitness.com",        // Production API
        "https://api.mailjet.com",
        "https://cdn.jsdelivr.net"
      ],
      mediaSrc: [
        "'self'",
        "capacitor://",
        "file://",
        "blob:"
      ],
      manifestSrc: [
        "'self'",
        "capacitor://",
        "file://"
      ],
      frameSrc: [
        "capacitor://"
      ],
      childSrc: [
        "capacitor://"
      ],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : [] // Allow HTTP in dev
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

/**
 * CORS Configuration for Mobile
 * Replace the existing cors() call with this updated version
 */
app.use(cors({
  origin: function(origin, callback) {
    const allowedOrigins = [
      'http://localhost:10000',
      'http://127.0.0.1:10000',
      'http://localhost:3000',
      'capacitor://localhost',
      'ionic://localhost',
      'file://',
      'http://10.0.2.2:10000' // Android emulator
    ];

    if (process.env.NODE_ENV === 'production') {
      allowedOrigins.push('https://api.jefitness.com');
      allowedOrigins.push('https://jefitness.web.app');
    }

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  maxAge: 86400 // 24 hours
}));