/**
 * Jamaican Timezone Utilities (America/Jamaica = UTC-5, no DST)
 * Ensures all logs use consistent Jamaican local time
 */

const JAMAICA_TZ = 'America/Jamaica';

/**
 * Get current time as ISO-like string in Jamaican TZ
 * Format: "2024-01-15T14:30:25.123Z" but adjusted to JST
 * Compatible with Date parsing and MongoDB Date fields
 */
const getJamaicanISOString = () => {
  // Parse local ISO string and append Z (becomes valid UTC Date but shows JST when formatted)
  return new Date().toLocaleString('sv', { timeZone: JAMAICA_TZ }).replace(/ /g, 'T') + 'Z';
};

/**
 * Format Jamaican local time for display (consistent across browsers)
 * @param {Date|string} dateInput - Date object or ISO string
 * @param {Object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted Jamaican local time
 */
const formatJamaicanTime = (dateInput, options = {}) => {
  const date = new Date(dateInput);
  return date.toLocaleString('en-US', { 
    timeZone: JAMAICA_TZ,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    ...options
  });
};

/**
 * Get Jamaican local Date object (preserves local time components)
 */
const getJamaicanDate = () => {
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: JAMAICA_TZ }));
};

/**
 * Check if a Date is in Jamaican TZ (utility)
 */
const isJamaicanTime = (dateStr) => {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', { timeZone: JAMAICA_TZ }) === 
         new Date(date.getTime() + (5 * 60 * 60 * 1000)).toLocaleString('en-US', { timeZone: 'UTC' });
};

module.exports = {
  JAMAICA_TZ,
  getJamaicanISOString,
  formatJamaicanTime,
  getJamaicanDate,
  isJamaicanTime
};

