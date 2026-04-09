/**
 * Shared /auth/me promise cache.
 * Fires exactly one fetch per page load; all callers share the same Promise.
 * On failure the cache is cleared so the next call retries.
 * Depends on: api.config.js (must load first)
 */
window.AuthCache = (() => {
  let _promise = null;
  return {
    getMe() {
      if (!_promise) {
        const base = window.ApiConfig.getAPI_BASE();
        _promise = fetch(`${base}/api/v1/auth/me`, { credentials: 'include' })
          .then(res => {
            if (!res.ok) {
              const err = new Error(`HTTP ${res.status}`);
              err.status = res.status;
              throw err;
            }
            return res.json();
          })
          .catch(err => {
            _promise = null; // reset so next caller retries
            throw err;
          });
      }
      return _promise;
    }
  };
})();
