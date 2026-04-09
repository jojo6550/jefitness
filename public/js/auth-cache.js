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
            // Defer the reset to the next microtask tick so all concurrent callers
            // that already hold a reference to this promise receive the rejection
            // before it's cleared. Without this, a second caller that runs between
            // the throw and the null assignment would fire a duplicate fetch.
            Promise.resolve().then(() => { _promise = null; });
            throw err;
          });
      }
      return _promise;
    }
  };
})();
