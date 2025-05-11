// main.js
firebase.initializeApp(firebaseConfig);

// Example: Firebase Auth listener
firebase.auth().onAuthStateChanged(user => {
  if (user) {
    console.log("User is signed in:", user.email);
  } else {
    console.log("No user signed in.");
  }
});
