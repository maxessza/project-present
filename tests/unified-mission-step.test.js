'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/js/overall/autonomous-mission-model.js');

test('preloaded navigation fixture NEXT advances one causal 50 ms event without requiring HOME', () => {
  assert.equal(typeof M.stepOnce, 'function', 'accepted mission model must expose bounded one-event stepping');
  const initial = M.createFixtureMission();
  initial.inputs.home = false;
  const result = M.stepOnce(initial);
  assert.equal(result.state.playing, false);
  assert.equal(result.state.missionState, 'GRID SCAN');
  assert.equal(result.state.clockMs, M.DT_SECONDS * 1000);
  assert.notDeepEqual(result.state.position, initial.position);
  assert.equal(result.event.atMs, result.state.clockMs);
  assert.equal(result.event.inputs.position.x, initial.position.x);
  assert.equal(result.event.output.position.x, result.state.position.x);
  assert.match(result.event.source.path, /Tasks\.cpp/);
  const steppedAgain = M.stepOnce(result.state);
  assert.equal(steppedAgain.state.clockMs, result.state.clockMs + M.DT_SECONDS * 1000);
  assert.equal(steppedAgain.event.id, result.event.id + 1);
});

test('explanation focus is not part of model state and cannot mutate a captured event', () => {
  assert.equal(typeof M.stepOnce, 'function', 'accepted mission model must expose captured trace events');
  const result = M.stepOnce(M.createFixtureMission());
  const frozen = JSON.stringify(result.event);
  assert.equal(Object.isFrozen(result.event), true);
  assert.equal(JSON.stringify(result.event), frozen);
});
