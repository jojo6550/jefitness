const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const TwitterStrategy = require('passport-twitter').Strategy;
const AppleStrategy = require('passport-apple');
const { verifyOrLinkSocialUser } = require('../services/socialAuthService');

// ── Google ──────────────────────────────────────────────────────────────────
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value || null;
        const firstName = profile.name?.givenName || profile.displayName?.split(' ')[0] || 'User';
        const lastName = profile.name?.familyName || profile.displayName?.split(' ').slice(1).join(' ') || '';
        const result = await verifyOrLinkSocialUser({ provider: 'google', providerId: profile.id, email, firstName, lastName });
        done(null, result);
      } catch (err) {
        done(err);
      }
    }
  )
);

// ── Facebook ─────────────────────────────────────────────────────────────────
passport.use(
  new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: process.env.FACEBOOK_CALLBACK_URL,
      profileFields: ['id', 'emails', 'name'],
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value || null;
        const firstName = profile.name?.givenName || profile.displayName?.split(' ')[0] || 'User';
        const lastName = profile.name?.familyName || profile.displayName?.split(' ').slice(1).join(' ') || '';
        const result = await verifyOrLinkSocialUser({ provider: 'facebook', providerId: profile.id, email, firstName, lastName });
        done(null, result);
      } catch (err) {
        done(err);
      }
    }
  )
);

// ── Twitter/X (OAuth 1.0a) ───────────────────────────────────────────────────
// Requires "Request email from users" enabled in Twitter developer portal.
passport.use(
  new TwitterStrategy(
    {
      consumerKey: process.env.TWITTER_CONSUMER_KEY,
      consumerSecret: process.env.TWITTER_CONSUMER_SECRET,
      callbackURL: process.env.TWITTER_CALLBACK_URL,
      includeEmail: true,
    },
    async (_token, _tokenSecret, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value || null;
        const firstName = profile.displayName?.split(' ')[0] || profile.username || 'User';
        const lastName = profile.displayName?.split(' ').slice(1).join(' ') || '';
        const result = await verifyOrLinkSocialUser({ provider: 'twitter', providerId: profile.id, email, firstName, lastName });
        done(null, result);
      } catch (err) {
        done(err);
      }
    }
  )
);

// ── Apple ────────────────────────────────────────────────────────────────────
// Apple only sends name + email on the FIRST authentication. After that, only
// profile.id is present. We look up by appleId so returning users still work.
passport.use(
  new AppleStrategy(
    {
      clientID: process.env.APPLE_CLIENT_ID,
      teamID: process.env.APPLE_TEAM_ID,
      callbackURL: process.env.APPLE_CALLBACK_URL,
      keyID: process.env.APPLE_KEY_ID,
      // Support multiline key stored with \n in env
      privateKeyString: process.env.APPLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    async (_req, _accessToken, _refreshToken, _idToken, profile, done) => {
      try {
        if (!profile?.id) return done(new Error('Apple profile missing id/sub'));
        const email = profile.email || null;
        const firstName = profile.name?.firstName || 'User';
        const lastName = profile.name?.lastName || '';
        const result = await verifyOrLinkSocialUser({ provider: 'apple', providerId: profile.id, email, firstName, lastName });
        done(null, result);
      } catch (err) {
        done(err);
      }
    }
  )
);

module.exports = passport;
