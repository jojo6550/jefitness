/**
 * ProductService.js
 * Centralized API calls for products and purchases.
 */

const ProductService = {
  getAll: async () => {
    const res = await fetch(`${API_BASE}/api/v1/products`);
    return handleApiResponse(res);
  },

  checkout: async (userToken, items) => {
    const res = await fetch(`${API_BASE}/api/v1/products/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ items }),
    });
    return handleApiResponse(res);
  },

  getPurchases: async (userToken) => {
    const res = await fetch(`${API_BASE}/api/v1/products/purchases`, {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    return handleApiResponse(res);
  },
};

window.ProductService = ProductService;
