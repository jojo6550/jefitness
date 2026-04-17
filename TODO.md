 Overall: code is solid, but ChatGPT copy-pasted instead of abstracting. Main issues:

  ---
  1. requireAdmin / requireTrainer — copy-paste (auth.js:143-172)

  Identical functions except role string. Replace both with a factory:

  const requireRole = (role) => (req, res, next) => {
    if (req.user?.role !== role) return res.status(403).json({ success: false, error: `Access denied. ${role} privileges required.`  
  });
    next();
  };

  module.exports.requireAdmin = requireRole('admin');
  module.exports.requireTrainer = requireRole('trainer');

  ---
  2. requireDataProcessingConsent / requireHealthDataConsent — near-identical (consent.js:13-145)

  Same skeleton, different field name. One factory covers both:

  const requireConsent = (consentField, code, message) => async (req, res, next) => {
    // single implementation checking user[consentField].given
  };

  const requireDataProcessingConsent = requireConsent('dataProcessingConsent', 'CONSENT_REQUIRED', '...');
  const requireHealthDataConsent = requireConsent('healthDataConsent', 'HEALTH_CONSENT_REQUIRED', '...');

  ---
  3. Webhook helpers don't belong in auth.js

  isWebhookEventProcessed / markWebhookEventProcessed (auth.js:180-223) have zero connection to auth. Move to
  src/services/webhooks.js or alongside src/routes/webhooks.js.

  ---
  4. req.user?.user?.id in consent.js — dead code smell

  consent.js:15: req.user?.id || req.user?.user?.id — the nested .user.user.id path never exists if auth middleware always sets      
  req.user.id. Drop the fallback.

  ---
  5. CSRF middleware is effectively a no-op for your app

  csrf.js:142-148: skips all requests with Authorization header or req.cookies.token. Since every protected route uses JWT cookie    
  auth, CSRF never actually validates anything. Your SameSite: strict cookie already provides CSRF protection. CSRF middleware adds  
  overhead with no benefit. Could remove entirely.

                                                  