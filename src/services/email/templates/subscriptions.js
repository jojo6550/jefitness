const { getPrimaryAppUrl } = require('../../../config/security');
const { sendEmail } = require('../core');

const APP_URL = getPrimaryAppUrl();

/**
 * Send a subscription renewal reminder email.
 */
async function sendSubscriptionReminder(to, toName, planName, daysLeft, renewalDate) {
  const timeLabel =
    typeof daysLeft === 'string'
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

module.exports = {
  sendSubscriptionReminder,
};
