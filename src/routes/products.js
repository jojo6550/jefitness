/**
 * Products API Route
 * Fetches product and pricing information from Stripe
 * Uses environment variables for product IDs (STRIPE_PRODUCT_1, STRIPE_PRODUCT_2, etc.)
 */

const express = require('express');
const { authenticate } = require('../middleware/auth');
const {
  getProduct,
  getProductPrice,
  formatProductForFrontend
} = require('../services/stripe');

const router = express.Router();

// Get product IDs from environment variables
// Format: STRIPE_PRODUCT_1, STRIPE_PRODUCT_2, etc.
function getProductIdsFromEnv() {
  const productIds = [];
  const env = process.env;
  
  // Check for STRIPE_PRODUCT_1, STRIPE_PRODUCT_2, etc.
  for (let i = 1; env[`STRIPE_PRODUCT_${i}`]; i++) {
    const productId = env[`STRIPE_PRODUCT_${i}`];
    if (productId && productId.trim()) {
      productIds.push(productId.trim());
    }
  }
  
  // If no products configured, return empty array
  return productIds;
}

/**
 * GET /api/v1/products
 * Get all products configured in environment variables
 * Query params:
 *   - format: 'full' | 'frontend' (default: 'frontend')
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const format = req.query.format || 'frontend';
    const productIds = getProductIdsFromEnv();
    
    if (productIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          products: [],
          count: 0,
          message: 'No products configured. Add STRIPE_PRODUCT_1, STRIPE_PRODUCT_2, etc. to your environment variables.'
        }
      });
    }
    
    // Fetch products from Stripe by ID
    const products = [];
    const errors = [];
    
    for (const productId of productIds) {
      try {
        const product = await getProduct(productId);
        products.push(product);
      } catch (err) {
        console.warn(`Could not fetch product ${productId}:`, err.message);
        errors.push({ productId, error: err.message });
      }
    }
    
    if (format === 'frontend') {
      // Format for frontend display
      const formattedProducts = products.map(formatProductForFrontend);
      return res.status(200).json({
        success: true,
        data: {
          products: formattedProducts,
          count: formattedProducts.length,
          errors: errors.length > 0 ? errors : undefined
        }
      });
    }
    
    // Return full product data
    res.status(200).json({
      success: true,
      data: {
        products: products,
        count: products.length,
        errors: errors.length > 0 ? errors : undefined
      }
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch products',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      }
    });
  }
});

/**
 * GET /api/v1/products/:productId
 * Get a single product from Stripe
 */
router.get('/:productId', authenticate, async (req, res) => {
  try {
    const { productId } = req.params;
    
    // Validate productId format
    if (!productId.match(/^prod_[a-zA-Z0-9]+$/)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid product ID format'
        }
      });
    }
    
    // Fetch product from Stripe
    const product = await getProduct(productId);
    
    res.status(200).json({
      success: true,
      data: { product }
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    
    if (error.message.includes('No such product')) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Product not found'
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch product',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      }
    });
  }
});

/**
 * GET /api/v1/products/:productId/price
 * Get price for a specific product and quantity
 * Query params:
 *   - quantity: number (default: 1)
 */
router.get('/:productId/price', authenticate, async (req, res) => {
  try {
    const { productId } = req.params;
    const quantity = parseInt(req.query.quantity) || 1;
    
    // Validate productId format
    if (!productId.match(/^prod_[a-zA-Z0-9]+$/)) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Invalid product ID format'
        }
      });
    }
    
    // Validate quantity
    if (quantity < 1 || quantity > 99) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Quantity must be between 1 and 99'
        }
      });
    }
    
    // Fetch price from Stripe
    const priceDetails = await getProductPrice(productId, quantity);
    
    res.status(200).json({
      success: true,
      data: { price: priceDetails }
    });
  } catch (error) {
    console.error('Error fetching product price:', error);
    
    if (error.message.includes('No such product')) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'Product not found'
        }
      });
    }
    
    if (error.message.includes('No active prices')) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'No active prices found for this product'
        }
      });
    }
    
    res.status(500).json({
      success: false,
      error: {
        message: 'Failed to fetch product price',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      }
    });
  }
});

module.exports = router;

