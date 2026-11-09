'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/js/overall/autonomous-mission-model.js');

function advanceUntil(state, predicate, limit = 30000) {
  for (let i = 0; i < limit && !predicate(state); i += 1) state = M.tick(state);
  assert.ok(predicate(state), `condition not reached: ${state.missionState} @ ${state.clockMs}ms`);
  return state;
}

function afterWp1() {
  let state = M.createFixtureMission();
  state = M.command(state, 'START_ARM');
  state = M.wakePolicyClock(state);
  state = M.tick(state);
  state = M.activateAnomaly(state);
  return advanceUntil(state, s => s.waypointIndex >= 1);
}

test('GPS-invalid automatic SPIRAL does not start clean/wall timing or cooldown before planner initialization', () => {
  let state = afterWp1();
  state.inputs.gps = false;
  state.inputs.turbidityV = 1.2;
  state = advanceUntil(state, s => s.missionState === 'SPIRAL SCAN');
  assert.equal(state.anomaly.center, null);
  assert.equal(state.anomaly.spiralTargets.length, 0);
  state.inputs.turbidityV = 1.93;
  state = M.advance(state, 220); // 11 s clean, still well before the source GPS fault deadline.
  assert.equal(state.gpsPolicy.fault, false);
  assert.equal(state.missionState, 'SPIRAL SCAN');
  assert.equal(state.anomaly.center, null);
  assert.equal(state.anomaly.spiralTargets.length, 0);
  assert.equal(state.fsm.forceCooldownStarted, false);

  state.inputs.gps = true;
  state = M.tick(state);
  assert.equal(state.missionState, 'SPIRAL SCAN');
  assert.deepEqual(state.anomaly.center, state.position);
  assert.equal(state.anomaly.spiralTargets.length, 1);
  assert.equal(state.anomaly.planner.initialized, true);
  assert.equal(state.anomaly.planner.startedMs, state.clockMs);
  assert.equal(state.anomaly.planner.pointStartedMs, state.clockMs);
  assert.ok(state.rows.some(row => row.key === 'spiral-planner-initialization'));
  assert.ok(state.rows.some(row => row.key === 'spiral-abort-timing' && row.predicate.result === false));
});

test('GPS-valid SPIRAL planner initializes with compass unavailable while final applied drive remains stopped', () => {
  let state = afterWp1();
  state.inputs.compass = false;
  state.inputs.turbidityV = 1.2;
  state = advanceUntil(state, s => s.missionState === 'SPIRAL SCAN');
  assert.equal(state.anomaly.planner.initialized, true);
  assert.deepEqual(state.anomaly.center, state.position);
  assert.equal(state.anomaly.spiralTargets.length, 1);
  assert.deepEqual(state.appliedPwm, {left: 0, right: 0});
});

test('forced uninitialized SPIRAL waits for GPS and remains exempt from the automatic clean abort', () => {
  let state = afterWp1();
  state.inputs.gps = false;
  state.inputs.turbidityV = 1.93;
  state = M.command(state, 'FORCE_SPIRAL');
  state = M.tick(state);
  assert.equal(state.missionState, 'SPIRAL SCAN');
  assert.equal(state.anomaly.planner.fromForce, true);
  assert.equal(state.anomaly.planner.initialized, false);
  state = M.advance(state, 220);
  assert.equal(state.missionState, 'SPIRAL SCAN');
  assert.equal(state.fsm.forceCooldownStarted, false);
  state.inputs.gps = true;
  state = M.tick(state);
  assert.equal(state.anomaly.planner.initialized, true);
  assert.equal(state.anomaly.spiralTargets.length, 1);
  state = M.advance(state, 220);
  assert.equal(state.missionState, 'SPIRAL SCAN');
  assert.ok(state.anomaly.spiralTargets.length >= 1);
  assert.equal(state.fsm.forceCooldownStarted, false);
});
