(function () {
  const API_BASE = window.ApiConfig.getAPI_BASE();

  function show(id) {
    ['stateLoading', 'stateSuccess', 'stateError', 'stateResent'].forEach(s => {
      document.getElementById(s).classList.toggle('d-none', s !== id);
    });
  }

  async function verify() {
    const token = new URLSearchParams(location.search).get('token');
    if (!token) {
      show('stateError');
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/verify-email?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (res.ok && data.success) {
        show('stateSuccess');
      } else {
        document.getElementById('errorMessage').textContent = data.error || 'The link is invalid or has expired.';
        show('stateError');
      }
    } catch {
      document.getElementById('errorMessage').textContent = 'Network error. Please try again.';
      show('stateError');
    }
  }

  document.getElementById('resendForm').addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('resendEmail').value.trim();
    const btn = document.getElementById('resendBtn');
    btn.disabled = true;
    btn.textContent = 'Sending…';

    try {
      await fetch(`${API_BASE}/api/v1/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      show('stateResent');
    } catch {
      btn.disabled = false;
      btn.textContent = 'Resend';
    }
  });

  verify();
})();
