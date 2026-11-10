'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const SystemMission = require('../src/js/system/system-model.js');
const UplinkMotion = require('../src/js/mission/uplink-motion.js');

function gridMission(voltage) {
  let state = SystemMission.createMission();
  const blocked = SystemMission.start(state);
  assert.equal(blocked.accepted, false);
  state = SystemMission.prepare(state, { safety: true, gps: true, compass: true, home: true, waypoints: true });
  state = SystemMission.start(state).state;
  assert.equal(SystemMission.snapshot(state).stage, 'START_ACCEPTED');
  assert.equal(SystemMission.snapshot(state).motorsActive, false);
  state = SystemMission.step(state);
  assert.equal(SystemMission.snapshot(state).stage, 'GRID');
  return SystemMission.setInput(state, { voltage });
}

test('readiness blocks START and accepted START stays stopped until an explicit step', () => {
  let state = SystemMission.createMission();
  assert.equal(SystemMission.start(state).reason, 'READINESS_INCOMPLETE');
  state = SystemMission.prepare(state, { safety: true, gps: true, compass: true, home: true, waypoints: true });
  const accepted = SystemMission.start(state);
  assert.equal(accepted.accepted, true);
  assert.equal(SystemMission.snapshot(accepted.state).stage, 'START_ACCEPTED');
  assert.equal(SystemMission.snapshot(accepted.state).motorsActive, false);
  assert.deepEqual(SystemMission.snapshot(accepted.state).position, SystemMission.HOME);
  assert.equal(SystemMission.snapshot(SystemMission.step(accepted.state)).stage, 'GRID');
});

test('dirty water fills a rolling window, waits for WP1 eligibility, then triggers one spiral', () => {
  let state = gridMission(1.20);
  for (let i = 0; i < 5; i += 1) state = SystemMission.step(state);
  let view = SystemMission.snapshot(state);
  assert.equal(view.waypointIndex, 1);
  assert.equal(view.sma.count, 5);
  assert.equal(view.sma.full, false);
  assert.equal(view.spiralUsed, false);
  for (let i = 0; i < 2; i += 1) state = SystemMission.step(state);
  view = SystemMission.snapshot(state);
  assert.deepEqual({ count: view.sma.count, sum: view.sma.sum, mean: view.sma.mean, full: view.sma.full },
    { count: 7, sum: 560, mean: 80, full: false });
  state = SystemMission.step(state);
  view = SystemMission.snapshot(state);
  assert.deepEqual({ count: view.sma.count, sum: view.sma.sum, mean: view.sma.mean, full: view.sma.full },
    { count: 8, sum: 640, mean: 80, full: true });
  assert.equal(view.stage, 'SPIRAL');
  assert.equal(view.decision, 'SPIRAL');
  assert.equal(view.spiralUsed, true);
  for (let i = 0; i < 125; i += 1) state = SystemMission.step(state);
  view = SystemMission.snapshot(state);
  assert.equal(view.stage, 'GRID');
  assert.equal(view.waypointIndex, 1);
  state = SystemMission.step(state);
  view = SystemMission.snapshot(state);
  assert.equal(view.stage, 'GRID');
  assert.equal(view.decision, 'SPIRAL_ALREADY_USED');
});

test('clear water produces a full zero mean and skips optional spiral', () => {
  let state = gridMission(1.93);
  for (let i = 0; i < 10; i += 1) state = SystemMission.step(state);
  const view = SystemMission.snapshot(state);
  assert.equal(view.sma.count, 8);
  assert.equal(view.sma.sum, 0);
  assert.equal(view.sma.mean, 0);
  assert.equal(view.decision, 'CLEAN');
  assert.equal(view.spiralUsed, false);
  assert.equal(view.stage, 'GRID');
});

test('voltage conversion, synthetic map scale, and current three-turn spiral match independent examples', () => {
  assert.equal(SystemMission.turbidityFromVoltage(1.93), 0);
  assert.equal(SystemMission.turbidityFromVoltage(1.20), 80);
  assert.ok(Number.isNaN(SystemMission.turbidityFromVoltage(NaN)));
  const east = SystemMission.navigation(SystemMission.HOME, { x: SystemMission.HOME.x + 100, y: SystemMission.HOME.y });
  assert.ok(Math.abs(east.distanceM - 14.9831468) < 0.001);
  assert.ok(Math.abs(east.bearing - 89.9999781) < 0.001);
  const first = SystemMission.spiralPoint(0, { x: 500, y: 300 });
  const last = SystemMission.spiralPoint(24, { x: 500, y: 300 });
  assert.equal(first.radiusM, 4);
  assert.equal(first.theta, 0);
  assert.equal(first.eastM, 4);
  assert.equal(last.radiusM, 8);
  assert.equal(last.theta, 6 * Math.PI);
  assert.ok(Math.abs(last.eastM - 8) < 1e-12);
  assert.ok(Math.abs(last.northM) < 1e-12);
});

test('GRID uses measured-rate damping, reports capped command, and gains alter steering', () => {
  const input = { target: 90, heading: 60, rate: 8, integral: 0 };
  const a = SystemMission.gridSteering(input, { kp: 2.5, ki: 0.05, kRate: 0.8 }, 0.1);
  const b = SystemMission.gridSteering(input, { kp: 1, ki: 0, kRate: 0 }, 0.1);
  assert.equal(a.error, 30);
  assert.equal(a.p, 75);
  assert.ok(Math.abs(a.i - 0.15) < 1e-12);
  assert.equal(a.damping, -6.4);
  assert.equal(a.raw, 68.75);
  assert.equal(a.u, 60);
  assert.equal(a.saturated, true);
  assert.equal(b.u, 30);
  assert.notEqual(a.u, b.u);
  let state = gridMission(1.93);
  state = SystemMission.setGains(state, { kp: 1, ki: 0, kRate: 0 });
  const low = SystemMission.snapshot(state).steering.u;
  state = SystemMission.setGains(state, { kp: 2, ki: 0, kRate: 0 });
  assert.notEqual(SystemMission.snapshot(state).steering.u, low);
});

test('RTH needs departure and arrival dwell; standby water fields stay unavailable', () => {
  let state = gridMission(1.93);
  for (let i = 0; i < 80 && SystemMission.snapshot(state).stage !== 'RTH'; i += 1) state = SystemMission.step(state);
  let view = SystemMission.snapshot(state);
  assert.equal(view.stage, 'RTH');
  assert.equal(view.departed, true);
  assert.ok(view.rthEntryDistanceM > 4);
  for (let i = 0; i < 20 && view.homeDistanceM > 4; i += 1) { state = SystemMission.step(state); view = SystemMission.snapshot(state); }
  assert.ok(view.homeDistanceM <= 4);
  assert.equal(view.stage, 'RTH');
  state = SystemMission.setReadiness(state, 'gps', false);
  state = SystemMission.step(state);
  assert.equal(SystemMission.snapshot(state).arrivedMs, 0);
  state = SystemMission.setReadiness(state, 'gps', true);
  for (let i = 0; i < 12; i += 1) state = SystemMission.step(state);
  view = SystemMission.snapshot(state);
  assert.equal(view.stage, 'STANDBY');
  assert.ok(Number.isNaN(view.source.packet.water_turbidity));
  assert.ok(Number.isNaN(view.source.packet.water_ph));
  assert.ok(Number.isNaN(view.source.packet.water_temp));
});

test('the existing 38-byte codec carries source data and receiver state can only follow decoded bytes', () => {
  let state = gridMission(1.20);
  state = SystemMission.step(state);
  const source = SystemMission.snapshot(state).source;
  const buffer = UplinkMotion.encodeTelemetry(source.packet);
  assert.equal(buffer.byteLength, 38);
  new DataView(buffer).setFloat32(24, 12.5, true);
  const decoded = UplinkMotion.decodeTelemetry(buffer);
  state = SystemMission.recordReceiver(state, 'RXCB-S0001-A1', decoded);
  assert.equal(SystemMission.snapshot(state).samples[0], 80);
  assert.equal(SystemMission.snapshot(state).source.packet.water_turbidity, 80);
  assert.equal(SystemMission.snapshot(state).shore.turbidity, 12.5);
  assert.equal(SystemMission.snapshot(state).rx.sampleId, 'S0001');
  assert.equal(SystemMission.snapshot(state).rx.decodedId, 'DEC-S0001');
  const held = SystemMission.snapshot(state).shore;
  state = SystemMission.setLink(state, false);
  assert.equal(SystemMission.snapshot(state).stale, true);
  assert.deepEqual(SystemMission.snapshot(state).shore, held);
  state = SystemMission.setLink(state, true);
  assert.equal(SystemMission.snapshot(state).stale, true);
  state = SystemMission.recordReceiver(state, 'RXCB-S0001-A2', decoded);
  assert.equal(SystemMission.snapshot(state).stale, false);
});
