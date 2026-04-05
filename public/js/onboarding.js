// public/js/onboarding.js
// Shows the multi-step onboarding modal once for new users who haven't completed onboarding.
// After completion, launches the interactive GymTour spotlight tour.

(function () {
  const API_BASE = window.ApiConfig.getAPI_BASE();

  async function authFetch(url, options = {}) {
    options.headers = { ...options.headers, 'Content-Type': 'application/json' };
    options.credentials = 'include';
    const res = await fetch(url, options);
    if (!res.ok) return null;
    return res.json();
  }

  async function init() {
    const profile = await authFetch(`${API_BASE}/api/v1/users/profile`);
    if (!profile || profile.onboardingCompleted) {
      // Already completed data onboarding — show tour on first visit only
      if (window.GymTour && !window.GymTour.hasCompleted()) {
        // Small delay so page content is visible first
        setTimeout(() => window.GymTour.start(), 600);
      }
      return;
    }

    const modalEl = document.getElementById('onboardingModal');
    if (!modalEl) return;

    const modal = new bootstrap.Modal(modalEl);
    const step1     = document.getElementById('onboardingStep1');
    const step2     = document.getElementById('onboardingStep2');
    const step3     = document.getElementById('onboardingStep3');
    const btnBack   = document.getElementById('onboardingBack');
    const btnNext   = document.getElementById('onboardingNext');
    const btnFinish = document.getElementById('onboardingFinish');
    const btnDone   = document.getElementById('onboardingDone');
    const btnSkip   = document.getElementById('onboardingSkip');
    const stepNum   = document.getElementById('ob-step-num');
    const stepLabel = document.getElementById('ob-step-label');
    const seg1      = document.getElementById('ob-seg-1');
    const seg2      = document.getElementById('ob-seg-2');
    const seg3      = document.getElementById('ob-seg-3');
    const title     = document.getElementById('onboardingModalLabel');

    const TITLES = [
      'Let\'s Set Up Your Profile',
      'A Little More About You',
      'You\'re Ready — What\'s Next?',
    ];

    let currentStep = 1;

    function showStep(n) {
      currentStep = n;
      step1.classList.toggle('d-none', n !== 1);
      step2.classList.toggle('d-none', n !== 2);
      step3.classList.toggle('d-none', n !== 3);

      btnBack.classList.toggle('d-none', n === 1 || n === 3);
      btnNext.classList.toggle('d-none', n !== 1);
      btnFinish.classList.toggle('d-none', n !== 2);
      btnDone.classList.toggle('d-none', n !== 3);
      btnSkip.classList.toggle('d-none', n === 3);

      if (stepNum) stepNum.textContent = n;
      if (stepLabel) stepLabel.innerHTML = n < 3
        ? `Step <span id="ob-step-num">${n}</span> of 3`
        : `<span id="ob-step-num">All done!</span>`;
      if (title) title.textContent = TITLES[n - 1];

      // Update progress segments
      if (seg1 && seg2 && seg3) {
        seg1.className = 'gym-tour-seg' + (n > 1 ? ' done' : ' current');
        seg2.className = 'gym-tour-seg' + (n === 2 ? ' current' : n > 2 ? ' done' : '');
        seg3.className = 'gym-tour-seg' + (n === 3 ? ' current' : '');
      }
    }

    btnNext.addEventListener('click', () => showStep(2));
    btnBack.addEventListener('click', () => showStep(currentStep - 1));

    async function saveAndAdvance() {
      const payload = {};
      const goals   = document.getElementById('onboardingGoals')?.value?.trim();
      const reason  = document.getElementById('onboardingReason')?.value?.trim();
      const gender  = document.getElementById('onboardingGender')?.value;
      const dob     = document.getElementById('onboardingDob')?.value;
      const height  = document.getElementById('onboardingHeight')?.value;
      const weight  = document.getElementById('onboardingWeight')?.value;

      if (goals)  payload.goals  = goals;
      if (reason) payload.reason = reason;
      if (gender) payload.gender = gender;
      if (dob)    payload.dob    = dob;
      if (height) payload.height = Number(height);
      if (weight) payload.weight = Number(weight);

      await authFetch(`${API_BASE}/api/v1/users/onboarding`, { method: 'POST', body: JSON.stringify(payload) });
      showStep(3);
    }

    btnFinish.addEventListener('click', saveAndAdvance);

    btnDone.addEventListener('click', () => {
      modal.hide();
      afterOnboarding();
    });

    btnSkip.addEventListener('click', async () => {
      await authFetch(`${API_BASE}/api/v1/users/onboarding`, { method: 'POST', body: JSON.stringify({}) });
      modal.hide();
      afterOnboarding();
    });

    showStep(1);
    modal.show();
  }

  /** Called after the data-collection modal closes. Starts the platform tour. */
  function afterOnboarding() {
    if (window.GymTour && !window.GymTour.hasCompleted()) {
      setTimeout(() => window.GymTour.start(), 500);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
