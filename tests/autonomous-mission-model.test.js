'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/js/overall/autonomous-mission-model.js');

function running() { return M.start(M.createFixtureMission()); }
function advanceUntil(state, predicate, limit = 30000) {
  for (let i = 0; i < limit && !predicate(state); i += 1) state = M.tick(state);
  if (!predicate(state)) {
    const v = M.snapshot(state);
    assert.fail(`condition not reached after ${limit} fixed steps: ${JSON.stringify({missionState:v.missionState,position:v.position,target:v.target,heading:v.heading,targetHeading:v.targetHeading,headingError:v.headingError,speedMps:v.speedMps,waypointIndex:v.waypointIndex,spiralIndex:v.anomaly.spiralIndex,targetDistanceM:v.targetDistanceM})}`);
  }
  return state;
}

test('heading error wraps north and preserves source signed +/-180 boundaries', () => {
  assert.equal(M.wrap180(1 - 359), 2);
  assert.equal(M.wrap180(359 - 1), -2);
  assert.equal(M.wrap180(180), 180);
  assert.equal(M.wrap180(-180), -180);
  assert.equal(M.wrap180(-181), 179);
});

test('live bearing/error and control sample distinguish Compass measurement from plant truth', () => {
  const state = M.start(M.createFixtureMission());
  const view = M.snapshot(M.tick(state));
  assert.equal(view.headingError, M.wrap180(view.targetHeading - view.measuredHeading));
  assert.equal(view.headingMetrics.errorDeg, M.wrap180(view.headingMetrics.targetHeadingDeg - view.headingMetrics.measuredHeadingDeg));
  assert.equal(view.headingMetrics.clockMs, view.clockMs);
  assert.equal(view.headingMetrics.position.x, M.HOME.x);
  assert.equal(view.plantHeading, view.heading, 'the displayed heading remains plant truth, separately labelled');
  assert.notEqual(view.measuredHeading, view.plantHeading, 'Compass sample and post-control plant heading are not fabricated as identical');
  assert.deepEqual(view.motorPwm, view.applied);
  assert.ok(view.applied.left >= -1 && view.applied.left <= 1);
  assert.ok(view.applied.right >= -1 && view.applied.right <= 1);
  assert.equal(view.controllerKind, 'GRID · LOS + continuous steering/surge');
  assert.ok(view.controlDerivative === 0); // measured-rate damping may represent zero as -0
});

test('one lower-level preloaded fixture start advances the fixed-step plant without creating another loop', () => {
  const initial = M.createFixtureMission();
  assert.equal(M.snapshot(initial).missionState, 'READY');
  const started = M.start(initial);
  const before = M.snapshot(started);
  assert.equal(M.start(started), started);
  const moved = M.snapshot(M.tick(started));
  assert.equal(moved.clockMs, M.DT_SECONDS * 1000);
  assert.notDeepEqual(moved.position, before.position);
  assert.equal(moved.trail.at(-1).x, moved.position.x);
});

test('pause and reset clear the complete mission without advancing the clock', () => {
  let s = advanceUntil(running(), v => v.clockMs > 1000);
  s = M.addDisturbance(s, 1);
  s = M.activateAnomaly(s);
  const paused = M.pause(s);
  assert.equal(M.tick(paused), paused);
  const reset = M.snapshot(M.reset());
  assert.equal(reset.clockMs, 0);
  assert.equal(reset.missionState, 'READY');
  assert.equal(reset.waypointIndex, 0);
  assert.equal(reset.trail.length, 1);
  assert.equal(reset.force.remainingSec, 0);
  assert.equal(reset.anomaly.armed, false);
  assert.equal(reset.anomaly.used, false);
});

test('both disturbance directions displace the real plant and motor control recovers toward the same target', () => {
  for (const direction of [-1, 1]) {
    let s = advanceUntil(running(), v => v.clockMs >= 1000);
    const before = M.snapshot(s);
    const targetBefore = before.target;
    s = M.addDisturbance(s, direction);
    let peak = null;
    for (let i = 0; i < 50; i += 1) {
      s = M.tick(s);
      if (i === 39) peak = M.snapshot(s);
    }
    assert.ok(peak.force.remainingSec > 0);
    assert.notDeepEqual(peak.position, before.position);
    assert.notEqual(peak.heading, before.heading);
    assert.notEqual(peak.motorPwm.left, peak.motorPwm.right);
    assert.deepEqual(peak.target, targetBefore);
    const recovered = advanceUntil(s, v => v.clockMs > peak.clockMs + 12000);
    const end = M.snapshot(recovered);
    assert.deepEqual(end.target, targetBefore);
    assert.ok(end.targetDistanceM < peak.targetDistanceM, `target distance did not recover (${direction})`);
    for (const p of end.trail) assert.ok(M.inGeofence(p), `out of geofence: ${JSON.stringify(p)}`);
  }
});

test('absolute detector uses strict full SMA8 >50 and the actual marked-region sample stream', () => {
  assert.equal(M.analyzeSma(Array(8).fill(49.9)).trigger, false);
  assert.equal(M.analyzeSma(Array(8).fill(50)).trigger, false);
  assert.equal(M.analyzeSma(Array(8).fill(50.1)).trigger, true);
  let s = M.activateAnomaly(running());
  s = advanceUntil(s, v => v.anomaly.window.length > 0);
  assert.equal(M.snapshot(s).missionState, 'GRID SCAN');
  s = advanceUntil(s, v => v.missionState === 'SPIRAL SCAN');
  const detected = M.snapshot(s);
  assert.ok(detected.anomaly.mean > detected.anomaly.threshold);
  assert.equal(detected.anomaly.interruptedIndex, detected.waypointIndex);
  assert.equal(detected.anomaly.window.length, 8);
  assert.ok(detected.waypointIndex >= 1);
});

test('spiral is generated and followed, then returns to the exact interrupted waypoint', () => {
  let s = M.activateAnomaly(running());
  s = advanceUntil(s, v => v.missionState === 'SPIRAL SCAN');
  const spiralStart = M.snapshot(s);
  const interrupted = spiralStart.waypointIndex;
  const center = {...spiralStart.anomaly.center};
  assert.equal(spiralStart.anomaly.spiralTargets.length, 1);
  assert.ok(Math.abs(M.distance(center, spiralStart.anomaly.spiralTargets[0]) * M.MAP_SCALE_M_PER_UNIT - 4) < 1e-8);
  const firstSpiralPosition = spiralStart.position;
  // Persistent injected plume exercises completion, separately from source clean-abort.
  s.inputs.turbidityV=1.2;
  let previousCount = 1;
  for (let i = 0; i < 30000 && s.missionState === 'SPIRAL SCAN'; i += 1) {
    s = M.tick(s);
    const generated = s.anomaly.spiralTargets.length;
    assert.ok(generated === previousCount || generated === previousCount + 1, `planner generated ${generated - previousCount} targets in one tick`);
    assert.deepEqual(s.anomaly.center, center);
    previousCount = generated;
  }
  assert.equal(s.missionState, 'GRID SCAN', 'spiral did not finish within the bounded fixture run');
  const returning = M.snapshot(s);
  assert.equal(returning.anomaly.spiralIndex, M.SPIRAL_POINTS);
  assert.equal(returning.anomaly.spiralTargets.length, M.SPIRAL_POINTS);
  assert.ok(returning.anomaly.spiralTargets.every(M.inGeofence));
  assert.equal(returning.anomaly.interruptedIndex, interrupted);
  assert.ok(returning.trail.length > 0 && returning.trail.at(-1).x === returning.position.x && returning.trail.at(-1).y === returning.position.y);
  assert.notDeepEqual(returning.position, firstSpiralPosition);
  s = advanceUntil(s, v => v.missionState === 'GRID SCAN', 12000);
  const resumed = M.snapshot(s);
  assert.equal(resumed.waypointIndex, interrupted);
  assert.equal(resumed.anomaly.used, true);
  assert.equal(resumed.anomaly.armed, true); // injected region is not a firmware lifetime lock
});

test('the normal nine-waypoint mission completes without anomaly and stays inside the geofence', () => {
  const s = advanceUntil(running(), v => v.missionState === 'COMPLETE', 50000);
  const view = M.snapshot(s);
  assert.equal(view.waypointIndex, 9);
  assert.equal(view.anomaly.used, false);
  assert.ok(view.trail.every(M.inGeofence));
});

test('runtime spiral creates only its current target at entry, not all future planner points', () => {
  const s = advanceUntil(M.activateAnomaly(running()), v => v.missionState === 'SPIRAL SCAN');
  const view = M.snapshot(s);
  assert.equal(view.anomaly.spiralTargets.length, 1);
  assert.equal(view.anomaly.spiralIndex, 0);
  assert.ok(Math.abs(M.distance(view.anomaly.center, view.anomaly.spiralTargets[0]) * M.MAP_SCALE_M_PER_UNIT - 4) < 1e-8);
  assert.equal(view.target.x, view.anomaly.spiralTargets[0].x);
  assert.equal(view.target.y, view.anomaly.spiralTargets[0].y);
});
