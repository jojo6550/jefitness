/**
 * ProductService.js
 * Centralized API calls for products and purchases.
 */

const ProductService = {
  getAll: async () => {
    const res = await fetch(`${API_BASE}/api/v1/products`);
    return handleApiResponse(res);
  },

  checkout: async (items) => {
    const res = await fetch(`${API_BASE}/api/v1/products/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ items }),
    });
    return handleApiResponse(res);
  },

  getPurchases: async () => {
    const res = await fetch(`${API_BASE}/api/v1/products/purchases`, {
      credentials: 'include',
    });
    return handleApiResponse(res);
  },
};

window.ProductService = ProductService;
