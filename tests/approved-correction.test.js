'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../pages/overall.html'), 'utf8');
const visuals = require('../src/js/overall/overall-visual-motion.js');
const telemetry = require('../src/js/mission/mission-start-telemetry-model.js');
const missionJs = fs.readFileSync(path.join(__dirname, '../src/js/mission/mission-start.js'), 'utf8');
const missionCss = fs.readFileSync(path.join(__dirname, '../src/css/mission-start.css'), 'utf8');
const MissionStart = require('../src/js/mission/mission-start.js');
const MissionStartModel = require('../src/js/mission/mission-start-model.js');

test('PWM storyboard has a visible boat-yaw response before compass feedback in all 12 frames', () => {
  const svg = html.match(/<svg class="ov-pid-flow"[\s\S]*?<\/svg>/)?.[0] || '';
  assert.match(svg, /data-motion-boat-response/);
  assert.match(svg, /data-motion-compass/);
  assert.ok(svg.indexOf('data-motion-boat-response') < svg.indexOf('data-motion-compass'));
  assert.equal(visuals.storyboards.pwm.frames.length, 12);
  assert.ok(visuals.storyboards.pwm.frames.every(frame => frame.position.every(value => Number.isFinite(value))));
  assert.doesNotMatch(svg, /M365 90 L347 123 M391 90 L407 123/);
});

test('HOME caption sits below the ring and the moving marker is a compact arrow clear of the house', () => {
  const svg = html.match(/<svg class="ov-home-chart"[\s\S]*?<\/svg>/)?.[0] || '';
  const ring = svg.match(/<circle cx="(\d+)" cy="(\d+)" r="(\d+)"/);
  const distance = svg.match(/<text x="\d+" y="(\d+)" text-anchor="middle" class="ov-svg-label">ระยะ/);
  assert.ok(ring && distance);
  assert.ok(Number(distance[1]) > Number(ring[2]) + Number(ring[3]), 'distance caption must clear the radius');
  const boat = svg.match(/<g data-motion-boat[^>]*>([\s\S]*?)<\/g>/)?.[1] || '';
  assert.match(boat, /<path/);
  assert.doesNotMatch(boat, /<rect/);
  assert.equal(visuals.storyboards.home.frames.length, 9);
  assert.ok(visuals.storyboards.home.frames.slice(5).every(frame => frame.pwmStopped));
  assert.equal(visuals.storyboards.home.frames.at(-1).arrivalDwellSeconds, 3);
});

test('teaching packet projection preserves schema, unknowns, distinct sample sequences, and bounded event chronology', () => {
  let run = telemetry.createRun();
  const standby = { step: 4, gpsReady: false, homeSet: false, routeReady: false, acceptedStart: false, status: 'waiting-start' };
  run = telemetry.record(run, { actor: 'ทดสอบ', direction: 'เริ่มตัวอย่าง', action: 'เริ่ม storyboard', fromStep: 0, snapshot: standby, timeDeltaMs: 0 });
  const first = telemetry.project(run, standby);
  assert.equal(first.telemetry.water_ph, Number.NaN);
  assert.equal(first.telemetry.gps_lat, null);
  assert.equal(first.telemetry.battery_percent, null);
  assert.notEqual(first.telemetry.sequence_number, first.stage.sequence_number);
  assert.equal(first.stage.current_stage, 0);
  assert.equal(first.stage.expected_batch_index, null);
  for (let i = 0; i < telemetry.LOG_LIMIT + 3; i++) {
    run = telemetry.record(run, { actor: 'ผู้ควบคุม', direction: 'local', action: `event ${i}`, fromStep: 4, snapshot: standby });
  }
  assert.equal(run.log.length, telemetry.LOG_LIMIT);
  assert.equal(run.eventNo, telemetry.LOG_LIMIT + 4);
  const reset = telemetry.createRun();
  assert.equal(reset.eventNo, 0);
  assert.equal(reset.log.length, 0);
});

test('mission map has a visible simulated boat-to-shore packet and expandable chronological log panel', () => {
  const visualStart = html.indexOf('<div class="ms-visual-column">');
  const visual = html.slice(visualStart, html.indexOf('<p class="ms-teaching-note">', visualStart));
  for (const id of ['ms-uplink-panel', 'ms-telemetry-packet', 'ms-stage-packet', 'ms-event-log', 'ms-battery-schema']) assert.match(visual, new RegExp(`id="${id}"`));
  for (const field of ['sequence_number', 'gps_lat', 'gps_lon', 'water_ph', 'water_turbidity', 'water_temp', 'current_mode', 'battery_percent', 'heading_angle', 'current_stage', 'intent', 'next_stage', 'reason', 'flags', 'waypoint_count', 'waypoint_index', 'expected_batch_index']) assert.ok(visual.includes(field), `missing packet field ${field}`);
  assert.match(visual, /SIMULATED|จำลอง/);
  assert.match(visual, /<details[^>]*id="ms-battery-schema"/);
  assert.doesNotMatch(missionJs, /\.innerHTML\s*=/);
  assert.match(missionCss, /\.ms-uplink-panel/);
});

class FakeElement {
  constructor(id) { this.id=id; this.attrs={}; this.listeners={}; this.children=[]; this.classes=new Set(); this.disabled=false; this.checked=false; this.hidden=false; this.value=''; this._text='';
    this.classList={toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name)}; }
  set textContent(value) { this._text=String(value); if (this._text==='') this.children=[]; }
  get textContent() { return this._text; }
  setAttribute(key,value) { this.attrs[key]=String(value); }
  removeAttribute(key) { delete this.attrs[key]; }
  addEventListener(name,fn) { this.listeners[name]=fn; }
  removeEventListener(name) { delete this.listeners[name]; }
  appendChild(child) { this.children.push(child); return child; }
  dispatch(name,extra={}) { if(this.listeners[name]) this.listeners[name]({target:this,...extra}); }
  click() { if(!this.disabled) this.dispatch('click'); }
}

function makeMissionDom() {
  const byId=new Map(); const put=id=>{const el=new FakeElement(id);byId.set(id,el);return el;};
  const root=put('mission-start'); const steps=Array.from({length:8},(_,i)=>put(`step-${i}`));
  root.querySelectorAll=selector=>selector==='.ms-step'?steps:[];
  const ids=['ms-stage','ms-title','ms-explanation','ms-status','ms-ready-gps','ms-ready-home','ms-ready-route','ms-gps-ready','ms-start-btn','ms-play','ms-next','ms-reset','ms-signal','ms-pwm-value','ms-boat','ms-continue','ms-log-count','ms-event-log','ms-tel-sequence','ms-tel-lat','ms-tel-lon','ms-tel-ph','ms-tel-turbidity','ms-tel-temp','ms-tel-mode','ms-tel-battery','ms-tel-heading','ms-stage-sequence','ms-stage-current','ms-stage-intent','ms-stage-next','ms-stage-reason','ms-stage-flags','ms-stage-wp-count','ms-stage-wp-index','ms-stage-batch'];
  ids.forEach(put);
  const doc={hidden:false,listeners:{},getElementById:id=>byId.get(id)||null,createElement:tag=>new FakeElement(tag),addEventListener(name,fn){this.listeners[name]=fn;},emit(name){this.listeners[name]?.();}};
  const timers=[]; const media={matches:false,addEventListener(){}};
  const env={MissionStartTelemetry:telemetry,matchMedia:()=>media,setTimeout(fn){timers.push(fn);return timers.length;},clearTimeout(){}};
  return {doc,byId,timers,env};
}

test('START rejection logs once, readiness needs a new explicit START, reset restarts sequences, and playback logs', () => {
  const {doc,byId,timers,env}=makeMissionDom();
  const view=MissionStart.install(doc,{},MissionStartModel,env);
  byId.get('ms-next').click();
  byId.get('ms-gps-ready').click();
  byId.get('ms-next').click(); byId.get('ms-next').click();
  byId.get('ms-ready-route').checked=false;byId.get('ms-ready-route').dispatch('change');
  byId.get('ms-start-btn').click();
  assert.equal(view.getSnapshot().acceptedStart,false);
  const afterReject=byId.get('ms-event-log').children.length;
  for(const id of ['ms-ready-gps','ms-ready-home','ms-ready-route']) { const input=byId.get(id);input.checked=true;input.dispatch('change'); }
  assert.equal(view.getSnapshot().acceptedStart,false,'readiness change cannot reuse rejected START');
  byId.get('ms-start-btn').click();
  assert.equal(view.getSnapshot().acceptedStart,true,'only the second explicit START is accepted');
  assert.ok(byId.get('ms-event-log').children.length>afterReject);
  byId.get('ms-reset').click();
  assert.equal(byId.get('ms-event-log').children.length,1,'reset clears history then records one deterministic reset event');
  const resetLine=byId.get('ms-event-log').children[0].textContent;
  doc.hidden=true;doc.emit('visibilitychange');
  assert.equal(byId.get('ms-event-log').children.length,1,'render-only visibility refresh adds no event');
  doc.hidden=false;doc.emit('visibilitychange');
  byId.get('ms-play').click();
  assert.ok(timers.length>0);
  timers.at(-1)();
  assert.equal(view.getSnapshot().step,1);
  assert.equal(byId.get('ms-event-log').children.length,2,'one playback tick adds one event');
  assert.match(resetLine,/21.*4/);
  view.destroy();
});
