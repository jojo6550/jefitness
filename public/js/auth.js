document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const messageDiv = document.getElementById('message');

  // Determine the base URL
  const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);

const baseUrl = isLocalhost
    ? 'http://localhost:10000'
    : 'https://jefitness.onrender.com'; // Replace with your real backend if deployed


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
          // Hide signup form and show OTP verification form
          signupForm.style.display = 'none';
          document.getElementById('otp-container').style.display = 'block';
          document.getElementById('otp-message').textContent = `We sent a verification code to ${email}`;
        } else {
          alert(data.msg || 'Signup failed.');
        }
      } catch (err) {
        console.error('Error:', err);
        alert('Signup failed. Please try again.');
      }
    });
  }

  // OTP Verification
  const otpForm = document.getElementById('otp-form');
  if (otpForm) {
    otpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('inputEmail').value;
      const otp = document.getElementById('inputOtp').value;

      try {
        const response = await fetch(`${baseUrl}/api/auth/verify-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, otp })
        });

        const data = await response.json();

        if (response.ok) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('userRole', data.user.role);
          alert('Email verified! Welcome to JE Fitness.');
          window.location.href = '../pages/dashboard.html';
        } else {
          alert(data.msg || 'Verification failed.');
        }
      } catch (err) {
        console.error('Error:', err);
        alert('Verification failed. Please try again.');
      }
    });

    // Resend OTP functionality
    document.getElementById('resendOtp').addEventListener('click', async () => {
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

        if (response.ok) {
          alert('OTP resent to your email.');
        } else {
          alert('Failed to resend OTP.');
        }
      } catch (err) {
        console.error('Error:', err);
        alert('Failed to resend OTP.');
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
