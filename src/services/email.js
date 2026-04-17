/**
 * Email service aggregator — re-exports from focused domain modules:
 *   - core: Resend client + generic sendEmail
 *   - calendar: ICS generation + Google/Apple calendar helpers
 *   - templates/auth: password reset + email verification
 *   - templates/subscriptions: renewal reminders
 *   - templates/appointments: booking confirmations + updates + cancellations + daily schedule
 *   - templates/tickets: support ticket notifications
 */

const { sendEmail } = require('./email/core');
const auth = require('./email/templates/auth');
const subscriptions = require('./email/templates/subscriptions');
const appointments = require('./email/templates/appointments');
const tickets = require('./email/templates/tickets');

module.exports = {
  sendEmail,
  sendPasswordReset: auth.sendPasswordReset,
  sendEmailVerification: auth.sendEmailVerification,
  sendSubscriptionReminder: subscriptions.sendSubscriptionReminder,
  sendTrainerDailySchedule: appointments.sendTrainerDailySchedule,
  sendAppointmentConfirmationClient: appointments.sendAppointmentConfirmationClient,
  sendNewAppointmentNotification: appointments.sendNewAppointmentNotification,
  sendAppointmentCancelledTrainer: appointments.sendAppointmentCancelledTrainer,
  sendAppointmentCancelledClient: appointments.sendAppointmentCancelledClient,
  sendAppointmentUpdatedTrainer: appointments.sendAppointmentUpdatedTrainer,
  sendAppointmentUpdatedClient: appointments.sendAppointmentUpdatedClient,
  sendNewTicketAdmin: tickets.sendNewTicketAdmin,
  sendTicketReceived: tickets.sendTicketReceived,
  sendTicketFulfilled: tickets.sendTicketFulfilled,
};
