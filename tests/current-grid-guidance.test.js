'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/js/overall/mission-kernel.js');

function localLosBearing(position, start, end, lookaheadM = 6) {
  const scale = M.MAP_SCALE_M_PER_UNIT;
  const east = (end.x - start.x) * scale;
  const north = -(end.y - start.y) * scale;
  const boatEast = (position.x - start.x) * scale;
  const boatNorth = -(position.y - start.y) * scale;
  const length = Math.hypot(east, north);
  const along = Math.max(0, Math.min(length,
    (boatEast * east + boatNorth * north) / length + lookaheadM));
  const aim = { x: start.x + east * along / length / scale,
    y: start.y - north * along / length / scale };
  return M.bearing(position, aim);
}

test('GRID guides to the 6 m lookahead on the accepted segment, not direct waypoint bearing', () => {
  const state = M.createFixtureMission();
  state.missionState = 'GRID SCAN';
  state.mode = 'GRID_PATROL';
  state.waypointIndex = 1;
  state.position = { x: 520, y: 190 };
  const start = state.acceptedRoute[0];
  const end = state.acceptedRoute[1];
  const expected = localLosBearing(state.position, start, end);
  const direct = M.bearing(state.position, end);
  const view = M.snapshot(state);
  assert.ok(Math.abs(M.wrap180(expected - direct)) > 1,
    'cross-track fixture distinguishes LOS from direct waypoint bearing');
  assert.ok(Math.abs(M.wrap180(view.targetHeading - expected)) < 1e-9,
    `expected LOS ${expected}, got ${view.targetHeading}`);
});
