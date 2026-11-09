(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SystemMissionModel = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function () {
  'use strict';

  const HOME = Object.freeze({ x: 335, y: 455 });
  const WAYPOINTS = Object.freeze([
    {x:440,y:170},{x:440,y:280},{x:440,y:390},{x:665,y:390},{x:665,y:280},
    {x:665,y:170},{x:890,y:170},{x:890,y:280},{x:890,y:390}
  ].map(Object.freeze));
  const MAP_SCALE_M_PER_UNIT = 0.15;
  const SYNTHETIC_ORIGIN = Object.freeze({ lat: 18, lon: 99 });
  const METERS_PER_DEGREE = 111320;
  const EARTH_RADIUS_M = 6371000;
  const CLEAR_V = 1.93;
  const DIRTY_V = 1.20;
  const DIRTY_NTU = 80;
  const SMA_WINDOW = 8;
  const SMA_LIMIT = 50;
  const SPIRAL_A_M = 4;
  const SPIRAL_MAX_M = 8;
  const SPIRAL_MAX_THETA = 6 * Math.PI;
  const SPIRAL_DTHETA = Math.PI / 4;
  const DT_SECONDS = 0.25;
  const STEP_FRACTION = 0.2;
  const DEFAULT_GAINS = Object.freeze({ kp: 2.5, ki: 0.05, kRate: 0.8, kd: 0.8 });

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(key => freeze(value[key]));
    return Object.freeze(value);
  }
  function next(state, changes) {
    return freeze(Object.assign({}, state, changes, { revision: state.revision + 1 }));
  }
  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function wrap180(degrees) {
    if (!Number.isFinite(degrees)) return NaN;
    let result = (degrees + 180) % 360;
    if (result < 0) result += 360;
    result -= 180;
    return result === -180 && degrees > 0 ? 180 : result;
  }
  function turbidityFromVoltage(voltage) {
    if (!Number.isFinite(voltage) || voltage < 0.01 || voltage > 5.25) return NaN;
    if (voltage >= CLEAR_V) return 0;
    return Math.max(0, DIRTY_NTU * (CLEAR_V - voltage) / (CLEAR_V - DIRTY_V));
  }
  function analyzeSma(values) {
    const finite = (Array.isArray(values) ? values : []).filter(Number.isFinite).slice(-SMA_WINDOW);
    const sum = finite.reduce((total, value) => total + value, 0);
    return freeze({ count: finite.length, sum, mean: finite.length ? sum / finite.length : NaN,
      full: finite.length === SMA_WINDOW, values: finite });
  }
  function gridSteering(input, gains, dt) {
    if (!input || !gains || !Number.isFinite(dt) || dt <= 0 || !Number.isFinite(input.target) ||
        !Number.isFinite(input.heading) || !Number.isFinite(input.rate) ||
        !Number.isFinite(input.integral) || !Number.isFinite(gains.kp) ||
        !Number.isFinite(gains.ki) || !Number.isFinite(gains.kRate)) throw new RangeError('finite GRID inputs required');
    const error = wrap180(input.target - input.heading);
    const integral = input.integral + error * dt;
    const p = gains.kp * error;
    const i = gains.ki * integral;
    const damping = -gains.kRate * input.rate;
    const raw = p + i + damping;
    return freeze({ error, p, i, damping, raw, u: clamp(raw, -60, 60), integral,
      saturated: Math.abs(raw) > 60, units: 'demo units' });
  }
  function pidSteering(input, gains, dt) {
    if (!input || !gains || !Number.isFinite(dt) || dt <= 0 || !Number.isFinite(input.target) ||
        !Number.isFinite(input.heading) || !Number.isFinite(input.integral) ||
        !Number.isFinite(input.previousError) || !Number.isFinite(input.dFiltered)) throw new RangeError('finite PID inputs required');
    const error = wrap180(input.target - input.heading);
    const rawRate = wrap180(error - input.previousError) / dt;
    const dFiltered = 0.3 * rawRate + 0.7 * input.dFiltered;
    const integral = input.integral + error * dt;
    const p = gains.kp * error;
    const i = gains.ki * integral;
    const d = gains.kd * dFiltered;
    const raw = p + i + d;
    return freeze({ error, p, i, d, damping: 0, raw, u: clamp(raw, -60, 60), integral,
      previousError: error, dFiltered, saturated: Math.abs(raw) > 60, units: 'demo units' });
  }
  function toLatLon(point) {
    const east = (point.x - HOME.x) * MAP_SCALE_M_PER_UNIT;
    const north = (HOME.y - point.y) * MAP_SCALE_M_PER_UNIT;
    const lat = SYNTHETIC_ORIGIN.lat + north / METERS_PER_DEGREE;
    const lon = SYNTHETIC_ORIGIN.lon + east / (METERS_PER_DEGREE * Math.cos(SYNTHETIC_ORIGIN.lat * Math.PI / 180));
    return { lat, lon };
  }
  function navigation(a, b) {
    const one = toLatLon(a), two = toLatLon(b);
    const rad = Math.PI / 180;
    const dLat = (two.lat - one.lat) * rad;
    let dLonDeg = two.lon - one.lon;
    while (dLonDeg > 180) dLonDeg -= 360;
    while (dLonDeg < -180) dLonDeg += 360;
    const dLon = dLonDeg * rad;
    let h = Math.sin(dLat / 2) ** 2 + Math.cos(one.lat * rad) * Math.cos(two.lat * rad) * Math.sin(dLon / 2) ** 2;
    h = clamp(h, 0, 1);
    const distanceM = EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    const y = Math.sin(dLon) * Math.cos(two.lat * rad);
    const x = Math.cos(one.lat * rad) * Math.sin(two.lat * rad) - Math.sin(one.lat * rad) * Math.cos(two.lat * rad) * Math.cos(dLon);
    let bearing = Math.atan2(y, x) / rad;
    if (bearing < 0) bearing += 360;
    return freeze({ from: freeze(one), to: freeze(two), distanceM, bearing });
  }
  function spiralPoint(index, center) {
    const theta = clamp(index, 0, 24) * SPIRAL_DTHETA;
    const b = (SPIRAL_MAX_M - SPIRAL_A_M) / SPIRAL_MAX_THETA;
    const radiusM = Math.min(SPIRAL_MAX_M, SPIRAL_A_M + b * theta);
    return freeze({ index: clamp(index, 0, 24), theta, radiusM,
      x: center.x + radiusM * Math.cos(theta) / MAP_SCALE_M_PER_UNIT,
      y: center.y - radiusM * Math.sin(theta) / MAP_SCALE_M_PER_UNIT,
      eastM: radiusM * Math.cos(theta), northM: radiusM * Math.sin(theta) });
  }
  function createMission(generation = 1) {
    return freeze({ revision: 0, generation, stage: 'PREPARE', clockMs: 0, clockRate: 1, paused: true,
      readiness: { safety: false, gps: false, compass: false, home: false, waypoints: false },
      gains: Object.assign({}, DEFAULT_GAINS), input: { voltage: 1.93, ph: 7, tempC: 25 },
      position: Object.assign({}, HOME), home: Object.assign({}, HOME), waypointIndex: 0, segmentProgress: 0,
      heading: 0, headingRate: 0, integral: 0, previousError: 0, dFiltered: 0,
      steering: { error: 0, p: 0, i: 0, d: 0, damping: 0, raw: 0, u: 0, left: 40, right: 40, saturated: false },
      samples: [], lastSample: null, decision: 'WAITING_FOR_SAMPLES', spiralUsed: false,
      spiralIndex: 0, spiralProgress: 0, spiralCenter: Object.assign({}, HOME),
      departedMs: 0, departed: false, rthEntryDistanceM: NaN, arrivedMs: 0,
      sourceSequence: 0, transport: { source: null, tx: null, rx: null, decoded: null, shore: null,
        link: true, dropMode: 'none', attempts: [], logs: [], stale: false, failed: null, decodeCount: 0, renderCount: 0 },
      localLog: [] });
  }
  function prepare(state, readiness) {
    return next(state, { readiness: Object.assign({}, state.readiness, readiness || {}) });
  }
  function setReadiness(state, key, value) {
    if (!Object.prototype.hasOwnProperty.call(state.readiness, key)) throw new RangeError('unknown readiness input');
    return prepare(state, { [key]: Boolean(value) });
  }
  function ready(state) { return Object.values(state.readiness).every(Boolean); }
  function start(state) {
    if (state.stage !== 'PREPARE' || !ready(state)) return freeze({ accepted: false, reason: 'READINESS_INCOMPLETE', state });
    return freeze({ accepted: true, reason: 'ACCEPTED', state: next(state, { stage: 'START_ACCEPTED', paused: true,
      localLog: [...state.localLog, { id: 'START', atMs: state.clockMs, result: 'ACCEPTED' }] }) });
  }
  function setInput(state, input) {
    const changes = Object.assign({}, state.input, input || {});
    if (Object.prototype.hasOwnProperty.call(changes, 'voltage') && (!Number.isFinite(changes.voltage) || changes.voltage < 0.01 || changes.voltage > 5.25)) throw new RangeError('voltage outside firmware conversion range');
    return next(state, { input: changes });
  }
  function setGains(state, gains) {
    const changes = Object.assign({}, state.gains, gains || {});
    if (['kp','ki','kRate','kd'].some(key => !Number.isFinite(changes[key]) || changes[key] < 0 || changes[key] > 8)) throw new RangeError('demo gain outside 0..8');
    const steering = ['GRID','SPIRAL','RTH'].includes(state.stage) ? previewSteering(state, changes) : state.steering;
    return next(state, { gains: changes, steering });
  }
  function setClockRate(state, rate) {
    if (![1,4,12].includes(rate)) throw new RangeError('clock rate must be 1, 4, or 12');
    return next(state, { clockRate: rate });
  }
  function addLog(logs, entry) { return [...logs, freeze(entry)].slice(-100); }
  function withSource(state, sample, voltage) {
    const sequence = state.sourceSequence + 1;
    const location = toLatLon(state.position);
    const standby = state.stage === 'STANDBY';
    const packet = freeze({ sequence_number: sequence, gps_lat: location.lat, gps_lon: location.lon,
      water_ph: standby ? NaN : state.input.ph, water_turbidity: standby || !sample || !sample.valid ? NaN : sample.value,
      water_temp: standby ? NaN : state.input.tempC, current_mode: ({ PREPARE:0, START_ACCEPTED:0, GRID:1, SPIRAL:2, RTH:3, STANDBY:0 })[state.stage] || 0,
      battery_percent: 94, heading_angle: state.heading });
    const source = freeze({ id: `S${String(sequence).padStart(4, '0')}`, sampleId: sequence,
      stage: state.stage, atMs: state.clockMs, voltage: Number.isFinite(voltage) ? voltage : NaN,
      turbidity: sample && sample.valid ? sample.value : NaN, packet });
    const transport = Object.assign({}, state.transport, { source,
      logs: addLog(state.transport.logs, { id: `SRC-${sequence}`, kind: 'source', sampleId: source.id, stage: source.stage }) });
    return next(state, { sourceSequence: sequence, transport,
      localLog: addLog(state.localLog, { id: `SAMPLE-${sequence}`, atMs: state.clockMs,
        voltage: source.voltage, turbidity: source.turbidity, valid: Boolean(sample && sample.valid) }) });
  }
  function recordTx(state, sampleId, bytes, hex, attempt) {
    const tx = freeze({ id: `TX-${sampleId}`, sampleId, byteLength: bytes.length, bytes: Object.freeze(bytes.slice()), hex, attempt });
    const transport = Object.assign({}, state.transport, { tx,
      logs: addLog(state.transport.logs, { id: tx.id, kind: 'tx', sampleId, byteLength: tx.byteLength, hex }) });
    return next(state, { transport });
  }
  function recordAttempt(state, record) {
    const transport = Object.assign({}, state.transport, {
      attempts: [...state.transport.attempts, freeze(record)].slice(-40),
      logs: addLog(state.transport.logs, { id: record.id, kind: record.outcome, sampleId: record.sampleId, attempt: record.attempt })
    });
    return next(state, { transport });
  }
  function recordReceiver(state, callbackId, decoded) {
    const sequence = decoded.sequence_number;
    const sampleId = `S${String(sequence).padStart(4, '0')}`;
    const rx = freeze({ id: callbackId, sampleId, sequence, decodedId: `DEC-${sampleId}`, renderId: null });
    const shore = freeze({ sampleId, sequence, turbidity: decoded.water_turbidity, ph: decoded.water_ph,
      tempC: decoded.water_temp, lat: decoded.gps_lat, lon: decoded.gps_lon, heading: decoded.heading_angle,
      mode: decoded.current_mode });
    const transport = Object.assign({}, state.transport, { rx, decoded: freeze(Object.assign({}, decoded)), shore,
      stale: false, failed: null, decodeCount: state.transport.decodeCount + 1, renderCount: state.transport.renderCount,
      logs: addLog(addLog(state.transport.logs, { id: rx.id, kind: 'callback', sampleId: rx.sampleId }),
        { id: rx.decodedId, kind: 'decode', sampleId: rx.sampleId }) });
    return next(state, { transport });
  }
  function recordRender(state) {
    if (!state.transport.rx || state.transport.rx.renderId) return state;
    const rx = freeze(Object.assign({}, state.transport.rx, { renderId: `SHORE-${state.transport.rx.sampleId}` }));
    return next(state, { transport: Object.assign({}, state.transport, { rx,
      renderCount: state.transport.renderCount + 1,
      logs: addLog(state.transport.logs, { id: rx.renderId, kind: 'render', sampleId: rx.sampleId }) }) });
  }
  function sampleMovingPhase(state, voltage) {
    const value = turbidityFromVoltage(voltage);
    const sample = freeze({ voltage, value, valid: Number.isFinite(value) && voltage >= 0.50, atMs: state.clockMs });
    const samples = sample.valid ? [...state.samples, value].slice(-SMA_WINDOW) : state.samples.slice();
    return withSource(next(state, { samples, lastSample: sample }), sample, voltage);
  }
  function recordFailure(state, sampleId, reason) {
    const transport = Object.assign({}, state.transport, { failed: freeze({ sampleId, reason }),
      stale: Boolean(state.transport.shore), logs: addLog(state.transport.logs,
        { id: `FAIL-${sampleId}`, kind: 'failure', sampleId, reason }) });
    return next(state, { transport });
  }
  function setLink(state, enabled) {
    const link = Boolean(enabled);
    const transport = Object.assign({}, state.transport, { link, stale: !link ? Boolean(state.transport.shore) : state.transport.stale,
      logs: addLog(state.transport.logs, { id: `LINK-${state.revision + 1}`, kind: 'link', enabled: link }) });
    return next(state, { transport });
  }
  function setDrop(state, mode) {
    if (!['none','first','all'].includes(mode)) throw new RangeError('drop mode must be none, first, or all');
    return next(state, { transport: Object.assign({}, state.transport, { dropMode: mode }) });
  }
  function setPaused(state, paused) { return next(state, { paused: Boolean(paused) }); }
  function move(from, to, fraction) { return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction }; }
  function departureGate(state, position, dt) {
    if (state.departed) return { departed: true, departedMs: state.departedMs };
    if (!state.readiness.home || !state.readiness.gps) return { departed: false, departedMs: 0 };
    const distance = navigation(position, state.home).distanceM;
    const departedMs = distance >= 12 ? state.departedMs + dt * 1000 : 0;
    return { departed: departedMs >= 2000, departedMs };
  }
  function targetFor(state) {
    if (state.stage === 'SPIRAL') return spiralPoint(state.spiralIndex, state.spiralCenter);
    if (state.stage === 'RTH') return state.home;
    return WAYPOINTS[Math.min(state.waypointIndex, WAYPOINTS.length - 1)] || state.home;
  }
  function previewSteering(state, gains) {
    const nav = navigation(state.position, targetFor(state));
    const error = wrap180(nav.bearing - state.heading);
    const dt = DT_SECONDS;
    const input = { target: nav.bearing, heading: state.heading, rate: state.headingRate,
      integral: state.integral - error * dt, previousError: state.previousError, dFiltered: state.dFiltered };
    const control = state.stage === 'GRID' ? gridSteering(input, gains, dt) : pidSteering(input, gains, dt);
    return freeze(Object.assign({}, control, { targetBearing: nav.bearing, inputHeading: state.heading,
      kind: state.stage === 'GRID' ? 'GRID' : 'PID', heading: state.heading,
      headingRate: state.headingRate, left: clamp(40 + control.u, 0, 100),
      right: clamp(40 - control.u, 0, 100), mix: 'normalized demo units' }));
  }
  function recordSteering(state, target, dt) {
    const nav = navigation(state.position, target);
    const input = { target: nav.bearing, heading: state.heading, rate: state.headingRate, integral: state.integral,
      previousError: state.previousError, dFiltered: state.dFiltered };
    const control = state.stage === 'GRID'
      ? gridSteering(input, state.gains, dt)
      : pidSteering(input, state.gains, dt);
    const headingRate = state.headingRate + dt * (control.u * 0.5 - 0.4 * state.headingRate);
    const heading = ((state.heading + headingRate * dt) % 360 + 360) % 360;
    const left = clamp(40 + control.u, 0, 100), right = clamp(40 - control.u, 0, 100);
    const steering = freeze(Object.assign({}, control, { targetBearing: nav.bearing, inputHeading: state.heading,
      kind: state.stage === 'GRID' ? 'GRID' : 'PID', heading,
      headingRate, left, right, mix: 'normalized demo units' }));
    return { heading, headingRate, integral: control.integral,
      previousError: control.previousError === undefined ? control.error : control.previousError,
      dFiltered: control.dFiltered || 0, steering };
  }
  function step(state, override) {
    const dt = DT_SECONDS;
    let clockMs = state.clockMs + dt * 1000;
    if (state.stage === 'PREPARE' || state.stage === 'STANDBY') return next(state, { clockMs });
    if (state.stage === 'START_ACCEPTED') return next(state, { stage: 'GRID', clockMs, paused: false,
      localLog: addLog(state.localLog, { id: 'GRID-START', atMs: clockMs, result: 'GRID sampling begins' }) });
    let s = Object.assign({}, state, { clockMs });
    const voltage = override && Number.isFinite(override.voltage) ? override.voltage : state.input.voltage;
    if (state.stage === 'GRID') {
      const ntu = turbidityFromVoltage(voltage);
      const valid = Number.isFinite(ntu) && voltage >= 0.50;
      const sample = freeze({ voltage, value: ntu, valid, atMs: clockMs });
      const samples = valid ? [...state.samples, ntu].slice(-SMA_WINDOW) : state.samples.slice();
      s.samples = samples; s.lastSample = sample;
      const target = targetFor(s);
      const control = recordSteering(s, target, dt);
      s = Object.assign(s, control);
      s.segmentProgress = state.segmentProgress + STEP_FRACTION;
      s.position = move(state.position, target, STEP_FRACTION);
      if (s.segmentProgress >= 1) {
        s.position = Object.assign({}, target); s.segmentProgress = 0;
        if (state.waypointIndex < WAYPOINTS.length - 1) s.waypointIndex = state.waypointIndex + 1;
        else {
          s.stage = 'RTH'; s.rthEntryDistanceM = navigation(s.position, s.home).distanceM;
          s.segmentProgress = 0;
        }
      }
      Object.assign(s, departureGate(state, s.position, dt));
      const sma = analyzeSma(samples);
      s.decision = sma.full ? (sma.mean > SMA_LIMIT ? (s.waypointIndex < 1 ? 'WAIT_FIRST_WAYPOINT' : s.spiralUsed ? 'SPIRAL_ALREADY_USED' : 'DIRTY_ELIGIBLE') : 'CLEAN') : 'WAITING_FOR_FULL_WINDOW';
      if (sma.full && sma.mean > SMA_LIMIT && s.waypointIndex >= 1 && !s.spiralUsed && s.stage === 'GRID') {
        s.stage = 'SPIRAL'; s.spiralUsed = true; s.spiralCenter = Object.assign({}, s.position);
        s.spiralIndex = 0; s.spiralProgress = 0; s.decision = 'SPIRAL';
      }
      let result = next(state, s);
      result = withSource(result, sample, voltage);
      return result;
    }
    if (state.stage === 'SPIRAL') {
      const target = targetFor(state);
      const control = recordSteering(state, target, dt);
      let progress = state.spiralProgress + STEP_FRACTION;
      let position = move(state.position, target, STEP_FRACTION);
      let index = state.spiralIndex;
      let stage = 'SPIRAL';
      if (progress >= 1) {
        progress = 0; position = Object.assign({}, target); index += 1;
        if (index >= 25) { index = 24; stage = 'GRID'; }
      }
      let result = next(state, Object.assign({ stage, clockMs, position, spiralIndex: index,
        spiralProgress: progress, decision: stage === 'GRID' ? 'RESUME_NEXT_GRID_WAYPOINT' : 'SPIRAL_ACTIVE' },
        departureGate(state, position, dt), control));
      if (stage === 'GRID' && index === 24) result = next(result, { segmentProgress: 0 });
      return sampleMovingPhase(result, voltage);
    }
    if (state.stage === 'RTH') {
      const distNow = navigation(state.position, state.home).distanceM;
      const departure = departureGate(state, state.position, dt);
      const target = state.position ? state.home : HOME;
      const moving = distNow > 4;
      let control;
      if (moving) control = recordSteering(state, target, dt);
      else {
        const preview = previewSteering(state, state.gains);
        control = { heading: state.heading, headingRate: state.headingRate, integral: state.integral,
          previousError: state.previousError, dFiltered: state.dFiltered,
          steering: freeze(Object.assign({}, preview, { u: 0, left: 0, right: 0, mix: 'RTH stop gate · motors off at ≤4 m' })) };
      }
      const position = moving ? move(state.position, target, STEP_FRACTION) : Object.assign({}, state.position);
      const distAfter = navigation(position, state.home).distanceM;
      const arrivalEligible = state.readiness.home && state.readiness.gps && departure.departed &&
        state.rthEntryDistanceM > 4 && distAfter <= 4;
      const arrivedMs = arrivalEligible ? state.arrivedMs + dt * 1000 : 0;
      const stage = arrivedMs >= 3000 ? 'STANDBY' : 'RTH';
      let result = next(state, Object.assign({ stage, clockMs, position,
        departedMs: departure.departedMs, departed: departure.departed, arrivedMs, decision: stage === 'STANDBY' ? 'RTH_GATE_PASSED' : 'RTH_GATE_WAIT' }, control));
      result = stage === 'STANDBY' ? withSource(result, null, NaN) : sampleMovingPhase(result, voltage);
      return result;
    }
    return next(state, { clockMs });
  }
  function snapshot(state) {
    const sma = analyzeSma(state.samples);
    const target = targetFor(state);
    const nav = navigation(state.position, target);
    const homeNav = navigation(state.position, state.home);
    const activeSpiral = state.stage === 'SPIRAL' ? spiralPoint(state.spiralIndex, state.spiralCenter) : null;
    return freeze({ revision: state.revision, generation: state.generation, stage: state.stage, clockMs: state.clockMs,
      clockRate: state.clockRate, paused: state.paused, readiness: state.readiness, ready: ready(state),
      motorsActive: ['GRID','SPIRAL'].includes(state.stage) || (state.stage === 'RTH' && homeNav.distanceM > 4),
      position: state.position, home: state.home, target, waypointIndex: state.waypointIndex, heading: state.heading, headingRate: state.headingRate,
      navigation: nav, homeDistanceM: homeNav.distanceM, steering: state.steering, gains: state.gains,
      voltage: state.lastSample ? state.lastSample.voltage : state.input.voltage,
      lastSample: state.lastSample, samples: state.samples, sma, decision: state.decision,
      eligible: state.waypointIndex >= 1, spiralUsed: state.spiralUsed, spiralIndex: activeSpiral ? activeSpiral.index : null,
      spiral: activeSpiral, departed: state.departed, departedMs: state.departedMs,
      arrivedMs: state.arrivedMs, rthEntryDistanceM: state.rthEntryDistanceM,
      source: state.transport.source, tx: state.transport.tx, rx: state.transport.rx, decoded: state.transport.decoded,
      shore: state.transport.shore, attempts: state.transport.attempts, logs: state.transport.logs,
      localLog: state.localLog, stale: state.transport.stale, failed: state.transport.failed,
      link: Boolean(state.transport.link), dropMode: state.transport.dropMode || 'none',
      decodeCount: state.transport.decodeCount, renderCount: state.transport.renderCount,
      origin: SYNTHETIC_ORIGIN, mapScaleMPerUnit: MAP_SCALE_M_PER_UNIT });
  }
  function cloneSnapshot(state) { return snapshot(state); }

  return Object.freeze({ HOME, WAYPOINTS, MAP_SCALE_M_PER_UNIT, SYNTHETIC_ORIGIN, CLEAR_V, DIRTY_V,
    SMA_WINDOW, SMA_LIMIT, SPIRAL_A_M, SPIRAL_MAX_M, SPIRAL_MAX_THETA, SPIRAL_DTHETA,
    TICK_MS: DT_SECONDS * 1000, createMission, prepare, setReadiness, ready, start, step, setInput, setGains, setClockRate,
    setPaused, setLink, setDrop, turbidityFromVoltage, analyzeSma, gridSteering, pidSteering,
    navigation, spiralPoint, sourceSnapshot: state => state.transport.source, snapshot, cloneSnapshot,
    recordTx, recordAttempt, recordReceiver, recordRender, recordFailure });
});
