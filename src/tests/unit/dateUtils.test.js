const {
  daysLeftUntil,
  daysBetween,
  calculateSubscriptionEndDate,
  addFixedMonths,
  addFixedYears,
  addDays,
  isLeapYear,
} = require('../../utils/dateUtils');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

  it('returns 0 when period ends today', () => {
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

  it('returns 358 for a 12-month (fixed-month rule) subscription', () => {
    expect(daysLeftUntil(daysFromNow(358))).toBe(358);
  });
});

// ---------------------------------------------------------------------------
// daysBetween
// ---------------------------------------------------------------------------

describe('daysBetween', () => {
  it('returns 0 for the same date', () => {
    const d = new Date(2026, 0, 1);
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
// isLeapYear
// ---------------------------------------------------------------------------

describe('isLeapYear', () => {
  it('2024 is leap', () => expect(isLeapYear(2024)).toBe(true));
  it('2025 not leap', () => expect(isLeapYear(2025)).toBe(false));
  it('2026 not leap', () => expect(isLeapYear(2026)).toBe(false));
  it('2028 is leap', () => expect(isLeapYear(2028)).toBe(true));
  it('2100 not leap (century non-400)', () => expect(isLeapYear(2100)).toBe(false));
  it('2000 is leap (century-400)', () => expect(isLeapYear(2000)).toBe(true));
});

// ---------------------------------------------------------------------------
// addDays
// ---------------------------------------------------------------------------

describe('addDays', () => {
  it('adds 30 days', () => {
    const start = new Date(2026, 3, 18); // Apr 18 2026
    const result = addDays(start, 30);
    expect(daysBetween(start, result)).toBe(30);
  });
  it('adds 0 days = same date', () => {
    const start = new Date(2026, 0, 1);
    expect(addDays(start, 0).getTime()).toBe(start.getTime());
  });
  it('throws on invalid date', () => {
    expect(() => addDays(null, 5)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// addFixedMonths — 30 days/month, Feb real length
// ---------------------------------------------------------------------------

describe('addFixedMonths', () => {
  it('1 month from Apr 18 2026 (non-Feb) → 30 days later', () => {
    const start = new Date(2026, 3, 18);
    expect(daysBetween(start, addFixedMonths(start, 1))).toBe(30);
  });

  it('1 month from Feb 1 2026 (non-leap) → 28 days later', () => {
    const start = new Date(2026, 1, 1);
    expect(daysBetween(start, addFixedMonths(start, 1))).toBe(28);
  });

  it('1 month from Feb 1 2028 (leap) → 29 days later', () => {
    const start = new Date(2028, 1, 1);
    expect(daysBetween(start, addFixedMonths(start, 1))).toBe(29);
  });

  it('3 months from Jan 1 2026 (spans Feb non-leap) → 30+28+30 = 88 days', () => {
    const start = new Date(2026, 0, 1);
    expect(daysBetween(start, addFixedMonths(start, 3))).toBe(88);
  });

  it('3 months from Jan 1 2028 (spans Feb leap) → 30+29+30 = 89 days', () => {
    const start = new Date(2028, 0, 1);
    expect(daysBetween(start, addFixedMonths(start, 3))).toBe(89);
  });

  it('6 months from Apr 18 2026 (no Feb) → 6*30 = 180 days', () => {
    const start = new Date(2026, 3, 18);
    expect(daysBetween(start, addFixedMonths(start, 6))).toBe(180);
  });

  it('6 months from Oct 1 2026 (spans Feb 2027) → 5*30 + 28 = 178 days', () => {
    const start = new Date(2026, 9, 1);
    expect(daysBetween(start, addFixedMonths(start, 6))).toBe(178);
  });

  it('throws on invalid date', () => {
    expect(() => addFixedMonths(null, 1)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// addFixedYears
// ---------------------------------------------------------------------------

describe('addFixedYears', () => {
  it('1 year from Jan 1 2026 (non-leap Feb) → 11*30 + 28 = 358 days', () => {
    const start = new Date(2026, 0, 1);
    expect(daysBetween(start, addFixedYears(start, 1))).toBe(358);
  });

  it('1 year from Jan 1 2028 (leap Feb) → 11*30 + 29 = 359 days', () => {
    const start = new Date(2028, 0, 1);
    expect(daysBetween(start, addFixedYears(start, 1))).toBe(359);
  });

  it('1 year from Mar 1 2026 (spans Feb 2027 non-leap) → 358 days', () => {
    const start = new Date(2026, 2, 1);
    expect(daysBetween(start, addFixedYears(start, 1))).toBe(358);
  });
});

// ---------------------------------------------------------------------------
// calculateSubscriptionEndDate — fixed-month rule
// ---------------------------------------------------------------------------

describe('calculateSubscriptionEndDate', () => {
  it('1-month from Apr 18 2026 → 30 days later', () => {
    const start = new Date(2026, 3, 18);
    const result = calculateSubscriptionEndDate('1-month', start);
    expect(daysBetween(start, result)).toBe(30);
  });

  it('1-month from Feb 1 2026 (non-leap) → 28 days later', () => {
    const start = new Date(2026, 1, 1);
    const result = calculateSubscriptionEndDate('1-month', start);
    expect(daysBetween(start, result)).toBe(28);
  });

  it('3-month from Jan 1 2026 → 88 days (spans Feb non-leap)', () => {
    const start = new Date(2026, 0, 1);
    const result = calculateSubscriptionEndDate('3-month', start);
    expect(daysBetween(start, result)).toBe(88);
  });

  it('6-month from Apr 18 2026 → 180 days (no Feb)', () => {
    const start = new Date(2026, 3, 18);
    const result = calculateSubscriptionEndDate('6-month', start);
    expect(daysBetween(start, result)).toBe(180);
  });

  it('12-month from Jan 1 2026 → 358 days', () => {
    const start = new Date(2026, 0, 1);
    const result = calculateSubscriptionEndDate('12-month', start);
    expect(daysBetween(start, result)).toBe(358);
  });

  it('12-month from Jan 1 2028 → 359 days (leap Feb)', () => {
    const start = new Date(2028, 0, 1);
    const result = calculateSubscriptionEndDate('12-month', start);
    expect(daysBetween(start, result)).toBe(359);
  });

  it('throws for an unknown plan name', () => {
    expect(() => calculateSubscriptionEndDate('2-month', new Date(2026, 2, 31))).toThrow();
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
  await new Promise(resolve => setTimeout(resolve, 300));
});
