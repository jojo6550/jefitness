const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const User = require('../models/User');

// SIGNUP ROUTE
router.post('/signup', async (req, res) => {
  const { firstName, lastName, email, password } = req.body;
  console.log('Received signup:', req.body);

  // Validate input
  if (!firstName || !lastName || !email || !password) {
    return res.status(400).json({ msg: 'All fields are required.' });
  }

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ msg: 'User already exists.' });

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const newUser = new User({
      firstName,
      lastName,
      email,
      password: hashedPassword
    });

    await newUser.save();

    // Optional: Generate JWT token
    const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, {
      expiresIn: '1h',
    });

    res.status(201).json({
      msg: 'Signup successful',
      token,
      user: {
        id: newUser._id,
        name: `${newUser.firstName} ${newUser.lastName}`,
        email: newUser.email,
      },
    });
  } catch (err) {
    console.error('Signup Error:', err.message);
    res.status(500).json({ msg: 'Server error. Please try again.' });
  }
});

  
  // Login
  router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ msg: 'Missing fields' });
  
    try {
      const user = await User.findOne({ email });
      if (!user) return res.status(400).json({ msg: 'Invalid credentials' });
  
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(400).json({ msg: 'Invalid credentials' });
  
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
      res.json({
        token,
        user: { id: user._id, username: user.username, email: user.email }
      });
    } catch (err) {
      res.status(500).json({ msg: 'Server error' });
    }
  });
  

module.exports = router;
