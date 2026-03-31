const {
  daysLeftUntil,
  daysBetween,
  calculateSubscriptionEndDate,
} = require('../../utils/dateUtils');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a Date that is `n` calendar days from today, normalised to local
 * midnight.  Using setDate() ensures DST-safe calendar arithmetic — the same
 * technique used internally by daysLeftUntil / daysBetween.
 */
function daysFromNow(n) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

// ---------------------------------------------------------------------------
// daysLeftUntil
// ---------------------------------------------------------------------------

describe('daysLeftUntil', () => {
  it('returns 0 for null', () => {
    expect(daysLeftUntil(null)).toBe(0);
  });

  it('returns 0 for undefined', () => {
    expect(daysLeftUntil(undefined)).toBe(0);
  });

  it('returns 0 for a past date (clamped — never negative)', () => {
    expect(daysLeftUntil(daysFromNow(-1))).toBe(0);
  });

  it('returns 0 when period ends today ("Renews Today" state)', () => {
    expect(daysLeftUntil(daysFromNow(0))).toBe(0);
  });

  it('returns 1 for tomorrow', () => {
    expect(daysLeftUntil(daysFromNow(1))).toBe(1);
  });

  it('returns 30 for a 1-month subscription', () => {
    expect(daysLeftUntil(daysFromNow(30))).toBe(30);
  });

  it('returns 90 for a 3-month subscription', () => {
    expect(daysLeftUntil(daysFromNow(90))).toBe(90);
  });

  it('returns 365 for a 12-month (annual) subscription', () => {
    expect(daysLeftUntil(daysFromNow(365))).toBe(365);
  });
});

// ---------------------------------------------------------------------------
// daysBetween
// ---------------------------------------------------------------------------

describe('daysBetween', () => {
  it('returns 0 for the same date', () => {
    const d = new Date(2026, 0, 1); // Jan 1 2026
    expect(daysBetween(d, d)).toBe(0);
  });

  it('returns 1 for consecutive days', () => {
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 0, 2);
    expect(daysBetween(start, end)).toBe(1);
  });

  it('returns 31 for January (Jan 1 → Feb 1)', () => {
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 1, 1);
    expect(daysBetween(start, end)).toBe(31);
  });

  it('returns 28 for February 2026 (non-leap)', () => {
    const start = new Date(2026, 1, 1);
    const end = new Date(2026, 2, 1);
    expect(daysBetween(start, end)).toBe(28);
  });

  it('returns a negative number when end is before start', () => {
    const start = new Date(2026, 1, 1);
    const end = new Date(2026, 0, 1);
    expect(daysBetween(start, end)).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// calculateSubscriptionEndDate — plan duration correctness
// ---------------------------------------------------------------------------

describe('calculateSubscriptionEndDate', () => {
  // Use local-time constructor (timezone-safe; matches the local arithmetic
  // used inside addMonths / addYears).
  const march31 = new Date(2026, 2, 31); // March 31, 2026

  it('1-month: March 31 → April 30 (no overflow into May)', () => {
    const result = calculateSubscriptionEndDate('1-month', march31);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(3);  // April (0-indexed)
    expect(result.getDate()).toBe(30);
  });

  it('3-month: March 31 → June 30', () => {
    const result = calculateSubscriptionEndDate('3-month', march31);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(5);  // June
    expect(result.getDate()).toBe(30);
  });

  it('6-month: March 31 → September 30', () => {
    const result = calculateSubscriptionEndDate('6-month', march31);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(8);  // September
    expect(result.getDate()).toBe(30);
  });

  it('12-month: March 31, 2026 → March 31, 2027', () => {
    const result = calculateSubscriptionEndDate('12-month', march31);
    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(2);  // March
    expect(result.getDate()).toBe(31);
  });

  it('1-month edge case: Jan 31 → Feb 28 (no overflow into March)', () => {
    const jan31 = new Date(2026, 0, 31);
    const result = calculateSubscriptionEndDate('1-month', jan31);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(1);  // February
    expect(result.getDate()).toBe(28);
  });

  it('12-month leap year: Feb 29, 2024 → Feb 28, 2025 (non-leap clamp)', () => {
    const leapDay = new Date(2024, 1, 29); // Feb 29, 2024
    const result = calculateSubscriptionEndDate('12-month', leapDay);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(1);  // February
    expect(result.getDate()).toBe(28);
  });

  it('throws for an unknown plan name', () => {
    expect(() => calculateSubscriptionEndDate('2-month', march31)).toThrow();
  });

  it('throws for a null start date', () => {
    expect(() => calculateSubscriptionEndDate('1-month', null)).toThrow();
  });

  it('throws for a non-Date start date', () => {
    expect(() => calculateSubscriptionEndDate('1-month', '2026-03-31')).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 300));
});
