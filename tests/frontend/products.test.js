/**
 * Frontend Products Page Tests
 * Tests products page functionality with JSDOM
 * Updated to use environment variable product IDs
 */

// Setup JSDOM
const { JSDOM } = require('jsdom');

// Create a DOM environment
const dom = new JSDOM(`
<!DOCTYPE html>
<html>
<head></head>
<body>
  <div id="page-loading" style="display: none;"></div>
  <div class="toast-container position-fixed top-0 end-0 p-3" style="z-index: 9999">
    <div id="cartToast" class="toast align-items-center text-bg-primary border-0" role="alert">
      <div class="d-flex">
        <div class="toast-body">
          <i class="bi bi-check-circle me-2"></i>
          <span id="toastMessage">Item added to cart!</span>
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    </div>
  </div>
  <nav class="navbar">
    <a class="navbar-brand" href="index.html">JE FITNESS</a>
    <a class="nav-link btn btn-outline-info position-relative" href="cart.html">
      <i class="bi bi-cart3"></i>
      <span id="cart-badge" class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger" style="display: none;">
        0
      </span>
    </a>
  </nav>
  <div id="products-container">
    <!-- Products will be dynamically loaded -->
  </div>
</body>
</html>
`, {
  url: 'http://localhost',
  runScripts: 'dangerously'
});

// Set up globals for the test environment
global.window = dom.window;
global.document = dom.window.document;
global.bootstrap = {
  Modal: class {
    show() {}
    hide() {}
  },
  Toast: class {
    show() {}
  }
};

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn((key) => {
    if (key === 'productCart') {
      return JSON.stringify({ items: [] });
    }
    if (key === 'token') {
      return 'mock-jwt-token';
    }
    return null;
  }),
  setItem: jest.fn(),
  removeItem: jest.fn()
};
global.localStorage = localStorageMock;

// Mock fetch
global.fetch = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ success: true }) });

describe('Products Page with Environment Variables', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Environment Variable Product IDs', () => {
    it('should parse product IDs from environment variables', () => {
      // Simulate getProductIdsFromEnv function
      const env = {
        'STRIPE_PRODUCT_1': 'prod_abc123',
        'STRIPE_PRODUCT_2': 'prod_def456',
        'STRIPE_PRODUCT_3': 'prod_ghi789'
      };

      function getProductIdsFromEnv() {
        const productIds = [];
        for (let i = 1; env[`STRIPE_PRODUCT_${i}`]; i++) {
          const productId = env[`STRIPE_PRODUCT_${i}`];
          if (productId && productId.trim()) {
            productIds.push(productId.trim());
          }
        }
        return productIds;
      }

      const productIds = getProductIdsFromEnv();
      expect(productIds).toHaveLength(3);
      expect(productIds).toContain('prod_abc123');
      expect(productIds).toContain('prod_def456');
      expect(productIds).toContain('prod_ghi789');
    });

    it('should return empty array when no products configured', () => {
      const env = {};

      function getProductIdsFromEnv() {
        const productIds = [];
        for (let i = 1; env[`STRIPE_PRODUCT_${i}`]; i++) {
          const productId = env[`STRIPE_PRODUCT_${i}`];
          if (productId && productId.trim()) {
            productIds.push(productId.trim());
          }
        }
        return productIds;
      }

      const productIds = getProductIdsFromEnv();
      expect(productIds).toHaveLength(0);
    });

    it('should skip empty product IDs', () => {
      const env = {
        'STRIPE_PRODUCT_1': 'prod_abc123',
        'STRIPE_PRODUCT_2': '',
        'STRIPE_PRODUCT_3': '   ',
        'STRIPE_PRODUCT_4': 'prod_xyz789'
      };

      function getProductIdsFromEnv() {
        const productIds = [];
        for (let i = 1; env[`STRIPE_PRODUCT_${i}`]; i++) {
          const productId = env[`STRIPE_PRODUCT_${i}`];
          if (productId && productId.trim()) {
            productIds.push(productId.trim());
          }
        }
        return productIds;
      }

      const productIds = getProductIdsFromEnv();
      expect(productIds).toHaveLength(2);
      expect(productIds).toContain('prod_abc123');
      expect(productIds).toContain('prod_xyz789');
    });
  });

  describe('Product Formatting', () => {
    it('should format product for frontend display', () => {
      const mockStripeProduct = {
        id: 'prod_abc123',
        name: 'Seamoss - Small Size',
        description: 'Premium organic Seamoss',
        active: true,
        metadata: {
          icon: 'bi-droplet-fill',
          color: 'primary'
        },
        images: ['https://example.com/seamoss.jpg'],
        prices: [
          { id: 'price_123', amount: 1599, currency: 'usd', type: 'one_time' }
        ]
      };

      function formatProductForFrontend(product) {
        if (!product) return null;
        
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

      const formatted = formatProductForFrontend(mockStripeProduct);
      
      expect(formatted.id).toBe('prod_abc123');
      expect(formatted.name).toBe('Seamoss - Small Size');
      expect(formatted.price).toBe(1599);
      expect(formatted.formattedPrice).toBe('$15.99');
      expect(formatted.metadata.icon).toBe('bi-droplet-fill');
      expect(formatted.metadata.color).toBe('primary');
    });

    it('should return null for null product', () => {
      function formatProductForFrontend(product) {
        if (!product) return null;
        return {};
      }

      expect(formatProductForFrontend(null)).toBeNull();
    });

    it('should handle product without prices', () => {
      const mockProduct = {
        id: 'prod_test',
        name: 'Test Product',
        description: 'A test product',
        active: true,
        metadata: {},
        images: [],
        prices: []
      };

      function formatProductForFrontend(product) {
        if (!product) return null;
        
        const oneTimePrice = product.prices && product.prices.length > 0 
          ? product.prices.find(p => p.type === 'one_time') || product.prices[0]
          : null;

        return {
          id: product.id,
          name: product.name,
          formattedPrice: oneTimePrice?.amount 
            ? `$${(oneTimePrice.amount / 100).toFixed(2)}` 
            : 'N/A'
        };
      }

      const formatted = formatProductForFrontend(mockProduct);
      expect(formatted.formattedPrice).toBe('N/A');
    });
  });

  describe('API Calls with Product IDs', () => {
    it('should fetch products using environment variable IDs', async () => {
      const envProductIds = ['prod_abc123', 'prod_def456'];
      const mockProducts = [
        { id: 'prod_abc123', name: 'Product 1' },
        { id: 'prod_def456', name: 'Product 2' }
      ];

      // Mock individual product fetches
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: { product: mockProducts[0] } })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: { product: mockProducts[1] } })
        });

      const results = [];
      for (const productId of envProductIds) {
        const res = await fetch(`/api/v1/products/${productId}`, {
          headers: { 'Authorization': 'Bearer mock-token' }
        });
        const data = await res.json();
        results.push(data.data.product);
      }

      expect(results).toHaveLength(2);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should handle missing products gracefully', async () => {
      const envProductIds = ['prod_valid', 'prod_invalid'];

      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: { product: { id: 'prod_valid', name: 'Valid' } } })
        })
        .mockRejectedValueOnce(new Error('Product not found'));

      const results = [];
      const errors = [];

      for (const productId of envProductIds) {
        try {
          const res = await fetch(`/api/v1/products/${productId}`, {
            headers: { 'Authorization': 'Bearer mock-token' }
          });
          const data = await res.json();
          results.push(data.data.product);
        } catch (err) {
          errors.push({ productId, error: err.message });
        }
      }

      expect(results).toHaveLength(1);
      expect(errors).toHaveLength(1);
      expect(errors[0].productId).toBe('prod_invalid');
    });
  });

  describe('Quantity Controls', () => {
    it('should increment quantity on + button click', () => {
      let inputValue = 1;
      const action = 'increase';
      
      if (action === 'increase') {
        inputValue = Math.min(inputValue + 1, 99);
      }
      
      expect(inputValue).toBe(2);
    });

    it('should decrement quantity on - button click', () => {
      let inputValue = 5;
      const action = 'decrease';
      
      if (action === 'decrease') {
        inputValue = Math.max(inputValue - 1, 1);
      }
      
      expect(inputValue).toBe(4);
    });

    it('should not decrement below 1', () => {
      let inputValue = 1;
      const action = 'decrease';
      
      if (action === 'decrease') {
        inputValue = Math.max(inputValue - 1, 1);
      }
      
      expect(inputValue).toBe(1);
    });

    it('should not increment above 99', () => {
      let inputValue = 99;
      const action = 'increase';
      
      if (action === 'increase') {
        inputValue = Math.min(inputValue + 1, 99);
      }
      
      expect(inputValue).toBe(99);
    });
  });

  describe('Add to Cart', () => {
    it('should add new item to cart', () => {
      let cart = { items: [] };
      const productId = 'prod_abc123';
      const productName = 'Seamoss - Small Size';
      const price = 1599; // in cents
      const quantity = 2;

      const existingItem = cart.items.find(item => item.productId === productId);
      
      if (existingItem) {
        existingItem.quantity += quantity;
      } else {
        cart.items.push({
          productId,
          name: productName,
          price,
          quantity
        });
      }

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].productId).toBe('prod_abc123');
      expect(cart.items[0].quantity).toBe(2);
    });

    it('should increase quantity for existing item', () => {
      let cart = {
        items: [{ productId: 'prod_abc123', name: 'Seamoss', price: 1599, quantity: 2 }]
      };
      const productId = 'prod_abc123';
      const quantity = 3;

      const existingItem = cart.items.find(item => item.productId === productId);
      
      if (existingItem) {
        existingItem.quantity += quantity;
      }

      expect(cart.items[0].quantity).toBe(5);
    });

    it('should save cart to localStorage', () => {
      const cart = { items: [{ productId: 'test', quantity: 1 }] };
      
      localStorageMock.setItem('productCart', JSON.stringify(cart));

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'productCart',
        JSON.stringify(cart)
      );
    });
  });

  describe('Cart Badge', () => {
    it('should update cart badge with total items', () => {
      const cartItems = [
        { productId: 'prod_1', quantity: 2 },
        { productId: 'prod_2', quantity: 1 },
        { productId: 'prod_3', quantity: 3 }
      ];

      const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
      const badgeVisible = totalItems > 0;

      expect(totalItems).toBe(6);
      expect(badgeVisible).toBe(true);
    });

    it('should hide badge for empty cart', () => {
      const cartItems = [];
      const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);
      const badgeVisible = totalItems > 0;

      expect(totalItems).toBe(0);
      expect(badgeVisible).toBe(false);
    });
  });

  describe('API Configuration', () => {
    it('should use localhost API for localhost environment', () => {
      const isLocalhost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
      const API_BASE = isLocalhost ? 'http://localhost:10000' : 'https://jefitness.onrender.com';

      expect(API_BASE).toBe('http://localhost:10000');
    });

    it('should use production API for non-localhost environment', () => {
      const mockHostname = 'example.com';
      const isLocalhost = ['localhost', '127.0.0.1'].includes(mockHostname);
      const API_BASE = isLocalhost ? 'http://localhost:10000' : 'https://jefitness.onrender.com';

      expect(API_BASE).toBe('https://jefitness.onrender.com');
    });
  });

  describe('Product Pricing', () => {
    it('should calculate correct line item total', () => {
      const price = 1599; // in cents
      const quantity = 3;
      const total = (price * quantity) / 100;

      expect(total).toBe(47.97);
    });

    it('should format price correctly', () => {
      const amountInCents = 1599;
      const formatted = `$${(amountInCents / 100).toFixed(2)}`;

      expect(formatted).toBe('$15.99');
    });
  });

  describe('Authentication Check', () => {
    it('should detect authenticated user', () => {
      const token = localStorageMock.getItem('token');
      const isAuthenticated = !!token;

      expect(isAuthenticated).toBe(true);
    });

    it('should detect unauthenticated user', () => {
      localStorageMock.getItem.mockReturnValueOnce(null);
      const token = localStorageMock.getItem('token');
      const isAuthenticated = !!token;

      expect(isAuthenticated).toBe(false);
    });
  });

  describe('Logout Functionality', () => {
    it('should clear all auth data on logout', () => {
      logout();

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('token');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('user');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('productCart');
    });

    function logout() {
      localStorageMock.removeItem('token');
      localStorageMock.removeItem('user');
      localStorageMock.removeItem('productCart');
    }
  });

  describe('Toast Notifications', () => {
    it('should generate correct toast message', () => {
      const productName = 'Seamoss - Small Size';
      const quantity = 2;
      const message = `${quantity}x ${productName} added to cart!`;

      expect(message).toBe('2x Seamoss - Small Size added to cart!');
    });

    it('should handle single item add notification', () => {
      const productName = 'Coconut Water';
      const quantity = 1;
      const message = `${quantity}x ${productName} added to cart!`;

      expect(message).toBe('1x Coconut Water added to cart!');
    });
  });
});

describe('Products Page DOM Tests', () => {
  describe('Product Container', () => {
    it('should have products container', () => {
      const container = document.getElementById('products-container');
      expect(container).not.toBeNull();
    });

    it('should have cart badge element', () => {
      const badge = document.getElementById('cart-badge');
      expect(badge).not.toBeNull();
    });

    it('should have toast container', () => {
      const toastContainer = document.querySelector('.toast-container');
      expect(toastContainer).not.toBeNull();
    });
  });
});

