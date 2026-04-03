const mongoose = require('mongoose');

const TrainerAvailabilitySchema = new mongoose.Schema(
  {
    trainerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    dayOfWeek: {
      type: Number,
      required: true,
      min: 0,
      max: 6,
    },
    // 24-hour format, e.g. 9 = 9:00 AM, 17 = 5:00 PM
    startHour: {
      type: Number,
      required: true,
      min: 0,
      max: 23,
    },
    endHour: {
      type: Number,
      required: true,
      min: 1,
      max: 24,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Max clients per 1-hour slot (default 6, enforced at booking time)
    slotCapacity: {
      type: Number,
      default: 6,
      min: 1,
      max: 50,
    },
  },
  {
    timestamps: true,
  }
);

// One availability window per trainer per day
TrainerAvailabilitySchema.index({ trainerId: 1, dayOfWeek: 1 }, { unique: true });

TrainerAvailabilitySchema.path('endHour').validate(function (value) {
  return value > this.startHour;
}, 'endHour must be greater than startHour');

module.exports = mongoose.model('TrainerAvailability', TrainerAvailabilitySchema);
