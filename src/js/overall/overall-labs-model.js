(function (root, factory) {
  const model = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = model;
  if (root) root.OverallLabsModel = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const SMA_WINDOW = 8;
  const SAMPLE_THRESHOLD_NTU = 50;
  const WARNING_NTU = 10;
  const BASELINE_DELTA_NTU = 10;
  const BASELINE_DWELL_SECONDS = 4;

  function finiteMean(values) {
    let mean = 0;
    values.forEach((value, index) => {
      mean += (value - mean) / (index + 1);
    });
    return Number.isFinite(mean) ? mean : null;
  }

  function parseSamples(text) {
    const source = String(text ?? '').trim();
    if (!source) return {samples: [], count: 0, mean: null, ready: false, error: 'incomplete'};
    if (/(?:^|,)\s*(?:,|$)/.test(source)) {
      return {samples: [], count: 0, mean: null, ready: false, error: 'empty-slot'};
    }
    const tokens = source.split(/[\s,]+/);
    const samples = tokens.map(token => Number(token));
    if (samples.some(value => !Number.isFinite(value))) {
      return {samples: [], count: 0, mean: null, ready: false, error: 'invalid-number'};
    }
    if (samples.some(value => value < 0)) {
      return {samples, count: samples.length, mean: null, ready: false, error: 'negative'};
    }
    const mean = samples.length ? finiteMean(samples) : null;
    return {
      samples,
      count: samples.length,
      mean,
      ready: samples.length === SMA_WINDOW,
      error: samples.length === SMA_WINDOW ? '' : samples.length < SMA_WINDOW ? 'incomplete' : 'too-many-samples'
    };
  }

  function evaluateWhatIf(input = {}) {
    const samples = Array.isArray(input.samples) ? Array.from(input.samples) : [];
    const mode = input.mode === undefined ? 'absolute-only' : input.mode;
    const baseline = input.baseline;
    const dwellSeconds = input.dwellSeconds;
    let error = '';
    if (input.sampleError) error = input.sampleError;
    else if (mode !== 'absolute-only' && mode !== 'combined') error = 'invalid-mode';
    else if (!Number.isFinite(baseline) || baseline < 0) error = 'invalid-baseline';
    else if (mode === 'combined' && baseline <= 0) error = 'uninitialized-baseline';
    else if (!Number.isFinite(dwellSeconds) || dwellSeconds < 0) error = 'invalid-dwell';
    else if (samples.some(value => !Number.isFinite(value))) error = 'invalid-samples';
    else if (samples.some(value => value < 0)) error = 'negative-sample';

    const count = samples.length;
    const mean = count && samples.every(value => Number.isFinite(value) && value >= 0)
      ? finiteMean(samples)
      : null;
    const ready = !error && count === SMA_WINDOW;
    const absolutePass = ready && mean > SAMPLE_THRESHOLD_NTU;
    const baselinePass = ready && mode === 'combined' && mean > WARNING_NTU &&
      mean - baseline > BASELINE_DELTA_NTU && dwellSeconds >= BASELINE_DWELL_SECONDS;
    const triggered = absolutePass || baselinePass;
    const branch = absolutePass ? 'absolute' : baselinePass ? 'baseline-dwell' : '';
    const gates = [
      ['passedWp1', 'blocked-wp1'],
      ['grid', 'blocked-grid'],
      ['safety', 'blocked-safety']
    ];
    const failedGate = gates.find(([key]) => input[key] !== true);
    const nextResult = !triggered ? 'stay-grid' : failedGate ? failedGate[1] : 'spiral-mapping';
    return {samples, count, mean, ready, error, absolutePass, baselinePass, triggered, branch, nextResult};
  }

  function getCheckpointIndices(mission) {
    const steps = mission.steps;
    const wp1Arrival = steps.findIndex(step => step.phase === 'arrive' &&
      mission.points.length - step.waypoint === 1);
    const anomaly = steps.findIndex(step => Boolean(step.readings));
    const firstSpiralTarget = steps.findIndex(step => step.spiralOperation === 'travel');
    const spiralComplete = steps.findIndex(step => step.phase === 'spiral' &&
      step.inspector.nextState === 'GRID_PATROL · ใช้ index เดิม');
    const rth = steps.findIndex(step => step.phase === 'return');
    if ([wp1Arrival, anomaly, firstSpiralTarget, spiralComplete, rth].some(index => index < 0)) {
      throw new Error('Mission is missing a required teaching checkpoint');
    }
    return {
      prepare: 0,
      afterWp1: wp1Arrival + 1,
      anomaly,
      firstSpiralTarget,
      resumeGrid: spiralComplete + 1,
      rth,
      complete: steps.length
    };
  }

  function finiteDistance(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    const number = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function createRthState(initial = {}) {
    const inputs = {
      homeSet: false,
      fixValid: false,
      entryDistanceM: 20,
      distanceM: 20,
      ...initial
    };
    return updateRth({inputs, outsideSeconds: 0, insideSeconds: 0, departed: false}, {}, false);
  }

  function updateRth(previous, patch = {}, tick = false) {
    const inputs = {...previous.inputs, ...patch};
    const entryDistanceM = finiteDistance(inputs.entryDistanceM);
    const distanceM = finiteDistance(inputs.distanceM);
    const valid = entryDistanceM !== null && distanceM !== null;
    const state = {
      inputs: {...inputs, entryDistanceM, distanceM},
      valid,
      error: valid ? '' : 'invalid-distance',
      outsideSeconds: previous.outsideSeconds || 0,
      insideSeconds: previous.insideSeconds || 0,
      departed: Boolean(previous.departed),
      arrived: false,
      distanceStopsMotors: valid && distanceM <= 4,
      reason: ''
    };
    const departureOk = valid && inputs.homeSet === true && inputs.fixValid === true && distanceM >= 12;
    if (!state.departed) {
      state.outsideSeconds = departureOk
        ? state.outsideSeconds + (tick ? 1 : 0)
        : 0;
      if (state.outsideSeconds >= 2) state.departed = true;
    } else {
      state.outsideSeconds = 0;
    }

    const arrivalOk = valid && inputs.homeSet === true && inputs.fixValid === true &&
      state.departed && entryDistanceM > 4 && distanceM <= 4;
    state.insideSeconds = arrivalOk
      ? state.insideSeconds + (tick ? 1 : 0)
      : 0;
    state.arrived = state.insideSeconds >= 3;

    if (!valid) state.reason = 'ระยะต้องเป็นตัวเลข finite ตั้งแต่ 0 m ขึ้นไป';
    else if (inputs.homeSet !== true) state.reason = 'ยังไม่ได้ตั้ง HOME · outside dwell ถูกรีเซ็ต';
    else if (inputs.fixValid !== true) state.reason = 'GPS fix ไม่ valid · pending dwell ถูกรีเซ็ต';
    else if (!state.departed) state.reason = distanceM < 12
      ? 'รอระยะออกห่าง HOME ≥ 12 m'
      : 'outside dwell ' + state.outsideSeconds + ' / 2 s';
    else if (entryDistanceM <= 4) state.reason = 'RTH เริ่มในวง ≤ 4 m จึงไม่รับ arrival';
    else if (distanceM > 4) state.reason = 'อยู่นอกวง arrival · inside dwell ถูกรีเซ็ต';
    else if (state.arrived) state.reason = 'arrival gate ครบ 3 s · เงื่อนไขนี้จึงให้ FSM ออกจาก RTH ได้';
    else state.reason = 'inside dwell ' + state.insideSeconds + ' / 3 s';
    return state;
  }

  return {
    parseSamples,
    evaluateWhatIf,
    getCheckpointIndices,
    createRthState,
    updateRth
  };
});
