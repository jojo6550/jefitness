(function () {
  function init() {
    const forgotPasswordForm = document.getElementById('forgot-password-form');
    if (!forgotPasswordForm) return;

    const { setLoadingState, handleApiError } = window.AuthShared;

    forgotPasswordForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = forgotPasswordForm.email.value;
      const forgotButton = forgotPasswordForm.querySelector('button[type="submit"]');

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

  window.AuthForgotPassword = { init };
})();
