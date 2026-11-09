'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const codec = require(path.join(root, 'src/js/mission/uplink-motion.js'));
const html = fs.readFileSync(path.join(root, 'pages/overall.html'), 'utf8');

function encodedHex(packet) {
  return [...new Uint8Array(codec.encodeTelemetry(packet))]
    .map(byte => byte.toString(16).padStart(2, '0')).join(' ');
}

function report(sequence, overrides = {}) {
  return Object.assign({
    sequence_number: sequence, gps_lat: 18.123456, gps_lon: 99.654321,
    water_ph: 7.25, water_turbidity: 41.75, water_temp: 22.5,
    current_mode: 1, battery_percent: 85, heading_angle: 270
  }, overrides);
}

test('DATA values follow immutable outgoing bytes and the committed shore report, not current source', () => {
  const presentation = require(path.join(root, 'src/js/overall/mission-presentation.js'));
  const outgoingPacket = report(17);
  const receivedPacket = report(16, {
    gps_lat: 18.111111, gps_lon: 99.222222, water_ph: 6.5,
    water_turbidity: 12.25, water_temp: 19.5, current_mode: 2, heading_angle: 180
  });
  const current = { water: { ph: 5.5, ntu: 98, temp: 31 }, missionState: 'GRID SCAN' };
  const transport = {
    active: { seq: 17, hex: encodedHex(outgoingPacket), attempt: 1 },
    latestTx: { seq: 17, hex: encodedHex(outgoingPacket) },
    rx: { sequence: 16, decoded: codec.decodeTelemetry(codec.encodeTelemetry(receivedPacket)) },
    phase: 'posted', stale: false, config: { lossAll: false }
  };
  const view = presentation.buildDataView(current, transport, codec);
  const byId = Object.fromEntries(view.fields.map(field => [field.id, field]));

  assert.equal(view.outgoing.sequence_number, 17);
  assert.equal(view.received.sequence_number, 16);
  assert.equal(byId.sequence_number.outgoingValue, '17');
  assert.equal(byId.gps_lat.outgoingValue, '18.123456°');
  assert.equal(byId.gps_lon.outgoingValue, '99.654321°');
  assert.equal(byId.water_ph.outgoingValue, '7.25 pH');
  assert.equal(byId.water_turbidity.outgoingValue, '41.75 NTU');
  assert.equal(byId.water_temp.outgoingValue, '22.5 °C');
  assert.equal(byId.current_mode.outgoingValue, 'สำรวจตามจุดที่กำหนด');
  assert.equal(byId.battery_percent.outgoingValue, '85%');
  assert.equal(byId.heading_angle.outgoingValue, '270°');
  assert.equal(byId.sequence_number.receivedValue, '16');
  assert.equal(byId.gps_lat.receivedValue, '18.111111°');
  assert.equal(byId.gps_lon.receivedValue, '99.222222°');
  assert.equal(byId.water_ph.receivedValue, '6.5 pH');
  assert.equal(byId.water_turbidity.receivedValue, '12.25 NTU');
  assert.equal(byId.water_temp.receivedValue, '19.5 °C');
  assert.equal(byId.current_mode.receivedValue, 'สแกนก้นหอย');
  assert.equal(byId.battery_percent.receivedValue, '85%');
  assert.equal(byId.heading_angle.receivedValue, '180°');
  assert.match(view.outgoingStatus, /กำลังส่งชุดที่ 17/);
  assert.ok(view.currentReadings.includes('98 NTU'));
});

test('DATA does not call a queued report delivered and preserves the last received report on loss', () => {
  const presentation = require(path.join(root, 'src/js/overall/mission-presentation.js'));
  const queued = report(18, { water_turbidity: 70 });
  const received = codec.decodeTelemetry(codec.encodeTelemetry(report(16, { water_turbidity: 12.25 })));
  const transport = {
    active: { seq: 18, hex: encodedHex(queued), attempt: 0 },
    latestTx: { seq: 18, hex: encodedHex(queued) },
    rx: { sequence: 16, decoded: received }, phase: 'queued', stale: true,
    config: { lossAll: true }
  };
  const view = presentation.buildDataView({ water: { ph: NaN, ntu: 70, temp: 22 } }, transport, codec);
  assert.match(view.outgoingStatus, /กำลังเตรียมชุดที่ 18/);
  assert.doesNotMatch(view.outgoingStatus, /ฝั่งได้รับชุดที่ 18/);
  assert.equal(view.outgoing.sequence_number, 18);
  assert.equal(view.received.sequence_number, 16);
  assert.equal(view.fields.find(field => field.id === 'water_turbidity').receivedValue, '12.25 NTU');
  assert.match(view.receivedStatus, /ข้อมูลใหม่|ชุดที่ 16/);
});

test('DATA explains unavailable values and mode zero without exposing computer-language placeholders', () => {
  const presentation = require(path.join(root, 'src/js/overall/mission-presentation.js'));
  const invalidPacket = report(19, {
    gps_lat: NaN, gps_lon: NaN, water_ph: NaN, water_turbidity: NaN,
    water_temp: NaN, current_mode: 0, heading_angle: NaN
  });
  const view = presentation.buildDataView({ water: { ph: NaN, ntu: NaN, temp: NaN } }, {
    active: null, latestTx: { seq: 19, hex: encodedHex(invalidPacket) },
    rx: null, phase: 'failed', stale: false, config: { lossAll: true }
  }, codec);
  const byId = Object.fromEntries(view.fields.map(field => [field.id, field]));
  assert.equal(view.fields.length, 9);
  assert.equal(byId.gps_lat.outgoingValue, 'ยังไม่มีตำแหน่งที่ใช้ได้');
  assert.equal(byId.heading_angle.outgoingValue, 'ยังไม่มีทิศทางที่ใช้ได้');
  assert.equal(byId.water_ph.outgoingValue, 'ยังไม่มีค่าที่พร้อมเผยแพร่');
  assert.equal(byId.water_turbidity.outgoingValue, 'ยังไม่มีค่าที่พร้อมเผยแพร่');
  assert.match(byId.water_ph.description, /น้ำนิ่ง/);
  assert.match(byId.current_mode.outgoingValue, /เตรียมพร้อมหรือพักหลังจบภารกิจ/);
  assert.match(view.batteryNote, /BatteryMonitor/);
  assert.match(view.batteryNote, /แรงดัน pack/);
  const shown = [view.currentReadings, view.outgoingStatus, view.receivedStatus, view.batteryNote,
    view.sourceNote, view.roundingNote, view.timingNote,
    ...view.fields.flatMap(field => [field.label, field.description, field.outgoingValue, field.receivedValue])].join(' ');
  assert.doesNotMatch(shown, /NaN|null|undefined|SEQ|TX|RX|queued|posted|decoded|stale/);
});

test('DATA shows explicit no-report text instead of invented zero values', () => {
  const presentation = require(path.join(root, 'src/js/overall/mission-presentation.js'));
  const view = presentation.buildDataView({ water: { ph: NaN, ntu: NaN, temp: NaN } }, {
    active: null, latestTx: null, rx: null, phase: 'idle', stale: false
  }, codec);
  assert.equal(view.fields.length, 9);
  assert.ok(view.fields.every(field => field.outgoingValue === 'ยังไม่มีชุดข้อมูล'));
  assert.ok(view.fields.every(field => field.receivedValue === 'ยังไม่ได้รับ'));
  assert.equal(view.outgoingStatus, 'ยังไม่มีชุดข้อมูล');
  assert.equal(view.receivedStatus, 'ฝั่งยังไม่ได้รับข้อมูลชุดใหม่');
});

test('DATA markup keeps the causal explanation first and declares exactly nine plain-Thai report rows', () => {
  const panel = html.slice(html.indexOf('id="am-panel"'), html.indexOf('id="am-explanation"'));
  const explanationIndex = html.indexOf('id="am-explanation"');
  const tableIndex = html.indexOf('id="am-data-details"');
  assert.ok(/id="am-tab-data"[^>]*>ข้อมูลที่ส่ง</.test(html), 'DATA tab uses plain Thai');
  assert.ok(explanationIndex >= 0 && tableIndex > explanationIndex);
  assert.ok(html.includes('ข้อมูลจำลอง'), 'report scope is explicitly simulated');
  assert.equal((html.match(/data-report-field=/g) || []).length, 9);
  assert.doesNotMatch(panel, /"TX|"RX|queued|posted|decoded|stale/);
});

test('boat glyph is compact and has no protruding heading attachment', () => {
  const boat = html.match(/<g id="am-boat"[\s\S]*?<\/g>/)?.[0] || '';
  const home = html.match(/<g id="am-home"[\s\S]*?<\/g>/)?.[0] || '';
  assert.doesNotMatch(boat, /<circle\b/);
  assert.doesNotMatch(home, /<(?:circle|path)\b/);
  assert.match(boat, /M0 -13/);
  assert.doesNotMatch(html, /am-heading-(?:arrow|vector|error-arc)/);
  assert.match(html, /<script src="\.\.\/src\/js\/overall\/mission-presentation\.js/);
});
