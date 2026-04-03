/**
 * dashboard-init.js
 * Skeleton → real content reveal logic + tour trigger.
 */
(function () {
  document.addEventListener('DOMContentLoaded', function () {
    if (window.GymLoader) GymLoader.show();

    var revealed = false;

    window._revealDashboard = function () {
      if (revealed) return;
      revealed = true;

      var skelRow = document.getElementById('dash-skeleton-row');
      var realRow = document.getElementById('dash-real-row');
      var skelWel = document.getElementById('welcome-skeleton');
      var realWel = document.getElementById('welcome-real');

      if (skelRow) skelRow.classList.add('hiding');
      if (skelWel) skelWel.classList.add('hiding');

      setTimeout(function () {
        if (skelRow) skelRow.classList.add('d-none');
        if (skelWel) skelWel.classList.add('d-none');

        if (realRow) {
          realRow.classList.remove('d-none');
          requestAnimationFrame(function () { realRow.classList.add('visible'); });
        }
        if (realWel) realWel.classList.remove('d-none');

        if (window.GymLoader) GymLoader.hide();
      }, 150);
    };

    /* Fallback in case initDashboard fails or is very slow */
    setTimeout(function () {
      if (window._revealDashboard) window._revealDashboard();
    }, 1200);

    document.addEventListener('click', function (e) {
      if (e.target && e.target.id === 'retake-tour-btn') {
        if (window.GymTour) GymTour.start();
      }
    });
  });
})();
