/**
 * Shared /auth/me promise cache.
 * Fires exactly one fetch per page load; all callers share the same Promise.
 * Depends on: api.config.js (must load first)
 */
window.AuthCache = (() => {
  let _promise = null;
  return {
    getMe() {
      if (!_promise) {
        const base = window.ApiConfig.getAPI_BASE();
        _promise = fetch(`${base}/api/v1/auth/me`, { credentials: 'include' })
          .then(res => res.ok ? res.json() : Promise.reject(res.status));
      }
      return _promise;
    }
  };
})();
