const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const explorer = fs.readFileSync(path.join(root, 'pages/system-explorer.html'), 'utf8');
const overallMission = require('../src/js/overall/autonomous-mission-model.js');

test('mission presentation starts paused in whole-scene focus with one shared control surface', () => {
  assert.match(explorer, /id="explorer" class="explorer" data-level="whole"/);
  assert.match(explorer, /id="mission-focus"/);
  for (const id of ['sim-start','sim-play','sim-step','sim-reset','sim-ready','sim-gps-receiving','sim-gps-sats','sim-gps-hdop','sim-compass-fresh','sim-clear-estop','sim-water-ntu','sim-water-valid','sim-water-summary','sim-boat','sim-target','sim-trail']) {
    assert.match(explorer, new RegExp(`id="${id}"`));
  }
  assert.match(explorer, /HOME ไม่ใช่ gate/);
  assert.match(explorer, /Live SET_HOME capture NOT IMPLEMENTED/);
});

test('survey route reuses the approved Overall waypoint geometry and order exactly', () => {
  const original = overallMission.WAYPOINTS.map(({x,y},index) => [index + 1, x, y]);
  const route = [...explorer.matchAll(/class="survey-waypoint" data-survey-wp="(\d+)" data-source-x="(\d+)" data-source-y="(\d+)" transform="translate\((\d+) (\d+)\)"/g)]
    .map(([, index, sourceX, sourceY, x, y]) => [Number(index), Number(sourceX), Number(sourceY), Number(x), Number(y)]);
  const sourceRoute = route.map(([index, sourceX, sourceY]) => [index, sourceX, sourceY]);
  assert.deepEqual(original, [
    [1, 440, 170], [2, 440, 280], [3, 440, 390],
    [4, 665, 390], [5, 665, 280], [6, 665, 170],
    [7, 890, 170], [8, 890, 280], [9, 890, 390],
  ]);
  assert.deepEqual(sourceRoute, original);
  for (const [, sourceX, sourceY, x, y] of route) {
    assert.equal(x,sourceX);
    assert.equal(y,sourceY);
  }
  const mapTransform = explorer.match(/id="survey-coordinate-system" transform="([^"]+)"/)?.[1];
  const boatTransform = explorer.match(/id="mission-dynamics" transform="([^"]+)"/)?.[1];
  assert.ok(mapTransform, 'the map has one explicit presentation transform');
  assert.match(mapTransform, /^translate\(-?[\d.]+ -?[\d.]+\) scale\([\d.]+\)$/);
  assert.equal(boatTransform, mapTransform, 'boat, trail and targets use the identical uniform transform as HOME and waypoints');
  assert.match(explorer, /id="survey-home-marker" transform="translate\(335 455\)"/);
  assert.match(explorer, /id="shore-station" transform="translate\(291\.3 109\.8\) scale\(\.7\)"/);
  assert.doesNotMatch(explorer, /id="story-(?:whole|navigation|heading)"/);
  assert.match(explorer, /GRID 3 × 3 · 9 จุด/);
  assert.match(explorer, /ลำดับเดิม WP1 ถึง WP9 · schematic/);
});

test('renderer literal element references exist in the production page', () => {
  const renderer = fs.readFileSync(path.join(root, 'src/js/explorer/boat-mission-ui.js'), 'utf8');
  const ids = new Set([...explorer.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
  const consumers = new Set([...renderer.matchAll(/\bel\('([^']+)'\)/g)].map(match => match[1]));
  assert.ok(consumers.size > 20, 'check the real renderer rather than an empty fixture');
  for (const id of consumers) assert.ok(ids.has(id), `missing renderer element: ${id}`);
});

test('mission page loads the new local model and renderer without remote assets', () => {
  assert.match(explorer, /src="\.\.\/src\/js\/explorer\/boat-mission-model\.js"/);
  assert.match(explorer, /src="\.\.\/src\/js\/explorer\/boat-mission-ui\.js"/);
  assert.match(explorer, /href="\.\.\/src\/css\/boat-mission\.css"/);
  assert.match(explorer, /href="\.\.\/src\/css\/system-explorer\.css"/);
  assert.match(explorer, /ไม่ใช่ full firmware LOS\/GRID/);
  assert.match(explorer, /ไม่ใช่ PWM\/แรงขับจริง/);
  assert.doesNotMatch(explorer,/src="\.\.\/src\/js\/explorer\/system-explorer\.js"/);
  assert.doesNotMatch(explorer, /<script[^>]+https?:|<link[^>]+https?:/);
});
