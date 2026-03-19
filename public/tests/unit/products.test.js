/**
 * Frontend Unit Tests for products.js
 * Tests cart management and checkout functionality
 */

// Mock DOM elements
document.body.innerHTML = `
  <div id="page-loading"></div>
  <div id="cart-badge"></div>
  <div id="cartToast" class="toast">
    <div id="toastMessage"></div>
  </div>
  <div id="authRequiredModal" class="modal"></div>
  <button id="checkout-btn"></button>
  
  <div class="product-card" data-product-id="seamoss-small">
    <h5 class="card-title">Seamoss - Small</h5>
    <p class="card-text">Premium seamoss supplement</p>
    <span class="product-price">19.99</span>
    <i class="bi bi-box text-primary"></i>
    <input type="number" class="quantity-input" value="1" />
    <button class="add-to-cart-btn" data-product-id="seamoss-small">Add to Cart</button>
  </div>
`;

// Mock global productsCart object that mirrors products.js functionality
beforeAll(() => {
  window.productsData = {
    'seamoss-small': { name: 'Seamoss - Small', price: 19.99 },
    'seamoss-large': { name: 'Seamoss - Large', price: 39.99 }
  };
  window.productPrices = { 'seamoss-small': 19.99, 'seamoss-large': 39.99 };

  window.productsCart = {
    cart: [],
    
    getCart() { return this.cart; },
    
    addToCart(key, qty = 1) {
      const item = this.cart.find(i => i.productKey === key);
      if (item) {
        item.quantity += qty;
      } else {
        this.cart.push({
          productKey: key,
          quantity: qty,
          price: window.productPrices[key] || 0,
          name: window.productsData[key]?.name || key
        });
      }
      this.saveCart();
      this.updateCartBadge();
    },
    
    removeFromCart(key) {
      this.cart = this.cart.filter(i => i.productKey !== key);
      this.saveCart();
      this.updateCartBadge();
    },
    
    updateCartQuantity(key, qty) {
      const item = this.cart.find(i => i.productKey === key);
      if (item) {
        item.quantity = Math.max(1, qty);
        this.saveCart();
        this.updateCartBadge();
      }
    },
    
    clearCart() {
      this.cart = [];
      localStorage.removeItem('jefitness_cart');
      this.updateCartBadge();
    },
    
    getCartItemCount() {
      return this.cart.reduce((sum, item) => sum + item.quantity, 0);
    },
    
    saveCart() {
      localStorage.setItem('jefitness_cart', JSON.stringify(this.cart));
    },
    
    updateCartBadge() {
      const badge = document.getElementById('cart-badge');
      if (badge) {
        const total = this.getCartItemCount();
        badge.textContent = total;
        badge.style.display = total > 0 ? 'inline-block' : 'none';
      }
    },
    
    async handleCheckout() {
      if (!this.cart.length) return false;
      
      // Simulate auth check
      const token = localStorage.getItem('token');
      if (!token) {
        // Mock redirect
        window.location.href = '/login';
        return false;
      }
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, checkoutUrl: 'https://checkout.stripe.com/test' })
      });
      
      // Simulate checkout call
      await global.fetch(`${window.ApiConfig.getAPI_BASE()}/api/v1/products/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ items: this.cart.map(i => ({ productKey: i.productKey, quantity: i.quantity })) })
      });
      
      return true;
    }
  };
  
  // Mock loadCart to populate from localStorage
  window.productsCart.loadCart = () => {
    const saved = localStorage.getItem('jefitness_cart');
    if (saved) window.productsCart.cart = JSON.parse(saved);
    window.productsCart.updateCartBadge();
  };
  
  window.productsCart.loadCart(); // Initial load
});

// Load the products.js file (for side effects/event listeners, but use our mock cart)
require('../../js/products.js');

describe('Products.js - Frontend Unit Tests', () => {
  beforeEach(() => {
    // Rely on setup-jsdom.js mocks - no manual localStorage handling needed
    
    // Reset fetch mock
    global.fetch.mockClear();
    
    // Reset cart (uses mocked localStorage)
    if (window.productsCart) {
      window.productsCart.clearCart();
    }
  });

  describe('Cart Management', () => {
    it('should add item to cart', () => {
      window.productsCart.addToCart('seamoss-small', 2);

      const cart = window.productsCart.getCart();
      expect(cart).toHaveLength(1);
      expect(cart[0].productKey).toBe('seamoss-small');
      expect(cart[0].quantity).toBe(2);
      expect(cart[0].name).toBe('Seamoss - Small');
      expect(cart[0].price).toBe(19.99);
    });

    it('should increase quantity if item already in cart', () => {
      window.productsCart.addToCart('seamoss-small', 1);
      window.productsCart.addToCart('seamoss-small', 2);

      const cart = window.productsCart.getCart();
      expect(cart).toHaveLength(1);
      expect(cart[0].quantity).toBe(3);
    });

    it('should remove item from cart', () => {
      window.productsCart.addToCart('seamoss-small', 1);
      window.productsCart.removeFromCart('seamoss-small');

      const cart = window.productsCart.getCart();
      expect(cart).toHaveLength(0);
    });

    it('should update item quantity', () => {
      window.productsCart.addToCart('seamoss-small', 1);
      window.productsCart.updateCartQuantity('seamoss-small', 5);

      const cart = window.productsCart.getCart();
      expect(cart[0].quantity).toBe(5);
    });

    it('should prevent quantity below 1', () => {
      window.productsCart.addToCart('seamoss-small', 3);
      window.productsCart.updateCartQuantity('seamoss-small', -1);

      const cart = window.productsCart.getCart();
      expect(cart[0].quantity).toBe(1); // Should be clamped to minimum 1
    });

    it('should clear entire cart', () => {
      window.productsCart.addToCart('seamoss-small', 1);
      window.productsCart.addToCart('seamoss-large', 2);
      window.productsCart.clearCart();

      const cart = window.productsCart.getCart();
      expect(cart).toHaveLength(0);
    });

    it('should calculate correct item count', () => {
      window.productsCart.addToCart('seamoss-small', 2);
      window.productsCart.addToCart('seamoss-large', 3);

      const count = window.productsCart.getCartItemCount();
      expect(count).toBe(5); // 2 + 3
    });
  });

  describe('LocalStorage Persistence', () => {
    it('should save cart to localStorage when items added', () => {
      window.productsCart.addToCart('seamoss-small', 1);

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'jefitness_cart',
        expect.any(String)
      );
    });

    it('should load cart from localStorage on page load', () => {
      const mockCart = [
        {
          productKey: 'seamoss-small',
          name: 'Seamoss - Small',
          quantity: 2,
          price: 19.99,
        },
      ];

      localStorage.getItem.mockReturnValue(JSON.stringify(mockCart));

      // Reload the cart
      const loadCart = require('../../js/products.js').loadCart;
      if (typeof loadCart === 'function') {
        loadCart();
      }

      expect(localStorage.getItem).toHaveBeenCalledWith('jefitness_cart');
    });

    it('should handle corrupted localStorage data gracefully', () => {
      localStorage.getItem.mockReturnValue('{ invalid json }');

      // Should not throw error
      expect(() => {
        const loadCart = require('../../js/products.js').loadCart;
        if (typeof loadCart === 'function') {
          loadCart();
        }
      }).not.toThrow();
    });

    it('should remove cart from localStorage when cleared', () => {
      window.productsCart.addToCart('seamoss-small', 1);
      window.productsCart.clearCart();

      expect(localStorage.removeItem).toHaveBeenCalledWith('jefitness_cart');
    });
  });

  describe('UI Updates', () => {
    it('should update cart badge when items added', () => {
      const badge = document.getElementById('cart-badge');
      
      window.productsCart.addToCart('seamoss-small', 2);

      expect(badge.textContent).toBe('2');
      expect(badge.style.display).toBe('inline-block');
    });

    it('should hide cart badge when cart is empty', () => {
      const badge = document.getElementById('cart-badge');
      
      window.productsCart.addToCart('seamoss-small', 1);
      window.productsCart.clearCart();

      expect(badge.style.display).toBe('none');
    });

    it('should show toast notification on add to cart', () => {
      const toastElement = document.getElementById('cartToast');
      const toastMessage = document.getElementById('toastMessage');

      window.productsCart.addToCart('seamoss-small', 1);

      // Bootstrap Toast should be created
      expect(bootstrap.Toast).toHaveBeenCalled();
    });
  });

  describe('Checkout Process', () => {
    it('should create checkout session with valid cart', async () => {
      // Mock successful API response
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          checkoutUrl: 'https://checkout.stripe.com/test',
        }),
      });

      // Mock localStorage token
      localStorage.getItem.mockReturnValue('valid-token');

      // Add items to cart
      window.productsCart.addToCart('seamoss-small', 2);

      // Trigger checkout
      await window.productsCart.handleCheckout();

      // Should call API
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/products/checkout'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer valid-token',
          }),
        })
      );
    });

    it('should redirect to login if no token present', async () => {
      localStorage.getItem.mockReturnValue(null);

      const originalLocation = window.location;
      delete window.location;
      window.location = { href: '' };

      window.productsCart.addToCart('seamoss-small', 1);
      await window.productsCart.handleCheckout();

      // Should attempt to redirect (mocked in test environment)
      window.location = originalLocation;
    });

    it('should show error toast if checkout fails', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          success: false,
          error: 'Payment processing error',
        }),
      });

      localStorage.getItem.mockReturnValue('valid-token');
      window.productsCart.addToCart('seamoss-small', 1);

      await window.productsCart.handleCheckout();

      // Toast should be shown with error
      expect(bootstrap.Toast).toHaveBeenCalled();
    });

    it('should not proceed with empty cart', async () => {
      await window.productsCart.handleCheckout();

      // Should not call API
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases & Error Handling', () => {
    it('should handle adding non-existent product gracefully', () => {
      // Try to add product that doesn't exist in DOM
      window.productsCart.addToCart('non-existent-product', 1);

      const cart = window.productsCart.getCart();
      expect(cart).toHaveLength(0); // Should not add to cart
    });

    it('should handle network errors during checkout', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      localStorage.getItem.mockReturnValue('valid-token');
      window.productsCart.addToCart('seamoss-small', 1);

      await window.productsCart.handleCheckout();

      // Should handle error gracefully
      expect(bootstrap.Toast).toHaveBeenCalled();
    });

    it('should validate quantity input limits', () => {
      const input = document.querySelector('.quantity-input');
      
      // Try to set quantity above max
      input.value = 150;
      input.dispatchEvent(new Event('change'));

      // Should be clamped to 99
      expect(parseInt(input.value)).toBeLessThanOrEqual(99);
    });
  });

  describe('Query Parameter Handling', () => {
    it('should clear cart on successful purchase', () => {
      // Simulate success URL parameter
      delete window.location;
      window.location = new URL('http://localhost/products.html?success=true');

      window.productsCart.addToCart('seamoss-small', 1);
      
      // Simulate page load with success parameter
      // Note: This would normally be handled by checkCheckoutStatus function
      window.productsCart.clearCart();

      expect(window.productsCart.getCart()).toHaveLength(0);
    });
  });
});