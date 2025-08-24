document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const messageDiv = document.getElementById('message');

  // Determine the base URL
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);

const baseUrl = isLocalhost
    ? 'http://localhost:10000'
    : 'https://jojo6550-github-io.onrender.com'; // Replace with your real backend if deployed


  // LOGIN
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const email = loginForm.email.value;
      const password = loginForm.password.value;

      try {
        const res = await fetch(`${baseUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        const data = await res.json();

        if (res.ok) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('userRole', data.user.role);
          
          // Role-based redirection
          if (data.user.role === 'admin') {
            window.location.href = '../pages/admin-dashboard.html';
          } else {
            window.location.href = '../pages/dashboard.html';
          }
        } else {
          showMessage(data.msg || 'Login failed');
        }
      } catch (err) {
        showMessage('Error connecting to server');
      }
    });
  }

  // SIGNUP
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const firstName = document.getElementById('inputFirstName').value;
      const lastName = document.getElementById('inputLastName').value;
      const email = document.getElementById('inputEmail').value;
      const password = document.getElementById('inputPassword').value;

      try {
        const response = await fetch(`${baseUrl}/api/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firstName, lastName, email, password })
        });

        const data = await response.json();

        if (response.ok) {
          alert('Signup successful!');
          window.location.href = '../pages/dashboard.html';
        } else {
          alert(data.msg || 'Signup failed.');
        }
      } catch (err) {
        console.error('Error:', err);
        alert('Signup failed. Please try again.');
      }
    });
  }

  function showMessage(msg) {
    if (messageDiv) {
      messageDiv.textContent = msg;
      messageDiv.style.display = 'block';
    } else {
      alert(msg);
    }
  }
});
