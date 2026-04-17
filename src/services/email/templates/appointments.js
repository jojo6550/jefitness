const { sendEmail } = require('../core');
const {
  formatTime24to12,
  buildIcs,
  icsAttachment,
  calendarButtonsHtml,
  buildGcalUrl,
  FROM_NAME,
} = require('../calendar');

/**
 * Send a trainer their daily client schedule.
 * @param {string} to - Trainer email
 * @param {string} trainerName - Trainer first name
 * @param {string} dateStr - Human-readable date string (e.g. "Wednesday, April 2, 2026")
 * @param {Array<{clientName: string, time: string}>} appointments - Sorted by time
 */
async function sendTrainerDailySchedule(to, trainerName, dateStr, appointments) {
  const rows = appointments
    .map(
      a =>
        `<tr><td style="padding:8px 12px;border-bottom:1px solid #dee2e6">${a.time}</td><td style="padding:8px 12px;border-bottom:1px solid #dee2e6">${a.clientName}</td></tr>`
    )
    .join('');

  const textLines = appointments.map(a => `  ${a.time}  —  ${a.clientName}`).join('\n');

  return sendEmail({
    to,
    subject: `Your schedule for today — ${dateStr}`,
    text: [
      `Hello ${trainerName},`,
      '',
      `Here are your clients for today (${dateStr}):`,
      '',
      textLines,
      '',
      '— JE Fitness Team',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#343a40">Your Schedule for Today</h2>
        <p>Hello ${trainerName},</p>
        <p>Here are your clients for <strong>${dateStr}</strong>:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <thead>
            <tr style="background:#f8f9fa">
              <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #dee2e6">Time</th>
              <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #dee2e6">Client</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <hr style="border:none;border-top:1px solid #dee2e6;margin:24px 0">
        <p style="color:#6c757d;font-size:13px">— JE Fitness Team</p>
      </div>`,
  });
}

/**
 * Confirm a new appointment booking to the client.
 * @param {string} to - Client email
 * @param {string} clientName - Client first name
 * @param {string} trainerName - Full trainer name
 * @param {string} dateStr - Human-readable date (e.g. "Friday, April 4, 2026")
 * @param {string} time - Appointment time string (e.g. "09:00")
 * @param {string} appointmentId - MongoDB appointment _id
 * @param {string} date - ISO date string
 */
async function sendAppointmentConfirmationClient(
  to,
  clientName,
  trainerName,
  dateStr,
  time,
  appointmentId,
  date
) {
  const displayTime = formatTime24to12(time);

  const summary = `Fitness Session with ${trainerName}`;
  const description = `Appointment with trainer ${trainerName} at JE Fitness.\nDate: ${dateStr}\nTime: ${displayTime}`;
  const gcalUrl = buildGcalUrl({ summary, description, date, time });
  const ics = buildIcs({
    uid: appointmentId,
    summary,
    description,
    date,
    time,
    organizer: FROM_NAME,
    method: 'REQUEST',
    sequence: 0,
  });

  return sendEmail({
    to,
    subject: `Appointment confirmed — ${dateStr} at ${displayTime}`,
    text: [
      `Hello ${clientName},`,
      '',
      'Your appointment has been confirmed:',
      '',
      `  Trainer: ${trainerName}`,
      `  Date:    ${dateStr}`,
      `  Time:    ${displayTime}`,
      '',
      `Add to Google Calendar: ${gcalUrl}`,
      'Or open the attached .ics file to add to Apple Calendar / Outlook.',
      '',
      '— JE Fitness Team',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#343a40">Appointment Confirmed</h2>
        <p>Hello ${clientName},</p>
        <p>Your appointment has been booked successfully:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr style="background:#f8f9fa">
            <td style="padding:10px 14px;font-weight:600;border-bottom:1px solid #dee2e6;width:35%">Trainer</td>
            <td style="padding:10px 14px;border-bottom:1px solid #dee2e6">${trainerName}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;font-weight:600;border-bottom:1px solid #dee2e6">Date</td>
            <td style="padding:10px 14px;border-bottom:1px solid #dee2e6">${dateStr}</td>
          </tr>
          <tr style="background:#f8f9fa">
            <td style="padding:10px 14px;font-weight:600">Time</td>
            <td style="padding:10px 14px">${displayTime}</td>
          </tr>
        </table>
        ${calendarButtonsHtml(gcalUrl)}
        <hr style="border:none;border-top:1px solid #dee2e6;margin:24px 0">
        <p style="color:#6c757d;font-size:13px">— JE Fitness Team</p>
      </div>`,
    attachments: [icsAttachment(ics)],
  });
}

/**
 * Notify a trainer of a single new appointment booking.
 * @param {string} to - Trainer email
 * @param {string} trainerName - Trainer first name
 * @param {string} clientName - Full client name
 * @param {string} dateStr - Human-readable date (e.g. "Friday, April 4, 2026")
 * @param {string} time - Appointment time string (e.g. "09:00")
 */
async function sendNewAppointmentNotification(
  to,
  trainerName,
  clientName,
  dateStr,
  time,
  appointmentId,
  date
) {
  const displayTime = formatTime24to12(time);

  const summary = `Fitness Session with ${clientName}`;
  const description = `Appointment with client ${clientName} at JE Fitness.\nDate: ${dateStr}\nTime: ${displayTime}`;
  const gcalUrl = buildGcalUrl({ summary, description, date, time });
  const ics = buildIcs({
    uid: appointmentId,
    summary,
    description,
    date,
    time,
    organizer: FROM_NAME,
    method: 'REQUEST',
    sequence: 0,
  });

  return sendEmail({
    to,
    subject: `New appointment booked — ${clientName} on ${dateStr}`,
    text: [
      `Hello ${trainerName},`,
      '',
      `A new appointment has been booked with you:`,
      '',
      `  Client: ${clientName}`,
      `  Date:   ${dateStr}`,
      `  Time:   ${displayTime}`,
      '',
      `Add to Google Calendar: ${gcalUrl}`,
      'Or open the attached .ics file to add to Apple Calendar / Outlook.',
      '',
      '— JE Fitness Team',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#343a40">New Appointment Booked</h2>
        <p>Hello ${trainerName},</p>
        <p>A new appointment has been scheduled with you:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr style="background:#f8f9fa">
            <td style="padding:10px 14px;font-weight:600;border-bottom:1px solid #dee2e6;width:35%">Client</td>
            <td style="padding:10px 14px;border-bottom:1px solid #dee2e6">${clientName}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;font-weight:600;border-bottom:1px solid #dee2e6">Date</td>
            <td style="padding:10px 14px;border-bottom:1px solid #dee2e6">${dateStr}</td>
          </tr>
          <tr style="background:#f8f9fa">
            <td style="padding:10px 14px;font-weight:600">Time</td>
            <td style="padding:10px 14px">${displayTime}</td>
          </tr>
        </table>
        ${calendarButtonsHtml(gcalUrl)}
        <hr style="border:none;border-top:1px solid #dee2e6;margin:24px 0">
        <p style="color:#6c757d;font-size:13px">— JE Fitness Team</p>
      </div>`,
    attachments: [icsAttachment(ics)],
  });
}

/**
 * Notify trainer that an appointment was cancelled or deleted.
 * @param {string} to - Trainer email
 * @param {string} trainerName - Trainer first name
 * @param {string} clientName - Full client name
 * @param {string} dateStr - Human-readable date
 * @param {string} time - Appointment time string (e.g. "09:00")
 * @param {string} reason - 'cancelled' | 'deleted'
 */
async function sendAppointmentCancelledTrainer(
  to,
  trainerName,
  clientName,
  dateStr,
  time,
  reason = 'cancelled',
  appointmentId,
  date
) {
  const displayTime = formatTime24to12(time);
  const verb = reason === 'deleted' ? 'removed' : 'cancelled';
  const Verb = reason === 'deleted' ? 'Removed' : 'Cancelled';

  const ics = buildIcs({
    uid: appointmentId,
    summary: `Fitness Session with ${clientName}`,
    description: `Appointment with client ${clientName} at JE Fitness.\nDate: ${dateStr}\nTime: ${displayTime}`,
    date,
    time,
    organizer: FROM_NAME,
    method: 'CANCEL',
    sequence: 1,
  });

  return sendEmail({
    to,
    subject: `Appointment ${verb} — ${clientName} on ${dateStr}`,
    text: [
      `Hello ${trainerName},`,
      '',
      `An appointment with ${clientName} has been ${verb}:`,
      '',
      `  Client: ${clientName}`,
      `  Date:   ${dateStr}`,
      `  Time:   ${displayTime}`,
      '',
      'The attached .ics file will remove this event from your calendar.',
      '',
      '— JE Fitness Team',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#343a40">Appointment ${Verb}</h2>
        <p>Hello ${trainerName},</p>
        <p>The following appointment has been ${verb}:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr style="background:#f8f9fa">
            <td style="padding:10px 14px;font-weight:600;border-bottom:1px solid #dee2e6;width:35%">Client</td>
            <td style="padding:10px 14px;border-bottom:1px solid #dee2e6">${clientName}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;font-weight:600;border-bottom:1px solid #dee2e6">Date</td>
            <td style="padding:10px 14px;border-bottom:1px solid #dee2e6">${dateStr}</td>
          </tr>
          <tr style="background:#f8f9fa">
            <td style="padding:10px 14px;font-weight:600">Time</td>
            <td style="padding:10px 14px">${displayTime}</td>
          </tr>
        </table>
        <p style="font-size:14px;color:#495057">📎 Open the attached <strong>.ics file</strong> to remove this event from your calendar.</p>
        <hr style="border:none;border-top:1px solid #dee2e6;margin:24px 0">
        <p style="color:#6c757d;font-size:13px">— JE Fitness Team</p>
      </div>`,
    attachments: [icsAttachment(ics)],
  });
}

/**
 * Notify client that their appointment was cancelled or deleted.
 * @param {string} to - Client email
 * @param {string} clientName - Client first name
 * @param {string} trainerName - Full trainer name
 * @param {string} dateStr - Human-readable date
 * @param {string} time - Appointment time string (e.g. "09:00")
 * @param {string} reason - 'cancelled' | 'deleted'
 */
async function sendAppointmentCancelledClient(
  to,
  clientName,
  trainerName,
  dateStr,
  time,
  reason = 'cancelled',
  appointmentId,
  date
) {
  const displayTime = formatTime24to12(time);
  const verb = reason === 'deleted' ? 'removed' : 'cancelled';
  const Verb = reason === 'deleted' ? 'Removed' : 'Cancelled';

  const ics = buildIcs({
    uid: appointmentId,
    summary: `Fitness Session with ${trainerName}`,
    description: `Appointment with trainer ${trainerName} at JE Fitness.\nDate: ${dateStr}\nTime: ${displayTime}`,
    date,
    time,
    organizer: FROM_NAME,
    method: 'CANCEL',
    sequence: 1,
  });

  return sendEmail({
    to,
    subject: `Your appointment on ${dateStr} has been ${verb}`,
    text: [
      `Hello ${clientName},`,
      '',
      `Your appointment has been ${verb}:`,
      '',
      `  Trainer: ${trainerName}`,
      `  Date:    ${dateStr}`,
      `  Time:    ${displayTime}`,
      '',
      'The attached .ics file will remove this event from your calendar.',
      'If you have questions, please contact us.',
      '',
      '— JE Fitness Team',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#343a40">Appointment ${Verb}</h2>
        <p>Hello ${clientName},</p>
        <p>Your appointment has been ${verb}:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr style="background:#f8f9fa">
            <td style="padding:10px 14px;font-weight:600;border-bottom:1px solid #dee2e6;width:35%">Trainer</td>
            <td style="padding:10px 14px;border-bottom:1px solid #dee2e6">${trainerName}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;font-weight:600;border-bottom:1px solid #dee2e6">Date</td>
            <td style="padding:10px 14px;border-bottom:1px solid #dee2e6">${dateStr}</td>
          </tr>
          <tr style="background:#f8f9fa">
            <td style="padding:10px 14px;font-weight:600">Time</td>
            <td style="padding:10px 14px">${displayTime}</td>
          </tr>
        </table>
        <p style="font-size:14px;color:#495057">📎 Open the attached <strong>.ics file</strong> to remove this event from your calendar.</p>
        <p>If you have any questions, please contact us.</p>
        <hr style="border:none;border-top:1px solid #dee2e6;margin:24px 0">
        <p style="color:#6c757d;font-size:13px">— JE Fitness Team</p>
      </div>`,
    attachments: [icsAttachment(ics)],
  });
}

/**
 * Notify trainer that an appointment was updated (date/time/notes changed).
 * @param {string} to - Trainer email
 * @param {string} trainerName - Trainer first name
 * @param {string} clientName - Full client name
 * @param {string} dateStr - Human-readable date (new)
 * @param {string} time - Appointment time string (new, e.g. "09:00")
 */
async function sendAppointmentUpdatedTrainer(
  to,
  trainerName,
  clientName,
  dateStr,
  time,
  appointmentId,
  date
) {
  const displayTime = formatTime24to12(time);

  const summary = `Fitness Session with ${clientName}`;
  const description = `Updated appointment with client ${clientName} at JE Fitness.\nDate: ${dateStr}\nTime: ${displayTime}`;
  const gcalUrl = buildGcalUrl({ summary, description, date, time });
  const ics = buildIcs({
    uid: appointmentId,
    summary,
    description,
    date,
    time,
    organizer: FROM_NAME,
    method: 'REQUEST',
    sequence: 1,
  });

  return sendEmail({
    to,
    subject: `Appointment updated — ${clientName} on ${dateStr}`,
    text: [
      `Hello ${trainerName},`,
      '',
      `An appointment with ${clientName} has been updated:`,
      '',
      `  Client: ${clientName}`,
      `  Date:   ${dateStr}`,
      `  Time:   ${displayTime}`,
      '',
      `Add to Google Calendar: ${gcalUrl}`,
      'Or open the attached .ics file to update in Apple Calendar / Outlook.',
      '',
      '— JE Fitness Team',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#343a40">Appointment Updated</h2>
        <p>Hello ${trainerName},</p>
        <p>An appointment with ${clientName} has been updated. Here are the new details:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr style="background:#f8f9fa">
            <td style="padding:10px 14px;font-weight:600;border-bottom:1px solid #dee2e6;width:35%">Client</td>
            <td style="padding:10px 14px;border-bottom:1px solid #dee2e6">${clientName}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;font-weight:600;border-bottom:1px solid #dee2e6">Date</td>
            <td style="padding:10px 14px;border-bottom:1px solid #dee2e6">${dateStr}</td>
          </tr>
          <tr style="background:#f8f9fa">
            <td style="padding:10px 14px;font-weight:600">Time</td>
            <td style="padding:10px 14px">${displayTime}</td>
          </tr>
        </table>
        ${calendarButtonsHtml(gcalUrl)}
        <hr style="border:none;border-top:1px solid #dee2e6;margin:24px 0">
        <p style="color:#6c757d;font-size:13px">— JE Fitness Team</p>
      </div>`,
    attachments: [icsAttachment(ics)],
  });
}

/**
 * Notify client that their appointment was updated.
 * @param {string} to - Client email
 * @param {string} clientName - Client first name
 * @param {string} trainerName - Full trainer name
 * @param {string} dateStr - Human-readable date (new)
 * @param {string} time - Appointment time string (new, e.g. "09:00")
 */
async function sendAppointmentUpdatedClient(
  to,
  clientName,
  trainerName,
  dateStr,
  time,
  appointmentId,
  date
) {
  const displayTime = formatTime24to12(time);

  const summary = `Fitness Session with ${trainerName}`;
  const description = `Updated appointment with trainer ${trainerName} at JE Fitness.\nDate: ${dateStr}\nTime: ${displayTime}`;
  const gcalUrl = buildGcalUrl({ summary, description, date, time });
  const ics = buildIcs({
    uid: appointmentId,
    summary,
    description,
    date,
    time,
    organizer: FROM_NAME,
    method: 'REQUEST',
    sequence: 1,
  });

  return sendEmail({
    to,
    subject: `Your appointment on ${dateStr} has been updated`,
    text: [
      `Hello ${clientName},`,
      '',
      `Your appointment has been updated. Here are the new details:`,
      '',
      `  Trainer: ${trainerName}`,
      `  Date:    ${dateStr}`,
      `  Time:    ${displayTime}`,
      '',
      `Add to Google Calendar: ${gcalUrl}`,
      'Or open the attached .ics file to update in Apple Calendar / Outlook.',
      'If you have questions, please contact us.',
      '',
      '— JE Fitness Team',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#343a40">Appointment Updated</h2>
        <p>Hello ${clientName},</p>
        <p>Your appointment has been updated. Here are the new details:</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <tr style="background:#f8f9fa">
            <td style="padding:10px 14px;font-weight:600;border-bottom:1px solid #dee2e6;width:35%">Trainer</td>
            <td style="padding:10px 14px;border-bottom:1px solid #dee2e6">${trainerName}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;font-weight:600;border-bottom:1px solid #dee2e6">Date</td>
            <td style="padding:10px 14px;border-bottom:1px solid #dee2e6">${dateStr}</td>
          </tr>
          <tr style="background:#f8f9fa">
            <td style="padding:10px 14px;font-weight:600">Time</td>
            <td style="padding:10px 14px">${displayTime}</td>
          </tr>
        </table>
        ${calendarButtonsHtml(gcalUrl)}
        <p>If you have any questions, please contact us.</p>
        <hr style="border:none;border-top:1px solid #dee2e6;margin:24px 0">
        <p style="color:#6c757d;font-size:13px">— JE Fitness Team</p>
      </div>`,
    attachments: [icsAttachment(ics)],
  });
}

module.exports = {
  sendTrainerDailySchedule,
  sendAppointmentConfirmationClient,
  sendNewAppointmentNotification,
  sendAppointmentCancelledTrainer,
  sendAppointmentCancelledClient,
  sendAppointmentUpdatedTrainer,
  sendAppointmentUpdatedClient,
};
