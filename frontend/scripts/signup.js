// signup.js
document.addEventListener('DOMContentLoaded', () => {
    const signupForm = document.querySelector('.signup-form');
    if (!signupForm) return;
  
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
  
      const username = document.getElementById('inputName').value;
      const email = document.getElementById('inputEmail').value;
      const password = document.getElementById('inputPassword').value;
      const confirmPassword = document.getElementById('inputConfirmPassword').value;
  
      if (password !== confirmPassword) {
        return alert('Passwords do not match');
      }
  
      try {
        const res = await fetch('http://localhost:5000/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, email, password })
        });
  
        const data = await res.json();
        if (res.ok) {
          alert('Signup successful! Please log in.');
          window.location.href = 'login.html';
        } else {
          alert(data.msg || data.error || 'Signup failed');
        }
      } catch (err) {
        console.error(err);
        alert('Error connecting to server.');
      }
    });
  });
  