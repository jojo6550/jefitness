(async () => {
  try {
    const apiBase = window.ApiConfig ? window.ApiConfig.getAPI_BASE() : '/api';
    const res = await fetch(`${apiBase}/api/v1/subscriptions/config/paypal-client-id`, { credentials: 'include' });
    const data = res.ok ? await res.json() : {};
    const clientId = data.clientId || 'sb-test';
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&components=buttons`;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  } catch (e) {
    console.error('PayPal SDK load failed:', e);
  }
})();
