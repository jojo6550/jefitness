const StripePlan = require('../../models/StripePlan');
const { logger } = require('../logger');
const { getStripe } = require('./client');

// Price caching for getPlanPricing() - 5min TTL in-memory
let priceCache = {};
let cacheExpiry = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get price ID for a plan name using DB (source of truth)
 * @param {string} plan - Plan name like '1-month', '3-month'
 * @returns {Promise<string|null>} Stripe price ID
 */
/**
 * Resolve a Stripe price ID from a plan name string (e.g. '1-month', '3-month').
 * @param {string} plan
 * @returns {Promise<string|null>}
 */
async function getPriceIdForPlan(plan) {
  try {
    const match = plan.match(/^(\d+)-(\w+)$/);
    if (!match) return null;
    const [, countStr, interval] = match;
    const intervalCount = parseInt(countStr);

    const planRecord = await StripePlan.findOne({
      intervalCount,
      interval,
      active: true,
      type: 'recurring',
    }).lean();
    return planRecord?.stripePriceId || null;
  } catch (error) {
    return null;
  }
}

/**
 * Get the active recurring price ID for a product (legacy, calls new DB function)
 * @param {string} productId - Stripe product ID
 * @returns {Promise<string|null>} Price ID or null if not found
 */
async function getPriceIdForProduct(productId) {
  const StripePlan = require('../../models/StripePlan');
  try {
    const planRecord = await StripePlan.findOne({
      stripeProductId: productId,
      active: true,
      type: 'recurring',
    }).lean();
    return planRecord ? planRecord.stripePriceId : null;
  } catch (error) {
    logger.error('Failed to get price for product', { productId, error: error.message });
    return null;
  }
}

/**
 * Get dynamic plan pricing from Stripe products
 * @returns {Promise<Object>} Plan pricing object
 */
async function getPlanPricing() {
  // Cache hit?
  if (Date.now() < cacheExpiry && Object.keys(priceCache).length > 0) {
    logger.debug('getPlanPricing cache hit');
    return priceCache;
  }

  logger.debug('getPlanPricing: fresh DB scan');

  try {
    // Get ALL active recurring plans from DB (pure dynamic)
    const plans = await StripePlan.find({
      active: true,
      type: 'recurring',
    })
      .sort({
        intervalCount: 1,
        unitAmount: 1,
      })
      .lean();

    if (plans.length === 0) {
      logger.warn('No active recurring plans in StripePlan DB');
      return {};
    }

    const pricing = {};
    for (const planRecord of plans) {
      // Use canonical plan name as key so it matches the controller allowlist
      const planKey = derivePlanName(planRecord);

      const amount = planRecord.unitAmount;
      const displayPrice = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: planRecord.currency || 'USD',
      }).format(amount / 100);

      pricing[planKey] = {
        key: planKey,
        name: planRecord.name || planKey,
        amount,
        displayPrice,
        currency: planRecord.currency,
        duration:
          planRecord.nickname ||
          planKey.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()),
        priceId: planRecord.stripePriceId,
        productId: planRecord.stripeProductId,
        interval: planRecord.interval,
        intervalCount: planRecord.intervalCount,
      };

      logger.debug('Dynamic plan loaded', {
        planKey,
        displayPrice,
        priceIdSuffix: planRecord.stripePriceId.slice(-8),
      });
    }

    // Cache
    priceCache = pricing;
    cacheExpiry = Date.now() + CACHE_TTL;
    logger.debug('getPlanPricing cached', { planCount: Object.keys(pricing).length });
    return pricing;
  } catch (error) {
    logger.error('getPlanPricing DB error', { error: error.message });
    return {};
  }
}

/**
 * Derive the internal plan name from a StripePlan record's authoritative
 * interval data.  Stripe's nickname/lookupKey strings vary per account
 * ('1-year', '1-month-subscription', 'annual', …) and cannot be trusted to
 * match the Subscription schema enum.  Using interval + intervalCount instead
 * ensures a consistent mapping regardless of how prices are named in Stripe.
 *
 * @param {{ interval: string, intervalCount: number }} planRecord
 * @returns {string} One of '1-month' | '3-month' | '6-month' | '12-month' | 'unknown-plan'
 */
function derivePlanName(planRecord) {
  const { interval, intervalCount = 1 } = planRecord;
  if (interval === 'year') return '12-month';
  if (interval === 'month') {
    if (intervalCount <= 1) return '1-month';
    if (intervalCount <= 3) return '3-month';
    if (intervalCount <= 6) return '6-month';
    return '12-month'; // 12-month billed monthly
  }
  return 'unknown-plan';
}

/**
 * Get plan name from Stripe price ID using DB
 * @param {string} priceId - Stripe price ID
 * @returns {Promise<string>} Plan name or 'unknown-plan'
 */
async function getPlanNameFromPriceId(priceId) {
  try {
    // Search active plans first, then fall back to inactive (handles archived plans on existing subscriptions)
    const planRecord = await StripePlan.findOne({ stripePriceId: priceId }).lean();
    if (planRecord) {
      return derivePlanName(planRecord);
    }
    return 'unknown-plan';
  } catch (error) {
    logger.error('Failed to get plan name for price', { priceId, error: error.message });
    return 'unknown-plan';
  }
}

/**
 * Get all active Stripe subscription prices with product details
 * @returns {Promise<Array>} Array of price objects with product details
 */
async function getAllActivePrices() {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }
    const prices = await stripe.prices.list({
      active: true,
      type: 'recurring',
      limit: 100,
    });

    // Get unique product IDs
    const productIds = [...new Set(prices.data.map(price => price.product))];

    // Fetch product details for all products
    const products = await Promise.all(
      productIds.map(productId => getStripe().products.retrieve(productId))
    );

    // Create a map of product ID to product data
    const productMap = {};
    products.forEach(product => {
      productMap[product.id] = product;
    });

    const formattedPrices = prices.data.map(price => ({
      priceId: price.id,
      productId: price.product,
      productName: productMap[price.product]?.name || 'Unknown Product',
      interval: price.recurring.interval,
      amount: price.unit_amount / 100, // Convert cents to dollars
      currency: price.currency,
    }));

    // Sort by interval (monthly first, then yearly), then by amount
    formattedPrices.sort((a, b) => {
      const intervalOrder = { month: 1, year: 2 };
      const aOrder = intervalOrder[a.interval] || 99;
      const bOrder = intervalOrder[b.interval] || 99;

      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }

      return a.amount - b.amount;
    });

    return formattedPrices;
  } catch (error) {
    throw new Error(`Failed to fetch active prices: ${error.message}`);
  }
}

module.exports = {
  getPriceIdForPlan,
  getPriceIdForProduct,
  getPlanPricing,
  getPlanNameFromPriceId,
  getAllActivePrices,
};
