/**
 * Client-side validation utilities
 * Shared with server-side validation to avoid duplication
 * These provide real-time validation feedback as progressive enhancement
 */

const Validators = {
  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email) {
      return { valid: false, error: 'Email is required.' };
    }
    if (!emailRegex.test(email)) {
      return { valid: false, error: 'Please enter a valid email address.' };
    }
    return { valid: true };
  },

  validatePassword(password) {
    if (!password) {
      return { valid: false, error: 'Password is required.' };
    }
    if (password.length < 6) {
      return { valid: false, error: 'Password must be at least 6 characters.' };
    }
    return { valid: true };
  },

  validatePasswordStrength(password) {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (!password) {
      return 'Password is required.';
    }
    if (password.length < minLength) {
      return 'Password must be at least 8 characters long.';
    }
    if (!hasUpperCase) {
      return 'Password must contain at least one uppercase letter.';
    }
    if (!hasLowerCase) {
      return 'Password must contain at least one lowercase letter.';
    }
    if (!hasNumbers) {
      return 'Password must contain at least one number.';
    }
    if (!hasSpecialChar) {
      return 'Password must contain at least one special character.';
    }
    return null; // Password is strong
  },

  getPasswordRequirements(password) {
    return {
      minLength: password.length >= 8,
      hasUpperCase: /[A-Z]/.test(password),
      hasLowerCase: /[a-z]/.test(password),
      hasNumbers: /\d/.test(password),
      hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    };
  },

  validateName(name, fieldName = 'Name') {
    const trimmed = name ? name.trim() : '';
    if (!trimmed) {
      return { valid: false, error: `${fieldName} is required.` };
    }
    if (trimmed.length < 2) {
      return { valid: false, error: `${fieldName} must be at least 2 characters.` };
    }
    return { valid: true };
  },

  validateConfirmPassword(password, confirmPassword) {
    if (!confirmPassword) {
      return { valid: false, error: 'Please confirm your password.' };
    }
    if (password !== confirmPassword) {
      return { valid: false, error: 'Passwords do not match.' };
    }
    return { valid: true };
  },

  validateOTP(otp) {
    if (!otp) {
      return { valid: false, error: 'Verification code is required.' };
    }
    if (!/^\d{6}$/.test(otp)) {
      return { valid: false, error: 'Verification code must be 6 digits.' };
    }
    return { valid: true };
  },

  showFieldError(input, errorDiv, message) {
    if (input) {
      input.classList.add('is-invalid');
      input.classList.remove('is-valid');
    }
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.classList.remove('d-none');
    }
  },

  hideFieldError(input, errorDiv) {
    if (input) {
      input.classList.remove('is-invalid');
      input.classList.add('is-valid');
    }
    if (errorDiv) {
      errorDiv.classList.add('d-none');
    }
  }
};

// Expose to window for global access
window.Validators = Validators;
