/**
 * Date utility functions for subscription calculations
 */

/**
 * Calculate the end date for a subscription based on plan and start date
 * Uses proper calendar arithmetic instead of approximate day counts
 * @param {string} plan - Subscription plan ('1-month', '3-month', '6-month', '12-month')
 * @param {Date} startDate - Start date for the subscription period
 * @returns {Date} Calculated end date
 */
function calculateSubscriptionEndDate(plan, startDate) {
  if (!startDate || !(startDate instanceof Date) || isNaN(startDate)) {
    throw new Error('Invalid start date provided');
  }

  const start = new Date(startDate);

  switch (plan) {
    case '1-month':
      return addMonths(start, 1);
    case '3-month':
      return addMonths(start, 3);
    case '6-month':
      return addMonths(start, 6);
    case '12-month':
      return addYears(start, 1);
    default:
      throw new Error(`Unknown plan: ${plan}`);
  }
}

/**
 * Add months to a date, handling different month lengths properly
 * @param {Date} date - Base date
 * @param {number} months - Number of months to add
 * @returns {Date} New date with months added
 */
function addMonths(date, months) {
  const result = new Date(date);

  // Get the day of the month (1-31)
  const dayOfMonth = result.getDate();

  // Add the months
  result.setMonth(result.getMonth() + months);

  // Handle cases where the target month doesn't have enough days
  // (e.g., Jan 31 + 1 month = Feb 28/29, not Mar 3)
  const originalDay = dayOfMonth;
  const resultDay = result.getDate();

  // If the day changed, it means we overflowed to the next month
  if (resultDay < originalDay) {
    // Go back to the last day of the previous month
    result.setDate(0);
  }

  return result;
}

/**
 * Add years to a date, accounting for leap years
 * Feb 29 + 1 year → Feb 28 (not Mar 1)
 * @param {Date} date - Base date
 * @param {number} years - Number of years to add
 * @returns {Date} New date with years added
 */
function addYears(date, years) {
  const result = new Date(date);
  const dayOfMonth = result.getDate();
  result.setFullYear(result.getFullYear() + years);
  // Clamp end-of-month overflow (e.g. Feb 29 leap → Feb 28 non-leap)
  if (result.getDate() < dayOfMonth) {
    result.setDate(0);
  }
  return result;
}

/**
 * Calculate days between two dates (midnight-normalised — DST-safe)
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {number} Number of days between dates
 */
function daysBetween(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Reset time to start of day for accurate day calculation
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  const diffTime = end.getTime() - start.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Calculate the next renewal date from a period-end date using StripePlan
 * interval/intervalCount fields (anniversary logic).
 * This mirrors what Stripe itself does when it advances a billing cycle.
 *
 * @param {Date}   periodEnd      - Current period end (= next bill date)
 * @param {string} interval       - StripePlan.interval  ('month' | 'year')
 * @param {number} [intervalCount=1] - StripePlan.intervalCount
 * @returns {Date} Next renewal date
 */
function calculateNextRenewalDate(periodEnd, interval, intervalCount = 1) {
  if (!periodEnd || !(periodEnd instanceof Date) || isNaN(periodEnd)) {
    throw new Error('Invalid period end date provided');
  }
  switch (interval) {
    case 'month': return addMonths(periodEnd, intervalCount);
    case 'year':  return addYears(periodEnd, intervalCount);
    default: throw new Error(`Unsupported interval: ${interval}`);
  }
}

/**
 * Compute the number of days left until a subscription's currentPeriodEnd.
 * Midnight-normalised so the result matches calendar days regardless of
 * what time of day the call is made.
 *
 * @param {Date} periodEnd - Subscription.currentPeriodEnd
 * @returns {number} Days remaining, clamped to 0
 */
function daysLeftUntil(periodEnd) {
  if (!periodEnd) return 0;
  return Math.max(0, daysBetween(new Date(), periodEnd));
}

module.exports = {
  calculateSubscriptionEndDate,
  calculateNextRenewalDate,
  daysLeftUntil,
  addMonths,
  addYears,
  daysBetween
};
