'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'pages/overall.html'), 'utf8');
const mission = fs.readFileSync(path.join(root, 'src/js/overall/autonomous-mission.js'), 'utf8');
const adapter = fs.readFileSync(path.join(root, 'src/js/overall/overall-completion.js'), 'utf8');
const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match => match[1]);

test('Overall boots the function-owned view and isolated labs without mounting retired storyboard controllers', () => {
  const visual = scripts.findIndex(src => src.startsWith('../src/js/overall/overall-visual-motion.js?'));
  const labsModel = scripts.indexOf('../src/js/overall/overall-labs-model.js?v=overall-labs-1');
  const labs = scripts.indexOf('../src/js/overall/overall-labs.js?v=overall-labs-1');
  const kernelOwner = scripts.indexOf('../src/js/overall/autonomous-mission.js?v=autonomous-mission-1');
  const functionView = scripts.indexOf('../src/js/overall/function-centered-overall.js?v=function-center-2');
  assert.ok(visual >= 0 && labsModel > visual && labs > labsModel && functionView > kernelOwner);
  assert.ok(!scripts.some(src => src.includes('overall-completion.js')), 'retired OPERATE projection is no longer mounted');
  assert.ok(!scripts.some(src => /(?:^|\/)(?:overall|mission-start)\.js(?:\?|$)/.test(src)));
});

test('Operate delegates every mission action to the canonical mission API and projects accepted snapshots only', () => {
  assert.match(adapter, /dispatch\(\{type: s\.playing \? 'pause' : 'start'\}\)/);
  for (const action of ['step', 'reset', 'speed']) assert.ok(adapter.includes(`type: '${action}'`), `missing canonical ${action} action`);
  assert.match(adapter, /mission\.subscribe\(observe\)/);
  assert.match(adapter, /acceptedRoute/);
  assert.match(adapter, /snapshot\.position/);
  assert.doesNotMatch(adapter, /requestAnimationFrame|setInterval|SystemMission|UplinkMotion|OverallModel/);
  assert.match(mission, /subscribe\(listener\)/);
  assert.match(mission, /snapshotListeners\.size>=8/);
  assert.match(mission, /listener\(M\.clone\(snapshot\)\)/);
  assert.match(mission, /resetInProgress\|\|!snapshotListeners\.size/);
  assert.match(mission, /finally\s*\{\s*resetInProgress=false/);
  assert.match(adapter, /setAttribute\('visibility', route\.length \? 'visible' : 'hidden'\)/);
});

test('Historical inspection is bounded and never dispatches a rewind or teleport action', () => {
  assert.match(adapter, /const historyLimit = 1200/);
  assert.match(adapter, /HISTORICAL · READ ONLY/);
  assert.match(adapter, /canonical mission ไม่เปลี่ยน/);
  assert.match(adapter, /option\.disabled = !item/);
  assert.match(adapter, /รอให้ state นี้เกิดขึ้นจริง/);
  assert.doesNotMatch(adapter, /dispatch\(\{\s*type:\s*['"](?:back|rewind|teleport|checkpoint)['"]/);
});

test('Learn and Operate aliases scroll to their native sections while legacy mission anchors remain mapped', () => {
  for (const id of ['learn', 'overview', 'operate', 'mission-start', 'ms-uplink-panel']) {
    assert.match(mission, new RegExp(`\\['${id}',\\{mode:`));
  }
  assert.match(mission, /byId\(alias\.target\)\|\|root/);
  assert.match(html, /id="sim-pose-readout"/);
  assert.match(html, /id="sim-history-status"/);
});
