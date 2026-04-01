document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const forgotPasswordForm = document.getElementById('forgot-password-form');
  const resetPasswordForm = document.getElementById('reset-password-form');
  const messageDiv = document.getElementById('message');

  if (!window.ApiConfig || typeof window.ApiConfig.getAPI_BASE !== 'function') {
    throw new Error('ApiConfig is not properly initialized. Ensure api.config.js is loaded before auth.js.');
  }
  if (!window.Validators || typeof window.Validators.validateEmail !== 'function') {
    throw new Error('Validators is not properly initialized. Ensure validators.js is loaded before auth.js.');
  }
  window.API_BASE = window.ApiConfig.getAPI_BASE();


  // LOGIN
  if (loginForm) {
    // Real-time validation using shared validators
    const emailInput = document.getElementById('inputEmail');
    const passwordInput = document.getElementById('inputPassword');
    const emailError = document.getElementById('emailError');
    const passwordError = document.getElementById('passwordError');

    function validateEmail() {
      const email = emailInput.value.trim();
      const result = Validators.validateEmail(email);

      if (!result.valid) {
        Validators.showFieldError(emailInput, emailError, result.error);
        return false;
      } else {
        Validators.hideFieldError(emailInput, emailError);
        return true;
      }
    }

    function validatePassword() {
      const password = passwordInput.value;
      const result = Validators.validatePassword(password);

      if (!result.valid) {
        Validators.showFieldError(passwordInput, passwordError, result.error);
        return false;
      } else {
        Validators.hideFieldError(passwordInput, passwordError);
        return true;
      }
    }

    emailInput.addEventListener('blur', validateEmail);
    emailInput.addEventListener('input', () => {
      if (emailInput.classList.contains('is-invalid')) {
        validateEmail();
      }
    });

    passwordInput.addEventListener('blur', validatePassword);
    passwordInput.addEventListener('input', () => {
      if (passwordInput.classList.contains('is-invalid')) {
        validatePassword();
      }
    });

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const isEmailValid = validateEmail();
      const isPasswordValid = validatePassword();

      if (!isEmailValid || !isPasswordValid) {
        return;
      }

      const email = loginForm.email.value;
      const password = loginForm.password.value;
      const loginButton = document.getElementById('loginButton');

      // Show loading state
      setLoadingState(loginButton, true);

      try {
        const data = await window.API.auth.login(email, password);
        const { token, user } = data.data || data;
        localStorage.setItem('token', token);
        
        // Ensure role is set, default to 'user' for safety
        const userRole = user.role || 'user';
        localStorage.setItem('userRole', userRole);

        // Show welcome back toast
        const userName = user.firstName || 'User';
        window.Toast.success(`Welcome back, ${userName}!`);

        // Check for redirect parameter (must be same-origin to prevent open redirect)
        const urlParams = new URLSearchParams(window.location.search);
        const redirectPath = urlParams.get('redirect');
        const isSafeRedirect = redirectPath && redirectPath.startsWith('/') && !redirectPath.startsWith('//');

        if (isSafeRedirect) {
          window.location.href = redirectPath;
        } else {
          // Role-based redirection
          let redirectPathRole = '/dashboard';
          if (userRole === 'admin') {
            redirectPathRole = '/admin-dashboard';
          } else if (userRole === 'trainer') {
            redirectPathRole = '/trainer-dashboard';
          }
          window.location.href = redirectPathRole;
        }
      } catch (err) {
        console.error('Login error:', err);
        if (err.message.includes('Backend service is currently unavailable') || err.message.includes('fetch')) {
          window.Toast.error('Backend service unavailable. Please check server connection.');
        } else if (err.message.includes('HTTP')) {
          window.Toast.error(`Server error: ${err.message}`);
        } else {
          // Frontend-specific errors for specific backend messages
          if (err.message.includes('No account found')) {
            window.Toast.error(err.message + ' Redirecting to signup...');
            setTimeout(() => {
              window.location.href = '/signup';
            }, 2000);
          } else if (err.message === 'Incorrect password') {
            window.Toast.error('Wrong password. Try again or use Forgot Password.');
          } else if (err.message.includes('verify your email')) {
            window.Toast.error(err.message + ' Check your inbox.');
          } else {
            window.Toast.error(err.message || 'Login failed. Please try again.');
          }
        }
      } finally {
        setLoadingState(loginButton, false);
      }
    });
  }

  // SIGNUP
  if (signupForm) {
    // Password requirements checker using shared validators
    const passwordInput = document.getElementById('inputPassword');
    const reqLength = document.getElementById('req-length');
    const reqUppercase = document.getElementById('req-uppercase');
    const reqLowercase = document.getElementById('req-lowercase');
    const reqNumber = document.getElementById('req-number');
    const reqSpecial = document.getElementById('req-special');

    function checkPasswordRequirements() {
      const password = passwordInput.value;
      const reqs = Validators.getPasswordRequirements(password);

      reqLength.className = reqs.minLength ? 'text-success' : 'text-muted';
      reqUppercase.className = reqs.hasUpperCase ? 'text-success' : 'text-muted';
      reqLowercase.className = reqs.hasLowerCase ? 'text-success' : 'text-muted';
      reqNumber.className = reqs.hasNumbers ? 'text-success' : 'text-muted';
      reqSpecial.className = reqs.hasSpecialChar ? 'text-success' : 'text-muted';
    }

    passwordInput.addEventListener('input', checkPasswordRequirements);

    // Signup validation
    const firstNameInput = document.getElementById('inputFirstName');
    const lastNameInput = document.getElementById('inputLastName');
    const signupEmailInput = document.getElementById('inputEmail');
    const signupPasswordInput = document.getElementById('inputPassword');
    const confirmPasswordInput = document.getElementById('inputConfirmPassword');

    const firstNameError = document.getElementById('firstNameError');
    const lastNameError = document.getElementById('lastNameError');
    const signupEmailError = document.getElementById('signupEmailError');
    const signupPasswordError = document.getElementById('signupPasswordError');
    const confirmPasswordError = document.getElementById('confirmPasswordError');

    function validateFirstName() {
      const result = Validators.validateName(firstNameInput.value, 'First name');
      if (!result.valid) {
        Validators.showFieldError(firstNameInput, firstNameError, result.error);
        return false;
      } else {
        Validators.hideFieldError(firstNameInput, firstNameError);
        return true;
      }
    }

    function validateLastName() {
      const result = Validators.validateName(lastNameInput.value, 'Last name');
      if (!result.valid) {
        Validators.showFieldError(lastNameInput, lastNameError, result.error);
        return false;
      } else {
        Validators.hideFieldError(lastNameInput, lastNameError);
        return true;
      }
    }

    function validateSignupEmail() {
      const result = Validators.validateEmail(signupEmailInput.value.trim());
      if (!result.valid) {
        Validators.showFieldError(signupEmailInput, signupEmailError, result.error);
        return false;
      } else {
        Validators.hideFieldError(signupEmailInput, signupEmailError);
        return true;
      }
    }

    function validateSignupPassword() {
      const password = signupPasswordInput.value;
      const error = Validators.validatePasswordStrength(password);

      if (error) {
        Validators.showFieldError(signupPasswordInput, signupPasswordError, error);
        return false;
      } else {
        Validators.hideFieldError(signupPasswordInput, signupPasswordError);
        return true;
      }
    }

    function validateConfirmPassword() {
      const result = Validators.validateConfirmPassword(signupPasswordInput.value, confirmPasswordInput.value);
      if (!result.valid) {
        Validators.showFieldError(confirmPasswordInput, confirmPasswordError, result.error);
        return false;
      } else {
        Validators.hideFieldError(confirmPasswordInput, confirmPasswordError);
        return true;
      }
    }

    // Add event listeners for real-time validation
    firstNameInput.addEventListener('blur', validateFirstName);
    firstNameInput.addEventListener('input', () => {
      if (firstNameInput.classList.contains('is-invalid')) {
        validateFirstName();
      }
    });

    lastNameInput.addEventListener('blur', validateLastName);
    lastNameInput.addEventListener('input', () => {
      if (lastNameInput.classList.contains('is-invalid')) {
        validateLastName();
      }
    });

    signupEmailInput.addEventListener('blur', validateSignupEmail);
    signupEmailInput.addEventListener('input', () => {
      if (signupEmailInput.classList.contains('is-invalid')) {
        validateSignupEmail();
      }
    });

    signupPasswordInput.addEventListener('blur', validateSignupPassword);
    signupPasswordInput.addEventListener('input', () => {
      if (signupPasswordInput.classList.contains('is-invalid')) {
        validateSignupPassword();
      }
      validateConfirmPassword(); // Re-validate confirm password when password changes
    });

    confirmPasswordInput.addEventListener('blur', validateConfirmPassword);
    confirmPasswordInput.addEventListener('input', () => {
      if (confirmPasswordInput.classList.contains('is-invalid')) {
        validateConfirmPassword();
      }
    });

    // Handle Accept Terms button in modal
    const acceptTermsBtn = document.getElementById('acceptTermsBtn');
    if (acceptTermsBtn) {
      acceptTermsBtn.addEventListener('click', () => {
        const agreeTermsCheckbox = document.getElementById('agreeTerms');
        agreeTermsCheckbox.checked = true;
        // Close the modal
        const termsModal = bootstrap.Modal.getInstance(document.getElementById('termsModal'));
        if (termsModal) {
          termsModal.hide();
        }
      });
    }

    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const isFirstNameValid = validateFirstName();
      const isLastNameValid = validateLastName();
      const isEmailValid = validateSignupEmail();
      const isPasswordValid = validateSignupPassword();
      const isConfirmPasswordValid = validateConfirmPassword();

      if (!isFirstNameValid || !isLastNameValid || !isEmailValid || !isPasswordValid || !isConfirmPasswordValid) {
        return;
      }

      const agreeTermsCheckbox = document.getElementById('agreeTerms');
      if (!agreeTermsCheckbox.checked) {
        showMessage('Please accept the terms and conditions to continue.', 'error');
        return;
      }

      const firstName = document.getElementById('inputFirstName').value;
      const lastName = document.getElementById('inputLastName').value;
      const email = document.getElementById('inputEmail').value;
      const password = document.getElementById('inputPassword').value;
      const signupButton = signupForm.querySelector('button[type="submit"]');

      // Show loading state
      setLoadingState(signupButton, true);

      try {
        // Use consistent API method like login for better error handling and health checks
        const data = await window.API.auth.register({
          firstName,
          lastName,
          email,
          password,
          dataProcessingConsent: { given: true },
          healthDataConsent: { given: true }
        });
        
        const { token, user } = data.data || data;
        localStorage.setItem('token', token);
        localStorage.setItem('userRole', user.role || 'user');
        window.Toast.success(`Welcome to JE Fitness, ${user.firstName || 'User'}!`);
        // Redirect based on role
        let redirectPath = '/dashboard';
        if (user.role === 'admin') redirectPath = '/admin-dashboard';
        else if (user.role === 'trainer') redirectPath = '/trainer-dashboard';
        setTimeout(() => window.location.href = redirectPath, 1500);
      } catch (err) {
        console.error('Signup error:', err);
        if (err.message.includes('Backend service is currently unavailable') || err.message.includes('fetch')) {
          window.Toast.error('Backend service unavailable. Please check server connection.');
        } else if (err.message.includes('HTTP')) {
          window.Toast.error(`Server error: ${err.message}`);
        } else if (err.message.includes('already exists')) {
          window.Toast.error('An account with this email already exists.');
        } else {
          window.Toast.error(err.message || 'Signup failed. Please try again.');
        }
      } finally {
        setLoadingState(signupButton, false);
      }
    });
  }



  // FORGOT PASSWORD
  if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = forgotPasswordForm.email.value;
      const forgotButton = forgotPasswordForm.querySelector('button[type="submit"]');

      // Show loading state
      setLoadingState(forgotButton, true);

      try {
        const res = await fetch(`${window.API_BASE}/api/v1/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });

        const data = await res.json();

        if (res.ok) {
          window.Toast.success(data.message || 'If an account with that email exists, a reset link has been sent.');
        } else {
          handleApiError(res, data, 'Error sending reset email');
        }
      } catch (err) {
        console.error('Forgot password error:', err);
        window.Toast.error('Network error. Please try again.');
      } finally {
        setLoadingState(forgotButton, false);
      }
    });
  }

  // RESET PASSWORD
  if (resetPasswordForm) {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (!token) {
      window.Toast.warning('Invalid reset link. Please request a new password reset.');
      return;
    }

    resetPasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const password = resetPasswordForm.password.value;
      const confirmPassword = resetPasswordForm.confirmPassword.value;

      if (password !== confirmPassword) {
        window.Toast.warning('Passwords do not match');
        return;
      }

      try {
        const res = await fetch(`${window.API_BASE}/api/v1/auth/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, password })
        });

        const data = await res.json();

        if (res.ok) {
          window.Toast.success('Password reset successfully');
          setTimeout(() => {
            window.location.href = '/login';
          }, 2000);
        } else {
          handleApiError(res, data, 'Error resetting password');
        }
      } catch (err) {
        console.error('Reset password error:', err);
        window.Toast.error('Network error. Please try again.');
      }
    });
  }

  function showMessage(msg, type = 'info') {
    if (messageDiv) {
      messageDiv.textContent = msg;
      messageDiv.className = `alert alert-${type === 'error' ? 'danger' : 'info'} mt-3 text-center`;
      messageDiv.classList.remove('d-none');
      // Auto-hide success messages after 5 seconds
      if (type === 'success') {
        setTimeout(() => {
          messageDiv.classList.add('d-none');
        }, 5000);
      }
    } else {
      alert(msg);
    }
  }

  function setLoadingState(button, isLoading) {
    if (!button) return;

    const originalText = button.textContent;
    button.disabled = isLoading;

    if (isLoading) {
      button.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Loading...';
    } else {
      button.innerHTML = originalText;
    }
  }

  /**
   * Standardized API error handler for frontend
   */
  function handleApiError(response, data, defaultMsg) {
    // Defensive check: ensure data exists and has expected structure
    let errorMsg = defaultMsg;
    
    // Use optional chaining throughout to handle undefined data
    if (data) {
      // Try various possible error response structures with optional chaining
      if (data?.error?.message) {
        errorMsg = data.error.message;
      } else if (data?.msg) {
        errorMsg = data.msg;
      } else if (data?.error) {
        errorMsg = typeof data.error === 'string' ? data.error : (data.error?.message || defaultMsg);
      } else if (data?.message) {
        errorMsg = data.message;
      }
    }

    switch (response?.status) {
      case 401:
        window.Toast.error(errorMsg || 'Your session has expired. Please log in again.');
        // If not on login page, redirect to login
        if (!window.location.pathname.includes('/login')) {
          setTimeout(() => {
            localStorage.removeItem('token');
            window.location.href = '/login';
          }, 2000);
        }
        break;
      case 403:
        window.Toast.error('You do not have permission to perform this action.');
        break;
      case 404:
        window.Toast.warning(errorMsg || 'The requested resource was not found.');
        break;
      case 423:
        window.Toast.warning(errorMsg || 'Account is temporarily locked.');
        break;
      case 500:
        window.Toast.error('A server error occurred. Please try again later.');
        break;
      default:
        window.Toast.error(errorMsg);
    }
  }
});
