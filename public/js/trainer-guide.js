// ── Onboarding flow ───────────────────────────────────────────────────────────
// If a trainer arrives here from the login redirect (?onboarding=1) or has never
// seen the guide before, show the "Go to Dashboard" CTA in the hero.
// Clicking it marks the guide as viewed in localStorage and navigates to the dashboard.

const GUIDE_VIEWED_KEY = 'trainerGuideViewed';

(function initGuidePage() {
  const params = new URLSearchParams(window.location.search);
  const isOnboarding = params.get('onboarding') === '1';
  const alreadySeen  = localStorage.getItem(GUIDE_VIEWED_KEY) === 'true';

  if (isOnboarding || !alreadySeen) {
    const cta = document.getElementById('guideCta');
    if (cta) cta.classList.add('visible');
  }

  const dashBtn = document.getElementById('gotoDashboardBtn');
  if (dashBtn) {
    dashBtn.addEventListener('click', function (e) {
      e.preventDefault();
      localStorage.setItem(GUIDE_VIEWED_KEY, 'true');
      window.location.href = '/trainer-dashboard';
    });
  }

  const skipLink = document.getElementById('skipGuideLink');
  if (skipLink) {
    skipLink.addEventListener('click', function (e) {
      e.preventDefault();
      localStorage.setItem(GUIDE_VIEWED_KEY, 'true');
      window.location.href = '/trainer-dashboard';
    });
  }
})();

// ── Active TOC highlight on scroll ────────────────────────────────────────────
(function initTocObserver() {
  const sections = document.querySelectorAll('.guide-section');
  const tocLinks  = document.querySelectorAll('.toc-list a');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        tocLinks.forEach(link => link.classList.remove('active'));
        const active = document.querySelector(`.toc-list a[href="#${entry.target.id}"]`);
        if (active) active.classList.add('active');
      }
    });
  }, { rootMargin: '-20% 0px -70% 0px' });

  sections.forEach(s => observer.observe(s));
})();
