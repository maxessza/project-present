(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SystemExplorerModel = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const LIMITS = Object.freeze({ p: [0, 4], i: [0, 1], d: [0, 4] });
  const DT = 0.05;

  function createSession(headingModel, config) {
    if (!headingModel || typeof headingModel.initial !== 'function' || typeof headingModel.advance !== 'function' || typeof headingModel.control !== 'function') {
      throw new TypeError('HeadingModel is required');
    }
    const settings = config || {};
    let target = settings.target === undefined ? 90 : settings.target;
    let wind = settings.wind === undefined ? 0 : settings.wind;
    let gains = { p: 0.65, i: 0.08, d: 1.25, ...(settings.gains || {}) };
    let model = headingModel.initial();
    let ticks = 0;
    let lastTransition = null;

    function validateTarget(value) {
      if (!Number.isInteger(value) || value < 0 || value > 359) throw new RangeError('target must be an integer bearing from 0 to 359');
    }

    function validateGain(key, value) {
      if (!Object.hasOwn(LIMITS, key) || !Number.isFinite(value) || value < LIMITS[key][0] || value > LIMITS[key][1]) {
        throw new RangeError('gain is outside the teaching-model range');
      }
    }

    validateTarget(target);
    if (!Number.isFinite(wind) || Math.abs(wind) > 20) throw new RangeError('wind is outside the teaching-model range');
    for (const [key, value] of Object.entries(gains)) validateGain(key, value);

    function snapshot() {
      const error = headingModel.wrapError(target, model.heading);
      const preview = headingModel.control(model, error, gains, DT);
      return {
        target,
        wind,
        gains: { ...gains },
        dt: DT,
        ticks,
        model: { ...model },
        preview: { ...preview },
        lastTransition: lastTransition ? {
          ...lastTransition,
          control: { ...lastTransition.control },
        } : null,
      };
    }

    return {
      snapshot,
      setTarget(value) {
        validateTarget(value);
        target = value;
        lastTransition = null;
        return snapshot();
      },
      setGain(key, value) {
        validateGain(key, value);
        gains = { ...gains, [key]: value };
        lastTransition = null;
        return snapshot();
      },
      step() {
        const beforeHeading = model.heading;
        const error = headingModel.wrapError(target, beforeHeading);
        const next = headingModel.advance(model, target, gains, wind, DT);
        model = next;
        ticks += 1;
        lastTransition = {
          tick: ticks,
          target,
          beforeHeading,
          error,
          control: { p: next.p, i: next.i, d: next.d, u: next.u, saturated: next.saturated },
          afterHeading: next.heading,
        };
        return snapshot();
      },
      reset() {
        model = headingModel.initial();
        ticks = 0;
        lastTransition = null;
        return snapshot();
      },
    };
  }

  return { createSession, DT, LIMITS };
});
