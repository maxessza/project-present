'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/js/overall/autonomous-mission-model.js');

function spiralFixture({positionAlongM = 0, pointStartedMs = 0, startedMs = 0, cleanSinceMs = null, fromForce = false} = {}) {
  const state = M.createFixtureMission();
  const commanded = M.command(state, 'START_ARM');
  const started = M.tick(M.wakePolicyClock(commanded));
  const center = {x:500, y:300};
  const target = {x:center.x + 1 / M.MAP_SCALE_M_PER_UNIT, y:center.y};
  started.position = {x:center.x + positionAlongM / M.MAP_SCALE_M_PER_UNIT,y:center.y};
  started.anomaly.used = true;
  started.anomaly.center = {...center};
  started.anomaly.interruptedIndex = started.waypointIndex;
  started.anomaly.spiralTargets = [target];
  started.anomaly.spiralIndex = 0;
  started.anomaly.planner = {nextTheta:Math.PI / 4, initialized:true, startedMs, pointStartedMs, fromForce, cleanSinceMs, cooldownUntilMs:0};
  started.missionState = 'SPIRAL SCAN';
  started.mode = 'SPIRAL_SCAN';
  started.clockMs = 0;
  return started;
}

function spiralRow(state) {
  return state.rows.find(row => row.key === 'spiral-generation-progress');
}

test('spiral LOS requires inclusive 0.5 m along-track progress despite the 2 m reached radius', () => {
  let before = M.tick(spiralFixture({positionAlongM:0.499}));
  assert.equal(before.anomaly.spiralIndex, 0);
  assert.equal(spiralRow(before).predicate.result, false);
  assert.ok(spiralRow(before).inputs.alongTrackM < 0.5);

  let at = M.tick(spiralFixture({positionAlongM:0.501}));
  assert.equal(at.anomaly.spiralIndex, 1);
  assert.equal(at.anomaly.spiralTargets.length, 2);
  assert.equal(at.rows.filter(row => row.key === 'spiral-generation-progress').length, 2);
});

test('a stalled spiral point does not advance before 45 s and requests one target at the deadline', () => {
  let before = M.tick(spiralFixture({pointStartedMs:-44900})); // elapsed=44,950 ms after this 50 ms tick
  assert.equal(before.anomaly.spiralIndex, 0);
  assert.equal(spiralRow(before).inputs.pointTimeout, false);

  let at = M.tick(spiralFixture({pointStartedMs:-44950})); // elapsed=45,000 ms
  assert.equal(at.anomaly.spiralIndex, 1);
  assert.equal(at.anomaly.spiralTargets.length, 2);
  assert.equal(spiralRow(at).inputs.pointTimeout, true);
});

test('the 240 s wall abort wins over a simultaneous 45 s point timeout', () => {
  const state = M.tick(spiralFixture({startedMs:-239950, pointStartedMs:-44950}));
  assert.equal(state.missionState, 'GRID SCAN');
  assert.equal(state.anomaly.spiralIndex, 0);
  assert.equal(state.anomaly.spiralTargets.length, 1);
  assert.equal(state.rows.find(row => row.key === 'spiral-return')?.inputs.reason, 'wall');
});

test('the automatic 8 s clean abort wins over a point timeout but force-origin spirals ignore it', () => {
  const automatic = M.tick(spiralFixture({pointStartedMs:-44950, cleanSinceMs:-7950}));
  assert.equal(automatic.missionState, 'GRID SCAN');
  assert.equal(automatic.anomaly.spiralIndex, 0);
  assert.equal(automatic.rows.find(row => row.key === 'spiral-return')?.inputs.reason, 'clean');

  const forced = M.tick(spiralFixture({fromForce:true, pointStartedMs:0, cleanSinceMs:-7950}));
  assert.equal(forced.missionState, 'SPIRAL SCAN');
  assert.equal(forced.anomaly.spiralIndex, 0);
  assert.equal(forced.rows.findLast(row=>row.key==='start-readiness').output.clean, false);
});
