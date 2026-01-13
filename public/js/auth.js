document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const forgotPasswordForm = document.getElementById('forgot-password-form');
  const resetPasswordForm = document.getElementById('reset-password-form');
  const messageDiv = document.getElementById('message');

  window.API_BASE = window.ApiConfig.getAPI_BASE();


  // LOGIN
  if (loginForm) {
    // Real-time validation
    const emailInput = document.getElementById('inputEmail');
    const passwordInput = document.getElementById('inputPassword');
    const emailError = document.getElementById('emailError');
    const passwordError = document.getElementById('passwordError');

    function validateEmail() {
      const email = emailInput.value.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!email) {
        showFieldError(emailInput, emailError, 'Email is required.');
        return false;
      } else if (!emailRegex.test(email)) {
        showFieldError(emailInput, emailError, 'Please enter a valid email address.');
        return false;
      } else {
        hideFieldError(emailInput, emailError);
        return true;
      }
    }

    function validatePassword() {
      const password = passwordInput.value;

      if (!password) {
        showFieldError(passwordInput, passwordError, 'Password is required.');
        return false;
      } else if (password.length < 6) {
        showFieldError(passwordInput, passwordError, 'Password must be at least 6 characters.');
        return false;
      } else {
        hideFieldError(passwordInput, passwordError);
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
        const res = await fetch(`${window.API_BASE}
/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (res.ok) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('userRole', data.user.role);

          // Check for redirect parameter
          const urlParams = new URLSearchParams(window.location.search);
          const redirectPath = urlParams.get('redirect');

          if (redirectPath) {
            // Redirect to the specified path
            window.location.href = redirectPath;
          } else {
            // Role-based redirection
            if (data.user.role === 'admin') {
              window.location.href = '../pages/admin-dashboard.html';
            } else if (data.user.role === 'trainer') {
              window.location.href = '../pages/trainer-dashboard.html';
            } else {
              window.location.href = '../pages/dashboard.html';
            }
          }
        } else {
          showMessage(data.msg || 'Login failed', 'error');
        }
      } catch (err) {
        showMessage('Error connecting to server', 'error');
      } finally {
        setLoadingState(loginButton, false);
      }
    });
  }

  // SIGNUP
  if (signupForm) {
    // Password requirements checker
    const passwordInput = document.getElementById('inputPassword');
    const reqLength = document.getElementById('req-length');
    const reqUppercase = document.getElementById('req-uppercase');
    const reqLowercase = document.getElementById('req-lowercase');
    const reqNumber = document.getElementById('req-number');
    const reqSpecial = document.getElementById('req-special');

    function checkPasswordRequirements() {
      const password = passwordInput.value;
      const minLength = password.length >= 8;
      const hasUpperCase = /[A-Z]/.test(password);
      const hasLowerCase = /[a-z]/.test(password);
      const hasNumbers = /\d/.test(password);
      const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

      reqLength.className = minLength ? 'text-success' : 'text-muted';
      reqUppercase.className = hasUpperCase ? 'text-success' : 'text-muted';
      reqLowercase.className = hasLowerCase ? 'text-success' : 'text-muted';
      reqNumber.className = hasNumbers ? 'text-success' : 'text-muted';
      reqSpecial.className = hasSpecialChar ? 'text-success' : 'text-muted';
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
      const firstName = firstNameInput.value.trim();
      if (!firstName) {
        showFieldError(firstNameInput, firstNameError, 'First name is required.');
        return false;
      } else if (firstName.length < 2) {
        showFieldError(firstNameInput, firstNameError, 'First name must be at least 2 characters.');
        return false;
      } else {
        hideFieldError(firstNameInput, firstNameError);
        return true;
      }
    }

    function validateLastName() {
      const lastName = lastNameInput.value.trim();
      if (!lastName) {
        showFieldError(lastNameInput, lastNameError, 'Last name is required.');
        return false;
      } else if (lastName.length < 2) {
        showFieldError(lastNameInput, lastNameError, 'Last name must be at least 2 characters.');
        return false;
      } else {
        hideFieldError(lastNameInput, lastNameError);
        return true;
      }
    }

    function validateSignupEmail() {
      const email = signupEmailInput.value.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!email) {
        showFieldError(signupEmailInput, signupEmailError, 'Email is required.');
        return false;
      } else if (!emailRegex.test(email)) {
        showFieldError(signupEmailInput, signupEmailError, 'Please enter a valid email address.');
        return false;
      } else {
        hideFieldError(signupEmailInput, signupEmailError);
        return true;
      }
    }

    function validateSignupPassword() {
      const password = signupPasswordInput.value;
      const minLength = password.length >= 8;
      const hasUpperCase = /[A-Z]/.test(password);
      const hasLowerCase = /[a-z]/.test(password);
      const hasNumbers = /\d/.test(password);
      const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

      if (!password) {
        showFieldError(signupPasswordInput, signupPasswordError, 'Password is required.');
        return false;
      } else if (!minLength || !hasUpperCase || !hasLowerCase || !hasNumbers || !hasSpecialChar) {
        showFieldError(signupPasswordInput, signupPasswordError, 'Password must meet all requirements.');
        return false;
      } else {
        hideFieldError(signupPasswordInput, signupPasswordError);
        return true;
      }
    }

    function validateConfirmPassword() {
      const password = signupPasswordInput.value;
      const confirmPassword = confirmPasswordInput.value;

      if (!confirmPassword) {
        showFieldError(confirmPasswordInput, confirmPasswordError, 'Please confirm your password.');
        return false;
      } else if (password !== confirmPassword) {
        showFieldError(confirmPasswordInput, confirmPasswordError, 'Passwords do not match.');
        return false;
      } else {
        hideFieldError(confirmPasswordInput, confirmPasswordError);
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
        const response = await fetch(`${window.API_BASE}
/api/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firstName,
            lastName,
            email,
            password,
            dataProcessingConsent: { given: true },
            healthDataConsent: { given: true }
          })
        });

        const data = await response.json();

        if (response.ok) {
          // Hide signup form and show OTP verification form
          signupForm.style.display = 'none';
          document.getElementById('otp-container').style.display = 'block';
          document.getElementById('otp-message').textContent = `We sent a verification code to ${email}`;
          showMessage('Signup successful! Please check your email for verification code.', 'success');
        } else {
          showMessage(data.msg || 'Signup failed.', 'error');
        }
      } catch (err) {
        console.error('Error:', err);
        showMessage('Signup failed. Please try again.', 'error');
      } finally {
        setLoadingState(signupButton, false);
      }
    });
  }

  // OTP Verification
  const otpForm = document.getElementById('otp-form');
  if (otpForm) {
    otpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('inputEmail').value;
      const otp = document.getElementById('inputOtp').value;

      try {
        const response = await fetch(`${window.API_BASE}
/api/auth/verify-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, otp })
        });

        const data = await response.json();

        if (response.ok) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('userRole', data.user.role);
          alert('Email verified! Welcome to JE Fitness.');
          window.location.href = '../pages/dashboard.html';
        } else {
          alert(data.msg || 'Verification failed.');
        }
      } catch (err) {
        console.error('Error:', err);
        alert('Verification failed. Please try again.');
      }
    });

    // Resend OTP functionality
    const resendOtpBtn = document.getElementById('resendOtp');
    if (resendOtpBtn) {
      resendOtpBtn.addEventListener('click', async () => {
        const firstName = document.getElementById('inputFirstName').value;
        const lastName = document.getElementById('inputLastName').value;
        const email = document.getElementById('inputEmail').value;
        const password = document.getElementById('inputPassword').value;

        try {
          const response = await fetch(`${window.API_BASE}
/api/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              firstName,
              lastName,
              email,
              password,
              dataProcessingConsent: { given: true },
              healthDataConsent: { given: true }
            })
          });

          if (response.ok) {
            alert('OTP resent to your email.');
          } else {
            alert('Failed to resend OTP.');
          }
        } catch (err) {
          console.error('Error:', err);
          alert('Failed to resend OTP.');
        }
      });
    }
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
        const res = await fetch(`${window.API_BASE}
/api/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });

        const data = await res.json();

        if (res.ok) {
          showMessage(data.msg || 'If an account with that email exists, a reset link has been sent.', 'success');
        } else {
          showMessage(data.msg || 'Error sending reset email', 'error');
        }
      } catch (err) {
        showMessage('Error connecting to server', 'error');
      } finally {
        setLoadingState(forgotButton, false);
      }
    });
  }

  // RESET PASSWORD
  if (resetPasswordForm) {
    // Get token from URL
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');

    if (!token) {
      showMessage('Invalid reset link. Please request a new password reset.');
      return;
    }

    resetPasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const password = resetPasswordForm.password.value;
      const confirmPassword = resetPasswordForm.confirmPassword.value;

      if (password !== confirmPassword) {
        showMessage('Passwords do not match');
        return;
      }

      try {
        const res = await fetch(`${window.API_BASE}
/api/auth/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, password })
        });

        const data = await res.json();

        if (res.ok) {
          showMessage(data.msg || 'Password reset successfully');
          setTimeout(() => {
            window.location.href = 'login.html';
          }, 2000);
        } else {
          showMessage(data.msg || 'Error resetting password');
        }
      } catch (err) {
        showMessage('Error connecting to server');
      }
    });
  }

  function showMessage(msg, type = 'info') {
    if (messageDiv) {
      messageDiv.textContent = msg;
      messageDiv.className = `alert alert-${type === 'error' ? 'danger' : 'info'} mt-3 text-center`;
      messageDiv.style.display = 'block';
      // Auto-hide success messages after 5 seconds
      if (type === 'success') {
        setTimeout(() => {
          messageDiv.style.display = 'none';
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

  function showFieldError(input, errorDiv, message) {
    if (input) {
      input.classList.add('is-invalid');
      input.classList.remove('is-valid');
    }
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.style.display = 'block';
    }
  }

  function hideFieldError(input, errorDiv) {
    if (input) {
      input.classList.remove('is-invalid');
      input.classList.add('is-valid');
    }
    if (errorDiv) {
      errorDiv.style.display = 'none';
    }
  }
});
