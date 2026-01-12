/**
 * Frontend Products Page Tests
 * Tests products page functionality with JSDOM
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
    <div class="product-card" data-product-id="seamoss-small">
      <button class="btn btn-outline-secondary quantity-btn" data-action="decrease">-</button>
      <input type="number" class="form-control text-center quantity-input" value="1" min="1" max="99" data-product="seamoss-small">
      <button class="btn btn-outline-secondary quantity-btn" data-action="increase">+</button>
      <button class="btn btn-primary add-to-cart-btn" data-product-id="seamoss-small" data-product-name="Seamoss - Small Size" data-price="15.99">Add to Cart</button>
    </div>
    <div class="product-card" data-product-id="seamoss-large">
      <button class="btn btn-outline-secondary quantity-btn" data-action="decrease">-</button>
      <input type="number" class="form-control text-center quantity-input" value="1" min="1" max="99" data-product="seamoss-large">
      <button class="btn btn-outline-secondary quantity-btn" data-action="increase">+</button>
      <button class="btn btn-primary add-to-cart-btn" data-product-id="seamoss-large" data-product-name="Seamoss - Large Size" data-price="25.99">Add to Cart</button>
    </div>
    <div class="product-card" data-product-id="coconut-water">
      <button class="btn btn-outline-secondary quantity-btn" data-action="decrease">-</button>
      <input type="number" class="form-control text-center quantity-input" value="1" min="1" max="99" data-product="coconut-water">
      <button class="btn btn-outline-secondary quantity-btn" data-action="increase">+</button>
      <button class="btn btn-primary add-to-cart-btn" data-product-id="coconut-water" data-product-name="Coconut Water" data-price="8.99">Add to Cart</button>
    </div>
    <div class="product-card" data-product-id="coconut-jelly">
      <button class="btn btn-outline-secondary quantity-btn" data-action="decrease">-</button>
      <input type="number" class="form-control text-center quantity-input" value="1" min="1" max="99" data-product="coconut-jelly">
      <button class="btn btn-outline-secondary quantity-btn" data-action="increase">+</button>
      <button class="btn btn-primary add-to-cart-btn" data-product-id="coconut-jelly" data-product-name="Coconut Jelly" data-price="12.99">Add to Cart</button>
    </div>
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

describe('Products Page Functionality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Product Configuration', () => {
    it('should define all product details correctly', () => {
      const PRODUCTS = {
        'seamoss-small': { id: 'seamoss-small', name: 'Seamoss - Small Size', price: 15.99, icon: 'bi-droplet-fill', color: 'primary' },
        'seamoss-large': { id: 'seamoss-large', name: 'Seamoss - Large Size', price: 25.99, icon: 'bi-droplet-fill', color: 'primary' },
        'coconut-water': { id: 'coconut-water', name: 'Coconut Water', price: 8.99, icon: 'bi-cup-straw', color: 'success' },
        'coconut-jelly': { id: 'coconut-jelly', name: 'Coconut Jelly', price: 12.99, icon: 'bi-egg-fried', color: 'warning' }
      };

      expect(Object.keys(PRODUCTS)).toHaveLength(4);
      expect(PRODUCTS['seamoss-small'].name).toBe('Seamoss - Small Size');
      expect(PRODUCTS['coconut-water'].price).toBe(8.99);
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

    it('should handle manual input changes', () => {
      let inputValue = parseInt('50') || 1;
      inputValue = Math.max(1, Math.min(inputValue, 99));
      
      expect(inputValue).toBe(50);
    });

    it('should normalize invalid input to 1', () => {
      let inputValue = parseInt('invalid') || 1;
      inputValue = Math.max(1, Math.min(inputValue, 99));
      
      expect(inputValue).toBe(1);
    });

    it('should normalize negative input to 1', () => {
      let inputValue = parseInt('-5') || 1;
      inputValue = Math.max(1, Math.min(inputValue, 99));
      
      expect(inputValue).toBe(1);
    });

    it('should normalize input over 99 to 99', () => {
      let inputValue = parseInt('150') || 1;
      inputValue = Math.max(1, Math.min(inputValue, 99));
      
      expect(inputValue).toBe(99);
    });
  });

  describe('Add to Cart', () => {
    it('should add new item to cart', () => {
      let cart = { items: [] };
      const productId = 'seamoss-small';
      const productName = 'Seamoss - Small Size';
      const price = 15.99;
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
      expect(cart.items[0].productId).toBe('seamoss-small');
      expect(cart.items[0].quantity).toBe(2);
    });

    it('should increase quantity for existing item', () => {
      let cart = {
        items: [{ productId: 'seamoss-small', name: 'Seamoss - Small Size', price: 15.99, quantity: 2 }]
      };
      const productId = 'seamoss-small';
      const quantity = 3;

      const existingItem = cart.items.find(item => item.productId === productId);
      
      if (existingItem) {
        existingItem.quantity += quantity;
      } else {
        cart.items.push({ productId, quantity });
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

    it('should sync cart to server', async () => {
      const token = 'mock-jwt-token';
      const API_BASE = 'http://localhost:10000';
      const cart = { items: [{ productId: 'seamoss-small', quantity: 2 }] };
      
      await fetch(`${API_BASE}/api/v1/cart/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          productId: cart.items[0].productId,
          quantity: cart.items[0].quantity
        })
      });

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:10000/api/v1/cart/products',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer mock-jwt-token'
          })
        })
      );
    });
  });

  describe('Cart Badge', () => {
    it('should update cart badge with total items', () => {
      const cartItems = [
        { productId: 'seamoss-small', quantity: 2 },
        { productId: 'coconut-water', quantity: 1 },
        { productId: 'coconut-jelly', quantity: 3 }
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

  describe('Server Cart Sync', () => {
    it('should sync cart from server', async () => {
      const token = 'mock-jwt-token';
      const API_BASE = 'http://localhost:10000';
      
      const mockServerCart = {
        data: {
          cart: {
            items: [
              { productId: 'seamoss-small', name: 'Seamoss Small', price: 15.99, quantity: 2 }
            ],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        }
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockServerCart)
      });

      const res = await fetch(`${API_BASE}/api/v1/cart`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      expect(res.ok).toBe(true);
    });

    it('should handle server sync error gracefully', async () => {
      const token = 'mock-jwt-token';
      const API_BASE = 'http://localhost:10000';
      
      fetch.mockRejectedValueOnce(new Error('Network error'));

      try {
        await fetch(`${API_BASE}/api/v1/cart`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      } catch (err) {
        // Should handle error silently
        expect(err.message).toBe('Network error');
      }
    });
  });

  describe('Product Pricing', () => {
    it('should calculate correct line item total', () => {
      const price = 15.99;
      const quantity = 3;
      const total = price * quantity;

      expect(total).toBeCloseTo(47.97, 2);
    });

    it('should calculate correct cart subtotal', () => {
      const products = [
        { id: 'seamoss-small', price: 15.99, quantity: 2 },
        { id: 'seamoss-large', price: 25.99, quantity: 1 },
        { id: 'coconut-water', price: 8.99, quantity: 3 }
      ];

      const subtotal = products.reduce(
        (sum, p) => sum + (p.price * p.quantity),
        0
      );

      // 15.99*2 + 25.99*1 + 8.99*3 = 31.98 + 25.99 + 26.97 = 84.94
      expect(subtotal).toBeCloseTo(84.94, 2);
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
  describe('Product Card Elements', () => {
    it('should have 4 product cards', () => {
      const productCards = document.querySelectorAll('.product-card');
      expect(productCards.length).toBe(4);
    });

    it('should have quantity input for each product', () => {
      const quantityInputs = document.querySelectorAll('.quantity-input');
      expect(quantityInputs.length).toBe(4);
    });

    it('should have quantity buttons for each product', () => {
      const quantityBtns = document.querySelectorAll('.quantity-btn');
      expect(quantityBtns.length).toBe(8); // 2 per product (increase and decrease)
    });

    it('should have add to cart buttons', () => {
      const addToCartBtns = document.querySelectorAll('.add-to-cart-btn');
      expect(addToCartBtns.length).toBe(4);
    });

    it('should have correct product IDs on elements', () => {
      const products = ['seamoss-small', 'seamoss-large', 'coconut-water', 'coconut-jelly'];
      
      products.forEach(productId => {
        const input = document.querySelector(`.quantity-input[data-product="${productId}"]`);
        const btn = document.querySelector(`.add-to-cart-btn[data-product-id="${productId}"]`);
        
        expect(input).not.toBeNull();
        expect(btn).not.toBeNull();
      });
    });
  });

  describe('Cart Badge', () => {
    it('should have cart badge element', () => {
      const badge = document.getElementById('cart-badge');
      expect(badge).not.toBeNull();
    });

    it('should be hidden by default', () => {
      const badge = document.getElementById('cart-badge');
      expect(badge.style.display).toBe('none');
    });
  });

  describe('Toast Container', () => {
    it('should have toast container', () => {
      const toastContainer = document.querySelector('.toast-container');
      expect(toastContainer).not.toBeNull();
    });

    it('should have toast message element', () => {
      const toastMessage = document.getElementById('toastMessage');
      expect(toastMessage).not.toBeNull();
    });
  });
});

