'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'pages/overall.html'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'src/js/overall/autonomous-mission.js'), 'utf8');
const cssPath = path.join(root, 'src/css/overall-instrument.css');
const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';

test('Overall instrument base precedes its approved final function-flow layer and remains page-scoped', () => {
  assert.ok(fs.existsSync(cssPath), 'the Overall-only instrument stylesheet exists');
  const stylesheets = [...html.matchAll(/<link\s+rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)].map(match => match[1]);
  assert.ok(stylesheets.includes('../src/css/overall-instrument.css?v=data-report-2'));
  assert.equal(stylesheets.at(-1), '../src/css/function-flow.css?v=function-flow-1');
  assert.match(css, /\.autonomous-mission/);
  assert.doesNotMatch(css, /(^|[},])\s*(?:html|body|:root)\s*[{,]/m);
});

test('playing-state emphasis follows the live mission snapshot, not an independent timer', () => {
  assert.ok(/root\.dataset\.playing\s*=\s*String\(v\.playing\)/.test(controller), 'render mirrors live mission playing state');
  assert.match(css, /\.autonomous-mission\[data-playing="true"\][^{]*\{/);
  assert.match(css, /am-target-focus/);
  assert.match(css, /am-followed-route/);
  assert.doesNotMatch(css, /@keyframes\s+[^\s{]+[\s\S]*?(?:boat|map)[\s\S]*?transform\s*:/i);
});

test('pause, hidden-page pause, reset and reduced motion stop nonessential animation', () => {
  assert.ok(/root\.dataset\.playing\s*=\s*String\(v\.playing\)/.test(controller), 'pause/reset/hidden transitions all render the hook');
  assert.match(css, /\.autonomous-mission\[data-playing="false"\][^{]*\{[^}]*animation:\s*none/i);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation:\s*none\s*!important/i);
  assert.match(css, /transition:\s*[^;]*\b(?:140|150|160|170|180|190|200)ms/i);
});

test('instrument controls preserve touch targets, focus indication and legible readouts', () => {
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /font-size:\s*(?:14|15|16|17|18)px/);
});
