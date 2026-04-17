const { getPrimaryAppUrl } = require('../../../config/security');
const { sendEmail } = require('../core');

const APP_URL = getPrimaryAppUrl();

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

module.exports = {
  sendPasswordReset,
  sendEmailVerification,
};
