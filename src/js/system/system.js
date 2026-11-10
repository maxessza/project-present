(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && root.document && root.SystemMissionModel && root.UplinkCodec) {
    root.SystemMission = api.install(root.document, root, root.SystemMissionModel, root.UplinkCodec);
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const STAGE_LABEL = { PREPARE: 'เตรียม', START_ACCEPTED: 'START รับแล้ว', GRID: 'GRID', SPIRAL: 'SPIRAL', RTH: 'RTH', STANDBY: 'STANDBY' };
  const DECISION_LABEL = { WAITING_FOR_SAMPLES: 'รอ sample', WAITING_FOR_FULL_WINDOW: 'รอครบ 8 samples',
    WAIT_FIRST_WAYPOINT: 'รอผ่าน WP1', DIRTY_ELIGIBLE: 'ครบเกณฑ์ · พร้อมตัดสินใจ',
    SPIRAL_ALREADY_USED: 'ทำ spiral แล้ว · ไม่ทำซ้ำ',
    CLEAN: 'mean ≤ 50 · ข้าม spiral demo', SPIRAL: 'เริ่ม spiral 1 รอบ', SPIRAL_ACTIVE: 'กำลัง spiral',
    RESUME_NEXT_GRID_WAYPOINT: 'กลับไป WP ถัดไป', RTH_GATE_WAIT: 'ตรวจ dwell / HOME', RTH_GATE_PASSED: 'เข้า STANDBY' };
  const READY_KEYS = ['safety','gps','compass','home','waypoints'];
  const FLOW = ['sensor','sma','decision','steering','bytes','shore'];

  function install(doc, win, model, codec) {
    const scene = doc.getElementById('system');
    if (!scene) return null;
    let generation = 1;
    let state = model.createMission(generation);
    let interval = null;
    let timers = new Set();
    let ports = new Set();
    let queue = [];
    let activeRun = null;
    const id = name => doc.getElementById(`system-${name}`);
    const query = selector => scene.querySelector(selector);
    const txt = (name, value) => { const node = id(name); if (node) node.textContent = value; };
    const fmt = (value, digits = 1) => Number.isFinite(value) ? value.toFixed(digits) : '—';
    const rad = value => value * Math.PI / 180;
    const code = value => value == null || value === '' ? '—' : String(value);
    const immutableHex = buffer => Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join(' ');

    function clearTimer(timer) {
      if (!timer) return;
      win.clearTimeout(timer);
      timers.delete(timer);
    }
    function schedule(fn, delay, runGeneration) {
      const timer = win.setTimeout(() => {
        timers.delete(timer);
        if (runGeneration !== generation) return;
        fn();
      }, delay);
      timers.add(timer);
      return timer;
    }
    function closeChannel(channel) {
      if (!channel) return;
      try { channel.port1.onmessage = null; channel.port2.onmessage = null; channel.port1.close(); channel.port2.close(); } catch (_) { /* a transferred channel may already be closed */ }
      ports.delete(channel);
    }
    function clearTransport() {
      for (const timer of timers) win.clearTimeout(timer);
      timers.clear();
      for (const channel of Array.from(ports)) closeChannel(channel);
      queue = [];
      activeRun = null;
    }

    function drawSamples(view) {
      const bars = id('sample-bars');
      if (!bars) return;
      bars.replaceChildren();
      const values = view.sma.values;
      for (let index = 0; index < model.SMA_WINDOW; index += 1) {
        const bar = doc.createElement('span');
        const value = values[index];
        if (!Number.isFinite(value)) bar.classList.add('is-empty');
        else {
          bar.style.height = `${Math.max(8, Math.min(100, value / 80 * 100))}%`;
          bar.title = `${index + 1}: ${fmt(value, 2)} NTU`;
          const number = doc.createElement('b');
          number.textContent = fmt(value, 0);
          bar.appendChild(number);
        }
        bars.appendChild(bar);
      }
    }
    function setEquationState(name, active, label) {
      const card = query(`[data-equation="${name}"]`);
      if (card) card.classList.toggle('is-active', Boolean(active));
      const badge = query(`[data-equation-state="${name}"]`);
      if (badge && label) badge.textContent = label;
    }
    function render() {
      const view = model.snapshot(state);
      txt('stage', STAGE_LABEL[view.stage] || view.stage);
      txt('map-stage', view.stage);
      txt('clock', `${(view.clockMs / 1000).toFixed(2)} s`);
      const left = view.motorsActive ? view.steering.left : 0;
      const right = view.motorsActive ? view.steering.right : 0;
      if (id('left')) id('left').value = left;
      if (id('right')) id('right').value = right;
      txt('left-value', fmt(left, 1)); txt('right-value', fmt(right, 1));
      txt('log-count', String(view.localLog.length));
      txt('waypoint', `${Math.min(view.waypointIndex, model.WAYPOINTS.length)} / ${model.WAYPOINTS.length}`);
      txt('heading-value', `${fmt(view.heading, 1)}°`);
      txt('home-distance', `${fmt(view.homeDistanceM, 1)} m`);
      txt('map-scale', `${view.mapScaleMPerUnit} m / SVG unit · synthetic origin`);

      const boat = id('boat');
      if (boat) boat.setAttribute('transform', `translate(${view.position.x.toFixed(2)} ${view.position.y.toFixed(2)}) rotate(${view.heading.toFixed(2)})`);
      const target = id('target');
      if (target) { target.setAttribute('cx', view.target.x); target.setAttribute('cy', view.target.y); }
      const rthRing = id('rth-ring');
      if (rthRing) {
        rthRing.setAttribute('transform', `translate(${view.home.x} ${view.home.y})`);
        rthRing.querySelector('circle').setAttribute('r', 4 / view.mapScaleMPerUnit);
      }
      scene.querySelectorAll('[data-wp]').forEach(node => {
        const index = Number(node.getAttribute('data-wp'));
        node.classList.toggle('is-current', view.stage === 'GRID' && index === view.waypointIndex);
        node.classList.toggle('is-passed', index < view.waypointIndex);
      });
      const spiralPoints = id('spiral-points');
      if (spiralPoints) {
        spiralPoints.replaceChildren();
        if (view.stage === 'SPIRAL' && view.spiral) {
          for (let i = 0; i < 25; i += 1) {
            const point = model.spiralPoint(i, state.spiralCenter);
            const circle = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', point.x); circle.setAttribute('cy', point.y);
            circle.setAttribute('r', i === view.spiral.index ? 6 : 2.7);
            circle.setAttribute('fill', i === view.spiral.index ? '#fff3d4' : '#ffb35c');
            spiralPoints.appendChild(circle);
          }
        }
      }

      txt('flow-sensor', view.lastSample ? `${fmt(view.lastSample.value, 1)} NTU` : 'รอ sample');
      txt('flow-sma', `${view.sma.count} / 8 · ${fmt(view.sma.mean, 1)}`);
      txt('flow-decision', DECISION_LABEL[view.decision] || view.decision);
      txt('flow-steering', `u ${fmt(view.steering.u, 1)} · ${view.steering.mix || ''}`);
      txt('flow-bytes', view.tx ? `${view.tx.byteLength} B · ${view.tx.id}` : 'รอส่ง');
      txt('flow-shore', view.shore ? `${fmt(view.shore.turbidity, 1)} NTU${view.stale ? ' · STALE' : ''}` : 'รอรับ');
      FLOW.forEach(name => {
        const node = query(`[data-flow="${name}"]`);
        if (!node) return;
        const active = name === 'sensor' ? Boolean(view.lastSample) : name === 'sma' ? view.sma.count > 0 :
          name === 'decision' ? view.decision !== 'WAITING_FOR_SAMPLES' && view.decision !== 'WAITING_FOR_FULL_WINDOW' :
          name === 'steering' ? view.motorsActive : name === 'bytes' ? Boolean(view.tx) : Boolean(view.shore);
        node.classList.toggle('is-active', active);
        node.classList.toggle('is-stale', ['bytes','shore'].includes(name) && (view.stale || !view.link || Boolean(view.failed)));
      });

      const voltage = state.input.voltage;
      const ntu = model.turbidityFromVoltage(voltage);
      const priorSample = view.lastSample ? ` · last ${view.lastSample.valid ? `${fmt(view.lastSample.value, 2)} NTU` : 'invalid'}` : ' · no sample yet';
      txt('equation-sensor', Number.isFinite(ntu) ? `input V = ${fmt(voltage, 2)} V → ${fmt(ntu, 2)} NTU${priorSample}` : `input V = ${fmt(voltage, 2)} V → unavailable${priorSample}`);
      txt('equation-sma', view.sma.count ? `(${view.sma.values.map(value => fmt(value, 1)).join(' + ')}) ÷ ${view.sma.count} = ${fmt(view.sma.mean, 2)} NTU` : 'n = 0 · sum = 0 · mean = — NTU');
      drawSamples(view);
      txt('equation-decision', `${DECISION_LABEL[view.decision] || view.decision} · ${view.sma.full ? `${fmt(view.sma.mean, 1)} ${view.sma.mean > 50 ? '>' : '≤'} 50 NTU` : `${view.sma.count}/8 samples`} · WP${view.waypointIndex}`);
      txt('equation-navigation', `${fmt(view.navigation.from.lat, 6)},${fmt(view.navigation.from.lon, 6)} → ${fmt(view.navigation.to.lat, 6)},${fmt(view.navigation.to.lon, 6)} · ${fmt(view.navigation.distanceM, 2)} m / ${fmt(view.navigation.bearing, 2)}° · synthetic`);
      const grid = view.steering.kind === 'GRID';
      txt('steering-equation', grid ? 'u = Kp·e + Ki·ΣeΔt − kRate·headingRate' : 'u = Kp·e + Ki·ΣeΔt + Kd·filtered(Δe/Δt)');
      const steering = view.steering;
      txt('equation-steering', `tick ψ* ${fmt(steering.targetBearing, 1)}° − ψin ${fmt(steering.inputHeading, 1)}° → wrap e ${fmt(steering.error, 1)}° · P ${fmt(steering.p, 2)} + I ${fmt(steering.i, 2)} + ${grid ? `rate ${fmt(steering.damping, 2)}` : `D ${fmt(steering.d, 2)}`} · raw ${fmt(steering.raw, 2)} → ${fmt(steering.u, 2)} / ±60`);
      txt('equation-spiral', view.spiral ? `target ${view.spiral.index + 1}/25 · θ ${fmt(view.spiral.theta, 3)} rad · r ${fmt(view.spiral.radiusM, 3)} m · E ${fmt(view.spiral.eastM, 2)} / N ${fmt(view.spiral.northM, 2)} m` : 'r = 4…8 m · θ = 0…6π · 25 targets · active only in SPIRAL');
      txt('equation-rth', `HOME ${fmt(view.homeDistanceM, 2)} m · departed ${view.departed ? 'yes' : 'no'} (${Math.round(view.departedMs)}/2000 ms) · dwell ${Math.round(view.arrivedMs)}/3000 ms · entry ${fmt(view.rthEntryDistanceM, 1)} m`);

      txt('source-id', view.source ? `${view.source.id} · ${view.source.stage}` : '—');
      txt('tx-id', view.tx ? `${activeRun ? 'ACTIVE' : 'LAST'} ${view.tx.id} · ${view.tx.byteLength} B` : '—');
      txt('rx-id', view.rx ? view.rx.id : '—');
      txt('decoded-id', view.rx ? view.rx.decodedId : '—');
      txt('render-id', view.rx ? view.rx.renderId : '—');
      const shoreValue = view.shore ? `${fmt(view.shore.turbidity, 2)} NTU${view.stale ? ' · STALE' : ''}` : '—';
      txt('shore-value', shoreValue);
      const packetStatus = view.stale ? 'STALE · last good held' : view.failed ? `FAIL · ${view.failed.reason}` : view.rx ? `RECEIVED · ${view.decodeCount} decode / ${view.renderCount} render` : view.source ? 'TX / waiting receiver' : 'WAIT';
      txt('transport-status', packetStatus);
      txt('equation-telemetry', view.source ? `LATEST SOURCE ${view.source.id} | ${activeRun ? 'ACTIVE TX' : 'LAST TX'} ${view.tx ? `${view.tx.id} · ${view.tx.byteLength} B` : 'waiting'} | LAST RX ${view.rx ? `${view.rx.id} → ${view.rx.decodedId} → ${view.rx.renderId}` : 'waiting'}` : 'Source snapshot waits for GRID sampling');
      txt('hex', view.tx ? view.tx.hex : '38-byte packet · no sample yet');
      const stale = id('shore-value');
      if (stale) stale.setAttribute('data-stale', String(view.stale));
      txt('ready-status', view.ready ? 'Readiness ผ่าน · START เปิดรับได้' : `ยังไม่พร้อม · ${READY_KEYS.filter(key => !view.readiness[key]).join(', ')}`);
      queryAll('[data-ready]').forEach(input => { input.checked = Boolean(view.readiness[input.dataset.ready]); });
      const link = id('link'); if (link) link.checked = view.link;
      const drop = id('drop-mode'); if (drop) drop.value = view.dropMode;
      const clock = id('clock-rate'); if (clock) clock.value = String(view.clockRate);
      const play = id('play'); if (play) play.textContent = interval ? 'พัก' : 'เล่น';
      setEquationState('sensor', Boolean(view.lastSample), view.lastSample && !view.lastSample.valid ? 'INVALID' : 'V → NTU');
      setEquationState('sma', view.sma.full, view.sma.full ? 'FULL · n=8' : `PARTIAL · n=${view.sma.count}`);
      setEquationState('decision', ['SPIRAL','SPIRAL_ACTIVE','RESUME_NEXT_GRID_WAYPOINT'].includes(view.decision), view.eligible ? 'WP1 ELIGIBLE' : 'WAIT WP1');
      setEquationState('navigation', view.stage !== 'PREPARE', view.stage !== 'PREPARE' ? 'ACTIVE · SYNTHETIC' : 'SCHEMATIC');
      setEquationState('steering', view.motorsActive, grid ? 'GRID PI − RATE' : 'SPIRAL/RTH PID');
      setEquationState('spiral', view.stage === 'SPIRAL', view.stage === 'SPIRAL' ? 'ACTIVE · FIRMWARE REF' : 'READY · 4…8 m');
      setEquationState('rth', view.stage === 'RTH' || view.stage === 'STANDBY', view.stage === 'RTH' ? 'DWELL GATE' : 'GATED');
      setEquationState('transport', Boolean(view.source), packetStatus.split(' · ')[0]);
      const startButton = id('start'); if (startButton) startButton.disabled = view.stage !== 'PREPARE';
      const selected = id('equation-focus') ? id('equation-focus').value : 'auto';
      const automatic = view.stage === 'SPIRAL' ? 'spiral' : view.stage === 'RTH' ? 'rth' : view.stage === 'STANDBY' ? 'transport' : view.stage === 'GRID' ? (view.sma.full ? 'steering' : 'sma') : 'sensor';
      const focus = selected === 'auto' ? automatic : selected;
      const pair = { sensor:'sma', sma:'decision', decision:'sma', navigation:'steering', steering:'sma', spiral:'steering', rth:'navigation', transport:'sensor' };
      scene.querySelectorAll('[data-equation]').forEach(card => { card.hidden = selected !== 'all' && ![focus,pair[focus]].includes(card.dataset.equation); });
    }
    function queryAll(selector) { return scene.querySelectorAll(selector); }

    function finishRun(run) {
      if (run.channel) closeChannel(run.channel);
      if (run.timeout) clearTimer(run.timeout);
      if (activeRun === run) activeRun = null;
      pump();
      if (!activeRun) render();
    }
    function retryOrFail(run, reason) {
      if (run.generation !== generation) { finishRun(run); return; }
      if (run.attempt < 3) {
        run.retryTimer = schedule(() => attempt(run), 160, run.generation);
        return;
      }
      state = model.recordFailure(state, run.source.id, reason);
      render();
      finishRun(run);
    }
    function attempt(run) {
      if (run.generation !== generation) { finishRun(run); return; }
      run.attempt += 1;
      const attemptId = `AT-${run.source.id}-${run.attempt}`;
      const dropMode = state.transport.dropMode || 'none';
      if (!state.transport.link || dropMode === 'all' || (dropMode === 'first' && run.attempt === 1)) {
        state = model.recordAttempt(state, { id: attemptId, sampleId: run.source.id, attempt: run.attempt,
          outcome: !state.transport.link ? 'link-off' : 'dropped' });
        render();
        retryOrFail(run, !state.transport.link ? 'LINK_OFF' : 'DROPPED_3_ATTEMPTS');
        return;
      }
      state = model.recordAttempt(state, { id: attemptId, sampleId: run.source.id, attempt: run.attempt, outcome: 'posted' });
      const channel = new win.MessageChannel();
      run.channel = channel;
      ports.add(channel);
      channel.port1.onmessage = event => {
        if (run.generation !== generation) { closeChannel(channel); return; }
        if (run.timeout) clearTimer(run.timeout);
        const decoded = codec.decodeTelemetry(event.data);
        if (!decoded) {
          state = model.recordAttempt(state, { id: `${attemptId}-REJECT`, sampleId: run.source.id, attempt: run.attempt, outcome: 'rejected' });
          closeChannel(channel);
          retryOrFail(run, 'DECODE_REJECTED');
          return;
        }
        state = model.recordReceiver(state, `RXCB-${run.source.id}-A${run.attempt}`, decoded);
        render();
        if (id('shore-value') && id('shore-value').textContent === `${fmt(decoded.water_turbidity, 2)} NTU`) {
          state = model.recordRender(state);
          render();
        }
        finishRun(run);
      };
      channel.port1.start();
      run.timeout = schedule(() => {
        closeChannel(channel);
        state = model.recordAttempt(state, { id: `${attemptId}-TIMEOUT`, sampleId: run.source.id, attempt: run.attempt, outcome: 'timeout' });
        retryOrFail(run, 'RECEIVER_TIMEOUT');
      }, 1200, run.generation);
      const transferable = Uint8Array.from(run.bytes).buffer;
      channel.port2.postMessage(transferable, [transferable]);
      render();
    }
    function pump() {
      if (activeRun || !queue.length) return;
      activeRun = queue.shift();
      state = model.recordTx(state, activeRun.source.id, activeRun.bytes, activeRun.hex, 1);
      attempt(activeRun);
    }
    function publish(source) {
      if (!source || !codec || codec.PACKET_BYTES !== 38) return;
      let buffer;
      try { buffer = codec.encodeTelemetry(source.packet); }
      catch (error) { state = model.recordFailure(state, source.id, `ENCODE_${error.name}`); render(); return; }
      const bytes = Object.freeze(Array.from(new Uint8Array(buffer)));
      const hex = immutableHex(buffer);
      const run = { source, bytes, hex, attempt: 0, generation };
      if (queue.length >= 8) {
        state = model.recordFailure(state, source.id, 'QUEUE_FULL');
      } else queue.push(run);
      render();
      pump();
    }
    function step(input) {
      const previousSource = state.transport.source && state.transport.source.id;
      if (input && Number.isFinite(input.voltage)) state = model.setInput(state, { voltage: input.voltage });
      state = model.step(state, input || {});
      const source = state.transport.source;
      render();
      if (source && source.id !== previousSource) publish(source);
      return snapshot();
    }
    function setInput(value) {
      const input = typeof value === 'number' ? { voltage: value } : value;
      state = model.setInput(state, input || {});
      const voltage = id('voltage'); if (voltage) voltage.value = String(state.input.voltage);
      const output = id('voltage-value'); if (output) output.textContent = `${Number(state.input.voltage).toFixed(2)} V`;
      render();
      return snapshot();
    }
    function setGains(gains) {
      state = model.setGains(state, gains || {});
      [['kp','kp'],['ki','ki'],['kd','kd'],['krate','kRate']].forEach(([nodeName,key]) => {
        const input = id(nodeName), output = id(`${nodeName}-value`);
        if (input) input.value = String(state.gains[key]);
        if (output) output.textContent = Number(state.gains[key]).toFixed(2);
      });
      render(); return snapshot();
    }
    function prepare(values) {
      state = model.prepare(state, values || {});
      render(); return snapshot();
    }
    function readiness(key, value) {
      state = model.setReadiness(state, key, value);
      render(); return snapshot();
    }
    function setLink(enabled) {
      state = model.setLink(state, enabled);
      render(); return snapshot();
    }
    function setDrop(mode) {
      state = model.setDrop(state, mode);
      render(); return snapshot();
    }
    function start() {
      const result = model.start(state);
      state = result.state;
      render();
      return Object.freeze({ accepted: result.accepted, reason: result.reason, snapshot: snapshot() });
    }
    function setClockRate(rate) {
      const wasPlaying = Boolean(interval);
      if (wasPlaying) pause();
      state = model.setClockRate(state, Number(rate));
      if (wasPlaying) play();
      render(); return snapshot();
    }
    function play() {
      if (interval) {
        win.clearInterval(interval); interval = null;
        state = model.setPaused(state, true); render(); return false;
      }
      if (state.stage === 'PREPARE' || state.stage === 'STANDBY') return false;
      state = model.setPaused(state, false);
      interval = win.setInterval(() => { if (state.stage === 'STANDBY') { pause(); return; } step(); }, model.TICK_MS / state.clockRate);
      render(); return true;
    }
    function pause() {
      if (interval) win.clearInterval(interval);
      interval = null; state = model.setPaused(state, true); render(); return false;
    }
    function snapshot() {
      const view = model.snapshot(state);
      return Object.freeze(Object.assign({}, view, {
        dom: Object.freeze({ stage: id('map-stage') && id('map-stage').textContent,
          sourceId: id('source-id') && id('source-id').textContent,
          txId: id('tx-id') && id('tx-id').textContent,
          rxId: id('rx-id') && id('rx-id').textContent,
          decodedId: id('decoded-id') && id('decoded-id').textContent,
          renderId: id('render-id') && id('render-id').textContent,
          shoreValue: id('shore-value') && id('shore-value').textContent,
          activeEquationCount: scene.querySelectorAll('.system-equation.is-active').length }),
        browser: Object.freeze({ generation, queued: queue.length, active: Boolean(activeRun), ports: ports.size, timers: timers.size })
      }));
    }
    function reset() {
      pause(); clearTransport(); generation += 1; state = model.createMission(generation);
      [['voltage',1.93],['kp',2.5],['ki',0.05],['kd',0.8],['krate',0.8]].forEach(([name,value]) => { const input = id(name); if (input) input.value = String(value); });
      READY_KEYS.forEach(key => { const input = query(`[data-ready="${key}"]`); if (input) input.checked = false; });
      const link = id('link'); if (link) link.checked = true;
      const drop = id('drop-mode'); if (drop) drop.value = 'none';
      const clock = id('clock-rate'); if (clock) clock.value = '1';
      const focus = id('equation-focus'); if (focus) focus.value = 'auto';
      [['voltage-value','1.93 V'],['kp-value','2.50'],['ki-value','0.05'],['kd-value','0.80'],['krate-value','0.80']].forEach(([name,value]) => txt(name,value));
      render(); return snapshot();
    }

    scene.addEventListener('click', event => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      switch (button.dataset.action) {
        case 'ready-preset': prepare({ safety:true, gps:true, compass:true, home:true, waypoints:true }); break;
        case 'start': start(); break;
        case 'step': step(); break;
        case 'play': play(); break;
        case 'reset': reset(); break;
      }
    });
    queryAll('[data-ready]').forEach(input => input.addEventListener('change', () => readiness(input.dataset.ready, input.checked)));
    queryAll('[data-voltage]').forEach(button => button.addEventListener('click', () => setInput(Number(button.dataset.voltage))));
    const voltage = id('voltage'); if (voltage) voltage.addEventListener('input', () => setInput(Number(voltage.value)));
    [['kp','kp'],['ki','ki'],['kd','kd'],['krate','kRate']].forEach(([nodeName,key]) => {
      const input = id(nodeName); if (input) input.addEventListener('input', () => setGains({ [key]: Number(input.value) }));
    });
    const link = id('link'); if (link) link.addEventListener('change', () => setLink(link.checked));
    const drop = id('drop-mode'); if (drop) drop.addEventListener('change', () => setDrop(drop.value));
    const clock = id('clock-rate'); if (clock) clock.addEventListener('change', () => setClockRate(clock.value));
    const focus = id('equation-focus'); if (focus) focus.addEventListener('change', render);
    win.addEventListener('pagehide', () => { pause(); clearTransport(); generation += 1; });
    render();
    return Object.freeze({ snapshot, prepare, readiness, start, step, setInput, setGains, setLink, setDrop,
      setClockRate, play, pause, reset });
  }
  return Object.freeze({ install });
});
