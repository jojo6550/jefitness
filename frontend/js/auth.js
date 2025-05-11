document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const messageDiv = document.getElementById('message');
  
    // LOGIN
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
  
        const email = loginForm.email.value;
        const password = loginForm.password.value;
  
        try {
          const res = await fetch('http://localhost:5000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });
  
          const data = await res.json();
          if (res.ok) {
            localStorage.setItem('token', data.token); // store JWT
            window.location.href = '/pages/dashboard.html'; // redirect
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
  
        const username = signupForm.username.value;
        const email = signupForm.email.value;
        const password = signupForm.password.value;
        const confirm = document.getElementById('inputConfirmPassword').value;
  
        if (password !== confirm) {
          return showMessage('Passwords do not match');
        }
  
        try {
          const res = await fetch('http://localhost:5000/api/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
          });
  
          const data = await res.json();
          if (res.ok) {
            showMessage('Account created! Redirecting to login...');
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
  