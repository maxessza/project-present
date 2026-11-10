const test = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../src/js/explorer/boat-mission-model.js');

function readyMission(home = false) {
  let state = Model.readyPreset(Model.createMission());
  if (!home) state = Model.setHome(state, false);
  return state;
}
function arm(state) { return Model.step(Model.start(state), 1); }

test('GPS thresholds and loss tiers match the bounded firmware reference', () => {
  let s = readyMission();
  s = Model.setGps(s, { sats:5 }); assert.equal(Model.snapshot(s).readiness.gps, false);
  s = Model.setGps(s, { sats:6, hdop:1.99, sampleAgeMs:2000 }); assert.equal(Model.snapshot(s).readiness.gps, true);
  s = Model.setGps(s, { hdop:2 }); assert.equal(Model.snapshot(s).readiness.gps, false);
  s = Model.setGps(s, { hdop:1.99, sampleAgeMs:2001 }); assert.equal(Model.snapshot(s).readiness.gps, false);
  s = Model.setGps(s, { sampleAgeMs:0, receiving:true });
  s = Model.setGps(s, { receiving:false });
  s = Model.step(s, 39); assert.equal(Model.snapshot(s).gps.tier, 'OK');
  s = Model.step(s, 1); assert.equal(Model.snapshot(s).gps.tier, 'SAFE_STOP');
  s = Model.step(s, 200); assert.equal(Model.snapshot(s).gps.ageMs, 60000); assert.equal(Model.snapshot(s).gps.tier, 'SAFE_STOP');
  s = Model.step(s, 240); assert.equal(Model.snapshot(s).gps.tier, 'GPS_FAULT'); assert.equal(Model.snapshot(s).mode, 'ESTOP');
});

test('invalid-quality GPS reception does not refresh the last-valid timestamp', () => {
  let s = readyMission();
  const lastValidAtMs = Model.snapshot(s).gps.lastValidAtMs;
  s = Model.setGps(s, { sats:5, receiving:true });
  assert.equal(Model.snapshot(s).gps.lastValidAtMs, lastValidAtMs);
  s = Model.step(s, 1);
  assert.equal(Model.snapshot(s).gps.lastValidAtMs, lastValidAtMs);
  assert.equal(Model.snapshot(s).gps.ageMs, 250);
});

test('a silent receiver preserves an accepted fix through age 2000ms, then loses navigation after expiry', () => {
  let s = Model.setGps(readyMission(), { receiving:false });
  assert.equal(Model.snapshot(s).readiness.gps,true);
  s = Model.step(s,8);
  assert.equal(Model.snapshot(s).gps.ageMs,2000);
  assert.equal(Model.snapshot(s).readiness.gps,true);
  s = Model.step(s,1);
  assert.equal(Model.snapshot(s).gps.ageMs,2250);
  assert.equal(Model.snapshot(s).readiness.gps,false);
});

test('compass readiness requires present, fresh, fewer than five failures and finite heading only', () => {
  let s = readyMission();
  s = Model.setCompass(s, { calibrationLoaded:false }); assert.equal(Model.snapshot(s).readiness.compass, true);
  for (const [patch, expected] of [[{present:false},false],[{present:true,fresh:false},false],[{fresh:true,failCount:4},true],[{failCount:5},false],[{failCount:0,headingDeg:NaN},false]]) {
    s = Model.setCompass(s, patch); assert.equal(Model.snapshot(s).readiness.compass, expected);
  }
});

test('START remains pending until recovery, does not require HOME, and delays motion until the next tick', () => {
  let s = Model.createMission();
  s = Model.setCompass(s, {present:true,fresh:true,headingDeg:0});
  s = Model.start(s); s = Model.step(s,1);
  assert.equal(Model.snapshot(s).mode,'STANDBY'); assert.equal(Model.snapshot(s).pendingStart,true);
  s = Model.setGps(s,{receiving:true,locationValid:true,sats:6,hdop:1.99,sampleAgeMs:0});
  const before = Model.snapshot(s).position;
  s = Model.step(s,1);
  assert.equal(Model.snapshot(s).mode,'GRID'); assert.equal(Model.snapshot(s).pendingStart,false);
  assert.deepEqual(Model.snapshot(s).position,before);
  assert.equal(Model.snapshot(s).home,null);
  s = Model.step(s,1); assert.notDeepEqual(Model.snapshot(s).position,before);
});

test('navigation loss neutralizes drive without changing mission mode; explicit clear requires fresh GPS', () => {
  let s = arm(readyMission()); s = Model.step(s,1);
  s = Model.setGps(s,{receiving:false}); s = Model.step(s,9);
  assert.equal(Model.snapshot(s).mode,'GRID'); assert.equal(Model.snapshot(s).speedMps,0);
  s = Model.setGps(s,{receiving:true,locationValid:true,sats:8,hdop:1,sampleAgeMs:0});
  s = Model.emergency(s); s = Model.setGps(s,{receiving:false});
  assert.match(Model.snapshot(Model.clearEstop(s)).lastTransition,/GPS สด/);
  s = Model.setSafety(s,'NORMAL');
  const recovered = Model.clearEstop(s);
  assert.equal(Model.snapshot(recovered).mode,'STANDBY');
});

test('turn command controls the visible path through coupled heading and surge integration', () => {
  let s = arm(readyMission(false));
  const before = Model.snapshot(s);
  s = Model.step(s,1);
  const after = Model.snapshot(s);
  assert.notDeepEqual(after.position,before.position);
  assert.notEqual(after.heading,before.heading);
  assert.equal(after.steering.targetBearing,before.targetBearing);
  assert.equal(after.plantLabel,'illustrative coupled turn + surge; normalized request, not PWM/thrust');
});

test('full clean route observes each 2-waypoint sample hold and returns HOME through dwell', () => {
  let s = arm(readyMission(true));
  const holds = new Set();
  for (let i=0; i<5000 && Model.snapshot(s).mode!=='STANDBY'; i+=1) {
    s = Model.step(s,1);
    const view=Model.snapshot(s);
    if (view.hold) holds.add(view.waypointIndex);
  }
  const view=Model.snapshot(s);
  assert.equal(view.mode,'STANDBY');
  assert.deepEqual([...holds].sort((a,b)=>a-b),[2,4,6,8]);
  assert.ok(view.homeDistanceM <= 4.01);
  assert.ok(view.clockMs > 0);
  assert.equal(view.water.trigger,false);
});

test('dirty route needs a full rolling eight-sample average >50 NTU, auto-enters SPIRAL after WP1, and clean dwell resumes GRID', () => {
  let s=arm(readyMission(true));
  for(let i=0;i<1000&&Model.snapshot(s).waypointIndex<1;i+=1)s=Model.step(s,1);
  assert.equal(Model.snapshot(s).waypointIndex,1);
  s=Model.setWater(s,{valid:false}); s=Model.step(s,1);
  s=Model.setWater(s,{valid:true,inputNtu:60}); s=Model.step(s,7);
  assert.equal(Model.snapshot(s).water.sampleCount,7);
  assert.equal(Model.snapshot(s).water.trigger,false);
  assert.equal(Model.snapshot(s).mode,'GRID');
  s=Model.step(s,1);
  assert.equal(Model.snapshot(s).water.sampleCount,8);
  assert.equal(Model.snapshot(s).water.meanNtu,60);
  assert.equal(Model.snapshot(s).water.trigger,true);
  assert.equal(Model.snapshot(s).mode,'SPIRAL');
  s=Model.setWater(s,{inputNtu:5}); s=Model.step(s,42);
  assert.equal(Model.snapshot(s).mode,'GRID');
  assert.equal(Model.snapshot(s).waypointIndex,1);
  assert.ok(Model.snapshot(s).water.cooldownUntilMs>Model.snapshot(s).clockMs);
  s=Model.setWater(s,{inputNtu:60}); s=Model.step(s,8);
  assert.equal(Model.snapshot(s).mode,'GRID');
  assert.equal(Model.snapshot(s).water.trigger,false);
});

test('explicit post-WP1 SPIRAL demo returns to the pending GRID waypoint', () => {
  let s = arm(readyMission(false));
  for (let i=0;i<1000 && Model.snapshot(s).waypointIndex<1;i+=1) s=Model.step(s,1);
  assert.equal(Model.snapshot(s).waypointIndex,1);
  s=Model.forceSpiral(s);
  assert.equal(Model.snapshot(s).mode,'SPIRAL');
  assert.equal(Model.snapshot(s).spiralIndex,0);
  const resumeIndex=Model.snapshot(s).waypointIndex;
  const visited=new Set();
  for (let i=0;i<4000 && Model.snapshot(s).mode==='SPIRAL';i+=1) {
    visited.add(Model.snapshot(s).spiralIndex);
    s=Model.step(s,1);
  }
  assert.equal(Model.snapshot(s).mode,'GRID');
  assert.equal(Model.snapshot(s).waypointIndex,resumeIndex);
  assert.deepEqual([...visited].sort((a,b)=>a-b),Array.from({length:25},(_,i)=>i));
});

test('outbound GRID accumulates and latches HOME departure before RTH', () => {
  const s = Model.step(arm(readyMission(true)),100);
  const view=Model.snapshot(s);
  assert.equal(view.mode,'GRID');
  assert.ok(view.homeDistanceM>=12);
  assert.equal(view.departed,true);
  assert.ok(view.departedMs>=2000);
});

test('fixed-step bounds reject unsafe/unbounded requests', () => {
  assert.throws(()=>Model.step(Model.createMission(),0),RangeError);
  assert.throws(()=>Model.step(Model.createMission(),10001),RangeError);
});