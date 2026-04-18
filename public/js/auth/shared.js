(function () {
  function redirectByRole(role) {
    if (role === 'admin') return '/admin';
    if (role === 'trainer') {
      const guideViewed = localStorage.getItem('trainerGuideViewed') === 'true';
      return guideViewed ? '/trainer-dashboard' : '/trainer-guide?onboarding=1';
    }
    return '/dashboard';
  }

  function showMessage(msg, type = 'info') {
    const messageDiv = document.getElementById('message');
    if (messageDiv) {
      messageDiv.textContent = msg;
      messageDiv.className = `alert alert-${type === 'error' ? 'danger' : 'info'} mt-3 text-center`;
      messageDiv.classList.remove('d-none');
      if (type === 'success') {
        setTimeout(() => { messageDiv.classList.add('d-none'); }, 5000);
      }
    } else {
      window.Toast.error(msg);
    }
  }

  function setLoadingState(button, isLoading) {
    if (!button) return;

    const originalText = button.textContent;
    button.disabled = isLoading;

    if (isLoading) {
      button.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Loading...';
    } else {
      button.innerHTML = originalText;
    }
  }

  function handleApiError(response, data, defaultMsg) {
    let errorMsg = defaultMsg;

    if (data) {
      if (data?.error?.message) {
        errorMsg = data.error.message;
      } else if (data?.msg) {
        errorMsg = data.msg;
      } else if (data?.error) {
        errorMsg = typeof data.error === 'string' ? data.error : (data.error?.message || defaultMsg);
      } else if (data?.message) {
        errorMsg = data.message;
      }
    }

    switch (response?.status) {
      case 401:
        window.Toast.error(errorMsg || 'Your session has expired. Please log in again.');
        if (!window.location.pathname.includes('/login')) {
          setTimeout(() => { window.location.href = '/login'; }, 2000);
        }
        break;
      case 403:
        window.Toast.error('You do not have permission to perform this action.');
        break;
      case 404:
        window.Toast.warning(errorMsg || 'The requested resource was not found.');
        break;
      case 423:
        window.Toast.warning(errorMsg || 'Account is temporarily locked.');
        break;
      case 500:
        window.Toast.error('A server error occurred. Please try again later.');
        break;
      default:
        window.Toast.error(errorMsg);
    }
  }

  function ensureDeps() {
    if (!window.ApiConfig || typeof window.ApiConfig.getAPI_BASE !== 'function') {
      throw new Error('ApiConfig is not properly initialized. Ensure api.config.js is loaded before auth.');
    }
    if (!window.Validators || typeof window.Validators.validateEmail !== 'function') {
      throw new Error('Validators is not properly initialized. Ensure validators.js is loaded before auth.');
    }
    window.API_BASE = window.ApiConfig.getAPI_BASE();
  }

  window.AuthShared = {
    redirectByRole,
    showMessage,
    setLoadingState,
    handleApiError,
    ensureDeps,
  };
})();
