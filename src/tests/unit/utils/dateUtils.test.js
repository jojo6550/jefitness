/**
 * Unit Tests for Date Utilities
 * Tests all functions in src/utils/dateUtils.js
 */

const dateUtils = require('../../../utils/dateUtils');

describe('Date Utils - Unit Tests', () => {
  describe('Date validation and parsing', () => {
    it('should validate correct date strings', () => {
      expect(dateUtils.isValidDate('2023-12-25')).toBe(true);
      expect(dateUtils.isValidDate('2023-02-28')).toBe(true);
      expect(dateUtils.isValidDate('2024-02-29')).toBe(true); // Leap year
    });

    it('should reject invalid date strings', () => {
      expect(dateUtils.isValidDate('invalid')).toBe(false);
      expect(dateUtils.isValidDate('2023-13-01')).toBe(false); // Invalid month
      expect(dateUtils.isValidDate('2023-02-30')).toBe(false); // Invalid day
      expect(dateUtils.isValidDate('2023-02-29')).toBe(false); // Not leap year
      expect(dateUtils.isValidDate('')).toBe(false);
      expect(dateUtils.isValidDate(null)).toBe(false);
      expect(dateUtils.isValidDate(undefined)).toBe(false);
    });

    it('should parse date strings correctly', () => {
      const result = dateUtils.parseDate('2023-12-25');
      expect(result).toEqual(new Date('2023-12-25'));
    });

    it('should return null for invalid date strings', () => {
      expect(dateUtils.parseDate('invalid')).toBeNull();
      expect(dateUtils.parseDate('')).toBeNull();
    });
  });

  describe('Date arithmetic', () => {
    it('should add days correctly', () => {
      const baseDate = new Date('2023-01-01');
      const result = dateUtils.addDays(baseDate, 5);
      expect(result).toEqual(new Date('2023-01-06'));
    });

    it('should subtract days correctly', () => {
      const baseDate = new Date('2023-01-10');
      const result = dateUtils.addDays(baseDate, -3);
      expect(result).toEqual(new Date('2023-01-07'));
    });

    it('should handle month boundaries', () => {
      const baseDate = new Date('2023-01-30');
      const result = dateUtils.addDays(baseDate, 5);
      expect(result).toEqual(new Date('2023-02-04'));
    });

    it('should handle year boundaries', () => {
      const baseDate = new Date('2023-12-30');
      const result = dateUtils.addDays(baseDate, 5);
      expect(result).toEqual(new Date('2024-01-04'));
    });

    it('should add months correctly', () => {
      const baseDate = new Date('2023-01-15');
      const result = dateUtils.addMonths(baseDate, 2);
      expect(result).toEqual(new Date('2023-03-15'));
    });

    it('should handle month overflow', () => {
      const baseDate = new Date('2023-01-31');
      const result = dateUtils.addMonths(baseDate, 1);
      expect(result).toEqual(new Date('2023-02-28')); // February has 28 days
    });

    it('should handle leap years in month addition', () => {
      const baseDate = new Date('2024-01-31');
      const result = dateUtils.addMonths(baseDate, 1);
      expect(result).toEqual(new Date('2024-02-29')); // Leap year
    });

    it('should subtract months correctly', () => {
      const baseDate = new Date('2023-03-15');
      const result = dateUtils.addMonths(baseDate, -1);
      expect(result).toEqual(new Date('2023-02-15'));
    });
  });

  describe('Date comparison', () => {
    it('should check if date is before another date', () => {
      const date1 = new Date('2023-01-01');
      const date2 = new Date('2023-01-02');
      expect(dateUtils.isBefore(date1, date2)).toBe(true);
      expect(dateUtils.isBefore(date2, date1)).toBe(false);
      expect(dateUtils.isBefore(date1, date1)).toBe(false);
    });

    it('should check if date is after another date', () => {
      const date1 = new Date('2023-01-01');
      const date2 = new Date('2023-01-02');
      expect(dateUtils.isAfter(date2, date1)).toBe(true);
      expect(dateUtils.isAfter(date1, date2)).toBe(false);
      expect(dateUtils.isAfter(date1, date1)).toBe(false);
    });

    it('should check if dates are equal', () => {
      const date1 = new Date('2023-01-01T10:00:00');
      const date2 = new Date('2023-01-01T10:00:00');
      const date3 = new Date('2023-01-01T11:00:00');
      expect(dateUtils.isEqual(date1, date2)).toBe(true);
      expect(dateUtils.isEqual(date1, date3)).toBe(false);
    });

    it('should check if date is between two dates', () => {
      const start = new Date('2023-01-01');
      const middle = new Date('2023-01-15');
      const end = new Date('2023-01-31');
      expect(dateUtils.isBetween(middle, start, end)).toBe(true);
      expect(dateUtils.isBetween(start, start, end)).toBe(true);
      expect(dateUtils.isBetween(end, start, end)).toBe(true);
      expect(dateUtils.isBetween(new Date('2022-12-31'), start, end)).toBe(false);
      expect(dateUtils.isBetween(new Date('2023-02-01'), start, end)).toBe(false);
    });
  });

  describe('Date formatting', () => {
    it('should format dates in ISO string', () => {
      const date = new Date('2023-12-25T15:30:45');
      const result = dateUtils.formatISO(date);
      expect(result).toBe('2023-12-25');
    });

    it('should format dates in readable format', () => {
      const date = new Date('2023-12-25');
      const result = dateUtils.formatReadable(date);
      expect(result).toBe('December 25, 2023');
    });

    it('should format dates in short format', () => {
      const date = new Date('2023-12-25');
      const result = dateUtils.formatShort(date);
      expect(result).toBe('12/25/2023');
    });
  });

  describe('Business days calculation', () => {
    it('should calculate business days between dates', () => {
      const start = new Date('2023-01-01'); // Sunday
      const end = new Date('2023-01-07'); // Saturday
      const businessDays = dateUtils.getBusinessDays(start, end);
      expect(businessDays).toBe(5); // Mon-Fri
    });

    it('should exclude weekends', () => {
      const start = new Date('2023-01-06'); // Friday
      const end = new Date('2023-01-09'); // Monday
      const businessDays = dateUtils.getBusinessDays(start, end);
      expect(businessDays).toBe(1); // Only Monday
    });

    it('should handle same day', () => {
      const date = new Date('2023-01-02'); // Monday
      const businessDays = dateUtils.getBusinessDays(date, date);
      expect(businessDays).toBe(0);
    });

    it('should identify business days', () => {
      expect(dateUtils.isBusinessDay(new Date('2023-01-02'))).toBe(true); // Monday
      expect(dateUtils.isBusinessDay(new Date('2023-01-07'))).toBe(false); // Saturday
      expect(dateUtils.isBusinessDay(new Date('2023-01-08'))).toBe(false); // Sunday
    });
  });

  describe('Subscription period calculations', () => {
    it('should calculate next billing date for monthly subscription', () => {
      const startDate = new Date('2023-01-15');
      const nextBilling = dateUtils.getNextBillingDate(startDate, 'monthly');
      expect(nextBilling).toEqual(new Date('2023-02-15'));
    });

    it('should calculate next billing date for yearly subscription', () => {
      const startDate = new Date('2023-06-15');
      const nextBilling = dateUtils.getNextBillingDate(startDate, 'yearly');
      expect(nextBilling).toEqual(new Date('2024-06-15'));
    });

    it('should handle month end billing', () => {
      const startDate = new Date('2023-01-31');
      const nextBilling = dateUtils.getNextBillingDate(startDate, 'monthly');
      expect(nextBilling).toEqual(new Date('2023-02-28'));
    });

    it('should calculate period end date', () => {
      const startDate = new Date('2023-01-01');
      const periodEnd = dateUtils.getPeriodEndDate(startDate, '1-month');
      expect(periodEnd).toEqual(new Date('2023-02-01'));
    });

    it('should calculate period end for different intervals', () => {
      const startDate = new Date('2023-01-01');
      expect(dateUtils.getPeriodEndDate(startDate, '3-month')).toEqual(new Date('2023-04-01'));
      expect(dateUtils.getPeriodEndDate(startDate, '1-year')).toEqual(new Date('2024-01-01'));
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle null and undefined inputs', () => {
      expect(dateUtils.addDays(null, 1)).toBeNull();
      expect(dateUtils.addMonths(undefined, 1)).toBeNull();
      expect(dateUtils.isBefore(null, new Date())).toBe(false);
      expect(dateUtils.isAfter(new Date(), null)).toBe(false);
      expect(dateUtils.formatISO(null)).toBe('');
    });

    it('should handle invalid date objects', () => {
      const invalidDate = new Date('invalid');
      expect(dateUtils.addDays(invalidDate, 1)).toEqual(invalidDate);
      expect(dateUtils.formatISO(invalidDate)).toBe('');
    });

    it('should handle leap year calculations', () => {
      const leapDay = new Date('2024-02-29');
      const nextYear = dateUtils.addDays(leapDay, 365);
      expect(nextYear).toEqual(new Date('2025-02-28')); // Not a leap year
    });

    it('should handle timezone considerations', () => {
      // Test that date operations preserve local timezone
      const date = new Date('2023-01-01T00:00:00');
      const result = dateUtils.addDays(date, 1);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
    });
  });
});
