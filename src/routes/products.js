/**
 * Products API Route
 * Fetches product and pricing information from Stripe
 */

const express = require('express');
const { authenticate } = require('../middleware/auth');
const {
  getAllProducts,
  getProduct,
  getProductPrice,
  formatProductsForFrontend
} = require('../services/stripe');

const router = express.Router();

/**
 * GET /api/v1/products
 * Get all products from Stripe
 * Query params:
 *   - format: 'full' | 'frontend' (default: 'frontend')
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const format = req.query.format || 'frontend';
    
    // Fetch all products from Stripe
    const products = await getAllProducts(true);
    
    if (format === 'frontend') {
      // Format for frontend display
      const formattedProducts = formatProductsForFrontend(products);
      return res.status(200).json({
        success: true,
        data: {
          products: formattedProducts,
          count: formattedProducts.length
        }
      });
    }
    
    // Return full product data
    res.status(200).json({
      success: true,
      data: {
        products: products,
        count: products.length
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

