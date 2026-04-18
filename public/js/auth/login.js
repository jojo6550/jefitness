(function () {
  function init() {
    const loginForm = document.getElementById('login-form');
    if (!loginForm) return;

    const { redirectByRole, setLoadingState } = window.AuthShared;

    const emailInput = document.getElementById('inputEmail');
    const passwordInput = document.getElementById('inputPassword');
    const emailError = document.getElementById('emailError');
    const passwordError = document.getElementById('passwordError');

    function validateEmail() {
      const result = Validators.validateEmail(emailInput.value.trim());
      if (!result.valid) {
        Validators.showFieldError(emailInput, emailError, result.error);
        return false;
      }
      Validators.hideFieldError(emailInput, emailError);
      return true;
    }

    function validatePassword() {
      const result = Validators.validatePassword(passwordInput.value);
      if (!result.valid) {
        Validators.showFieldError(passwordInput, passwordError, result.error);
        return false;
      }
      Validators.hideFieldError(passwordInput, passwordError);
      return true;
    }

    emailInput.addEventListener('blur', validateEmail);
    emailInput.addEventListener('input', () => {
      if (emailInput.classList.contains('is-invalid')) validateEmail();
    });

    passwordInput.addEventListener('blur', validatePassword);
    passwordInput.addEventListener('input', () => {
      if (passwordInput.classList.contains('is-invalid')) validatePassword();
    });

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const isEmailValid = validateEmail();
      const isPasswordValid = validatePassword();
      if (!isEmailValid || !isPasswordValid) return;

      const email = loginForm.email.value;
      const password = loginForm.password.value;
      const loginButton = document.getElementById('loginButton');

      setLoadingState(loginButton, true);

      try {
        const data = await window.API.auth.login(email, password);
        const { user } = data.data || data;
        const userRole = user.role || 'user';

        const userName = user.firstName || 'User';
        window.Toast.success(`Welcome back, ${userName}!`);

        const urlParams = new URLSearchParams(window.location.search);
        const redirectPath = urlParams.get('redirect');
        const isSafeRedirect = redirectPath && redirectPath.startsWith('/') && !redirectPath.startsWith('//');

        if (isSafeRedirect) {
          window.location.href = redirectPath;
        } else {
          window.location.href = redirectByRole(userRole);
        }
      } catch (err) {
        console.error('Login error:', err);
        if (err.response?.requiresEmailVerification) {
          sessionStorage.setItem('pendingVerificationEmail', err.response.email || '');
          window.location.href = '/verify-email';
          return;
        }
        if (err.message.includes('Backend service is currently unavailable') || err.message.includes('fetch')) {
          window.Toast.error('Backend service unavailable. Please check server connection.');
        } else if (err.message.includes('HTTP')) {
          window.Toast.error(`Server error: ${err.message}`);
        } else if (err.message.includes('No account found')) {
          window.Toast.error(err.message + ' Redirecting to signup...');
          setTimeout(() => { window.location.href = '/signup'; }, 2000);
        } else if (err.message === 'Incorrect password') {
          window.Toast.error('Wrong password. Try again or use Forgot Password.');
        } else if (err.message.includes('verify your email')) {
          window.Toast.error(err.message + ' Check your inbox.');
        } else {
          window.Toast.error(err.message || 'Login failed. Please try again.');
        }
      } finally {
        setLoadingState(loginButton, false);
      }
    });
  }

  window.AuthLogin = { init };
})();
