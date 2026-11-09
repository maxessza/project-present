const test = require('node:test');
const assert = require('node:assert/strict');
const HeadingModel = require('../src/js/heading/heading-model.js');
const ExplorerModel = require('../src/js/explorer/system-explorer-model.js');

function session() {
  return ExplorerModel.createSession(HeadingModel);
}

test('bearing input produces a real non-default HeadingModel correction and yaw step', () => {
  const run = session();
  run.setTarget(135);
  const before = run.snapshot();
  const expected = HeadingModel.advance(before.model, 135, before.gains, 0, before.dt);
  const after = run.step();
  assert.deepEqual(after.model, expected);
  assert.equal(after.lastTransition.error, 135);
  assert.equal(after.lastTransition.target, 135);
  assert.ok(after.model.heading > 0);
  assert.equal(after.lastTransition.afterHeading, after.model.heading);
});

test('bounded gain and target changes preserve numeric state and recalculate preview', () => {
  const run = session();
  run.setTarget(135);
  run.step();
  run.step();
  const before = run.snapshot();
  const expected = HeadingModel.control(before.model, HeadingModel.wrapError(270, before.model.heading), { ...before.gains, p: 0.8 }, before.dt);
  run.setTarget(270);
  run.setGain('p', 0.8);
  const after = run.snapshot();
  assert.deepEqual(after.model, before.model);
  assert.equal(after.ticks, before.ticks);
  assert.deepEqual(after.preview, expected);
  assert.equal(after.lastTransition, null);
});

test('each step records one coherent pre-control / post-yaw snapshot', () => {
  const run = session();
  run.setTarget(270);
  const before = run.snapshot();
  const error = HeadingModel.wrapError(270, before.model.heading);
  const next = HeadingModel.advance(before.model, 270, before.gains, 0, before.dt);
  const after = run.step();
  assert.deepEqual(after.lastTransition, {
    tick: 1,
    target: 270,
    beforeHeading: before.model.heading,
    error,
    control: { p: next.p, i: next.i, d: next.d, u: next.u, saturated: next.saturated },
    afterHeading: next.heading,
  });
});

test('reset clears yaw dynamics and tick history but keeps the selected experiment', () => {
  const run = session();
  run.setTarget(135);
  run.setGain('p', 0.8);
  run.step();
  const reset = run.reset();
  assert.deepEqual(reset.model, HeadingModel.initial());
  assert.equal(reset.ticks, 0);
  assert.equal(reset.target, 135);
  assert.equal(reset.gains.p, 0.8);
  assert.equal(reset.lastTransition, null);
});

test('invalid input and gains outside the UI bounds are rejected', () => {
  const run = session();
  assert.throws(() => run.setTarget(360), RangeError);
  assert.throws(() => run.setTarget(12.5), RangeError);
  assert.throws(() => run.setGain('p', 4.1), RangeError);
  assert.throws(() => run.setGain('i', -0.01), RangeError);
  assert.throws(() => run.setGain('rate', 1), RangeError);
});

test('session requires the existing HeadingModel implementation', () => {
  assert.throws(() => ExplorerModel.createSession(null), TypeError);
});
