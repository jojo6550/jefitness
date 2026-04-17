const { getStripe } = require('./client');

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
  getAllProducts,
  getProduct,
  getProductPrice,
  formatProductForFrontend,
  formatProductsForFrontend,
};
