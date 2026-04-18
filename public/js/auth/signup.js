(function () {
  function init() {
    const signupForm = document.getElementById('signup-form');
    if (!signupForm) return;

    const { redirectByRole, setLoadingState, showMessage } = window.AuthShared;

    const passwordInput = document.getElementById('inputPassword');
    const reqLength = document.getElementById('req-length');
    const reqUppercase = document.getElementById('req-uppercase');
    const reqLowercase = document.getElementById('req-lowercase');
    const reqNumber = document.getElementById('req-number');
    const reqSpecial = document.getElementById('req-special');

    function checkPasswordRequirements() {
      const reqs = Validators.getPasswordRequirements(passwordInput.value);
      reqLength.className = reqs.minLength ? 'text-success' : 'text-muted';
      reqUppercase.className = reqs.hasUpperCase ? 'text-success' : 'text-muted';
      reqLowercase.className = reqs.hasLowerCase ? 'text-success' : 'text-muted';
      reqNumber.className = reqs.hasNumbers ? 'text-success' : 'text-muted';
      reqSpecial.className = reqs.hasSpecialChar ? 'text-success' : 'text-muted';
    }

    passwordInput.addEventListener('input', checkPasswordRequirements);

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
      }
      Validators.hideFieldError(firstNameInput, firstNameError);
      return true;
    }

    function validateLastName() {
      const result = Validators.validateName(lastNameInput.value, 'Last name');
      if (!result.valid) {
        Validators.showFieldError(lastNameInput, lastNameError, result.error);
        return false;
      }
      Validators.hideFieldError(lastNameInput, lastNameError);
      return true;
    }

    function validateSignupEmail() {
      const result = Validators.validateEmail(signupEmailInput.value.trim());
      if (!result.valid) {
        Validators.showFieldError(signupEmailInput, signupEmailError, result.error);
        return false;
      }
      Validators.hideFieldError(signupEmailInput, signupEmailError);
      return true;
    }

    function validateSignupPassword() {
      const error = Validators.validatePasswordStrength(signupPasswordInput.value);
      if (error) {
        Validators.showFieldError(signupPasswordInput, signupPasswordError, error);
        return false;
      }
      Validators.hideFieldError(signupPasswordInput, signupPasswordError);
      return true;
    }

    function validateConfirmPassword() {
      const result = Validators.validateConfirmPassword(signupPasswordInput.value, confirmPasswordInput.value);
      if (!result.valid) {
        Validators.showFieldError(confirmPasswordInput, confirmPasswordError, result.error);
        return false;
      }
      Validators.hideFieldError(confirmPasswordInput, confirmPasswordError);
      return true;
    }

    firstNameInput.addEventListener('blur', validateFirstName);
    firstNameInput.addEventListener('input', () => {
      if (firstNameInput.classList.contains('is-invalid')) validateFirstName();
    });

    lastNameInput.addEventListener('blur', validateLastName);
    lastNameInput.addEventListener('input', () => {
      if (lastNameInput.classList.contains('is-invalid')) validateLastName();
    });

    signupEmailInput.addEventListener('blur', validateSignupEmail);
    signupEmailInput.addEventListener('input', () => {
      if (signupEmailInput.classList.contains('is-invalid')) validateSignupEmail();
    });

    signupPasswordInput.addEventListener('blur', validateSignupPassword);
    signupPasswordInput.addEventListener('input', () => {
      if (signupPasswordInput.classList.contains('is-invalid')) validateSignupPassword();
      validateConfirmPassword();
    });

    confirmPasswordInput.addEventListener('blur', validateConfirmPassword);
    confirmPasswordInput.addEventListener('input', () => {
      if (confirmPasswordInput.classList.contains('is-invalid')) validateConfirmPassword();
    });

    const acceptTermsBtn = document.getElementById('acceptTermsBtn');
    if (acceptTermsBtn) {
      acceptTermsBtn.addEventListener('click', () => {
        document.getElementById('agreeTerms').checked = true;
        const termsModal = bootstrap.Modal.getInstance(document.getElementById('termsModal'));
        if (termsModal) termsModal.hide();
      });
    }

    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const valid = validateFirstName() && validateLastName() && validateSignupEmail()
        && validateSignupPassword() && validateConfirmPassword();
      if (!valid) return;

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

      setLoadingState(signupButton, true);

      try {
        const data = await window.API.auth.register({
          firstName,
          lastName,
          email,
          password,
          dataProcessingConsent: { given: true },
          healthDataConsent: { given: true }
        });

        const responseData = data.data || data;
        if (responseData.requiresEmailVerification) {
          sessionStorage.setItem('pendingVerificationEmail', responseData.email || '');
          window.location.href = '/verify-email';
          return;
        }
        const { user } = responseData;
        window.Toast.success(`Welcome to JE Fitness, ${user.firstName || 'User'}!`);
        setTimeout(() => { window.location.href = redirectByRole(user.role); }, 1500);
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

  window.AuthSignup = { init };
})();
