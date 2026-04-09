(function () {
  const API_BASE = window.ApiConfig.getAPI_BASE();
  const STATES = ['statePending', 'stateLoading', 'stateSuccess', 'stateError', 'stateResent'];
  let pollInterval = null;

  function show(id) {
    STATES.forEach(s => {
      document.getElementById(s).classList.toggle('d-none', s !== id);
    });
  }

  // ── Pending state: no token in URL, user just signed up ──────────────────
  function showPending() {
    const email = sessionStorage.getItem('pendingVerificationEmail');
    document.getElementById('pendingEmail').textContent = email || 'your email address';
    show('statePending');

    // Poll every 3 seconds to check if email has been verified
    pollInterval = setInterval(async () => {
      if (!email) return;
      try {
        const res = await fetch(`${API_BASE}/api/v1/auth/check-verification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        const data = await res.json();
        if (res.ok && data.verified) {
          clearInterval(pollInterval);
          sessionStorage.removeItem('pendingVerificationEmail');
          handleVerified(data);
        }
      } catch {
        // silently ignore network errors during polling
      }
    }, 3000);
  }

  // ── Token link: verify the token from the URL ─────────────────────────────
  async function verifyToken(token) {
    show('stateLoading');
    try {
      const res = await fetch(`${API_BASE}/api/v1/auth/verify-email?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (res.ok && data.success) {
        handleVerified(data);
      } else {
        document.getElementById('errorMessage').textContent =
          data.error?.message || data.error || 'The link is invalid or has expired.';
        show('stateError');
      }
    } catch {
      document.getElementById('errorMessage').textContent = 'Network error. Please try again.';
      show('stateError');
    }
  }

  // ── After successful verification: cookie is set by server, go to dashboard ─
  function handleVerified(data) {
    show('stateSuccess');
    setTimeout(() => {
      window.location.href = '/dashboard';
    }, 2000);
  }

  // ── Resend from pending state (uses stored email) ─────────────────────────
  document.getElementById('resendFormPending').addEventListener('submit', async e => {
    e.preventDefault();
    const email = sessionStorage.getItem('pendingVerificationEmail');
    if (!email) return;
    const btn = document.getElementById('resendBtnPending');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    try {
      await fetch(`${API_BASE}/api/v1/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      btn.textContent = 'Sent!';
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = 'Resend Email';
      }, 5000);
    } catch {
      btn.disabled = false;
      btn.textContent = 'Resend Email';
    }
  });

  // ── Resend from error state (manual email entry) ──────────────────────────
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

  // ── Entry point ───────────────────────────────────────────────────────────
  const token = new URLSearchParams(location.search).get('token');
  if (token) {
    verifyToken(token);
  } else {
    showPending();
  }
})();
