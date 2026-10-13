'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const StoryModel = require('../site/story-model.js');

test('prepared illustrative fixture waits for START with only HOME missing', () => {
  assert.equal(typeof StoryModel.createStory, 'function');
  const story = StoryModel.createStory();
  assert.deepEqual(story.getSnapshot(), {
    missionStep: 4,
    gpsReady: true,
    homeSet: false,
    routeReady: true,
    acceptedStart: false,
    motorsActive: false,
    boatMoved: false,
    scene: 0,
    packet: 'idle',
    effect: 'idle'
  });
});

test('scene selection changes only the view and preserves mission state', () => {
  const story = StoryModel.createStory();
  const before = story.getSnapshot();
  story.selectScene(3);
  const after = story.getSnapshot();
  assert.equal(after.scene, 3);
  assert.equal(after.missionStep, before.missionStep);
  assert.equal(after.gpsReady, before.gpsReady);
  assert.equal(after.homeSet, before.homeSet);
  assert.equal(after.routeReady, before.routeReady);
  assert.equal(after.acceptedStart, before.acceptedStart);
});

test('restoring HOME alone changes readiness but never accepts START', () => {
  const story = StoryModel.createStory();
  story.setReadiness('homeSet', true);
  const snapshot = story.getSnapshot();
  assert.equal(snapshot.homeSet, true);
  assert.equal(snapshot.missionStep, 4);
  assert.equal(snapshot.acceptedStart, false);
  assert.equal(snapshot.motorsActive, false);
  assert.equal(snapshot.boatMoved, false);
});

test('each missing readiness check blocks START until the user resends it', () => {
  for (const missing of ['gpsReady', 'homeSet', 'routeReady']) {
    const story = StoryModel.createStory();
    for (const key of ['gpsReady', 'homeSet', 'routeReady']) story.setReadiness(key, true);
    story.setReadiness(missing, false);
    story.sendStart();
    let snapshot = story.getSnapshot();
    assert.equal(snapshot.missionStep, 4, `${missing} keeps source at waiting START`);
    assert.equal(snapshot.acceptedStart, false);
    assert.equal(snapshot.motorsActive, false);
    assert.equal(snapshot.boatMoved, false);
    assert.equal(snapshot.packet, 'blocked');

    story.setReadiness(missing, true);
    snapshot = story.getSnapshot();
    assert.equal(snapshot.missionStep, 4);
    assert.equal(snapshot.acceptedStart, false);
    assert.equal(snapshot.packet, 'blocked');

    story.sendStart();
    snapshot = story.getSnapshot();
    assert.equal(snapshot.missionStep, 5);
    assert.equal(snapshot.acceptedStart, true);
    assert.equal(snapshot.motorsActive, false);
    assert.equal(snapshot.boatMoved, false);
    assert.equal(snapshot.packet, 'accepted');
  }
});

test('effects advance permission to motors to movement one source step at a time', () => {
  const story = StoryModel.createStory();
  story.nextEffect();
  assert.equal(story.getSnapshot().missionStep, 4);
  assert.equal(story.getSnapshot().effect, 'idle');

  story.setReadiness('homeSet', true);
  story.sendStart();
  assert.equal(story.getSnapshot().missionStep, 5);
  story.nextEffect();
  assert.equal(story.getSnapshot().missionStep, 6);
  assert.equal(story.getSnapshot().motorsActive, true);
  assert.equal(story.getSnapshot().boatMoved, false);
  assert.equal(story.getSnapshot().effect, 'motors');
  story.nextEffect();
  assert.equal(story.getSnapshot().missionStep, 7);
  assert.equal(story.getSnapshot().motorsActive, true);
  assert.equal(story.getSnapshot().boatMoved, true);
  assert.equal(story.getSnapshot().effect, 'movement');
  story.nextEffect();
  assert.equal(story.getSnapshot().missionStep, 7);
});

test('reset after blocked and completed states restores the exact first scene', () => {
  const story = StoryModel.createStory();
  story.sendStart();
  story.selectScene(2);
  assert.deepEqual(story.reset(), {
    missionStep: 4, gpsReady: true, homeSet: false, routeReady: true,
    acceptedStart: false, motorsActive: false, boatMoved: false,
    scene: 0, packet: 'idle', effect: 'idle'
  });

  story.setReadiness('homeSet', true);
  story.sendStart();
  story.nextEffect();
  story.nextEffect();
  story.selectScene(3);
  assert.deepEqual(story.reset(), {
    missionStep: 4, gpsReady: true, homeSet: false, routeReady: true,
    acceptedStart: false, motorsActive: false, boatMoved: false,
    scene: 0, packet: 'idle', effect: 'idle'
  });
  story.reset();
  assert.equal(story.getSnapshot().boatMoved, false);
});
