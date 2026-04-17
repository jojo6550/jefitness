const { getPrimaryAppUrl } = require('../../../config/security');
const { sendEmail } = require('../core');

const APP_URL = getPrimaryAppUrl();

const CATEGORY_LABELS = {
  'bug-report': 'Bug Report',
  'feature-request': 'Feature Request',
  'billing-issue': 'Billing Issue',
  'account-issue': 'Account Issue',
  'general-inquiry': 'General Inquiry',
};

/**
 * Notify all admins that a new support ticket was submitted.
 * @param {Array} admins - Array of { email, firstName } objects
 * @param {object} ticket - SupportTicket document
 * @param {object} user - Submitting user { email, firstName, lastName }
 */
async function sendNewTicketAdmin(admins, ticket, user) {
  if (!admins || admins.length === 0) return;

  const categoryLabel = CATEGORY_LABELS[ticket.category] || ticket.category;
  const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'A user';
  const submittedAt = new Date(ticket.createdAt || Date.now()).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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
      sendEmail({
        to: admin.email,
        subject: `New Support Ticket: ${ticket.subject}`,
        html,
        text,
      })
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
  const categoryLabel = CATEGORY_LABELS[ticket.category] || ticket.category;

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
  const adminNoteSection = ticket.adminNote ? `\n\nAdmin Note:\n${ticket.adminNote}` : '';

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
  sendNewTicketAdmin,
  sendTicketReceived,
  sendTicketFulfilled,
};
