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
 * @param {Date} date - Base date
 * @param {number} years - Number of years to add
 * @returns {Date} New date with years added
 */
function addYears(date, years) {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

/**
 * Calculate days between two dates
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

module.exports = {
  calculateSubscriptionEndDate,
  addMonths,
  addYears,
  daysBetween
};
