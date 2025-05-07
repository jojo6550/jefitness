// login.js
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.querySelector('.login-form');
    if (!loginForm) return;
  
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
  
      const email = document.getElementById('inputEmail').value;
      const password = document.getElementById('inputPassword').value;
  
      try {
        const res = await fetch('http://localhost:5000/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
  
        const data = await res.json();
        if (res.ok) {
          localStorage.setItem('token', data.token);
          alert(`Welcome ${data.user.username}`);
          window.location.href = '../../index.html'; // Change this to your real dashboard page
        } else {
          document.getElementById('message').textContent = data.msg || 'Login failed';
        }
      } catch (err) {
        console.error(err);
        document.getElementById('message').textContent = 'Error connecting to server.';
      }
    });
  });
  