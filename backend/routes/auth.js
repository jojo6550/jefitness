const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const User = require('../models/User');
const nodemailer = require('nodemailer');

// Signup
router.post('/signup', async (req, res) => {
  const { firstName, lastName, email, dob } = req.body;

  // Generate a unique ticket number
  const ticketNumber = 'TICKET-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  const signUpTime = new Date().toISOString();

  try {
    // Send email to admin with the request details
    const transporter = nodemailer.createTransport({
        host: 'mail.protonmail.com',
        port: 25,
        secure: true, // or 'SSL'
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_ADMIN,
      subject: `New Signup Request - Ticket #${ticketNumber}`,
      text: `
        A new user has requested to sign up with the following details:

        Full Name: ${firstName} ${lastName}
        Email: ${email}
        Date of Birth: ${dob}
        Date of Signup: ${signUpTime}
        Ticket Number: ${ticketNumber}

        Please review and create the user profile.
      `,
    };

    await transporter.sendMail(mailOptions);

    res.status(201).json({ msg: 'Signup request sent to admin. Please wait for confirmation.' });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ msg: 'Error during signup' });
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
