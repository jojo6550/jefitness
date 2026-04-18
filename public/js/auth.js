document.addEventListener('DOMContentLoaded', () => {
  window.AuthShared.ensureDeps();
  window.AuthLogin?.init();
  window.AuthSignup?.init();
  window.AuthForgotPassword?.init();
  window.AuthResetPassword?.init();
});
