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
    preview: {
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
        required: true
    },
    features: [{ 
        type: String 
    }],
    days: [
        {
            dayName: { type: String, required: true },
            exercises: [
                {
                    name: { type: String, required: true },
                    sets: { type: Number, required: true },
                    reps: { type: String, required: true },
                    notes: { type: String }
                }
            ]
        }
    ],
    isActive: { 
        type: Boolean, 
        default: true 
    },
    isPublished: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Database indexes for optimization
ProgramSchema.index({ slug: 1 }, { unique: true });
ProgramSchema.index({ level: 1 });
ProgramSchema.index({ isPublished: 1 });
ProgramSchema.index({ isActive: 1 });
ProgramSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Program', ProgramSchema);
