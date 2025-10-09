
const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE_URL = isLocalhost
    ? 'http://localhost:10000'
    : 'https://jojo6550-github-io.onrender.com';

window.initDashboard = async () => {
    const token = localStorage.getItem('token');
    if (!token) return; // not logged in

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        console.warn('User data fetch failed');
        const adminLink = document.querySelector('a[href="admin-dashboard.html"]');
        if (adminLink) adminLink.style.display = 'none';
        return;
      }

      const user = await res.json();

      // Hide Admin Dashboard link if not admin
      if (user.role !== 'admin') {
        const adminLink = document.querySelector('a[href="admin-dashboard.html"]');
        if (adminLink) adminLink.style.display = 'none';
      }
    } catch (err) {
      console.error('Error verifying admin status:', err);
      const adminLink = document.querySelector('a[href="admin-dashboard.html"]');
      if (adminLink) adminLink.style.display = 'none';
    }
  };

