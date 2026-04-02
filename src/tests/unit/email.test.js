/**
 * Unit tests for src/services/email.js
 *
 * All Resend calls are mocked so no real network requests are made.
 */

process.env.NODE_ENV = 'test';

// ── Mock the Resend module before any require of email.js ──────────────────────
const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

// ── Mock logger so we can assert on warning/error calls ───────────────────────
jest.mock('../../services/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const { logger } = require('../../services/logger');
const {
  sendEmail,
  sendPasswordReset,
  sendSubscriptionReminder,
  sendEmailVerification,
} = require('../../services/email');

// ── Helpers ────────────────────────────────────────────────────────────────────
function setResendKey(value) {
  if (value === undefined) {
    delete process.env.RESEND_API_KEY;
  } else {
    process.env.RESEND_API_KEY = value;
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  // Reset module registry so each test gets a fresh email service
  jest.resetModules();
});

// ── sendEmail ──────────────────────────────────────────────────────────────────
describe('sendEmail', () => {
  describe('when RESEND_API_KEY is not configured', () => {
    beforeEach(() => setResendKey(undefined));

    it('returns without throwing', async () => {
      await expect(sendEmail({ to: 'user@test.com', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' })).resolves.toBeUndefined();
    });

    it('logs a warning', async () => {
      await sendEmail({ to: 'user@test.com', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' });
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('RESEND_API_KEY missing'),
        expect.objectContaining({ to: 'user@test.com', subject: 'Hi' })
      );
    });

    it('does not call Resend SDK', async () => {
      await sendEmail({ to: 'user@test.com', subject: 'Hi', html: '<p>Hi</p>', text: 'Hi' });
      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('when RESEND_API_KEY is configured', () => {
    beforeEach(() => setResendKey('re_test_key'));

    it('calls resend.emails.send with correct payload', async () => {
      mockSend.mockResolvedValueOnce({ data: { id: 'msg_abc123' }, error: null });

      await sendEmail({
        to: 'user@test.com',
        subject: 'Test Subject',
        html: '<p>Hello</p>',
        text: 'Hello',
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      const payload = mockSend.mock.calls[0][0];
      expect(payload.to).toBe('user@test.com');
      expect(payload.subject).toBe('Test Subject');
      expect(payload.html).toBe('<p>Hello</p>');
      expect(payload.text).toBe('Hello');
    });

    it('includes the from address', async () => {
      mockSend.mockResolvedValueOnce({ data: { id: 'msg_1' }, error: null });
      await sendEmail({ to: 'a@b.com', subject: 'S', html: '<p/>', text: '' });
      const payload = mockSend.mock.calls[0][0];
      expect(payload.from).toContain('jefitnessja.com');
    });

    it('logs success after sending', async () => {
      mockSend.mockResolvedValueOnce({ data: { id: 'msg_xyz' }, error: null });
      await sendEmail({ to: 'a@b.com', subject: 'S', html: '<p/>', text: '' });
      expect(logger.info).toHaveBeenCalledWith('Email sent via Resend', expect.any(Object));
    });

    it('throws and logs error when Resend returns an error object', async () => {
      mockSend.mockResolvedValueOnce({ data: null, error: { message: 'Invalid API key' } });
      await expect(
        sendEmail({ to: 'a@b.com', subject: 'S', html: '<p/>', text: '' })
      ).rejects.toThrow('Invalid API key');
      expect(logger.error).toHaveBeenCalledWith(
        'Resend failed to send email',
        expect.objectContaining({ error: 'Invalid API key' })
      );
    });

    it('propagates unexpected Resend SDK rejection', async () => {
      mockSend.mockRejectedValueOnce(new Error('Network timeout'));
      await expect(
        sendEmail({ to: 'a@b.com', subject: 'S', html: '<p/>', text: '' })
      ).rejects.toThrow('Network timeout');
    });
  });
});

// ── sendPasswordReset ──────────────────────────────────────────────────────────
describe('sendPasswordReset', () => {
  beforeEach(() => setResendKey('re_test_key'));

  it('sends to the correct address', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: '1' }, error: null });
    await sendPasswordReset('jane@test.com', 'Jane', 'abc123token');
    expect(mockSend.mock.calls[0][0].to).toBe('jane@test.com');
  });

  it('uses a password-reset subject line', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: '1' }, error: null });
    await sendPasswordReset('jane@test.com', 'Jane', 'abc123token');
    expect(mockSend.mock.calls[0][0].subject).toMatch(/password/i);
  });

  it('includes the reset token in the HTML body', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: '1' }, error: null });
    await sendPasswordReset('jane@test.com', 'Jane', 'myUniqueToken999');
    expect(mockSend.mock.calls[0][0].html).toContain('myUniqueToken999');
  });

  it('includes the reset token in the plain-text body', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: '1' }, error: null });
    await sendPasswordReset('jane@test.com', 'Jane', 'myUniqueToken999');
    expect(mockSend.mock.calls[0][0].text).toContain('myUniqueToken999');
  });

  it('addresses the user by first name', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: '1' }, error: null });
    await sendPasswordReset('jane@test.com', 'Jane', 'tok');
    expect(mockSend.mock.calls[0][0].html).toContain('Jane');
  });
});

// ── sendSubscriptionReminder ───────────────────────────────────────────────────
describe('sendSubscriptionReminder', () => {
  beforeEach(() => setResendKey('re_test_key'));

  it('sends to the correct address', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: '1' }, error: null });
    await sendSubscriptionReminder('bob@test.com', 'Bob', '3-month', 7, 'May 1, 2026');
    expect(mockSend.mock.calls[0][0].to).toBe('bob@test.com');
  });

  it('includes daysLeft in the subject', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: '1' }, error: null });
    await sendSubscriptionReminder('bob@test.com', 'Bob', '3-month', 3, 'May 1, 2026');
    expect(mockSend.mock.calls[0][0].subject).toContain('3');
  });

  it('uses "day" (singular) when daysLeft is 1', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: '1' }, error: null });
    await sendSubscriptionReminder('bob@test.com', 'Bob', '1-month', 1, 'May 1, 2026');
    const subject = mockSend.mock.calls[0][0].subject;
    expect(subject).toMatch(/\bday\b/);
    expect(subject).not.toMatch(/days/);
  });

  it('uses "days" (plural) when daysLeft > 1', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: '1' }, error: null });
    await sendSubscriptionReminder('bob@test.com', 'Bob', '12-month', 7, 'May 1, 2026');
    expect(mockSend.mock.calls[0][0].subject).toContain('days');
  });

  it('includes the plan name in the HTML body', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: '1' }, error: null });
    await sendSubscriptionReminder('bob@test.com', 'Bob', '6-month', 3, 'May 1, 2026');
    expect(mockSend.mock.calls[0][0].html).toContain('6-month');
  });

  it('includes the renewal date in the HTML body', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: '1' }, error: null });
    await sendSubscriptionReminder('bob@test.com', 'Bob', '1-month', 3, 'April 30, 2026');
    expect(mockSend.mock.calls[0][0].html).toContain('April 30, 2026');
  });
});

// ── sendEmailVerification ──────────────────────────────────────────────────────
describe('sendEmailVerification', () => {
  beforeEach(() => setResendKey('re_test_key'));

  it('sends to the correct address', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: '1' }, error: null });
    await sendEmailVerification('new@test.com', 'Alice', 'verifyTok123');
    expect(mockSend.mock.calls[0][0].to).toBe('new@test.com');
  });

  it('uses a verification subject line', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: '1' }, error: null });
    await sendEmailVerification('new@test.com', 'Alice', 'verifyTok123');
    expect(mockSend.mock.calls[0][0].subject).toMatch(/verif/i);
  });

  it('includes the verification token in the HTML link', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: '1' }, error: null });
    await sendEmailVerification('new@test.com', 'Alice', 'verifyTok123');
    expect(mockSend.mock.calls[0][0].html).toContain('verifyTok123');
  });

  it('includes the verification token in the plain-text body', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: '1' }, error: null });
    await sendEmailVerification('new@test.com', 'Alice', 'verifyTok123');
    expect(mockSend.mock.calls[0][0].text).toContain('verifyTok123');
  });

  it('addresses the user by first name', async () => {
    mockSend.mockResolvedValueOnce({ data: { id: '1' }, error: null });
    await sendEmailVerification('new@test.com', 'Alice', 'tok');
    expect(mockSend.mock.calls[0][0].html).toContain('Alice');
  });

  it('skips send when API key is missing', async () => {
    setResendKey(undefined);
    await expect(
      sendEmailVerification('new@test.com', 'Alice', 'tok')
    ).resolves.toBeUndefined();
    expect(mockSend).not.toHaveBeenCalled();
  });
});
