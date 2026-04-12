(function () {
  const params = new URLSearchParams(window.location.search);
  const consentToken = params.get('token');

  // No token — nothing to consent to; back to login
  if (!consentToken) {
    window.location.href = '/login';
    return;
  }

  const form = document.getElementById('consent-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.getElementById('consentButton');
    const errEl = document.getElementById('consent-error');
    errEl.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Please wait...';

    try {
      const res = await window.API.request('/api/v1/auth/social-consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ consentToken }),
      });

      if (res.success) {
        window.location.href = '/dashboard';
      } else {
        btn.disabled = false;
        btn.textContent = 'Accept & Continue';
        errEl.textContent = 'Something went wrong. Please try again.';
      }
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Accept & Continue';
      errEl.textContent = err.message || 'Something went wrong. Please try again.';
    }
  });
})();
