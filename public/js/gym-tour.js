/**
 * gym-tour.js
 * Interactive onboarding spotlight tour + gym loader controller.
 * JE Fitness — Industrial Athletic
 */

(function () {
  'use strict';

  /* ─────────────────────────────────────────────────
     CONSTANTS
  ───────────────────────────────────────────────── */

  const TOUR_DONE_KEY  = 'jef_tour_v2_done';
  const LOADER_MSGS = [
    'Warming up...',
    'Loading your gains...',
    'Flexing the servers...',
    'Counting your reps...',
    'Adding weight...',
    'Syncing your stats...',
    'Building strength...',
    'Preparing your program...',
  ];

  /* Steps array. type: 'hero' = full-screen card, 'spotlight' = element highlight */
  const TOUR_STEPS = [
    {
      type: 'hero',
      showDumbbell: true,
      emoji: null,
      title: 'Welcome to <span>JEFITNESS</span>',
      body: "Here's everything you need to crush your fitness goals — all in one place. Let me show you around.",
      cta: "Let's Go",
      skipLabel: 'Skip tour',
    },
    {
      type: 'spotlight',
      selector: '[data-tour="profile"]',
      iconClass: 'bi bi-person-circle',
      title: 'Your Profile',
      body: 'Start here. Set your personal details, fitness goals, and body stats. The more we know, the better we can guide you.',
    },
    {
      type: 'spotlight',
      selector: '[data-tour="trainer"]',
      iconClass: 'bi bi-person-badge',
      title: 'Meet Your Trainer',
      body: "Book one-on-one sessions with certified personal trainers. They'll push you past every plateau.",
    },
    {
      type: 'spotlight',
      selector: '[data-tour="subscription"]',
      iconClass: 'bi bi-credit-card-fill',
      title: 'Subscriptions',
      body: 'Unlock premium programs, priority trainer access, and exclusive content. Pick the plan that fits your grind.',
    },
    {
      type: 'hero',
      showDumbbell: false,
      emoji: '🏆',
      title: "You're All Set!",
      body: "Your fitness journey starts now. Log workouts, book sessions, and track every gain. The only way is forward.",
      cta: 'Start Training',
      skipLabel: null,
      isLast: true,
    },
  ];

  /* ─────────────────────────────────────────────────
     STATE
  ───────────────────────────────────────────────── */

  let step        = 0;
  let $overlay    = null;
  let $tooltip    = null;
  let $center     = null;
  let $spotlit    = null;   // currently highlighted element
  let msgIdx      = 0;
  let msgTimer    = null;

  /* ─────────────────────────────────────────────────
     PUBLIC API
  ───────────────────────────────────────────────── */

  window.GymTour = {
    start,
    stop,
    hasCompleted: () => localStorage.getItem(TOUR_DONE_KEY) === '1',
  };

  window.GymLoader = {
    show: showLoader,
    hide: hideLoader,
  };

  /* ─────────────────────────────────────────────────
     GYM LOADER
  ───────────────────────────────────────────────── */

  function showLoader() {
    const el = document.getElementById('gym-loader-overlay');
    if (!el) return;
    el.classList.remove('gym-loader--hidden');
    startMsgCycle();
  }

  function hideLoader() {
    const el = document.getElementById('gym-loader-overlay');
    if (!el) return;
    el.classList.add('gym-loader--hidden');
    stopMsgCycle();
  }

  function startMsgCycle() {
    stopMsgCycle();
    const inner = document.querySelector('.gym-loader-msg-inner');
    if (!inner) return;
    msgIdx = 0;
    inner.textContent = LOADER_MSGS[0];

    msgTimer = setInterval(() => {
      msgIdx = (msgIdx + 1) % LOADER_MSGS.length;
      inner.classList.add('slide-out');

      setTimeout(() => {
        inner.textContent = LOADER_MSGS[msgIdx];
        inner.classList.remove('slide-out');
      }, 360);
    }, 2400);
  }

  function stopMsgCycle() {
    if (msgTimer) { clearInterval(msgTimer); msgTimer = null; }
  }

  /* ─────────────────────────────────────────────────
     TOUR ENGINE
  ───────────────────────────────────────────────── */

  function start() {
    step = 0;
    mountDOM();
    goTo(0);
  }

  function stop() {
    localStorage.setItem(TOUR_DONE_KEY, '1');
    unmountDOM();
  }

  /* Build tour DOM once */
  function mountDOM() {
    /* Overlay */
    $overlay = el('div', { id: 'gym-tour-overlay', className: 'gym-tour-overlay' });
    document.body.appendChild($overlay);
    raf(() => $overlay.classList.add('active'));

    /* Spotlight tooltip */
    $tooltip = el('div', { id: 'gym-tour-tooltip', className: 'gym-tour-tooltip' });
    $tooltip.style.display = 'none';
    document.body.appendChild($tooltip);

    /* Center card container */
    $center = el('div', { id: 'gym-tour-center', className: 'gym-tour-center' });
    $center.style.display = 'none';
    document.body.appendChild($center);
  }

  function unmountDOM() {
    clearSpotlight();
    if ($tooltip) { $tooltip.classList.remove('visible'); }

    setTimeout(() => {
      if ($overlay) { $overlay.classList.remove('active'); }
      setTimeout(() => {
        [$overlay, $tooltip, $center].forEach(n => n && n.remove());
        $overlay = $tooltip = $center = null;
      }, 460);
    }, 180);
  }

  function goTo(idx) {
    const s = TOUR_STEPS[idx];
    if (!s) { stop(); return; }

    clearSpotlight();

    if (s.type === 'hero') {
      renderHero(s, idx);
    } else {
      renderSpotlight(s, idx);
    }
  }

  /* ── Hero / full-screen card ── */
  function renderHero(s, idx) {
    hideTooltip();
    $center.style.display = 'flex';

    const spotlightSteps = TOUR_STEPS.filter(x => x.type === 'spotlight');

    $center.innerHTML = `
      <div class="gym-tour-hero">
        ${s.showDumbbell ? `
          <div class="gym-tour-hero-dumbbell">
            <div class="gym-dumbbell">
              <div class="gym-dumbbell-plate gym-dumbbell-plate--left"></div>
              <div class="gym-dumbbell-collar gym-dumbbell-collar--left"></div>
              <div class="gym-dumbbell-bar"></div>
              <div class="gym-dumbbell-collar gym-dumbbell-collar--right"></div>
              <div class="gym-dumbbell-plate gym-dumbbell-plate--right"></div>
            </div>
          </div>
        ` : `<span class="gym-tour-hero-emoji">${s.emoji}</span>`}
        <div class="gym-tour-hero-title">${s.title}</div>
        <p class="gym-tour-hero-body">${s.body}</p>
        <button class="gym-tour-hero-cta" id="tour-hero-cta">
          ${s.cta} <i class="bi bi-arrow-right"></i>
        </button>
        ${s.skipLabel ? `<button class="gym-tour-hero-skip" id="tour-hero-skip">${s.skipLabel}</button>` : ''}
      </div>
    `;

    id('tour-hero-cta').addEventListener('click', () => {
      if (s.isLast) {
        stop();
      } else {
        $center.style.display = 'none';
        step++;
        goTo(step);
      }
    });

    const skipBtn = id('tour-hero-skip');
    if (skipBtn) skipBtn.addEventListener('click', stop);
  }

  /* ── Spotlight step ── */
  function renderSpotlight(s, idx) {
    $center.style.display = 'none';

    const target = document.querySelector(s.selector);
    if (!target) { step++; goTo(step); return; }   // skip missing elements

    /* Apply spotlight class */
    target.classList.add('gym-tour-spotlight');
    $spotlit = target;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });

    /* Progress segments — count only spotlight steps */
    const spotlightSteps = TOUR_STEPS.filter(x => x.type === 'spotlight');
    const sIdx = spotlightSteps.indexOf(s);
    const total = spotlightSteps.length;

    const segs = spotlightSteps.map((_, i) => {
      let cls = 'gym-tour-seg';
      if (i < sIdx)      cls += ' done';
      else if (i === sIdx) cls += ' current';
      return `<div class="${cls}"></div>`;
    }).join('');

    const isFirst = idx === TOUR_STEPS.findIndex(x => x.type === 'spotlight');
    const isLastSpot = sIdx === total - 1;

    /* Build tooltip */
    $tooltip.innerHTML = `
      <div class="gym-tour-tt-header">
        <div class="gym-tour-tt-icon"><i class="${s.iconClass}"></i></div>
        <h3 class="gym-tour-tt-title">${s.title}</h3>
      </div>
      <p class="gym-tour-tt-body">${s.body}</p>
      <div class="gym-tour-progress">${segs}</div>
      <div class="gym-tour-tt-footer">
        <button class="gym-tour-tt-skip" id="tt-skip">Skip</button>
        <div class="gym-tour-tt-count">${sIdx + 1} / ${total}</div>
        <div class="gym-tour-tt-btns">
          ${!isFirst ? '<button class="gym-tour-btn gym-tour-btn--ghost" id="tt-prev">Back</button>' : ''}
          <button class="gym-tour-btn gym-tour-btn--primary" id="tt-next">
            ${isLastSpot
              ? 'Finish <i class="bi bi-check2"></i>'
              : 'Next <i class="bi bi-arrow-right"></i>'}
          </button>
        </div>
      </div>
    `;

    positionTooltip(target);

    $tooltip.style.display = 'block';
    raf(() => raf(() => $tooltip.classList.add('visible')));

    id('tt-skip').addEventListener('click', stop);
    id('tt-next').addEventListener('click', () => {
      $tooltip.classList.remove('visible');
      setTimeout(() => { step++; goTo(step); }, 220);
    });

    const prevBtn = id('tt-prev');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        $tooltip.classList.remove('visible');
        setTimeout(() => { step--; goTo(step); }, 220);
      });
    }
  }

  /* Smart tooltip positioning */
  function positionTooltip(target) {
    const MARGIN  = 14;
    const TT_W    = 368;
    const TT_H    = 230;
    const rect    = target.getBoundingClientRect();
    const vw      = window.innerWidth;
    const vh      = window.innerHeight;

    let top, left, arrow;

    /* Prefer placing below */
    if (rect.bottom + TT_H + MARGIN <= vh) {
      top   = rect.bottom + MARGIN;
      left  = clamp(rect.left, MARGIN, vw - TT_W - MARGIN);
      arrow = 'below';
    }
    /* Try above */
    else if (rect.top - TT_H - MARGIN >= 0) {
      top   = rect.top - TT_H - MARGIN;
      left  = clamp(rect.left, MARGIN, vw - TT_W - MARGIN);
      arrow = 'above';
    }
    /* Fall back: center below the element */
    else {
      top   = clamp(rect.bottom + MARGIN, MARGIN, vh - TT_H - MARGIN);
      left  = clamp((vw - TT_W) / 2, MARGIN, vw - TT_W - MARGIN);
      arrow = 'below';
    }

    $tooltip.style.top  = `${top}px`;
    $tooltip.style.left = `${left}px`;
    $tooltip.setAttribute('data-arrow', arrow);
  }

  /* ── Helpers ── */

  function clearSpotlight() {
    if ($spotlit) {
      $spotlit.classList.remove('gym-tour-spotlight');
      $spotlit = null;
    }
  }

  function hideTooltip() {
    if ($tooltip) {
      $tooltip.classList.remove('visible');
      $tooltip.style.display = 'none';
    }
  }

  function el(tag, props) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    return node;
  }

  function id(i) { return document.getElementById(i); }

  function raf(fn) { return requestAnimationFrame(fn); }

  function clamp(v, min, max) { return Math.max(min, Math.min(v, max)); }

})();
