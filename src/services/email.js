/**
 * Email service using Resend (https://resend.com).
 * Requires RESEND_API_KEY environment variable.
 * If the key is not set, emails are logged and skipped gracefully.
 */

const { logger } = require('./logger');

const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@jefitnessja.com';
const FROM_NAME = process.env.FROM_NAME || 'JE Fitness';
const APP_URL = process.env.APP_URL || 'https://jefitnessja.com';

function getResendClient() {
  if (!process.env.RESEND_API_KEY) return null;
  const { Resend } = require('resend');
  return new Resend(process.env.RESEND_API_KEY);
}

/**
 * Send a transactional email via Resend.
 * @param {object} opts
 * @param {string} opts.to - Recipient email
 * @param {string} [opts.toName] - Recipient name (used in display)
 * @param {string} opts.subject - Email subject
 * @param {string} opts.html - HTML body
 * @param {string} opts.text - Plain-text body
 */
async function sendEmail({ to, subject, html, text, attachments }) {
  const client = getResendClient();

  if (!client) {
    logger.warn('Email service not configured (RESEND_API_KEY missing). Email skipped.', { to, subject });
    return;
  }

  const payload = {
    from: `${FROM_NAME} <${FROM_EMAIL}>`,
    to,
    subject,
    html,
    text,
  };

  if (attachments && attachments.length > 0) {
    payload.attachments = attachments;
  }

  const { data, error } = await client.emails.send(payload);

  if (error) {
    logger.error('Resend failed to send email', { to, subject, error: error.message });
    throw new Error(error.message);
  }

  logger.info('Email sent via Resend', { to, subject, id: data?.id });
}

/**
 * Build an iCalendar (.ics) string for an appointment event.
 * @param {object} opts
 * @param {string} opts.uid        - Stable unique ID (MongoDB appointment _id)
 * @param {string} opts.summary    - Event title
 * @param {string} opts.description
 * @param {string} opts.date       - ISO date string (appointment date)
 * @param {string} opts.time       - "HH:MM" in 24-hour format
 * @param {number} opts.durationMinutes - Default 60
 * @param {string} opts.organizer  - Organizer display name
 * @param {string} opts.method     - 'REQUEST' (new/update) | 'CANCEL'
 * @param {number} opts.sequence   - 0 for new, 1+ for updates/cancels
 * @returns {string} iCalendar content
 */
function buildIcs({ uid, summary, description, date, time, durationMinutes = 60, organizer, method = 'REQUEST', sequence = 0 }) {
  // Parse date + time into UTC components
  const [year, month, day] = date.split('T')[0].split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);

  const pad = n => String(n).padStart(2, '0');
  const dtStart = `${year}${pad(month)}${pad(day)}T${pad(hour)}${pad(minute)}00`;

  // Calculate end time
  const startMs = new Date(Date.UTC(year, month - 1, day, hour, minute)).getTime();
  const endDate = new Date(startMs + durationMinutes * 60 * 1000);
  const dtEnd = [
    endDate.getUTCFullYear(),
    pad(endDate.getUTCMonth() + 1),
    pad(endDate.getUTCDate()),
    'T',
    pad(endDate.getUTCHours()),
    pad(endDate.getUTCMinutes()),
    '00',
  ].join('');

  const now = new Date();
  const dtStamp = [
    now.getUTCFullYear(),
    pad(now.getUTCMonth() + 1),
    pad(now.getUTCDate()),
    'T',
    pad(now.getUTCHours()),
    pad(now.getUTCMinutes()),
    pad(now.getUTCSeconds()),
    'Z',
  ].join('');

  // Escape special chars for iCal text fields
  const esc = s => (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//JE Fitness//Appointment//EN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${uid}@jefitnessja.com`,
    `DTSTAMP:${dtStamp}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${esc(summary)}`,
    `DESCRIPTION:${esc(description)}`,
    `ORGANIZER;CN=${esc(organizer)}:mailto:${FROM_EMAIL}`,
    `SEQUENCE:${sequence}`,
    `STATUS:${method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.join('\r\n');
}

/**
 * Build the calendar attachment object for Resend.
 * @param {string} icsContent - Output of buildIcs()
 * @returns {{ filename: string, content: string, contentType: string }}
 */
function icsAttachment(icsContent) {
  return {
    filename: 'appointment.ics',
    content: Buffer.from(icsContent).toString('base64'),
    contentType: 'text/calendar; method=REQUEST',
  };
}

/**
 * Build the "Add to calendar" HTML button block (Google + Apple/iCal links).
 * @param {string} icsDataUri - data: URI of the ICS for Apple/Outlook download
 * @param {object} gcalParams - params for Google Calendar URL
 * @returns {string} HTML snippet
 */
function calendarButtonsHtml(gcalUrl) {
  return `
    <div style="margin:20px 0">
      <p style="font-size:14px;color:#495057;margin-bottom:10px"><strong>Add to your calendar:</strong></p>
      <a href="${gcalUrl}" target="_blank"
         style="display:inline-block;margin-right:10px;padding:9px 18px;background:#4285f4;color:#fff;text-decoration:none;border-radius:5px;font-size:13px;font-family:Arial,sans-serif">
        📅 Google Calendar
      </a>
      <span style="display:inline-block;padding:9px 18px;background:#f8f9fa;color:#343a40;border:1px solid #dee2e6;border-radius:5px;font-size:13px;font-family:Arial,sans-serif">
        📎 Apple / Outlook: open the attached .ics file
      </span>
    </div>`;
}

/**
 * Build Google Calendar "add event" URL.
 */
function buildGcalUrl({ summary, description, date, time, durationMinutes = 60 }) {
  const [year, month, day] = date.split('T')[0].split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const pad = n => String(n).padStart(2, '0');

  const startMs = Date.UTC(year, month - 1, day, hour, minute);
  const endMs = startMs + durationMinutes * 60 * 1000;

  const fmt = ms => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  };

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: summary,
    details: description,
    dates: `${fmt(startMs)}/${fmt(endMs)}`,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Send a password reset email with a tokenised link.
 */
async function sendPasswordReset(to, toName, resetToken) {
  const resetUrl = `${APP_URL}/reset-password?token=${resetToken}`;
  return sendEmail({
    to,
    subject: 'Reset Your JE Fitness Password',
    text: [
      `Hello ${toName},`,
      '',
      'You requested a password reset for your JE Fitness account.',
      '',
      `Reset link: ${resetUrl}`,
      '',
      'This link expires in 1 hour. If you did not request a reset, ignore this email.',
      '',
      '— JE Fitness Team',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#343a40">Password Reset Request</h2>
        <p>Hello ${toName},</p>
        <p>You requested a password reset for your JE Fitness account.</p>
        <p style="margin:24px 0">
          <a href="${resetUrl}"
             style="background:#0d6efd;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block">
            Reset Password
          </a>
        </p>
        <p>This link expires in <strong>1 hour</strong>.</p>
        <p style="color:#6c757d;font-size:13px">If you did not request a password reset, you can safely ignore this email.</p>
        <hr style="border:none;border-top:1px solid #dee2e6;margin:24px 0">
        <p style="color:#6c757d;font-size:13px">— JE Fitness Team</p>
      </div>`,
  });
}

/**
 * Send a subscription renewal reminder email.
 */
async function sendSubscriptionReminder(to, toName, planName, daysLeft, renewalDate) {
  const timeLabel = typeof daysLeft === 'string'
    ? daysLeft
    : `${daysLeft} day${daysLeft !== 1 ? 's' : ''}`;
  const isImminent = typeof daysLeft === 'string';
  const verb = isImminent ? 'expires' : 'renews';
  return sendEmail({
    to,
    subject: `Your JE Fitness subscription ${verb} in ${timeLabel}`,
    text: [
      `Hello ${toName},`,
      '',
      `Your ${planName} subscription ${verb} in ${timeLabel} on ${renewalDate}.`,
      '',
      `Manage your subscription: ${APP_URL}/subscriptions`,
      '',
      '— JE Fitness Team',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#343a40">Subscription ${isImminent ? 'Expiry' : 'Renewal'} Reminder</h2>
        <p>Hello ${toName},</p>
        <p>Your <strong>${planName}</strong> subscription ${verb} in <strong>${timeLabel}</strong> on <strong>${renewalDate}</strong>.</p>
        <p style="margin:24px 0">
          <a href="${APP_URL}/subscriptions"
             style="background:#0d6efd;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block">
            Manage Subscription
          </a>
        </p>
        <hr style="border:none;border-top:1px solid #dee2e6;margin:24px 0">
        <p style="color:#6c757d;font-size:13px">— JE Fitness Team</p>
      </div>`,
  });
}

/**
 * Send an email verification link to a newly registered user.
 */
async function sendEmailVerification(to, toName, verificationToken) {
  const verifyUrl = `${APP_URL}/verify-email?token=${verificationToken}`;
  return sendEmail({
    to,
    subject: 'Verify Your JE Fitness Email',
    text: [
      `Hello ${toName},`,
      '',
      'Thanks for signing up with JE Fitness! Please verify your email address.',
      '',
      `Verification link: ${verifyUrl}`,
      '',
      'This link expires in 24 hours.',
      '',
      '— JE Fitness Team',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#343a40">Verify Your Email</h2>
        <p>Hello ${toName},</p>
        <p>Thanks for signing up with JE Fitness! Click below to verify your email address.</p>
        <p style="margin:24px 0">
          <a href="${verifyUrl}"
             style="background:#198754;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block">
            Verify Email
          </a>
        </p>
        <p>This link expires in <strong>24 hours</strong>.</p>
        <hr style="border:none;border-top:1px solid #dee2e6;margin:24px 0">
        <p style="color:#6c757d;font-size:13px">— JE Fitness Team</p>
      </div>`,
  });
}

/**
 * Send a trainer their daily client schedule.
 * @param {string} to - Trainer email
 * @param {string} trainerName - Trainer first name
 * @param {string} dateStr - Human-readable date string (e.g. "Wednesday, April 2, 2026")
 * @param {Array<{clientName: string, time: string}>} appointments - Sorted by time
 */
async function sendTrainerDailySchedule(to, trainerName, dateStr, appointments) {
  const rows = appointments
    .map(a => `<tr><td style="padding:8px 12px;border-bottom:1px solid #dee2e6">${a.time}</td><td style="padding:8px 12px;border-bottom:1px solid #dee2e6">${a.clientName}</td></tr>`)
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
async function sendAppointmentConfirmationClient(to, clientName, trainerName, dateStr, time, appointmentId, date) {
  const [h, m] = time.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const displayTime = `${displayHour}:${String(m).padStart(2, '0')} ${suffix}`;

  const summary = `Fitness Session with ${trainerName}`;
  const description = `Appointment with trainer ${trainerName} at JE Fitness.\nDate: ${dateStr}\nTime: ${displayTime}`;
  const gcalUrl = buildGcalUrl({ summary, description, date, time });
  const ics = buildIcs({ uid: appointmentId, summary, description, date, time, organizer: FROM_NAME, method: 'REQUEST', sequence: 0 });

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
async function sendNewAppointmentNotification(to, trainerName, clientName, dateStr, time, appointmentId, date) {
  const [h, m] = time.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const displayTime = `${displayHour}:${String(m).padStart(2, '0')} ${suffix}`;

  const summary = `Fitness Session with ${clientName}`;
  const description = `Appointment with client ${clientName} at JE Fitness.\nDate: ${dateStr}\nTime: ${displayTime}`;
  const gcalUrl = buildGcalUrl({ summary, description, date, time });
  const ics = buildIcs({ uid: appointmentId, summary, description, date, time, organizer: FROM_NAME, method: 'REQUEST', sequence: 0 });

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
async function sendAppointmentCancelledTrainer(to, trainerName, clientName, dateStr, time, reason = 'cancelled', appointmentId, date) {
  const [h, m] = time.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const displayTime = `${displayHour}:${String(m).padStart(2, '0')} ${suffix}`;
  const verb = reason === 'deleted' ? 'removed' : 'cancelled';
  const Verb = reason === 'deleted' ? 'Removed' : 'Cancelled';

  const ics = buildIcs({
    uid: appointmentId,
    summary: `Fitness Session with ${clientName}`,
    description: `Appointment with client ${clientName} at JE Fitness.\nDate: ${dateStr}\nTime: ${displayTime}`,
    date, time, organizer: FROM_NAME, method: 'CANCEL', sequence: 1,
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
async function sendAppointmentCancelledClient(to, clientName, trainerName, dateStr, time, reason = 'cancelled', appointmentId, date) {
  const [h, m] = time.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const displayTime = `${displayHour}:${String(m).padStart(2, '0')} ${suffix}`;
  const verb = reason === 'deleted' ? 'removed' : 'cancelled';
  const Verb = reason === 'deleted' ? 'Removed' : 'Cancelled';

  const ics = buildIcs({
    uid: appointmentId,
    summary: `Fitness Session with ${trainerName}`,
    description: `Appointment with trainer ${trainerName} at JE Fitness.\nDate: ${dateStr}\nTime: ${displayTime}`,
    date, time, organizer: FROM_NAME, method: 'CANCEL', sequence: 1,
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
async function sendAppointmentUpdatedTrainer(to, trainerName, clientName, dateStr, time, appointmentId, date) {
  const [h, m] = time.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const displayTime = `${displayHour}:${String(m).padStart(2, '0')} ${suffix}`;

  const summary = `Fitness Session with ${clientName}`;
  const description = `Updated appointment with client ${clientName} at JE Fitness.\nDate: ${dateStr}\nTime: ${displayTime}`;
  const gcalUrl = buildGcalUrl({ summary, description, date, time });
  const ics = buildIcs({ uid: appointmentId, summary, description, date, time, organizer: FROM_NAME, method: 'REQUEST', sequence: 1 });

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
async function sendAppointmentUpdatedClient(to, clientName, trainerName, dateStr, time, appointmentId, date) {
  const [h, m] = time.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const displayTime = `${displayHour}:${String(m).padStart(2, '0')} ${suffix}`;

  const summary = `Fitness Session with ${trainerName}`;
  const description = `Updated appointment with trainer ${trainerName} at JE Fitness.\nDate: ${dateStr}\nTime: ${displayTime}`;
  const gcalUrl = buildGcalUrl({ summary, description, date, time });
  const ics = buildIcs({ uid: appointmentId, summary, description, date, time, organizer: FROM_NAME, method: 'REQUEST', sequence: 1 });

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

/**
 * Notify all admins that a new support ticket was submitted.
 * @param {Array} admins - Array of { email, firstName } objects
 * @param {object} ticket - SupportTicket document
 * @param {object} user - Submitting user { email, firstName, lastName }
 */
async function sendNewTicketAdmin(admins, ticket, user) {
  if (!admins || admins.length === 0) return;

  const categoryLabels = {
    'bug-report': 'Bug Report',
    'feature-request': 'Feature Request',
    'billing-issue': 'Billing Issue',
    'account-issue': 'Account Issue',
    'general-inquiry': 'General Inquiry',
  };

  const categoryLabel = categoryLabels[ticket.category] || ticket.category;
  const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'A user';
  const submittedAt = new Date(ticket.createdAt || Date.now()).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  const text = [
    `New Support Ticket`,
    ``,
    `From: ${userName} (${user.email})`,
    `Category: ${categoryLabel}`,
    `Subject: ${ticket.subject}`,
    `Submitted: ${submittedAt}`,
    ``,
    `Description:`,
    ticket.description,
    ``,
    `View in admin panel: ${APP_URL}/admin`,
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#343a40;border-bottom:2px solid #6366f1;padding-bottom:12px">New Support Ticket</h2>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr style="background:#f8f9fa">
          <td style="padding:10px 14px;font-weight:600;width:140px;border-bottom:1px solid #dee2e6">From</td>
          <td style="padding:10px 14px;border-bottom:1px solid #dee2e6">${userName} &lt;${user.email}&gt;</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;font-weight:600;border-bottom:1px solid #dee2e6">Category</td>
          <td style="padding:10px 14px;border-bottom:1px solid #dee2e6">${categoryLabel}</td>
        </tr>
        <tr style="background:#f8f9fa">
          <td style="padding:10px 14px;font-weight:600;border-bottom:1px solid #dee2e6">Subject</td>
          <td style="padding:10px 14px;border-bottom:1px solid #dee2e6"><strong>${ticket.subject}</strong></td>
        </tr>
        <tr>
          <td style="padding:10px 14px;font-weight:600">Submitted</td>
          <td style="padding:10px 14px">${submittedAt}</td>
        </tr>
      </table>
      <h3 style="color:#495057;margin-bottom:8px">Description</h3>
      <div style="background:#f8f9fa;border-left:4px solid #6366f1;padding:16px;border-radius:4px;white-space:pre-wrap;font-size:14px;color:#343a40">${ticket.description}</div>
      <p style="margin-top:24px">
        <a href="${APP_URL}/admin"
           style="background:#6366f1;color:#fff;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:600">
          View in Admin Panel
        </a>
      </p>
      <hr style="border:none;border-top:1px solid #dee2e6;margin:24px 0">
      <p style="color:#6c757d;font-size:13px">— JE Fitness System</p>
    </div>`;

  await Promise.allSettled(
    admins.map(admin =>
      sendEmail({ to: admin.email, subject: `New Support Ticket: ${ticket.subject}`, html, text })
    )
  );
}

/**
 * Confirm to the user that their ticket was received.
 * @param {string} to - User email
 * @param {string} userName - User first name
 * @param {object} ticket - SupportTicket document
 */
async function sendTicketReceived(to, userName, ticket) {
  const categoryLabels = {
    'bug-report': 'Bug Report',
    'feature-request': 'Feature Request',
    'billing-issue': 'Billing Issue',
    'account-issue': 'Account Issue',
    'general-inquiry': 'General Inquiry',
  };
  const categoryLabel = categoryLabels[ticket.category] || ticket.category;

  return sendEmail({
    to,
    subject: `We received your ticket: ${ticket.subject}`,
    text: [
      `Hello ${userName},`,
      ``,
      `We've received your support ticket and our team will review it shortly.`,
      ``,
      `Ticket Summary`,
      `Category: ${categoryLabel}`,
      `Subject: ${ticket.subject}`,
      ``,
      `Description:`,
      ticket.description,
      ``,
      `You'll receive another email once your ticket has been resolved.`,
      ``,
      `— JE Fitness Team`,
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#343a40">Ticket Received</h2>
        <p>Hello ${userName},</p>
        <p>We've received your support ticket and our team will review it shortly.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0">
          <tr style="background:#f8f9fa">
            <td style="padding:10px 14px;font-weight:600;width:120px;border-bottom:1px solid #dee2e6">Category</td>
            <td style="padding:10px 14px;border-bottom:1px solid #dee2e6">${categoryLabel}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;font-weight:600">Subject</td>
            <td style="padding:10px 14px"><strong>${ticket.subject}</strong></td>
          </tr>
        </table>
        <div style="background:#f8f9fa;border-left:4px solid #6366f1;padding:16px;border-radius:4px;white-space:pre-wrap;font-size:14px;color:#343a40">${ticket.description}</div>
        <p style="margin-top:20px;color:#495057">You'll receive another email once your ticket has been resolved.</p>
        <hr style="border:none;border-top:1px solid #dee2e6;margin:24px 0">
        <p style="color:#6c757d;font-size:13px">— JE Fitness Team</p>
      </div>`,
  });
}

/**
 * Notify the user that their ticket has been resolved.
 * @param {string} to - User email
 * @param {string} userName - User first name
 * @param {object} ticket - SupportTicket document
 */
async function sendTicketFulfilled(to, userName, ticket) {
  const adminNoteSection = ticket.adminNote
    ? `\n\nAdmin Note:\n${ticket.adminNote}`
    : '';

  const adminNoteHtml = ticket.adminNote
    ? `<h3 style="color:#495057;margin:20px 0 8px">Admin Note</h3>
       <div style="background:#f0fdf4;border-left:4px solid #22c55e;padding:16px;border-radius:4px;white-space:pre-wrap;font-size:14px;color:#343a40">${ticket.adminNote}</div>`
    : '';

  return sendEmail({
    to,
    subject: `Your ticket has been resolved: ${ticket.subject}`,
    text: [
      `Hello ${userName},`,
      ``,
      `Great news — your support ticket has been resolved.`,
      ``,
      `Subject: ${ticket.subject}`,
      adminNoteSection,
      ``,
      `Thank you for helping us improve JE Fitness.`,
      ``,
      `— JE Fitness Team`,
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#343a40">Ticket Resolved ✓</h2>
        <p>Hello ${userName},</p>
        <p>Great news — your support ticket has been resolved.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0">
          <tr>
            <td style="padding:10px 14px;font-weight:600;width:120px">Subject</td>
            <td style="padding:10px 14px"><strong>${ticket.subject}</strong></td>
          </tr>
        </table>
        ${adminNoteHtml}
        <p style="margin-top:20px;color:#495057">Thank you for helping us improve JE Fitness.</p>
        <hr style="border:none;border-top:1px solid #dee2e6;margin:24px 0">
        <p style="color:#6c757d;font-size:13px">— JE Fitness Team</p>
      </div>`,
  });
}

module.exports = {
  sendEmail,
  sendPasswordReset,
  sendSubscriptionReminder,
  sendEmailVerification,
  sendTrainerDailySchedule,
  sendAppointmentConfirmationClient,
  sendNewAppointmentNotification,
  sendAppointmentCancelledTrainer,
  sendAppointmentCancelledClient,
  sendAppointmentUpdatedTrainer,
  sendAppointmentUpdatedClient,
  sendNewTicketAdmin,
  sendTicketReceived,
  sendTicketFulfilled,
};
