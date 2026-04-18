(function () {
  const {
    state,
    getElement,
    safeShow,
    safeHide,
    showAlert,
    formatCurrency,
    safeFormatDate,
    isActive,
    isTrialing,
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

    const activeSub = state.userSubscriptions.find(sub => isActive(sub.status) || isTrialing(sub.status));
    const isQueueMode = !!activeSub;
    const queueStartDate = isQueueMode ? safeFormatDate(activeSub.currentPeriodEnd) : null;

    plansContainer.innerHTML = '';

    const planDurations = {
      '1-month':  { months: 1,  displayName: '1 Month'   },
      '3-month':  { months: 3,  displayName: '3 Months'  },
      '6-month':  { months: 6,  displayName: '6 Months'  },
      '12-month': { months: 12, displayName: '12 Months' }
    };

    state.availablePlans.forEach(plan => {
      const isCurrent = !isQueueMode && hasActiveSubscription(plan.id);
      const planId = plan.id || plan.name?.toLowerCase().replace(' ', '-');
      const durationInfo = planDurations[planId] || { months: 1, displayName: '1 Month' };

      const totalDollars = (plan.amount || 0) / 100;
      const monthlyDollars = totalDollars / durationInfo.months;

      let buttonLabel;
      if (isCurrent) {
        buttonLabel = 'Current Plan';
      } else if (isQueueMode) {
        buttonLabel = `Queue after ${queueStartDate}`;
      } else {
        buttonLabel = 'Subscribe Now';
      }

      const card = document.createElement('div');
      card.className = 'col-lg-3 col-md-6 col-12';
      card.innerHTML = `
        <div class="card h-100 plan-card ${isCurrent ? 'disabled-plan' : ''}">
          <div class="card-body d-flex flex-column justify-content-between h-100">
            <div>
              <div class="plan-duration mb-3">
                <span class="duration-badge">${durationInfo.displayName}</span>
              </div>
              <div class="plan-price mb-2">
                <div class="price-main">${formatCurrency(monthlyDollars)}</div>
                <div class="price-period">/month</div>
              </div>
              ${durationInfo.months > 1 ? `<div class="plan-total text-muted small">Total: ${formatCurrency(totalDollars)}</div>` : ''}
            </div>
            <button class="btn btn-primary plan-button w-100 mt-4" ${isCurrent ? 'disabled' : ''}>
              ${buttonLabel}
            </button>
          </div>
        </div>
      `;

      if (!isCurrent) {
        card.querySelector('button').onclick = () => window.SubCheckout.selectPlan(plan.id, isQueueMode);
      }

      plansContainer.appendChild(card);
    });

    plansContainer.classList.remove('d-none');

    if (isQueueMode) {
      safeShow(getElement('plansSection'));
    }
  }

  window.SubPlansView = { loadPlans, renderPlans };
})();
