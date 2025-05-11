document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const messageDiv = document.getElementById('message');
    
    // Determine the base URL based on the environment
    const baseUrl = window.location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://jojo6550-github-io.onrender.com';

    // LOGIN
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = loginForm.email.value;
        const password = loginForm.password.value;

        try {
          // Use the dynamic base URL for login
          const res = await fetch(`${baseUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });

          const data = await res.json();
          if (res.ok) {
            localStorage.setItem('token', data.token); // store JWT
            window.location.href = '../public/dashboard.html'; // redirect
          } else {
            showMessage(data.message || 'Login failed');
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

      const firstName = signupForm.firstName.value;
      const lastName = signupForm.lastName.value;
      const email = signupForm.email.value;
      const dob = signupForm.dob.value;

      try {
        // Use the dynamic base URL for signup
        const res = await fetch(`${baseUrl}/api/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ firstName, lastName, email, dob })
        });

        const data = await res.json();
        if (res.ok) {
          showMessage('Signup request sent! Admin will review your details shortly.');
          setTimeout(() => {
            window.location.href = 'login.html';
          }, 1500);
        } else {
          showMessage(data.message || 'Signup failed');
        }
      } catch (err) {
        showMessage('Error connecting to server');
      }
    });
  }

  function showMessage(msg) {
    if (messageDiv) {
      messageDiv.innerText = msg;
      messageDiv.style.color = 'red';
    } else {
      alert(msg);
    }
  }
});
