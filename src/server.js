// server.js (or app.js)
const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');


// Load environment variables from .env file
dotenv.config();

const app = express();

// Middleware
app.use(express.json()); // Body parser for JSON requests
app.use(cors()); // Enable CORS for all routes (adjust as needed for security in production)

// Serve static files from the 'public' directory
// IMPORTANT: Ensure your frontend files (HTML, CSS, JS, images, favicons)
// are organized within a 'public' folder at the root of your backend project.
app.use(express.static('public')); // <--- ADDED THIS LINE

// Connect to MongoDB
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            // useCreateIndex: true, // Deprecated in Mongoose 6+
            // useFindAndModify: false // Deprecated in Mongoose 6+
        });
        console.log('MongoDB Connected...');
    } catch (err) {
        console.error('MongoDB Connection Error:', err.message);
        process.exit(1); // Exit process with failure
    }
};
connectDB();

// Define Routes
app.use('/api/auth', require('./routes/auth'));



// Basic test route
app.get('/', (req, res) => res.send('API Running'));

// Generic Error Handling Middleware (IMPORTANT for catching unhandled errors and sending JSON)
// This should be placed after all your routes
app.use((err, req, res, next) => {
    console.error('Unhandled Server Error:', err.stack); // Log the full error stack for debugging
    if (res.headersSent) { // Check if headers have already been sent
        return next(err); // If so, defer to default Express error handler
    }
    res.status(500).json({ msg: 'Something went wrong on the server. Please try again later.' });
});


const PORT = process.env.PORT || 5000;

app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
