'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../site/story.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../site/story.css'), 'utf8');

test('story page exposes four picture-first scenes and the required experiment controls', () => {
  for (const id of ['story-root', 'story-start', 'story-next-effect', 'story-reset', 'story-ready-gps', 'story-ready-home', 'story-ready-route', 'story-scene-0', 'story-scene-1', 'story-scene-2', 'story-scene-3', 'story-message', 'story-map', 'story-boat']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing ${id}`);
  }
  assert.equal((html.match(/data-story-panel=/g) || []).length, 4);
  assert.match(html, /model-only/i);
  assert.match(css, /prefers-reduced-motion/);
});

test('route diagram keeps the confirmed wide snake coordinates and arrow-only marker', () => {
  for (const point of ['335 455', '440 170', '440 280', '440 390', '665 390', '665 280', '665 170', '890 170', '890 280', '890 390']) {
    assert.ok(html.includes(point), `missing map point ${point}`);
  }
  assert.match(html, /id="story-boat"[^>]*transform="translate\(335 455\)"/);
  assert.match(html, /M0 0L-26-12L-19 0L-26 12Z/);
  assert.doesNotMatch(html, /hull|propeller/i);
});
