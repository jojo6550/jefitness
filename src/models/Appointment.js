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

module.exports = mongoose.model('Appointment', AppointmentSchema);
