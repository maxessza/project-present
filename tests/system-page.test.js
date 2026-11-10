'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../pages/overall.html'), 'utf8');
const uplink = fs.readFileSync(path.join(__dirname, '../src/js/mission/uplink-motion.js'), 'utf8');

test('the integrated AUTONOMOUS MISSION is the first Overall main section and loads its local scripts', () => {
  const main = html.indexOf('<main id="main">');
  const system = html.indexOf('<section id="system"', main);
  const learn = html.indexOf('<section class="ov-learn"', main);
  assert.ok(system > main && learn > system);
  assert.match(html, /class="autonomous-mission"[^>]+data-autonomous-mission/);
  assert.match(html, /src="\.\.\/src\/js\/overall\/autonomous-mission-model\.js/);
  assert.match(html, /src="\.\.\/src\/js\/overall\/autonomous-mission\.js/);
  assert.match(html, /href="\.\.\/src\/css\/autonomous-mission\.css/);
});

test('Overall teaching plant stays separate from the existing byte-transport codec', () => {
  const model = fs.readFileSync(path.join(__dirname, '../src/js/overall/autonomous-mission-model.js'), 'utf8');
  assert.match(model, /function tick\(state\)/);
  assert.match(model, /function integratePlant\(state\)/);
  assert.doesNotMatch(model, /UplinkCodec|MessageChannel|system-source-id/);
});

test('UplinkCodec is an additive export of the existing encoder and decoder', () => {
  assert.match(uplink, /root\.UplinkCodec = Object\.freeze\(\{ encodeTelemetry: api\.encodeTelemetry, decodeTelemetry: api\.decodeTelemetry, PACKET_BYTES: api\.PACKET_BYTES \}\)/);
  assert.match(uplink, /function encodeTelemetry\(packet\)/);
  assert.match(uplink, /function decodeTelemetry\(buffer\)/);
  assert.match(uplink, /const PACKET_BYTES = 38/);
});
