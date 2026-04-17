const { FROM_EMAIL, FROM_NAME } = require('./core');

/**
 * Convert 24-hour time format to 12-hour with AM/PM.
 * @param {string} time - Time string (e.g. "09:00", "14:30")
 * @returns {string} - Formatted time (e.g. "9:00 AM", "2:30 PM")
 */
function formatTime24to12(time) {
  const [h, m] = time.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayHour}:${String(m).padStart(2, '0')} ${suffix}`;
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
function buildIcs({
  uid,
  summary,
  description,
  date,
  time,
  durationMinutes = 60,
  organizer,
  method = 'REQUEST',
  sequence = 0,
}) {
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
  const esc = s =>
    (s || '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\n/g, '\\n');

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

module.exports = {
  formatTime24to12,
  buildIcs,
  icsAttachment,
  calendarButtonsHtml,
  buildGcalUrl,
  FROM_NAME,
};
