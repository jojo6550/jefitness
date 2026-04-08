/**
 * Notify a client of their new appointment booking.
 * @param {string} to - Client email
 * @param {string} clientName - Client first name
 * @param {string} trainerName - Full trainer name
 * @param {string} dateStr - Human-readable date (e.g. \"Friday, April 4, 2026\")
 * @param {string} time - Appointment time string (e.g. \"09:00\")
 * @param {string} appointmentId - Appointment MongoDB _id
 * @param {string} date - ISO date string for iCal
 */
async function sendNewAppointmentClient(to, clientName, trainerName, dateStr, time, appointmentId, date) {
  const [h, m] = time.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const displayTime = `${displayHour}:${String(m).padStart(2, '0')} ${suffix}`;

  const summary = `Fitness Session with ${trainerName}`;
  const description = `Appointment with trainer ${trainerName} at JE Fitness.\\nDate: ${dateStr}\\nTime: ${displayTime}`;
  const gcalUrl = buildGcalUrl({ summary, description, date, time });
  const ics = buildIcs({ uid: appointmentId, summary, description, date, time, organizer: FROM_NAME, method: 'REQUEST', sequence: 0 });

  return sendEmail({
    to,
    subject: `Your appointment is confirmed — ${trainerName} on ${dateStr}`,
    text: [
      `Hello ${clientName},`,
      '',
      `Your appointment has been confirmed:`,
      '',
      `  Trainer: ${trainerName}`,
      `  Date:   ${dateStr}`,
      `  Time:   ${displayTime}`,
      '',
      `Add to Google Calendar: ${gcalUrl}`,
      'Or open the attached .ics file to add to Apple Calendar / Outlook.',
      '',
      'If you need to reschedule or cancel, visit your dashboard or contact us.',
      '',
      '— JE Fitness Team',
    ].join('\\n'),
    html: `
      <div style=\"font-family:Arial,sans-serif;max-width:560px;margin:0 auto\">
        <h2 style=\"color:#343a40\">Appointment Confirmed!</h2>
        <p>Hello ${clientName},</p>
        <p>Your appointment has been successfully booked:</p>
        <table style=\"width:100%;border-collapse:collapse;margin:16px 0\">
          <tr style=\"background:#f8f9fa\">
            <td style=\"padding:10px 14px;font-weight:600;border-bottom:1px solid #dee2e6;width:35%\">Trainer</td>
            <td style=\"padding:10px 14px;border-bottom:1px solid #dee2e6\">${trainerName}</td>
          </tr>
          <tr>
            <td style=\"padding:10px 14px;font-weight:600;border-bottom:1px solid #dee2e6\">Date</td>
            <td style=\"padding:10px 14px;border-bottom:1px solid #dee2e6\">${dateStr}</td>
          </tr>
          <tr style=\"background:#f8f9fa\">
            <td style=\"padding:10px 14px;font-weight:600\">Time</td>
            <td style=\"padding:10px 14px\">${displayTime}</td>
          </tr>
        </table>
        ${calendarButtonsHtml(gcalUrl)}
        <p style=\"font-size:14px;color:#495057\">You can reschedule or cancel from your <a href=\"${APP_URL}/dashboard\">dashboard</a>.</p>
        <hr style=\"border:none;border-top:1px solid #dee2e6;margin:24px 0\">
        <p style=\"color:#6c757d;font-size:13px\">— JE Fitness Team</p>
      </div>`,
    attachments: [icsAttachment(ics)],
  });
}

module.exports = sendNewAppointmentClient;

