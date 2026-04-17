/**
 * Email service using Resend (https://resend.com).
 * Requires RESEND_API_KEY environment variable.
 * If the key is not set, emails are logged and skipped gracefully.
 */

const { logger } = require('../logger');

const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@jefitnessja.com';
const FROM_NAME = process.env.FROM_NAME || 'JE Fitness';

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
    logger.warn('Email service not configured (RESEND_API_KEY missing). Email skipped.', {
      to,
      subject,
    });
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

module.exports = {
  getResendClient,
  sendEmail,
  FROM_EMAIL,
  FROM_NAME,
};
