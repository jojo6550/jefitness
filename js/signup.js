// scripts/signup.js

document.getElementById("signup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
  
    const name = document.getElementById("inputName").value.trim();
    const email = document.getElementById("inputEmail").value.trim();
    const password = document.getElementById("inputPassword").value;
    const confirmPassword = document.getElementById("inputConfirmPassword").value;
  
    if (password !== confirmPassword) {
      alert("Passwords do not match!");
      return;
    }
  
    try {
      const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
      const user = userCredential.user;
  
      // Optionally store name in Firestore or update user profile
      await user.updateProfile({ displayName: name });
  
      alert("Sign-up successful!");
      // Redirect or show dashboard
      window.location.href = "login.html";
    } catch (error) {
      alert("Error: " + error.message);
    }
  });
  