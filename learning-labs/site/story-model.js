'use strict';
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StoryModel = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const Mission = typeof module === 'object' && module.exports
    ? require('./mission-start-model.js')
    : window.MissionStartModel;

  function createFixture() {
    let mission = Mission.createState();
    mission = Mission.advance(mission);
    mission = Mission.simulateGpsReady(mission);
    mission = Mission.advance(mission);
    mission = Mission.advance(mission);
    return Mission.setReadiness(mission, 'homeSet', false);
  }

  function createStory() {
    let mission = createFixture();
    let scene = 0;
    let packet = 'idle';
    let effect = 'idle';

    function getSnapshot() {
      return {
        missionStep: mission.step,
        gpsReady: mission.gpsReady,
        homeSet: mission.homeSet,
        routeReady: mission.routeReady,
        acceptedStart: mission.acceptedStart,
        motorsActive: Mission.motorsActive(mission),
        boatMoved: Mission.boatMoved(mission),
        scene,
        packet,
        effect
      };
    }

    function selectScene(index) {
      if (Number.isInteger(index) && index >= 0 && index <= 3) scene = index;
      return getSnapshot();
    }

    function setReadiness(key, value) {
      if (mission.step === 4) mission = Mission.setReadiness(mission, key, value);
      return getSnapshot();
    }

    function sendStart() {
      if (mission.step === 4) {
        mission = Mission.acceptStart(mission);
        packet = mission.acceptedStart ? 'accepted' : 'blocked';
      }
      return getSnapshot();
    }

    function nextEffect() {
      if (mission.step === 5 || mission.step === 6) {
        mission = Mission.advance(mission);
        effect = mission.step === 6 ? 'motors' : 'movement';
      }
      return getSnapshot();
    }

    function reset() {
      mission = createFixture();
      scene = 0;
      packet = 'idle';
      effect = 'idle';
      return getSnapshot();
    }

    return { getSnapshot, selectScene, setReadiness, sendStart, nextEffect, reset };
  }

  return Object.freeze({ createStory });
});
