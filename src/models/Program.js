const mongoose = require('mongoose');

const ProgramSchema = new mongoose.Schema({
    title: { 
        type: String, 
        required: true 
    },
    description: { 
        type: String, 
        required: true 
    },
    price: { 
        type: Number, 
        required: true 
    },
    duration: {
        type: String,
        required: true,
        match: [/^\d+\s+(week|weeks|month|months|day|days)$/i, 'Duration must be in format like "4 weeks" or "1 month"']
    },
    level: { 
        type: String, 
        enum: ['Beginner', 'Intermediate', 'Advanced'], 
        required: true 
    },
    frequency: { 
        type: String, 
        required: true 
    },
    sessionLength: { 
        type: String, 
        required: true 
    },
    slug: { 
        type: String, 
        required: true, 
        unique: true 
    },
    features: [{ 
        type: String 
    }],
    isActive: { 
        type: Boolean, 
        default: true 
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

module.exports = mongoose.model('Program', ProgramSchema);