/**
 * Appointment email orchestration helpers.
 * Wraps the email template calls + appointment normalization/population
 * utilities used by the appointment controller.
 */

const { logger } = require('./logger');
const {
  sendAppointmentConfirmationClient,
  sendNewAppointmentNotification,
  sendAppointmentCancelledTrainer,
  sendAppointmentCancelledClient,
  sendAppointmentUpdatedTrainer,
  sendAppointmentUpdatedClient,
} = require('./email');

/** Normalize a date to YYYY-MM-DD string, handle string/Date/timestamp */
function normalizeAppointmentDate(date) {
  const normalized =
    typeof date === 'string'
      ? date.slice(0, 10)
      : new Date(date).toISOString().slice(0, 10);
  return new Date(normalized + 'T00:00:00.000Z');
}

/** Format date for email display */
function formatApptDateForEmail(date) {
  return new Date(date).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Extract and format appointment participant names */
function extractApptNames(appointment) {
  const clientName = appointment.clientId
    ? `${appointment.clientId.firstName} ${appointment.clientId.lastName}`
    : 'Unknown Client';
  const trainerName = appointment.trainerId
    ? `${appointment.trainerId.firstName} ${appointment.trainerId.lastName}`
    : 'Unknown Trainer';
  return { clientName, trainerName };
}

/** Populate both clientId and trainerId on appointment */
async function populateAppointmentParticipants(appointment, fields = {}) {
  const clientFields = fields.client || 'firstName lastName email';
  const trainerFields = fields.trainer || 'firstName lastName email';
  await appointment.populate('clientId', clientFields);
  await appointment.populate('trainerId', trainerFields);
}

/** Send appointment notification emails */
async function sendApptEmails(appointment, action, clientName, trainerName, dateStr) {
  const apptId = appointment._id.toString();
  const apptDate =
    appointment.date instanceof Date ? appointment.date.toISOString() : appointment.date;
  const { time, clientId, trainerId } = appointment;

  if (action === 'created') {
    if (clientId?.email) {
      sendAppointmentConfirmationClient(
        clientId.email,
        clientId.firstName,
        trainerName,
        dateStr,
        time,
        apptId,
        apptDate
      ).catch(e =>
        logger.warn('Failed to send booking confirmation', { error: e.message })
      );
    }
  } else if (action === 'cancelled') {
    if (clientId?.email) {
      sendAppointmentCancelledClient(
        clientId.email,
        clientId.firstName,
        trainerName,
        dateStr,
        time,
        'cancelled',
        apptId,
        apptDate
      ).catch(e =>
        logger.warn('Failed to send cancellation to client', { error: e.message })
      );
    }
    if (trainerId?.trainerEmailPreference === 'individual' && trainerId?.email) {
      sendAppointmentCancelledTrainer(
        trainerId.email,
        trainerId.firstName,
        clientName,
        dateStr,
        time,
        'cancelled',
        apptId,
        apptDate
      ).catch(e =>
        logger.warn('Failed to send cancellation to trainer', { error: e.message })
      );
    }
  } else if (action === 'deleted') {
    if (clientId?.email) {
      sendAppointmentCancelledClient(
        clientId.email,
        clientId.firstName,
        trainerName,
        dateStr,
        time,
        'deleted',
        apptId,
        apptDate
      ).catch(e =>
        logger.warn('Failed to send deletion to client', { error: e.message })
      );
    }
    if (trainerId?.trainerEmailPreference === 'individual' && trainerId?.email) {
      sendAppointmentCancelledTrainer(
        trainerId.email,
        trainerId.firstName,
        clientName,
        dateStr,
        time,
        'deleted',
        apptId,
        apptDate
      ).catch(e =>
        logger.warn('Failed to send deletion to trainer', { error: e.message })
      );
    }
  } else if (action === 'updated') {
    if (clientId?.email) {
      sendAppointmentUpdatedClient(
        clientId.email,
        clientId.firstName,
        trainerName,
        dateStr,
        time,
        apptId,
        apptDate
      ).catch(e => logger.warn('Failed to send update to client', { error: e.message }));
    }
    if (trainerId?.trainerEmailPreference === 'individual' && trainerId?.email) {
      sendAppointmentUpdatedTrainer(
        trainerId.email,
        trainerId.firstName,
        clientName,
        dateStr,
        time,
        apptId,
        apptDate
      ).catch(e => logger.warn('Failed to send update to trainer', { error: e.message }));
    }
  } else if (action === 'created_trainer_individual') {
    if (trainerId?.email && trainerId?.trainerEmailPreference === 'individual') {
      sendNewAppointmentNotification(
        trainerId.email,
        trainerId.firstName,
        clientName,
        dateStr,
        time,
        apptId,
        apptDate
      ).catch(e =>
        logger.warn('Failed to send individual appointment notification', {
          error: e.message,
        })
      );
    }
  }
}

/** Validate status transition based on role */
function validateStatusTransition(
  role,
  currentStatus,
  newStatus,
  trainerMatch,
  clientMatch
) {
  if (role === 'admin') return true;
  if (
    role === 'trainer' &&
    trainerMatch &&
    ['completed', 'no_show', 'late'].includes(newStatus)
  ) {
    return true;
  }
  if (clientMatch && newStatus === 'cancelled') return true;
  return false;
}

module.exports = {
  normalizeAppointmentDate,
  formatApptDateForEmail,
  extractApptNames,
  populateAppointmentParticipants,
  sendApptEmails,
  validateStatusTransition,
};
