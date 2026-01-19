const mongoose = require('mongoose');

const AppointmentSchema = new mongoose.Schema({
    clientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    trainerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    date: {
        type: Date,
        required: true
    },
    time: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['scheduled', 'completed', 'cancelled', 'no_show', 'late'],
        default: 'scheduled'
    },
    notes: {
        type: String
    }
}, {
    timestamps: true
});

// Add indexes for efficient querying
AppointmentSchema.index({ date: 1, time: 1 });
AppointmentSchema.index({ trainerId: 1 });
AppointmentSchema.index({ clientId: 1 });

// Compound indexes for complex queries
AppointmentSchema.index({ trainerId: 1, date: 1 });
AppointmentSchema.index({ trainerId: 1, status: 1 });
AppointmentSchema.index({ clientId: 1, date: 1 });
AppointmentSchema.index({ trainerId: 1, clientId: 1 });
AppointmentSchema.index({ date: 1, trainerId: 1, time: 1 });
AppointmentSchema.index({ status: 1, date: 1 });

module.exports = mongoose.model('Appointment', AppointmentSchema);
