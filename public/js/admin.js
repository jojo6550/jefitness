
  document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = 'dashboard.html'; // redirect if no token
      return;
    }

    try {
      const res = await fetch('/api/auth/me', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      const user = await res.json();
      if (user.role !== 'admin') {
        window.location.href = 'dashboard.html'; // redirect non-admins
      }
    } catch (err) {
      console.error('Access check failed:', err);
      window.location.href = 'dashboard.html';
    }
  });

