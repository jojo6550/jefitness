const mongoose = require('mongoose');

const ProgramSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  author: {
    type: String,
    required: true,
    trim: true
  },
  goals: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  tags: [{
    type: String,
    lowercase: true,
    trim: true
  }],
  stripeProductId: {
    type: String,
    required: true
  },
  stripePriceId: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  features: [{
    type: String
  }],
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'beginner'
  },
  duration: {
    type: String,
    default: ''
  },
  imageUrl: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Indexes for search and filtering
ProgramSchema.index({ title: 'text', tags: 'text', author: 'text' });
ProgramSchema.index({ isActive: 1 });
ProgramSchema.index({ tags: 1 });

module.exports = mongoose.model('Program', ProgramSchema);