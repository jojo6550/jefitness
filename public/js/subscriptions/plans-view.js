(function () {
  const {
    state,
    getElement,
    safeShow,
    safeHide,
    showAlert,
    formatCurrency,
    hasActiveSubscription,
    DEBUG,
  } = window.SubShared;

  async function loadPlans() {
    const plansLoading = getElement('plansLoading');
    try {
      const data = await SubscriptionService.getPlans();
      const plansObj = data?.data?.plans || {};
      state.availablePlans = Object.entries(plansObj).map(([id, plan]) => ({ id, ...plan }));
      renderPlans();
    } catch (err) {
      if (DEBUG) console.error('Load plans failed:', err);
      showAlert('Failed to load subscription plans', 'error');
    } finally {
      safeHide(plansLoading);
    }
  }

  function renderPlans() {
    const plansContainer = getElement('plansContainer');
    if (!plansContainer) return;

    const hasCurrent = hasActiveSubscription();

    plansContainer.innerHTML = '';

    const planMeta = {
      '1-month':  { months: 1,  displayName: '1 Month',   featured: false },
      '3-month':  { months: 3,  displayName: '3 Months',  featured: false },
      '6-month':  { months: 6,  displayName: '6 Months',  featured: true  },
      '12-month': { months: 12, displayName: '12 Months', featured: false },
    };

    state.availablePlans.forEach(plan => {
      const planId = plan.id;
      const meta = planMeta[planId] || { months: 1, displayName: '1 Month', featured: false };

      // plan.price is in dollars (not cents) based on subscriptionConstants.js
      const totalDollars = plan.price || 0;
      const monthlyDollars = totalDollars / meta.months;

      const isCurrent = hasCurrent;
      const buttonLabel = isCurrent ? 'Current Plan' : 'Get Started';
      const featuredClass = meta.featured ? 'featured' : '';

      const card = document.createElement('div');
      card.className = 'col-lg-3 col-md-6 col-12';
      card.innerHTML = `
        <div class="card h-100 plan-card ${featuredClass} ${isCurrent ? 'disabled-plan' : ''}">
          <div class="card-body d-flex flex-column justify-content-between h-100">
            <div>
              ${meta.featured ? '<div class="plan-popular-badge">Most Popular</div>' : ''}
              <div class="plan-duration mb-3">
                <span class="duration-badge">${meta.displayName}</span>
              </div>
              <div class="plan-price mb-1">
                <div class="price-main">${formatCurrency(monthlyDollars)}</div>
                <div class="price-period">/mo</div>
              </div>
              ${meta.months > 1 ? `<div class="plan-total">Total: ${formatCurrency(totalDollars)}</div>` : '<div class="plan-total">&nbsp;</div>'}
              <ul class="plan-features mt-3">
                <li>Personal trainer access</li>
                <li>Workout tracking</li>
                <li>Nutrition coaching</li>
                <li>Progress analytics</li>
              </ul>
            </div>
            <button class="btn plan-button w-100 mt-2" ${isCurrent ? 'disabled' : ''}>
              ${buttonLabel}
            </button>
          </div>
        </div>
      `;

      if (!isCurrent) {
        card.querySelector('button').addEventListener('click', () => window.SubCheckout.selectPlan(planId));
      }

      plansContainer.appendChild(card);
    });

    plansContainer.classList.remove('d-none');
    safeShow(getElement('plansSection'));
  }

  window.SubPlansView = { loadPlans, renderPlans };
})();
