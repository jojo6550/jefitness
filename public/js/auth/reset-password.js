(function () {
  function init() {
    const resetPasswordForm = document.getElementById('reset-password-form');
    if (!resetPasswordForm) return;

    const { handleApiError } = window.AuthShared;

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

      const strengthError = Validators.validatePasswordStrength(password);
      if (strengthError) {
        window.Toast.warning(strengthError);
        return;
      }

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
          setTimeout(() => { window.location.href = '/login'; }, 2000);
        } else {
          handleApiError(res, data, 'Error resetting password');
        }
      } catch (err) {
        console.error('Reset password error:', err);
        window.Toast.error('Network error. Please try again.');
      }
    });
  }

  window.AuthResetPassword = { init };
})();
