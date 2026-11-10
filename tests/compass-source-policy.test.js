const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('../src/js/overall/firmware-policy.js');
const M=require('../src/js/overall/mission-kernel.js');

test('Compass source policy applies raw-axis hard-iron, yaw, declination, mirror and wrap',()=>{
  let state=P.createCompass();
  state=P.updateCompass(state,{addressPresent:true,readOk:true,rawX:-2019,rawY:-328},0);
  assert.equal(state.isOk,true);
  assert.ok(Math.abs(state.headingDeg-359.972533)<0.001,state.headingDeg);
  assert.deepEqual([state.rawX,state.rawY,state.failCount,state.fresh],[-2019,-328,0,true]);
});

test('Compass failed reads become stale immediately, saturate failCount, and recover on a good read',()=>{
  let state=P.updateCompass(P.createCompass(),{addressPresent:true,readOk:true,rawX:2048,rawY:0},0);
  for(let i=1;i<=5;i++){
    state=P.updateCompass(state,{addressPresent:true,readOk:false},i*50);
    assert.equal(state.fresh,false);
    assert.equal(state.isOk,false);
    assert.ok(Number.isNaN(state.headingDeg));
    assert.equal(state.failCount,i);
  }
  state=P.updateCompass(state,{addressPresent:true,readOk:true,rawX:-2019,rawY:-328},300);
  assert.equal(state.isOk,true);
  assert.equal(state.failCount,0);
  assert.equal(state.fresh,true);
});

test('Compass missing address clears freshness without counting a failed I2C sample',()=>{
  let state=P.updateCompass(P.createCompass(),{addressPresent:true,readOk:false},0);
  state=P.updateCompass(state,{addressPresent:false,readOk:false},50);
  assert.equal(state.addressPresent,false);
  assert.equal(state.fresh,false);
  assert.equal(state.failCount,1);
  assert.equal(state.isOk,false);
});

test('Compass calibration is present only when both finite hard-iron spans meet the source boundary',()=>{
  const sample={addressPresent:true,readOk:true,rawX:0,rawY:0};
  const exact=P.updateCompass(P.createCompass(),{...sample,calibration:{present:true,xMin:-300,xMax:300,yMin:-300,yMax:300}},0);
  const short=P.updateCompass(P.createCompass(),{...sample,rawX:2048,calibration:{present:true,xMin:-299,xMax:300,yMin:-300,yMax:300}},0);
  assert.equal(exact.calibrationLoaded,true);
  assert.equal(short.calibrationLoaded,false);
  assert.ok(Number.isNaN(exact.headingDeg),'a zero centered vector has no heading');
  assert.ok(Number.isFinite(short.headingDeg),'invalid NVS spans fall back to known factory bounds');
});

test('Compass telemetry source value is unavailable while the current sample is invalid',()=>{
  const valid=P.updateCompass(P.createCompass(),{addressPresent:true,readOk:true,rawX:-2019,rawY:-328},0);
  const stale=P.updateCompass(valid,{addressPresent:true,readOk:false},50);
  assert.ok(Number.isFinite(valid.headingDeg));
  assert.ok(Number.isNaN(stale.headingDeg));
});

test('explicit plant-follow sample remains a raw-axis synthetic input and round-trips through Compass policy',()=>{
  for(const headingDeg of [0,90,180,270,359]){
    const raw=P.makeSyntheticCompassRaw(headingDeg);
    const state=P.updateCompass(P.createCompass(),{addressPresent:true,readOk:true,...raw},100);
    assert.ok(state.available);
    assert.ok(Math.abs(P.wrap180(state.headingDeg-headingDeg))<0.06,JSON.stringify({headingDeg,raw,actual:state.headingDeg}));
  }
});

test('Compass failure blocks pending START, then recovery restores FSM readiness',()=>{
  let state=M.createFixtureMission();
  state.inputs.compassReadOk=false;
  state=M.command(state,'START_ARM');state.playing=true;state=M.tick(state);
  assert.equal(state.missionState,'READY');
  assert.equal(state.stationStage,'waiting-readiness');
  assert.equal(state.compassPolicy.fresh,false);
  state.inputs.compassReadOk=true;state=M.tick(state);
  assert.equal(state.missionState,'GRID SCAN');
  assert.equal(state.compassPolicy.failCount,0);
});

test('current Compass heading reaches control, Drive interlock and telemetry NaN publication',()=>{
  let state=M.start(M.createFixtureMission());
  state=M.tick(state);
  assert.ok(Number.isFinite(state.acquiredHeading));
  assert.ok(Number.isFinite(state.headingError));
  state.inputs.compassReadOk=false;state=M.tick(state);
  assert.equal(state.compassAvailable,false);
  assert.deepEqual(state.appliedPwm,{left:0,right:0});
  assert.ok(Number.isNaN(M.telemetry(state,1).heading_angle));
  state.inputs.compassReadOk=true;state=M.tick(state);
  assert.equal(state.compassAvailable,true);
  assert.ok(Number.isFinite(M.telemetry(state,2).heading_angle));
});
