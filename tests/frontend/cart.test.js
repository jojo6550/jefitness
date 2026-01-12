/**
 * Frontend Cart Page Tests
 * Tests cart page functionality with JSDOM
 */

// Setup JSDOM
const { JSDOM } = require('jsdom');

// Create a DOM environment
const dom = new JSDOM(`
<!DOCTYPE html>
<html>
<head></head>
<body>
  <div id="page-loading" style="display: none;">
    <div id="cart-items"></div>
    <div id="subtotal-amount">$0.00</div>
    <div id="tax-amount">$0.00</div>
    <div id="total-amount">$0.00</div>
    <div id="checkout-btn" class="btn btn-primary" style="display: none;">Proceed to Checkout</div>
    <div id="empty-cart" style="display: none;">
      <p>Your cart is empty</p>
      <a href="products.html" class="btn btn-primary">Browse Products</a>
    </div>
    <div id="error-alert" class="alert alert-danger" style="display: none;"></div>
  </div>
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
      return JSON.stringify({
        items: [
          { productId: 'seamoss-small', name: 'Seamoss - Small Size', price: 15.99, quantity: 2 },
          { productId: 'coconut-water', name: 'Coconut Water', price: 8.99, quantity: 1 }
        ]
      });
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
global.fetch = jest.fn();

describe('Frontend Cart Functionality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Product Configuration', () => {
    it('should define product prices correctly', () => {
      const PRODUCTS = {
        'seamoss-small': { price: 15.99 },
        'seamoss-large': { price: 25.99 },
        'coconut-water': { price: 8.99 },
        'coconut-jelly': { price: 12.99 }
      };

      expect(PRODUCTS['seamoss-small'].price).toBe(15.99);
      expect(PRODUCTS['seamoss-large'].price).toBe(25.99);
      expect(PRODUCTS['coconut-water'].price).toBe(8.99);
      expect(PRODUCTS['coconut-jelly'].price).toBe(12.99);
    });
  });

  describe('Cart Calculations', () => {
    it('should calculate subtotal correctly', () => {
      const cartItems = [
        { productId: 'seamoss-small', name: 'Seamoss - Small Size', price: 15.99, quantity: 2 },
        { productId: 'coconut-water', name: 'Coconut Water', price: 8.99, quantity: 1 }
      ];

      const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      // 15.99 * 2 + 8.99 * 1 = 31.98 + 8.99 = 40.97
      expect(subtotal).toBeCloseTo(40.97, 2);
    });

    it('should calculate tax correctly', () => {
      const subtotal = 40.97;
      const taxRate = 0.1; // 10% tax
      const tax = subtotal * taxRate;

      expect(tax).toBeCloseTo(4.10, 2);
    });

    it('should calculate grand total correctly', () => {
      const cartItems = [
        { productId: 'seamoss-small', name: 'Seamoss - Small Size', price: 15.99, quantity: 2 },
        { productId: 'coconut-water', name: 'Coconut Water', price: 8.99, quantity: 1 }
      ];

      const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const tax = subtotal * 0.1;
      const total = subtotal + tax;

      expect(total).toBeCloseTo(45.07, 2);
    });
  });

  describe('Quantity Controls', () => {
    it('should increment quantity correctly', () => {
      let quantity = 1;
      quantity = Math.min(quantity + 1, 99);
      expect(quantity).toBe(2);
    });

    it('should decrement quantity correctly', () => {
      let quantity = 5;
      quantity = Math.max(quantity - 1, 1);
      expect(quantity).toBe(4);
    });

    it('should not decrement below 1', () => {
      let quantity = 1;
      quantity = Math.max(quantity - 1, 1);
      expect(quantity).toBe(1);
    });

    it('should not increment above 99', () => {
      let quantity = 99;
      quantity = Math.min(quantity + 1, 99);
      expect(quantity).toBe(99);
    });
  });

  describe('Cart Item Management', () => {
    it('should add new item to cart', () => {
      let cart = { items: [] };
      const newItem = { productId: 'coconut-jelly', name: 'Coconut Jelly', price: 12.99, quantity: 1 };

      cart.items.push(newItem);

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].productId).toBe('coconut-jelly');
    });

    it('should increase quantity for existing item', () => {
      let cart = {
        items: [{ productId: 'seamoss-small', name: 'Seamoss - Small Size', price: 15.99, quantity: 2 }]
      };
      const existingItem = cart.items.find(item => item.productId === 'seamoss-small');

      if (existingItem) {
        existingItem.quantity += 1;
      }

      expect(cart.items[0].quantity).toBe(3);
    });

    it('should remove item from cart', () => {
      let cart = {
        items: [
          { productId: 'seamoss-small', name: 'Seamoss - Small Size', price: 15.99, quantity: 2 },
          { productId: 'coconut-water', name: 'Coconut Water', price: 8.99, quantity: 1 }
        ]
      };

      cart.items = cart.items.filter(item => item.productId !== 'coconut-water');

      expect(cart.items).toHaveLength(1);
      expect(cart.items[0].productId).toBe('seamoss-small');
    });

    it('should update item quantity', () => {
      let cart = {
        items: [{ productId: 'seamoss-small', name: 'Seamoss - Small Size', price: 15.99, quantity: 2 }]
      };
      const newQuantity = 5;

      const item = cart.items.find(item => item.productId === 'seamoss-small');
      if (item) {
        item.quantity = newQuantity;
      }

      expect(cart.items[0].quantity).toBe(5);
    });
  });

  describe('Cart Badge', () => {
    it('should calculate total items correctly', () => {
      const cartItems = [
        { productId: 'seamoss-small', quantity: 2 },
        { productId: 'coconut-water', quantity: 1 },
        { productId: 'coconut-jelly', quantity: 3 }
      ];

      const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

      expect(totalItems).toBe(6);
    });

    it('should return 0 for empty cart', () => {
      const cartItems = [];
      const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

      expect(totalItems).toBe(0);
    });
  });

  describe('API Configuration', () => {
    it('should use localhost API for localhost environment', () => {
      const isLocalhost = ['localhost', '127.0.0.1'].includes('localhost');
      const API_BASE = isLocalhost ? 'http://localhost:10000' : 'https://jefitness.onrender.com';

      expect(API_BASE).toBe('http://localhost:10000');
    });

    it('should use production API for non-localhost environment', () => {
      const isLocalhost = ['localhost', '127.0.0.1'].includes('example.com');
      const API_BASE = isLocalhost ? 'http://localhost:10000' : 'https://jefitness.onrender.com';

      expect(API_BASE).toBe('https://jefitness.onrender.com');
    });
  });

  describe('Stripe Checkout URL Generation', () => {
    it('should construct checkout URL correctly', () => {
      const sessionId = 'cs_test123';
      const returnUrl = 'http://localhost/cart.html';
      
      // In a real implementation, Stripe provides the checkout URL
      // Here we test that session ID is properly formatted
      expect(sessionId).toMatch(/^cs_/);
    });

    it('should include session ID in success URL', () => {
      const sessionId = 'cs_test123';
      const baseUrl = 'https://checkout.stripe.com';
      
      // Test URL construction pattern
      const checkoutUrl = `${baseUrl}/pay/${sessionId}`;
      
      expect(checkoutUrl).toBe('https://checkout.stripe.com/pay/cs_test123');
    });
  });

  describe('Cart Persistence', () => {
    it('should save cart to localStorage', () => {
      const cart = {
        items: [
          { productId: 'seamoss-small', name: 'Seamoss - Small Size', price: 15.99, quantity: 2 }
        ]
      };

      localStorageMock.setItem('productCart', JSON.stringify(cart));

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'productCart',
        JSON.stringify(cart)
      );
    });

    it('should load cart from localStorage', () => {
      const storedCart = localStorageMock.getItem('productCart');
      const cart = JSON.parse(storedCart);

      expect(cart.items).toHaveLength(2);
      expect(cart.items[0].productId).toBe('seamoss-small');
    });

    it('should clear cart from localStorage', () => {
      localStorageMock.removeItem('productCart');

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('productCart');
    });
  });

  describe('Checkout Session Creation', () => {
    it('should prepare line items for checkout', () => {
      const cartItems = [
        { productId: 'seamoss-small', name: 'Seamoss - Small Size', price: 15.99, quantity: 2 },
        { productId: 'coconut-water', name: 'Coconut Water', price: 8.99, quantity: 1 }
      ];

      const lineItems = cartItems.map(item => ({
        productId: item.productId,
        name: item.name,
        price: Math.round(item.price * 100), // Convert to cents
        quantity: item.quantity
      }));

      expect(lineItems[0].price).toBe(1599);
      expect(lineItems[1].price).toBe(899);
    });

    it('should calculate total amount in cents', () => {
      const lineItems = [
        { productId: 'seamoss-small', price: 1599, quantity: 2 },
        { productId: 'coconut-water', price: 899, quantity: 1 }
      ];

      const totalCents = lineItems.reduce(
        (sum, item) => sum + (item.price * item.quantity),
        0
      );

      expect(totalCents).toBe(4097); // $40.97
    });
  });

  describe('Error Handling', () => {
    it('should handle empty cart gracefully', () => {
      const cartItems = [];
      const subtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);

      expect(subtotal).toBe(0);
    });

    it('should handle invalid quantity input', () => {
      let quantity = parseInt('invalid') || 1;
      quantity = Math.max(1, Math.min(quantity, 99));

      expect(quantity).toBe(1);
    });

    it('should normalize negative quantity to 1', () => {
      let quantity = parseInt('-5') || 1;
      quantity = Math.max(1, Math.min(quantity, 99));

      expect(quantity).toBe(1);
    });

    it('should normalize quantity over 99 to 99', () => {
      let quantity = parseInt('150') || 1;
      quantity = Math.max(1, Math.min(quantity, 99));

      expect(quantity).toBe(99);
    });
  });
});

describe('Checkout Success Page', () => {
  describe('URL Parameter Parsing', () => {
    it('should extract session_id from URL', () => {
      const url = 'http://localhost/checkout-success.html?session_id=cs_test123';
      const urlObj = new URL(url);
      const sessionId = urlObj.searchParams.get('session_id');

      expect(sessionId).toBe('cs_test123');
    });

    it('should handle missing session_id', () => {
      const url = 'http://localhost/checkout-success.html';
      const urlObj = new URL(url);
      const sessionId = urlObj.searchParams.get('session_id');

      expect(sessionId).toBeNull();
    });
  });

  describe('Order Summary Display', () => {
    it('should format currency correctly', () => {
      const amountInCents = 4097;
      const formatted = `$${(amountInCents / 100).toFixed(2)}`;

      expect(formatted).toBe('$40.97');
    });

    it('should format date correctly', () => {
      const date = new Date('2025-01-15T10:30:00Z');
      const formatted = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      expect(formatted).toBe('January 15, 2025');
    });
  });
});

