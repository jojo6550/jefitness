/**
 * Find, link, or create a user for a social OAuth login.
 *
 * Priority:
 *   1. Find by provider ID (returning social user)
 *   2. Find by email + link provider ID (existing email/password user)
 *   3. Create new social user
 *
 * @param {{ provider: string, providerId: string, email: string|null, firstName: string, lastName: string }}
 * @returns {Promise<{ user: import('../models/User'), isNew: boolean }>}
 */
async function verifyOrLinkSocialUser({ provider, providerId, email, firstName, lastName }) {
  // Require inside function so jest.resetModules() in tests can swap the mock
  const User = require('../models/User');
  const providerIdField = `${provider}Id`;

  // 1. Returning social user — look up by provider ID
  let user = await User.findOne({ [providerIdField]: providerId });
  if (user) return { user, isNew: false };

  // 2. Existing account with matching email — link provider ID
  if (email) {
    user = await User.findOne({ email: email.toLowerCase() });
    if (user) {
      user[providerIdField] = providerId;
      await user.save();
      return { user, isNew: false };
    }
  }

  // 3. New user — create and fetch with tokenVersion for JWT signing
  const created = await User.create({
    email: email ? email.toLowerCase() : undefined,
    firstName: firstName || 'User',
    lastName: lastName || '',
    [providerIdField]: providerId,
    isEmailVerified: true,
  });

  const newUser = await User.findById(created._id).select('+tokenVersion');
  return { user: newUser, isNew: true };
}

module.exports = { verifyOrLinkSocialUser };
