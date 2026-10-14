'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const StoryView = require('../src/js/story/story.js');
const StoryModel = require('../src/js/story/story-model.js');

class Element {
  constructor(id, dataset = {}) {
    this.id = id; this.dataset = { ...dataset }; this.attrs = {}; this.listeners = {};
    this.textContent = ''; this.checked = false; this.disabled = false; this.hidden = false;
    this.classes = new Set(); this.replays = 0; this.layoutReads = 0; this.offsetWidth = undefined;
    this.classList = { add: (value) => { this.classes.add(value); this.replays++; }, remove: (value) => this.classes.delete(value), contains: (value) => this.classes.has(value) };
  }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  addEventListener(name, handler) { this.listeners[name] = handler; }
  removeEventListener(name) { delete this.listeners[name]; }
  getBoundingClientRect() { this.layoutReads++; return { width: 1 }; }
  closest() { return this; }
  matches() { return false; }
  focus() {}
}

function makeDOM() {
  const byId = new Map();
  const put = (id, data) => { const el = new Element(id, data); byId.set(id, el); return el; };
  const panels = [0, 1, 2, 3].map((i) => put(`panel-${i}`, { storyPanel: String(i) }));
  const scenes = [0, 1, 2, 3].map((i) => put(`scene-${i}`, { scene: String(i) }));
  for (const id of ['story-message','story-boat','story-map','story-home-label','story-readiness-note','story-map-note','story-ready-gps','story-ready-home','story-ready-route','story-start','story-next-effect','story-reset','story-scene0-motor','story-packet','story-packet-2','story-ready-node-gps','story-ready-node-home','story-ready-node-route','story-ready-text-gps','story-ready-text-home','story-ready-text-route','story-ready-link-gps','story-ready-link-home','story-ready-link-route']) put(id);
  for (const id of ['permission','motors','movement']) put(`indicator-${id}`, { indicator: id });
  const root = new Element('story-root');
  root.contains = () => true;
  root.querySelector = (selector) => {
    const indicator = selector.match(/^\[data-indicator="([^"]+)"\]$/);
    return byId.get(indicator ? `indicator-${indicator[1]}` : selector.replace(/^#/, '')) || null;
  };
  root.querySelectorAll = (selector) => selector === '[data-story-panel]' ? panels : selector === '[data-scene]' ? scenes : [];
  root.addEventListener = (name, handler) => { root.listeners[name] = handler; };
  root.removeEventListener = (name) => { delete root.listeners[name]; };
  root.emit = (name, id, extra = {}) => root.listeners[name]({ target: byId.get(id), key: extra.key, preventDefault() {} });
  return { root, byId };
}

test('readiness SVG nodes and links follow source flags; restored HOME still waits for a new START', () => {
  const { root, byId } = makeDOM();
  const view = StoryView.mountStory(root, StoryModel);
  assert.equal(byId.get('story-ready-node-gps').dataset.state, 'ready');
  assert.equal(byId.get('story-ready-node-home').dataset.state, 'missing');
  assert.equal(byId.get('story-ready-node-route').dataset.state, 'ready');
  assert.equal(byId.get('story-ready-link-home').dataset.state, 'missing');
  root.emit('click', 'story-start');
  assert.equal(view.getSnapshot().acceptedStart, false);
  byId.get('story-ready-home').checked = true;
  root.emit('change', 'story-ready-home');
  assert.equal(byId.get('story-ready-node-home').dataset.state, 'ready');
  assert.equal(view.getSnapshot().acceptedStart, false);
  assert.match(byId.get('story-message').textContent, /START ใหม่/);
  view.destroy();
});

test('scene zero reports the live source motor state after revisiting it at step seven', () => {
  const { root, byId } = makeDOM();
  StoryView.mountStory(root, StoryModel);
  byId.get('story-ready-home').checked = true;
  root.emit('change', 'story-ready-home');
  root.emit('click', 'story-start');
  root.emit('click', 'story-next-effect');
  root.emit('click', 'story-next-effect');
  root.emit('click', 'scene-0');
  assert.equal(byId.get('story-scene0-motor').textContent, 'มอเตอร์ทำงาน');
});

test('movement uses one endpoint transform with a WP1 heading and blocked packets replay without timers', () => {
  const { root, byId } = makeDOM();
  const view = StoryView.mountStory(root, StoryModel);
  root.emit('click', 'story-start');
  assert.equal(byId.get('story-packet').classList.contains('is-sending'), true);
  assert.equal(view.getSnapshot().missionStep, 4);
  const firstReplay = byId.get('story-packet').replays;
  root.emit('click', 'story-start');
  assert.equal(byId.get('story-packet').replays, firstReplay + 1);
  assert.equal(view.getSnapshot().boatMoved, false);
  byId.get('story-ready-home').checked = true;
  root.emit('change', 'story-ready-home');
  root.emit('click', 'story-start');
  root.emit('click', 'story-next-effect');
  root.emit('click', 'story-next-effect');
  assert.equal(view.getSnapshot().boatMoved, true);
  assert.match(byId.get('story-boat').attrs.transform, /^translate\(440 170\) rotate\(-69\.8\)$/);
  view.destroy();
});

test('repeated blocked START forces an SVG-supported layout read for a fresh packet animation', () => {
  const { root, byId } = makeDOM();
  StoryView.mountStory(root, StoryModel);
  root.emit('click', 'story-start'); root.emit('click', 'story-start');
  assert.equal(byId.get('story-packet-2').layoutReads, 2);
});

test('focused diagram viewport keeps native pan arrows without changing the scene', () => {
  const {root}=makeDOM(); const view=StoryView.mountStory(root,StoryModel);
  const target={matches:s=>s.includes('.diagram-viewport')};
  root.listeners.keydown({target,key:'ArrowRight',preventDefault(){}});
  assert.equal(view.getSnapshot().scene,0);
});

test('desktop composition keeps the compact navigation, stage, and controls together', () => {
  const html = fs.readFileSync(path.join(__dirname, '../pages/story.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../src/css/story.css'), 'utf8');
  assert.ok(html.indexOf('class="chapters"') < html.indexOf('class="stage"'));
  assert.ok(html.indexOf('class="stage"') < html.indexOf('class="experiment"'));
  assert.match(html, /MODEL ONLY/);
  assert.match(css, /grid-template-columns/);
  assert.match(css, /prefers-reduced-motion/);
});
