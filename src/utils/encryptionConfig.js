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
  // Encryption keys must be exactly 32 bytes for mongoose-encryption
  if (encryptionKey) {
    try {
      // Check if key is hex (64 chars) or base64 (approx 44 chars)
      let keyBuffer;
      if (encryptionKey.length === 64 && /^[0-9a-fA-F]+$/.test(encryptionKey)) {
        keyBuffer = Buffer.from(encryptionKey, 'hex');
      } else {
        keyBuffer = Buffer.from(encryptionKey, 'base64');
      }

      if (keyBuffer.length !== 32) {
        console.warn(`⚠️ ENCRYPTION_KEY length is ${keyBuffer.length} bytes. mongoose-encryption requires exactly 32 bytes.`);
        return {
          isValid: false,
          isConfigured: true,
          encryptionConfig: null
        };
      }
    } catch (e) {
      console.warn('⚠️ ENCRYPTION_KEY format is invalid. Must be hex or base64.');
      return {
        isValid: false,
        isConfigured: true,
        encryptionConfig: null
      };
    }
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
