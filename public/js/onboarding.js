// public/js/onboarding.js
// Shows the multi-step onboarding modal once for new users who haven't completed onboarding.

(function () {
  const API_BASE = window.ApiConfig.getAPI_BASE();

  async function authFetch(url, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) return null;
    options.headers = { ...options.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const res = await fetch(url, options);
    if (!res.ok) return null;
    return res.json();
  }

  async function init() {
    const profile = await authFetch(`${API_BASE}/api/v1/users/profile`);
    if (!profile || profile.onboardingCompleted) return;

    const modalEl = document.getElementById('onboardingModal');
    if (!modalEl) return;

    const modal = new bootstrap.Modal(modalEl);
    const step1 = document.getElementById('onboardingStep1');
    const step2 = document.getElementById('onboardingStep2');
    const btnBack = document.getElementById('onboardingBack');
    const btnNext = document.getElementById('onboardingNext');
    const btnFinish = document.getElementById('onboardingFinish');
    const btnSkip = document.getElementById('onboardingSkip');

    let currentStep = 1;

    function showStep(n) {
      currentStep = n;
      step1.classList.toggle('d-none', n !== 1);
      step2.classList.toggle('d-none', n !== 2);
      btnBack.classList.toggle('d-none', n === 1);
      btnNext.classList.toggle('d-none', n !== 1);
      btnFinish.classList.toggle('d-none', n !== 2);
    }

    btnNext.addEventListener('click', () => showStep(2));
    btnBack.addEventListener('click', () => showStep(1));

    async function complete() {
      const payload = {};
      const goals = document.getElementById('onboardingGoals')?.value?.trim();
      const reason = document.getElementById('onboardingReason')?.value?.trim();
      const gender = document.getElementById('onboardingGender')?.value;
      const dob = document.getElementById('onboardingDob')?.value;
      const height = document.getElementById('onboardingHeight')?.value;
      const weight = document.getElementById('onboardingWeight')?.value;

      if (goals) payload.goals = goals;
      if (reason) payload.reason = reason;
      if (gender) payload.gender = gender;
      if (dob) payload.dob = dob;
      if (height) payload.height = Number(height);
      if (weight) payload.weight = Number(weight);

      await authFetch(`${API_BASE}/api/v1/users/onboarding`, { method: 'POST', body: JSON.stringify(payload) });
      modal.hide();
    }

    btnFinish.addEventListener('click', complete);
    btnSkip.addEventListener('click', async () => {
      await authFetch(`${API_BASE}/api/v1/users/onboarding`, { method: 'POST', body: JSON.stringify({}) });
      modal.hide();
    });

    showStep(1);
    modal.show();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
