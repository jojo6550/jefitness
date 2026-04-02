const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const User = require('../models/User');
const { logger } = require('../services/logger');

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/v1/auth/google/callback',
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value?.toLowerCase();
        if (!email) return done(new Error('No email returned from Google'), null);

        // Find existing account linked by googleId or email
        let user = await User.findOne({ $or: [{ googleId: profile.id }, { email }] });

        if (user) {
          // Link googleId if not already set
          if (!user.googleId) {
            user.googleId = profile.id;
            await user.save({ validateBeforeSave: false });
          }
          return done(null, user);
        }

        // Create new user from Google profile
        const firstName = profile.name?.givenName || profile.displayName?.split(' ')[0] || 'User';
        const lastName = profile.name?.familyName || profile.displayName?.split(' ').slice(1).join(' ') || '';

        user = new User({
          googleId: profile.id,
          firstName,
          lastName,
          email,
          password: require('crypto').randomBytes(32).toString('hex'), // Random unusable password
          isEmailVerified: true,
          dataProcessingConsent: { given: true, givenAt: new Date() },
          healthDataConsent: { given: true, givenAt: new Date() },
        });
        await user.save();
        logger.info('New user created via Google OAuth', { userId: user._id, email });
        done(null, user);
      } catch (err) {
        logger.error('Google OAuth strategy error', { error: err.message });
        done(err, null);
      }
    }
  )
);

module.exports = passport;
