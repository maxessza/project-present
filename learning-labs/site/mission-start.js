(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document && root.MissionStartModel) root.MissionStartStoryboard = api.install(root.document, root, root.MissionStartModel, root);
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function install(doc, win, Model, env) {
    const scope = env || win;
    const root = doc.getElementById('mission-start');
    if (!root || !Model) return null;
    const get = id => doc.getElementById(id);
    let state = Model.createState();
    let timer = null;
    let tourRequested = false;
    let visible = !doc.hidden;
    let intersecting = true;
    const listeners = [];
    const media = scope.matchMedia ? scope.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    let reduced = Boolean(media.matches);

    function listen(node, event, fn) {
      if (!node) return;
      node.addEventListener(event, fn);
      listeners.push(() => node.removeEventListener && node.removeEventListener(event, fn));
    }
    function stopTimer() {
      if (timer !== null) scope.clearTimeout(timer);
      timer = null;
    }
    function canAnimate() { return !reduced && visible && intersecting; }
    function schedule() {
      stopTimer();
      if (!tourRequested || !canAnimate() || state.status !== 'playing') return;
      timer = scope.setTimeout(tick, 1350);
    }
    function tick() {
      timer = null;
      if (!tourRequested || !canAnimate()) return;
      state = Model.advance(state);
      if (state.status === 'waiting-gps') {
        render();
        return;
      }
      if (state.status === 'waiting-start' || state.status === 'complete') tourRequested = false;
      render();
      schedule();
    }
    function render() {
      const step = Model.STEPS[state.step];
      root.setAttribute('data-phase', step.phase);
      root.setAttribute('data-reduced-motion', String(reduced));
      get('ms-stage').textContent = `${String(state.step + 1).padStart(2, '0')} / 08`;
      get('ms-title').textContent = step.title;
      get('ms-explanation').textContent = step.caption;
      get('ms-status').textContent = state.message;
      const rail = root.querySelectorAll('.ms-step');
      rail.forEach((item, index) => {
        item.classList.toggle('is-current', index === state.step);
        item.classList.toggle('is-complete', index < state.step);
        if (index === state.step) item.setAttribute('aria-current', 'step');
        else item.removeAttribute('aria-current');
      });
      get('ms-ready-gps').checked = state.gpsReady;
      get('ms-ready-home').checked = state.homeSet;
      get('ms-ready-route').checked = state.routeReady;
      const atGate = state.step === 4;
      get('ms-ready-gps').disabled = !atGate;
      get('ms-ready-home').disabled = !atGate;
      get('ms-ready-route').disabled = !atGate;
      get('ms-gps-ready').hidden = state.step !== 1;
      get('ms-gps-ready').disabled = state.step !== 1;
      get('ms-start-btn').disabled = !atGate;
      get('ms-play').disabled = reduced;
      get('ms-play').textContent = tourRequested ? 'พักทัวร์' : 'เล่นทัวร์';
      get('ms-play').setAttribute('aria-label', tourRequested ? 'พักทัวร์อัตโนมัติ' : 'เล่นทัวร์อัตโนมัติ');
      get('ms-next').disabled = state.step >= 7;
      get('ms-signal').setAttribute('data-active', String(state.acceptedStart && state.step === 5));
      get('ms-signal').setAttribute('data-accepted', String(state.acceptedStart));
      get('ms-pwm-value').textContent = Model.motorsActive(state) ? 'ทำงาน · storyboard' : 'ยังไม่ทำงาน';
      get('ms-boat').setAttribute('data-motors', String(Model.motorsActive(state)));
      get('ms-boat').setAttribute('data-moved', String(Model.boatMoved(state)));
      get('ms-continue').hidden = !Model.boatMoved(state);
      get('ms-continue').setAttribute('aria-hidden', String(!Model.boatMoved(state)));
      if (state.status === 'blocked') get('ms-status').setAttribute('data-kind', 'blocked');
      else get('ms-status').setAttribute('data-kind', 'info');
    }
    function toggleTour() {
      if (tourRequested) {
        stopTimer(); tourRequested = false; state = Model.pause(state); render(); return;
      }
      if (reduced || !visible || !intersecting) return;
      const next = Model.play(state);
      state = next;
      if (state.status === 'playing') tourRequested = true;
      render();
      schedule();
    }
    listen(get('ms-play'), 'click', toggleTour);
    listen(get('ms-next'), 'click', () => {
      stopTimer(); tourRequested = false; state = Model.advance(state); render();
    });
    listen(get('ms-reset'), 'click', () => {
      stopTimer(); tourRequested = false; state = Model.reset(); render();
    });
    listen(get('ms-gps-ready'), 'click', () => {
      state = Model.simulateGpsReady(state);
      if (tourRequested && canAnimate()) state = Model.play(state);
      render();
      schedule();
    });
    listen(get('ms-start-btn'), 'click', () => {
      stopTimer();
      state = Model.acceptStart(state);
      if (state.acceptedStart && !reduced && visible && intersecting) {
        state = Model.play(state); tourRequested = true;
      } else if (state.acceptedStart) {
        state = Model.pause(state); tourRequested = false;
      }
      render();
      schedule();
    });
    listen(get('ms-continue'), 'click', () => {
      if (!Model.boatMoved(state)) return;
      const start = get('sim-start');
      const step = get('sim-step');
      const reset = get('sim-reset');
      if (!start || !step || !reset) return;
      if (win.OverallControls && typeof win.OverallControls.restoreTo === 'function') win.OverallControls.restoreTo(0);
      else { reset.click(); step.click(); }
      if (!reduced) start.click();
      const operate = get('operate');
      if (operate && operate.scrollIntoView) operate.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    });
    [['ms-ready-gps', 'gpsReady'], ['ms-ready-home', 'homeSet'], ['ms-ready-route', 'routeReady']].forEach(([id, key]) => {
      listen(get(id), 'change', event => { state = Model.setReadiness(state, key, event.target.checked); render(); });
    });
    const visibilityChange = () => {
      visible = !doc.hidden;
      if (!visible) {
        stopTimer(); tourRequested = false;
        if (state.status === 'playing') state = Model.pause(state);
        render();
      }
    };
    listen(doc, 'visibilitychange', visibilityChange);
    let observer = null;
    const Observer = scope.IntersectionObserver;
    if (Observer) {
      observer = new Observer(entries => {
        const entry = entries.find(item => item.target === root) || entries[0];
        if (!entry) return;
        intersecting = Boolean(entry.isIntersecting);
        if (!intersecting) {
          stopTimer(); tourRequested = false;
          if (state.status === 'playing') state = Model.pause(state);
          render();
        }
      });
      observer.observe(root);
    }
    const motionChange = event => {
      reduced = Boolean(event.matches);
      if (reduced) {
        stopTimer(); tourRequested = false;
        if (state.status === 'playing') state = Model.pause(state);
      }
      render();
    };
    if (media.addEventListener) listen(media, 'change', motionChange);
    else if (media.addListener) { media.addListener(motionChange); listeners.push(() => media.removeListener && media.removeListener(motionChange)); }

    render();
    return {
      getSnapshot() { return Object.assign({}, state, { motorsActive: Model.motorsActive(state), boatMoved: Model.boatMoved(state) }); },
      destroy() { stopTimer(); if (observer) observer.disconnect(); listeners.forEach(remove => remove()); }
    };
  }

  return Object.freeze({ install });
});
