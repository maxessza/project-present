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

    const Telemetry = scope.MissionStartTelemetry;
    const hasTelemetry = Boolean(Telemetry && get('ms-event-log'));
    let run = hasTelemetry ? Telemetry.createRun() : null;
    function recordEvent(actor, direction, action, previous, dt = 1000) {
      if (!hasTelemetry) return;
      run = Telemetry.record(run, { actor, direction, action, fromStep: previous.step,
        fromTitle: Model.STEPS[previous.step].title, toTitle: Model.STEPS[state.step].title,
        snapshot: state, timeDeltaMs: dt });
    }
    function renderTelemetry() {
      if (!hasTelemetry) return;
      const packet = Telemetry.project(run, state);
      const show = value => Number.isNaN(value) ? 'NaN · suppressed in STANDBY' : value === null ? '— unavailable' : String(value);
      const put = (id, value) => { const node = get(id); if (node) node.textContent = value; };
      const telemetryIds = { sequence_number: 'sequence', gps_lat: 'lat', gps_lon: 'lon', water_ph: 'ph',
        water_turbidity: 'turbidity', water_temp: 'temp', current_mode: 'mode', battery_percent: 'battery', heading_angle: 'heading' };
      Object.entries(telemetryIds).forEach(([field, id]) => put('ms-tel-' + id, show(packet.telemetry[field])));
      const stageIds = { sequence_number: 'sequence', current_stage: 'current', intent: 'intent', next_stage: 'next', reason: 'reason',
        flags: 'flags', waypoint_count: 'wp-count', waypoint_index: 'wp-index', expected_batch_index: 'batch' };
      Object.entries(stageIds).forEach(([field, id]) => put('ms-stage-' + id, show(packet.stage[field])));
      put('ms-tel-mode', packet.telemetry.current_mode + ' · ' + (packet.telemetry.current_mode ? 'GRID_PATROL · projected' : 'STANDBY · projected'));
      put('ms-stage-current', packet.stage.current_stage + ' · projected');
      put('ms-stage-flags', '0x' + packet.stage.flags.toString(16).padStart(2, '0') + ' · known subset only');
      put('ms-stage-intent', packet.stage.intent + ' · ' + (packet.stage.intent === 4 ? 'PATROL_WAYPOINT' : packet.stage.intent === 0 ? 'WAIT_WAYPOINT_BATCH' : 'WAIT_START') + ' · projected');
      put('ms-log-count', run.log.length + ' events · ' + run.eventNo + ' total');
      const list = get('ms-event-log'); const scroll = list.scrollTop;
      list.textContent = '';
      run.log.forEach(entry => {
        const row = doc.createElement('li'); row.className = 'ms-log-entry';
        const elapsed = (entry.elapsedMs / 1000).toFixed(2);
        const readiness = Object.entries(entry.readiness).map(([key, value]) => key + '=' + value).join(', ');
        row.textContent = '#'+entry.eventNo+' · t+'+elapsed+'s SIM · '+entry.actor+' · '+entry.direction+' · telemetry seq '+entry.telemetrySequence+' / stage seq '+entry.stageSequence+'\n'
          +entry.action+' · decision='+entry.decision+' · '+entry.transition+'\n'
          +'readiness: '+readiness+' · blockers: '+(entry.blockers.join(', ') || 'none in teaching gate')+'\n'
          +'position: '+entry.movement.label+' ('+entry.movement.x+', '+entry.movement.y+') px · NOT GPS\n'
          +'projected fields: mode='+entry.packet.telemetry.current_mode+', stage='+entry.packet.stage.current_stage+', intent='+entry.packet.stage.intent+', reason='+entry.packet.stage.reason+', flags=0x'+entry.packet.stage.flags.toString(16)+', waypoint='+entry.packet.stage.waypoint_index+'/'+entry.packet.stage.waypoint_count+'\n'
          +'radio ACK / shore parsing / storage / display: NOT OBSERVED; sensor/GPS/heading/battery measurements unavailable';
        list.appendChild(row);
      });
      list.scrollTop = scroll;
    }

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
      const previous = state;
      state = Model.advance(state);
      recordEvent('เรือจำลอง', 'local storyboard tick', 'เดินขั้น playback', previous, 1350);
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
      renderTelemetry();
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
      const previous = state;
      stopTimer(); tourRequested = false; state = Model.advance(state);
      recordEvent('ผู้ดู', 'local storyboard', 'ขั้นถัดไป', previous); render();
    });
    listen(get('ms-reset'), 'click', () => {
      stopTimer(); tourRequested = false; state = Model.reset();
      if (hasTelemetry) run = Telemetry.createRun();
      recordEvent('ระบบจำลอง', 'browser only', 'เริ่ม storyboard', state, 0); render();
    });
    listen(get('ms-gps-ready'), 'click', () => {
      const previous = state;
      state = Model.simulateGpsReady(state);
      recordEvent('ผู้ดู', 'input → boat example', 'จำลอง GPS พร้อม; ไม่มีพิกัดจริง', previous);
      if (tourRequested && canAnimate()) state = Model.play(state);
      render();
      schedule();
    });
    listen(get('ms-start-btn'), 'click', () => {
      stopTimer();
      const previous = state;
      state = Model.acceptStart(state);
      recordEvent('ฝั่งจำลอง', 'shore → boat (SIMULATED)', 'CommandPacket CMD_START_ARM=3 → '+(state.acceptedStart ? 'ACCEPTED (teaching gate)' : 'REJECTED (teaching gate)'), previous);
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
      listen(get(id), 'change', event => { const previous = state; state = Model.setReadiness(state, key, event.target.checked);
        recordEvent('ผู้ดู', 'local simulated readiness', key+'='+event.target.checked+'; ไม่ส่ง START ซ้ำ', previous); render(); });
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

    recordEvent('ระบบจำลอง', 'browser only', 'เริ่ม storyboard', state, 0);
    render();
    return {
      getSnapshot() { return Object.assign({}, state, { motorsActive: Model.motorsActive(state), boatMoved: Model.boatMoved(state) }); },
      destroy() { stopTimer(); if (observer) observer.disconnect(); listeners.forEach(remove => remove()); }
    };
  }

  return Object.freeze({ install });
});
