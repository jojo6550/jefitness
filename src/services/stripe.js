// Lazy initialization of Stripe to avoid issues in test environment
let stripeInstance = null;
const getStripe = () => {
  if (!stripeInstance) {
    const stripe = require('stripe');
    stripeInstance = stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeInstance;
};

/**
 * STRIPE PRODUCT IDS CONFIGURATION
 * Replace these with your actual Stripe Product IDs from the dashboard
 * You can find them at: https://dashboard.stripe.com/test/products
 * Each product should have at least one active recurring price
 */
const PRODUCT_IDS = {
  '1-month': process.env.STRIPE_PRODUCT_1_MONTH || 'prod_TlkNETGd6OFrRf',
  '3-month': process.env.STRIPE_PRODUCT_3_MONTH || 'prod_TlkOMtyHdhvBXQ',
  '6-month': process.env.STRIPE_PRODUCT_6_MONTH || 'prod_TlkQ5HrbgnHXA5',
  '12-month': process.env.STRIPE_PRODUCT_12_MONTH || 'prod_TlkRUlSilrQIu0'
};

/**
 * PROGRAM PRODUCT IDS CONFIGURATION
 * Product IDs for program purchases (one-time payments)
 */
const PROGRAM_PRODUCT_IDS = {
  // Add your program product IDs here, mapped by program slug or ID
  // Example: 'program-slug': process.env.STRIPE_PROGRAM_SLUG || 'prod_program_slug'
  // You can add specific ones as needed
};

/**
 * PRODUCT MAP CONFIGURATION
 * One-time product purchases configuration
 * Maps product keys to their Stripe product IDs and expected prices
 */
const PRODUCT_MAP = {
  'seamoss-small': {
    productId: process.env.STRIPE_PRODUCT_SEAMOSS_SMALL,
    name: 'Seamoss - Small Size',
    price: 1599, // $15.99 in cents
    currency: 'usd'
  },
  'seamoss-large': {
    productId: process.env.STRIPE_PRODUCT_SEAMOSS_LARGE,
    name: 'Seamoss - Large Size',
    price: 2599, // $25.99 in cents
    currency: 'usd'
  }
};

/**
 * Get the active recurring price ID for a product
 * @param {string} productId - Stripe product ID
 * @returns {Promise<string|null>} Price ID or null if not found
 */
async function getPriceIdForProduct(productId) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }
    const prices = await stripe.prices.list({
      product: productId,
      active: true,
      type: 'recurring',
      limit: 1
    });

    return prices.data.length > 0 ? prices.data[0].id : null;
  } catch (error) {
    console.error(`Failed to get price for product ${productId}:`, error.message);
    return null;
  }
}

/**
 * Get dynamic plan pricing from Stripe products
 * @returns {Promise<Object>} Plan pricing object
 */
async function getPlanPricing() {
  const plans = {};

  console.log('🔄 Starting getPlanPricing...');
  console.log('📋 PRODUCT_IDS:', PRODUCT_IDS);

  for (const [planKey, productId] of Object.entries(PRODUCT_IDS)) {
    console.log(`🔍 Processing ${planKey} with productId: ${productId}`);

    try {
      const priceId = await getPriceIdForProduct(productId);
      console.log(`💰 Price ID for ${planKey}: ${priceId}`);

      if (priceId) {
        const price = await getStripe().prices.retrieve(priceId);
        const amount = price.unit_amount;
        const displayPrice = `$${(amount / 100).toFixed(2)}`;

        plans[planKey] = {
          amount,
          displayPrice,
          duration: planKey.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()),
          productId,
          priceId
        };

        console.log(`✅ Successfully loaded pricing for ${planKey}: ${displayPrice}`);
      } else {
        // Fallback to static pricing if price not found
        console.warn(`⚠️ No active recurring price found for product ${productId}, using fallback`);
        plans[planKey] = getFallbackPricing(planKey);
        console.log(`🔄 Using fallback pricing for ${planKey}: ${plans[planKey].displayPrice}`);
      }
    } catch (error) {
      console.error(`❌ Error getting pricing for ${planKey}:`, error.message);
      plans[planKey] = getFallbackPricing(planKey);
      console.log(`🔄 Using fallback pricing for ${planKey} due to error: ${plans[planKey].displayPrice}`);
    }
  }

  console.log('📊 Final plans object:', plans);
  return plans;
}

/**
 * Fallback pricing when Stripe is unavailable or prices not found
 * @param {string} planKey - Plan key
 * @returns {Object} Fallback pricing object
 */
function getFallbackPricing(planKey) {
  const fallbacks = {
    '1-month': { amount: 999, displayPrice: '$9.99', duration: '1 Month' },
    '3-month': { amount: 2799, displayPrice: '$27.99', duration: '3 Months', savings: '$2.98' },
    '6-month': { amount: 4999, displayPrice: '$49.99', duration: '6 Months', savings: '$9.95' },
    '12-month': { amount: 8999, displayPrice: '$89.99', duration: '12 Months', savings: '$29.89' }
  };
  return fallbacks[planKey] || fallbacks['1-month'];
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
    // Check if customer already exists with this email
    const existingCustomers = await stripe.customers.list({
      email: email,
      limit: 1
    });

    let customer;
    if (existingCustomers.data.length > 0) {
      customer = existingCustomers.data[0];
      // Update metadata if provided
      if (Object.keys(metadata).length > 0) {
        customer = await stripe.customers.update(customer.id, { metadata });
      }
      // Attach payment method if provided and not already attached
      if (paymentMethodId) {
        try {
          await stripe.paymentMethods.attach(paymentMethodId, { customer: customer.id });
          await stripe.customers.update(customer.id, {
            invoice_settings: { default_payment_method: paymentMethodId }
          });
        } catch (attachError) {
          // Payment method might already be attached, ignore error
          console.warn('Payment method attach warning:', attachError.message);
        }
      }
    } else {
      // Create new customer
      customer = await stripe.customers.create({
        email: email,
        ...(paymentMethodId && {
          payment_method: paymentMethodId,
          invoice_settings: {
            default_payment_method: paymentMethodId
          }
        }),
        metadata: metadata
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
  try {
    console.log('createSubscription called with customerId:', customerId, 'plan:', plan);

    const productId = PRODUCT_IDS[plan];
    console.log('productId for plan:', productId);
    if (!productId) {
      throw new Error(`Invalid plan: ${plan}`);
    }

    const priceId = await getPriceIdForProduct(productId);
    console.log('priceId found:', priceId);
    if (!priceId) {
      throw new Error(`No active recurring price found for plan: ${plan}`);
    }

    // Get customer to check default payment method
    const customer = await getStripe().customers.retrieve(customerId);
    console.log('customer retrieved:', customer.id);
    const defaultPaymentMethod = customer.invoice_settings?.default_payment_method;
    console.log('defaultPaymentMethod:', defaultPaymentMethod);

    const subscriptionData = {
      customer: customerId,
      items: [{
        price: priceId
      }],
      // Expand to get latest invoice and payment intent details
      expand: ['latest_invoice.payment_intent'],
      // Allow incomplete payment - customer can complete it later
      payment_behavior: 'allow_incomplete'
    };

    // Set default payment method if available
    if (defaultPaymentMethod) {
      subscriptionData.default_payment_method = defaultPaymentMethod;
    }

    console.log('Creating subscription with data:', JSON.stringify(subscriptionData, null, 2));
    const subscription = await getStripe().subscriptions.create(subscriptionData);
    console.log('Subscription created successfully:', subscription.id, 'status:', subscription.status);

    return subscription;
  } catch (error) {
    console.error('createSubscription error:', error);
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
      limit: 100
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
      expand: ['latest_invoice.payment_intent', 'default_payment_method']
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
      const productId = PRODUCT_IDS[updates.plan];
      if (!productId) {
        throw new Error(`Invalid plan: ${updates.plan}`);
      }

      const newPriceId = await getPriceIdForProduct(productId);
      if (!newPriceId) {
        throw new Error(`No active recurring price found for plan: ${updates.plan}`);
      }

      // Update subscription items
      updateData.items = [{
        id: subscription.items.data[0].id,
        price: newPriceId
      }];

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
      const updatedSubscription = await stripe.subscriptions.update(
        subscriptionId,
        { cancel_at_period_end: true }
      );
      return updatedSubscription;
    } else {
      // Cancel immediately
      const canceledSubscription = await stripe.subscriptions.cancel(subscriptionId);
      return canceledSubscription;
    }
  } catch (error) {
    // Handle specific Stripe errors
    if (error.code === 'resource_missing' || error.message.includes('No such subscription')) {
      throw new Error('Subscription is already canceled or does not exist');
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
    const resumedSubscription = await stripe.subscriptions.update(
      subscriptionId,
      { cancel_at_period_end: false }
    );

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
      expand: ['data.payment_intent']
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
    const productId = PRODUCT_IDS[plan];
    if (!productId) {
      throw new Error(`Invalid plan: ${plan}`);
    }

    const priceId = await getPriceIdForProduct(productId);
    if (!priceId) {
      throw new Error(`No active recurring price found for plan: ${plan}`);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      // Allow customer to update payment method
      billing_address_collection: 'required',
      subscription_data: {
        // Automatically apply proration for existing subscriptions
        proration_behavior: 'create_prorations'
      }
    });

    return session;
  } catch (error) {
    throw new Error(`Failed to create checkout session: ${error.message}`);
  }
}

/**
 * Create a checkout session for program purchase (one-time payment)
 * @param {string} customerId - Stripe customer ID
 * @param {string} programId - Program ID or slug
 * @param {string} successUrl - URL to redirect on successful payment
 * @param {string} cancelUrl - URL to redirect if payment is canceled
 * @returns {Promise<Object>} Checkout session object
 */
async function createProgramCheckoutSession(customerId, programId, successUrl, cancelUrl) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }
    // Get program details to find the product ID
    const Program = require('../models/Program');
    const program = await Program.findById(programId);
    if (!program) {
      throw new Error(`Program not found: ${programId}`);
    }

    // Use program slug to find product ID from environment
    const productId = PROGRAM_PRODUCT_IDS[program.slug] || process.env[`STRIPE_PROGRAM_${program.slug.toUpperCase().replace(/-/g, '_')}`];
    if (!productId) {
      throw new Error(`No product ID found for program: ${program.slug}. Please set STRIPE_PROGRAM_${program.slug.toUpperCase().replace(/-/g, '_')} in environment variables.`);
    }

    const priceId = await getPriceIdForProduct(productId);
    if (!priceId) {
      throw new Error(`No active price found for program: ${program.slug}`);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'payment', // One-time payment for programs
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      billing_address_collection: 'required',
      metadata: {
        programId: programId,
        programSlug: program.slug
      }
    });

    return session;
  } catch (error) {
    throw new Error(`Failed to create program checkout session: ${error.message}`);
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
      limit: 100
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
 * @param {string} currency - Currency code (e.g., 'usd')
 * @returns {Promise<Object>} Payment intent object
 */
async function createPaymentIntent(customerId, amount, currency = 'usd') {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency,
      customer: customerId,
      payment_method_types: ['card']
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
      limit: 100
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
      currency: price.currency
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
 * Create a checkout session for product purchases (one-time payment with quantity)
 * @param {string} customerId - Stripe customer ID
 * @param {Array} items - Array of { productId, name, price, quantity }
 * @param {string} successUrl - URL to redirect on successful payment
 * @param {string} cancelUrl - URL to redirect if payment is canceled
 * @returns {Promise<Object>} Checkout session object
 */
async function createProductCheckoutSession(customerId, items, successUrl, cancelUrl) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      throw new Error('Stripe not initialized');
    }

    // Validate items
    if (!items || items.length === 0) {
      throw new Error('No items provided for checkout');
    }

    // Build line items for Stripe
    const lineItems = items.map(item => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.name,
          description: `Product ID: ${item.productId}`,
          metadata: {
            productId: item.productId
          }
        },
        unit_amount: item.price, // Price in cents
      },
      quantity: item.quantity
    }));

    // Calculate total for metadata
    const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      mode: 'payment', // One-time payment
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      billing_address_collection: 'required',
      phone_number_collection: {
        enabled: true
      },
      metadata: {
        type: 'product_purchase',
        itemCount: items.length.toString(),
        totalAmount: totalAmount.toString(),
        // Store item details as JSON string
        items: JSON.stringify(items.map(item => ({
          productId: item.productId,
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.price,
          totalPrice: item.price * item.quantity
        })))
      },
      // Enable additional payment method types if needed
      payment_method_options: {
        card: {
          request_three_d_secure: 'automatic'
        }
      }
    });

    console.log(`✅ Product checkout session created: ${session.id} for customer: ${customerId}`);
    console.log(`📦 Items: ${items.length}, Total: $${(totalAmount / 100).toFixed(2)}`);

    return session;
  } catch (error) {
    console.error('Failed to create product checkout session:', error.message);
    throw new Error(`Failed to create checkout session: ${error.message}`);
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
      expand: ['payment_intent', 'customer']
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

    // Check if customer already exists
    const existingCustomers = await stripe.customers.list({
      email: email,
      limit: 1
    });

    if (existingCustomers.data.length > 0) {
      console.log(`✅ Found existing customer: ${existingCustomers.data[0].id}`);
      return existingCustomers.data[0];
    }

    // Create new customer
    const customer = await stripe.customers.create({
      email: email,
      name: name || undefined,
      metadata: {
        source: 'jefitness_product_purchase'
      }
    });

    console.log(`✅ Created new customer: ${customer.id}`);
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
      expand: ['data.default_price']
    });

    // For each product, get its active prices
    const productsWithPrices = await Promise.all(
      products.data.map(async (product) => {
        const prices = await stripe.prices.list({
          product: product.id,
          active: true,
          limit: 100
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
            recurring: price.recurring || null
          }))
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
      expand: ['default_price']
    });

    // Get all prices for this product
    const prices = await stripe.prices.list({
      product: productId,
      active: true,
      limit: 100
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
        recurring: price.recurring || null
      }))
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
    const defaultPrice = product.prices.find(p => p.type === 'one_time') || product.prices[0];

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
      formattedTotal: `$${((defaultPrice.amount * quantity) / 100).toFixed(2)}`
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
  const oneTimePrice = product.prices && product.prices.length > 0 
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
    currency: oneTimePrice?.currency || 'usd',
    images: product.images,
    metadata: product.metadata
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
  createOrRetrieveCustomer,
  createSubscription,
  getCustomerSubscriptions,
  getSubscription,
  updateSubscription,
  cancelSubscription,
  resumeSubscription,
  getSubscriptionInvoices,
  createCheckoutSession,
  createProgramCheckoutSession,
  createProductCheckoutSession,
  getCheckoutSession,
  getOrCreateProductCustomer,
  getPaymentMethods,
  deletePaymentMethod,
  createPaymentIntent,
  getPriceIdForProduct,
  getPlanPricing,
  getAllActivePrices,
  getAllProducts,
  getProduct,
  getProductPrice,
  formatProductForFrontend,
  formatProductsForFrontend,
  PRODUCT_IDS,
  PROGRAM_PRODUCT_IDS,
  PRODUCT_MAP
};
