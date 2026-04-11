const StripePlan = require('../models/StripePlan');
const { logger } = require('./logger');

// Lazy initialization of Stripe to avoid issues in test environment
let stripeInstance = null;
const getStripe = () => {
  if (!stripeInstance && process.env.STRIPE_SECRET_KEY) {
    const stripe = require('stripe');
    stripeInstance = stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeInstance;
};


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
  const StripePlan = require('../models/StripePlan');
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
      // Generate plan key: lookupKey > nickname > intervalCount-interval
      const planKey =
        planRecord.lookupKey ||
        planRecord.nickname ||
        `${planRecord.intervalCount}-${planRecord.interval}`;

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

      logger.debug('Dynamic plan loaded', { planKey, displayPrice, priceIdSuffix: planRecord.stripePriceId.slice(-8) });
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
 * Create or retrieve a Stripe customer
 * @param {string} email - Customer email
 * @param {string} paymentMethodId - Stripe Payment Method ID (optional)
 * @param {object} metadata - Additional metadata (optional)
 * @returns {Promise<Object>} Stripe customer object
 */
async function createOrRetrieveCustomer(email, paymentMethodId = null, metadata = {}) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }
    // Check if customer already exists with this email in the current environment (test vs live).
    // Stripe's customer.list returns customers across both modes — filter by livemode so we don't
    // accidentally reuse a test customer in production or vice versa.
    const isLive = !process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_');
    const allCustomers = await stripe.customers.list({ email, limit: 100 });
    const matchingCustomers = allCustomers.data.filter(c => c.livemode === isLive);

    let customer;
    if (matchingCustomers.length > 0) {
      customer = matchingCustomers[0];
      // Update metadata if provided
      if (Object.keys(metadata).length > 0) {
        customer = await stripe.customers.update(customer.id, { metadata });
      }
      // Attach payment method if provided and not already attached
      if (paymentMethodId) {
        try {
          await stripe.paymentMethods.attach(paymentMethodId, { customer: customer.id });
          await stripe.customers.update(customer.id, {
            invoice_settings: { default_payment_method: paymentMethodId },
          });
        } catch (attachError) {
          // Payment method might already be attached, ignore error
          logger.warn('Payment method attach warning', { error: attachError.message });
        }
      }
    } else {
      // Create new customer
      customer = await stripe.customers.create({
        email,
        ...(paymentMethodId && {
          payment_method: paymentMethodId,
          invoice_settings: {
            default_payment_method: paymentMethodId,
          },
        }),
        metadata,
      });
    }

    return customer;
  } catch (error) {
    throw new Error(`Failed to create/retrieve customer: ${error.message}`);
  }
}

/**
 * Create a subscription for a customer
 * @param {string} customerId - Stripe customer ID
 * @param {string} plan - Subscription plan ('1-month', '3-month', '6-month', '12-month')
 * @returns {Promise<Object>} Stripe subscription object
 */
async function createSubscription(customerId, plan) {
  // This function is deprecated — all subscriptions go through createCheckoutSession.
  // PRODUCT_IDS was removed; calling this will throw to surface the miscall clearly.
  throw new Error(
    'createSubscription is deprecated. Use createCheckoutSession instead.'
  );
  /* eslint-disable no-unreachable */
  try {
    logger.info('createSubscription called', { customerId, plan });

    const productId = undefined; // PRODUCT_IDS removed — see deprecation above
    logger.debug('Product ID for plan', { plan, productId });
    if (!productId) {
      throw new Error(`Invalid plan: ${plan}`);
    }

    const priceId = await getPriceIdForPlan(plan);
    logger.debug('Price ID from DB', { plan, priceId });
    if (!priceId) {
      throw new Error(
        `No active recurring price found for plan: ${plan} (check StripePlan DB)`
      );
    }

    // Get customer to check default payment method
    const customer = await getStripe().customers.retrieve(customerId);
    logger.debug('Customer retrieved', { customerId: customer.id });
    const defaultPaymentMethod = customer.invoice_settings?.default_payment_method;
    logger.debug('Default payment method', { defaultPaymentMethod });

    const subscriptionData = {
      customer: customerId,
      items: [
        {
          price: priceId,
        },
      ],
      // Expand to get latest invoice and payment intent details
      expand: ['latest_invoice.payment_intent'],
      // Allow incomplete payment - customer can complete it later
      payment_behavior: 'allow_incomplete',
    };

    // Set default payment method if available
    if (defaultPaymentMethod) {
      subscriptionData.default_payment_method = defaultPaymentMethod;
    }

    logger.debug('Creating subscription', { customerId, plan, priceId });
    const subscription = await getStripe().subscriptions.create(subscriptionData);
    logger.info('Subscription created', { subscriptionId: subscription.id, status: subscription.status });

    return subscription;
  } catch (error) {
    logger.error('createSubscription error', { error: error.message });
    throw new Error(`Failed to create subscription: ${error.message}`);
  }
}

/**
 * Retrieve all subscriptions for a customer
 * @param {string} customerId - Stripe customer ID
 * @param {string} status - Filter by status (all, active, past_due, canceled, unpaid, paused)
 * @returns {Promise<Array>} Array of subscription objects
 */
async function getCustomerSubscriptions(customerId, status = 'all') {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: status === 'all' ? undefined : status,
      expand: ['data.latest_invoice', 'data.default_payment_method'],
      limit: 100,
    });

    return subscriptions.data;
  } catch (error) {
    throw new Error(`Failed to retrieve subscriptions: ${error.message}`);
  }
}

/**
 * Get a single subscription by ID
 * @param {string} subscriptionId - Stripe subscription ID
 * @returns {Promise<Object>} Stripe subscription object
 */
async function getSubscription(subscriptionId) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['latest_invoice.payment_intent', 'default_payment_method'],
    });

    return subscription;
  } catch (error) {
    throw new Error(`Failed to retrieve subscription: ${error.message}`);
  }
}

/**
 * Update a subscription (change plan, update payment method, etc.)
 * @param {string} subscriptionId - Stripe subscription ID
 * @param {object} updates - Updates to apply { plan, priceId, paymentMethodId, etc. }
 * @returns {Promise<Object>} Updated subscription object
 */
async function updateSubscription(subscriptionId, updates = {}) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Prepare update object
    const updateData = {};

    // If plan is changing, update the price
    if (updates.plan) {
      const newPriceId = await getPriceIdForPlan(updates.plan);
      if (!newPriceId) {
        throw new Error(
          `No active recurring price found for plan: ${updates.plan} (check StripePlan DB)`
        );
      }

      // Update subscription items
      updateData.items = [
        {
          id: subscription.items.data[0].id,
          price: newPriceId,
        },
      ];

      // Proration - charge or credit for the difference immediately
      updateData.proration_behavior = 'create_prorations';
    }

    // Update payment method if provided
    if (updates.paymentMethodId) {
      updateData.default_payment_method = updates.paymentMethodId;
    }

    // Update metadata if provided
    if (updates.metadata) {
      updateData.metadata = updates.metadata;
    }

    if (Object.keys(updateData).length === 0) {
      return subscription; // No updates to apply
    }

    const updatedSubscription = await stripe.subscriptions.update(
      subscriptionId,
      updateData
    );

    return updatedSubscription;
  } catch (error) {
    throw new Error(`Failed to update subscription: ${error.message}`);
  }
}

/**
 * Cancel a subscription
 * @param {string} subscriptionId - Stripe subscription ID
 * @param {boolean} atPeriodEnd - If true, cancel at period end; if false, cancel immediately
 * @returns {Promise<Object>} Canceled subscription object
 */
async function cancelSubscription(subscriptionId, atPeriodEnd = false) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }

    if (atPeriodEnd) {
      // Cancel at period end
      const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });
      return updatedSubscription;
    } else {
      // Cancel immediately
      const canceledSubscription = await stripe.subscriptions.cancel(subscriptionId);
      return canceledSubscription;
    }
  } catch (error) {
    // Treat all "already gone" scenarios as success — cancelSubscription must be idempotent
    const msg = error.message || '';
    if (
      error.code === 'resource_missing' ||
      error.code === 'subscription_already_canceled' ||
      msg.includes('No such subscription') ||
      msg.includes('already canceled') ||
      msg.includes('already been canceled') ||
      msg.includes('Cannot cancel')
    ) {
      logger.info('Stripe subscription already canceled or not found, treating as success', { subscriptionId });
      return null;
    }
    throw new Error(`Failed to cancel subscription: ${error.message}`);
  }
}

/**
 * Resume a subscription that was scheduled for cancellation
 * @param {string} subscriptionId - Stripe subscription ID
 * @returns {Promise<Object>} Resumed subscription object
 */
async function resumeSubscription(subscriptionId) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }
    const resumedSubscription = await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });

    return resumedSubscription;
  } catch (error) {
    throw new Error(`Failed to resume subscription: ${error.message}`);
  }
}

/**
 * Get all invoices for a subscription
 * @param {string} subscriptionId - Stripe subscription ID
 * @returns {Promise<Array>} Array of invoice objects
 */
async function getSubscriptionInvoices(subscriptionId) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }
    const invoices = await stripe.invoices.list({
      subscription: subscriptionId,
      limit: 100,
      expand: ['data.payment_intent'],
    });

    return invoices.data;
  } catch (error) {
    throw new Error(`Failed to retrieve invoices: ${error.message}`);
  }
}

/**
 * Create a checkout session for subscription
 * @param {string} customerId - Stripe customer ID
 * @param {string} plan - Subscription plan
 * @param {string} successUrl - URL to redirect on successful payment
 * @param {string} cancelUrl - URL to redirect if payment is canceled
 * @returns {Promise<Object>} Checkout session object
 */
async function createCheckoutSession(customerId, plan, successUrl, cancelUrl) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }

    // ✅ DEFENSIVE: Validate customer exists before checkout
    if (!customerId) {
      throw new Error('Missing customer ID - please re-authenticate your account');
    }
    logger.debug('Validating Stripe customer', { customerId, plan });

    try {
      await stripe.customers.retrieve(customerId);
      logger.debug('Stripe customer verified', { customerId });
    } catch (custErr) {
      if (custErr.code === 'resource_missing') {
        logger.error('Stripe customer not found', { customerId });
        throw new Error(
          `Customer account invalid: ${customerId}. Please contact support to re-link your Stripe account.`
        );
      }
      logger.error('Customer validation failed', { customerId, error: custErr.message });
      throw custErr;
    }

    // Dynamic price lookup from cached plans (matches frontend getPlans)
    const pricing = await getPlanPricing();
    const planData = pricing[plan];
    if (!planData?.priceId) {
      const available = Object.keys(pricing);
      throw new Error(
        `No active price found for plan "${plan}". ` +
          `Available: ${available.length ? available.join(', ') : 'none'}. ` +
          'Run "node scripts/sync-stripe-to-db.js" to sync Stripe → DB'
      );
    }
    const priceId = planData.priceId;
    logger.debug('Checkout price resolved', { plan, priceIdSuffix: priceId.slice(-8), currency: planData.currency });

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        plan: plan,
        priceId: priceId.slice(-8),
        source: 'subscription_checkout',
      },
      // Allow customer to update payment method
      billing_address_collection: 'required',
      // Removed: subscription_data.proration_behavior - invalid for new sessions without billing_cycle_anchor
    });

    logger.info('Subscription checkout session created', { sessionId: session.id, customerId });
    return session;
  } catch (error) {
    logger.error('createCheckoutSession error', { plan, customerId, error: error.message });
    throw new Error(`Failed to create checkout session: ${error.message}`);
  }
}

/**
 * Get payment methods for a customer
 * @param {string} customerId - Stripe customer ID
 * @returns {Promise<Array>} Array of payment method objects
 */
async function getPaymentMethods(customerId) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }
    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: 'card',
      limit: 100,
    });

    return paymentMethods.data;
  } catch (error) {
    throw new Error(`Failed to retrieve payment methods: ${error.message}`);
  }
}

/**
 * Delete a payment method
 * @param {string} paymentMethodId - Stripe payment method ID
 * @returns {Promise<Object>} Deleted payment method object
 */
async function deletePaymentMethod(paymentMethodId) {
  try {
    const deletedPaymentMethod = await getStripe().paymentMethods.detach(paymentMethodId);
    return deletedPaymentMethod;
  } catch (error) {
    throw new Error(`Failed to delete payment method: ${error.message}`);
  }
}

/**
 * Create a payment intent for manual payment processing
 * @param {string} customerId - Stripe customer ID
 * @param {number} amount - Amount in cents
 * @param {string} currency - Currency code (e.g., 'jmd')
 * @returns {Promise<Object>} Payment intent object
 */
async function createPaymentIntent(customerId, amount, currency = 'jmd') {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      customer: customerId,
      payment_method_types: ['card'],
    });

    return paymentIntent;
  } catch (error) {
    throw new Error(`Failed to create payment intent: ${error.message}`);
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

/**
 * Verify and retrieve a checkout session
 * @param {string} sessionId - Stripe checkout session ID
 * @returns {Promise<Object>} Checkout session object
 */
async function getCheckoutSession(sessionId) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['payment_intent', 'customer'],
    });

    return session;
  } catch (error) {
    throw new Error(`Failed to retrieve checkout session: ${error.message}`);
  }
}

/**
 * Create or get a Stripe customer for product purchases
 * @param {string} email - Customer email
 * @param {string} name - Customer name (optional)
 * @returns {Promise<Object>} Stripe customer object
 */
async function getOrCreateProductCustomer(email, name = null) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }

    // Check if customer already exists — filter by livemode to avoid reusing test customers in production
    const isLive = !process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_');
    const existingCustomers = await stripe.customers.list({
      email: email,
      limit: 100,
    });
    const matchingCustomers = existingCustomers.data.filter(c => c.livemode === isLive);

    if (matchingCustomers.length > 0) {
      logger.debug('Found existing Stripe customer', { customerId: matchingCustomers[0].id });
      return matchingCustomers[0];
    }

    // Create new customer
    const customer = await stripe.customers.create({
      email: email,
      name: name || undefined,
      metadata: {
        source: 'jefitness_product_purchase',
      },
    });

    logger.info('Created new Stripe customer', { customerId: customer.id });
    return customer;
  } catch (error) {
    throw new Error(`Failed to get/create customer: ${error.message}`);
  }
}

/**
 * Get all active products from Stripe with their prices
 * @param {boolean} activeOnly - Only return active products (default: true)
 * @returns {Promise<Array>} Array of product objects with prices
 */
async function getAllProducts(activeOnly = true) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }

    // Fetch all active products
    const products = await stripe.products.list({
      active: activeOnly,
      limit: 100,
      expand: ['data.default_price'],
    });

    // For each product, get its active prices
    const productsWithPrices = await Promise.all(
      products.data.map(async product => {
        const prices = await stripe.prices.list({
          product: product.id,
          active: true,
          limit: 100,
        });

        return {
          id: product.id,
          name: product.name,
          description: product.description,
          active: product.active,
          metadata: product.metadata,
          images: product.images,
          defaultPrice: product.default_price,
          prices: prices.data.map(price => ({
            id: price.id,
            amount: price.unit_amount,
            currency: price.currency,
            type: price.type,
            recurring: price.recurring || null,
          })),
        };
      })
    );

    return productsWithPrices;
  } catch (error) {
    throw new Error(`Failed to fetch products: ${error.message}`);
  }
}

/**
 * Get a single product by ID with its prices
 * @param {string} productId - Stripe product ID
 * @returns {Promise<Object>} Product object with prices
 */
async function getProduct(productId) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }

    // Fetch the product
    const product = await stripe.products.retrieve(productId, {
      expand: ['default_price'],
    });

    // Get all prices for this product
    const prices = await stripe.prices.list({
      product: productId,
      active: true,
      limit: 100,
    });

    return {
      id: product.id,
      name: product.name,
      description: product.description,
      active: product.active,
      metadata: product.metadata,
      images: product.images,
      defaultPrice: product.default_price,
      prices: prices.data.map(price => ({
        id: price.id,
        amount: price.unit_amount,
        currency: price.currency,
        type: price.type,
        recurring: price.recurring || null,
      })),
    };
  } catch (error) {
    throw new Error(`Failed to fetch product: ${error.message}`);
  }
}

/**
 * Get product price for a specific quantity and configuration
 * @param {string} productId - Stripe product ID
 * @param {number} quantity - Quantity to purchase
 * @returns {Promise<Object>} Price details
 */
async function getProductPrice(productId, quantity = 1) {
  try {
    const product = await getProduct(productId);

    if (!product || !product.prices || product.prices.length === 0) {
      throw new Error(`No active prices found for product: ${productId}`);
    }

    // Use the default price or first available price
    const defaultPrice =
      product.prices.find(p => p.type === 'one_time') || product.prices[0];

    return {
      productId: product.id,
      productName: product.name,
      description: product.description,
      priceId: defaultPrice.id,
      unitAmount: defaultPrice.amount,
      currency: defaultPrice.currency,
      quantity: quantity,
      totalAmount: defaultPrice.amount * quantity,
      formattedUnitPrice: `$${(defaultPrice.amount / 100).toFixed(2)}`,
      formattedTotal: `$${((defaultPrice.amount * quantity) / 100).toFixed(2)}`,
    };
  } catch (error) {
    throw new Error(`Failed to get product price: ${error.message}`);
  }
}

/**
 * Format a single product for frontend display
 * @param {Object} product - Stripe product with prices
 * @returns {Object} Formatted product object
 */
function formatProductForFrontend(product) {
  if (!product) return null;

  // Find the one-time price (for product purchases)
  const oneTimePrice =
    product.prices && product.prices.length > 0
      ? product.prices.find(p => p.type === 'one_time') || product.prices[0]
      : null;

  return {
    id: product.id,
    name: product.name,
    description: product.description,
    priceId: oneTimePrice?.id,
    price: oneTimePrice?.amount,
    formattedPrice: oneTimePrice?.amount
      ? `$${(oneTimePrice.amount / 100).toFixed(2)}`
      : 'N/A',
    currency: oneTimePrice?.currency || 'jmd',
    images: product.images,
    metadata: product.metadata,
  };
}

/**
 * Format products for frontend display
 * @param {Array} products - Array of Stripe products with prices
 * @returns {Array} Formatted products array
 */
function formatProductsForFrontend(products) {
  return products
    .filter(product => product.active && product.prices && product.prices.length > 0)
    .map(formatProductForFrontend);
}

module.exports = {
  getStripe,
  createOrRetrieveCustomer,
  createSubscription,
  getCustomerSubscriptions,
  getSubscription,
  updateSubscription,
  cancelSubscription,
  resumeSubscription,
  getSubscriptionInvoices,
  createCheckoutSession,

  getCheckoutSession,
  getOrCreateProductCustomer,
  getPaymentMethods,
  deletePaymentMethod,
  createPaymentIntent,
  getPriceIdForProduct,
  getPriceIdForPlan,
  getPlanNameFromPriceId,
  getPlanPricing,
  getAllActivePrices,
  getAllProducts,
  getProduct,
  getProductPrice,
  formatProductForFrontend,
  formatProductsForFrontend,
};
