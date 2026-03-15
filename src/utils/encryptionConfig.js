/**
 * Encryption Configuration Utility
 * 
 * Handles encryption key validation and management
 * IMPORTANT: Encryption keys should never be logged or exposed
 */

/**
 * Validate encryption key configuration
 * @returns {object} Object with isValid boolean and encryptionConfig
 * @throws {Error} If encryption is required but key is missing
 */
function validateEncryptionKey() {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  const signingKey = process.env.SIGNING_KEY;

  // If encryption key is not provided, encryption is disabled
  if (!encryptionKey) {
    console.warn('⚠️ WARNING: ENCRYPTION_KEY not set. Sensitive fields will NOT be encrypted. This is NOT recommended for production.');
    return {
      isValid: false,
      isConfigured: false,
      encryptionConfig: null
    };
  }

  // Validate encryption key format and length
  // Encryption keys should be at least 32 characters for security
  // Note: For demonstration purposes, we are using the environment variable directly.
  // In production, ensure the key is a properly formatted base64 or hex string.
  if (encryptionKey.length < 32) {
    console.warn('⚠️ ENCRYPTION_KEY is shorter than 32 characters. Encryption may be insecure.');
  }

  // SECURITY: Log only that encryption is configured, never log the key itself
  console.log('✅ Encryption enabled: Sensitive fields will be encrypted');

  return {
    isValid: true,
    isConfigured: true,
    encryptionConfig: {
      encryptionKey: encryptionKey,
      signingKey: signingKey || encryptionKey, // Use signing key if provided, otherwise use encryption key
      encryptedFields: [
        'medicalConditions',
        'goals',
        'reason',
        'phone',
        'dob',
        'gender',
        'startWeight',
        'currentWeight',
        'workoutLogs'
      ],
      excludeFromEncryption: [
        'password',      // SECURITY: Never encrypt password (should use bcrypt)
        'email',         // Need to query by email
        'firstName',
        'lastName',
        'role',
        'isEmailVerified',
        'createdAt',
        'lastLoggedIn',
        'activityStatus',
        'hasMedical',
        'stripeCustomerId'
      ]
    }
  };
}

/**
 * Get encryption configuration for mongoose-encryption plugin
 * Returns null if encryption is not configured
 */
function getEncryptionConfig() {
  try {
    const config = validateEncryptionKey();
    return config.isValid ? config.encryptionConfig : null;
  } catch (err) {
    console.error('Failed to validate encryption config:', err.message);
    throw err;
  }
}

/**
 * Check if encryption is enabled
 */
function isEncryptionEnabled() {
  try {
    const config = validateEncryptionKey();
    return config.isConfigured;
  } catch (err) {
    return false;
  }
}

module.exports = {
  validateEncryptionKey,
  getEncryptionConfig,
  isEncryptionEnabled
};
