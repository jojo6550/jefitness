const mongoose = require('mongoose');

const AppointmentSchema = new mongoose.Schema(
  {
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    trainerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    time: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['scheduled', 'completed', 'cancelled', 'no_show', 'late'],
      default: 'scheduled',
    },
    notes: {
      type: String,
    },
    statusUpdatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Add indexes for efficient querying
AppointmentSchema.index({ date: 1 });
AppointmentSchema.index({ trainerId: 1 });
AppointmentSchema.index({ clientId: 1 });
AppointmentSchema.index({ trainerId: 1, date: 1 });
AppointmentSchema.index({ clientId: 1, date: 1 });

// Prevent double-booking: trainer cannot have two non-cancelled appointments at same date+time
AppointmentSchema.index(
  { trainerId: 1, date: 1, time: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $ne: 'cancelled' } },
    name: 'unique_trainer_slot',
  }
);

module.exports = mongoose.model('Appointment', AppointmentSchema);
