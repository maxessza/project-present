'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const M=require('../src/js/overall/mission-kernel.js');

function story(generation=1){return M.beginStory(M.createMission({generation}),generation);}
function routeEnvelope(points,options={}){
  return {version:1,generation:options.generation??1,messageId:options.messageId||'route-msg',kind:'route-upload',routeId:options.routeId||'route-a',packetIndex:options.packetIndex??0,count:options.count??points.length,points};
}
function receipt(envelope){return {generation:envelope.generation,messageId:envelope.messageId,kind:envelope.kind,envelope};}
function receiveRoute(points,options={}){
  let state=story(options.generation??1);
  const envelope=routeEnvelope(points,options);
  state=M.markRoutePosted(state,envelope);
  return {state:M.receiveStationMessage(state,receipt(envelope)),envelope};
}
function acceptStart(state,routeId='route-a',messageId='start-msg'){
  const envelope={version:1,generation:state.stationGeneration,messageId,kind:'start',routeId,sealExistingBatch:true};
  state=M.markStartPosted(state,envelope);
  return {state:M.receiveStationMessage(state,receipt(envelope)),envelope};
}

test('fresh mission has only a station plan: start is inert until route and separate START are accepted',()=>{
  const state=M.createMission();
  const view=M.snapshot(state);
  assert.deepEqual(view.stationPlan,M.WAYPOINTS);
  assert.deepEqual(view.acceptedRoute,[]);
  assert.equal(view.routeReady,false);
  assert.equal(view.hasNavigationTarget,false);
  assert.deepEqual(view.target,M.HOME);
  assert.deepEqual(view.request,{left:0,right:0});
  assert.deepEqual(view.applied,{left:0,right:0});
  assert.equal(view.speedMps,0);
  assert.equal(M.start(state),state);
  assert.deepEqual(M.snapshot(M.tick(state)).position,M.HOME);
});

test('received non-default route becomes the canonical target only at a controlled application step',()=>{
  const points=[{x:510,y:210},{x:520,y:300},{x:650,y:340}];
  const original=JSON.parse(JSON.stringify(points));
  let {state,envelope}=receiveRoute(points);
  assert.equal(state.missionState,'READY');
  assert.equal(state.stationStage,'route-accepted');
  assert.equal(state.pendingStart,false);
  assert.deepEqual(state.position,M.HOME);
  assert.deepEqual(state.acceptedRoute,original);
  points[0].x=900;
  envelope.points[0].y=900;
  assert.deepEqual(state.acceptedRoute,original,'source mutation cannot alter the stored receipt');
  assert.deepEqual(M.snapshot(state).target,original[0]);
  assert.equal(M.snapshot(state).targetHeading,M.bearing(M.HOME,original[0]));
  let started=acceptStart(state).state;
  assert.equal(started.missionState,'READY');
  assert.equal(started.pendingStart,true);
  assert.deepEqual(started.position,M.HOME);
  started=M.tick(started);
  // Zero presentation pacing has no invented extra firmware readiness tick.
  assert.equal(started.stationStage,'moving');
  assert.equal(started.missionState,'GRID SCAN');
  assert.deepEqual(started.target,original[0]);
  assert.notEqual(started.heading,0,'the first GRID tick pivots the canonical heading toward the accepted route');
  assert.ok(started.requestedPwm.left*started.requestedPwm.right<0,'the first GRID tick requests opposing motor outputs for the pivot');
  assert.deepEqual(started.position,M.HOME,'a pivot does not imply translation on the same tick');
  for(let i=0;i<160&&started.position.x===M.HOME.x&&started.position.y===M.HOME.y;i++)started=M.tick(started);
  assert.notDeepEqual(started.position,M.HOME,'bounded later ticks translate the canonical pose');
  assert.deepEqual(started.acceptedRoute,original,'continued tracking retains the accepted route');
  const view=M.snapshot(started);
  const los=M.localLos(view.position,view.acceptedRoute,view.waypointIndex,M.HOME,{scale:M.MAP_SCALE_M_PER_UNIT});
  assert.ok(Math.abs(M.wrap180(view.liveTargetHeading-los.bearingDeg))<1e-9,'the live target heading follows accepted-route LOS');
  assert.equal(view.headingError,M.wrap180(view.targetHeading-view.measuredHeading),'displayed controller target/error use the same Compass sample');
});

test('NORMAL START may wait before route/GPS/compass and later use the same command; HOME is not required',()=>{
  let state=story(4);
  state.inputs.gps=false;state.inputs.compass=false;state.inputs.home=false;
  const start={version:1,generation:4,messageId:'early-start',kind:'start',routeId:'later-route',sealExistingBatch:true};
  state=M.markStartPosted(state,start);
  state=M.receiveStationMessage(state,receipt(start));
  assert.equal(state.pendingStart,true);
  state=M.tick(state);
  assert.equal(state.stationStage,'waiting-readiness');
  const points=[{x:470,y:180},{x:470,y:250}];
  const route=routeEnvelope(points,{generation:4,messageId:'later-upload',routeId:'later-route'});
  state=M.markRoutePosted(state,route);
  state=M.receiveStationMessage(state,receipt(route));
  assert.equal(state.pendingStart,true);
  assert.equal(M.snapshot(state).routeReady,true);
  state=M.tick(state);
  assert.equal(state.stationStage,'waiting-readiness');
  assert.deepEqual(state.position,M.HOME);
  state.inputs.gps=true;state.inputs.compass=true;
  state=M.tick(state);
  assert.equal(state.missionState,'GRID SCAN');
  assert.equal(state.stationStage,'moving');
  assert.deepEqual(state.target,points[0]);
});

test('unsafe START is consumed/refused and clearing safety does not auto-retry it',()=>{
  let {state}=receiveRoute([{x:500,y:200}]);
  state.inputs.safety=false;
  state=acceptStart(state).state;
  state=M.tick(state);
  assert.equal(state.stationStage,'start-refused');
  assert.equal(state.pendingStart,false);
  assert.deepEqual(state.position,M.HOME);
  state.inputs.safety=true;
  state=M.resume(state);
  assert.equal(state.missionState,'EMERGENCY STOP');
  state=M.tick(state);
  assert.equal(state.missionState,'EMERGENCY STOP','critical recovery does not clear the FSM latch');
  state=M.tick(M.command(state,'CLEAR_ESTOP'));
  assert.equal(state.missionState,'READY');
  assert.deepEqual(state.position,M.HOME);
});

test('unsupported upload batches and non-finite coordinates are rejected without installing a route',()=>{
  const invalid=[
    {points:Array.from({length:13},(_,i)=>({x:400+i,y:200})),options:{}},
    {points:[{x:400,y:200}],options:{packetIndex:1}},
    {points:[{x:400,y:200}],options:{count:2}},
    {points:[{x:NaN,y:200}],options:{}}
  ];
  for(const item of invalid){
    const {state}=receiveRoute(item.points,item.options);
    assert.equal(state.stationStage,'route-rejected');
    assert.deepEqual(state.acceptedRoute,[]);
    assert.equal(M.snapshot(state).routeReady,false);
    assert.deepEqual(state.applied,{left:0,right:0});
    assert.deepEqual(state.position,M.HOME);
    assert.match(state.stationReason,/ปฏิเสธ/);
  }
});

test('twelve-point batch is accepted but not ready until the separate START seals it',()=>{
  const points=Array.from({length:12},(_,i)=>({x:420+i*10,y:220+i*3}));
  let {state}=receiveRoute(points);
  assert.equal(state.acceptedRoute.length,12);
  assert.equal(state.routeSealed,false);
  assert.equal(M.snapshot(state).routeReady,false);
  state=acceptStart(state).state;
  assert.equal(state.routeSealed,false,'receipt is not navigation-task sealing');
  assert.equal(state.pendingStart,true);
  assert.deepEqual(state.position,M.HOME);
  state=M.tick(state);assert.equal(state.routeSealed,true);
});

test('stale generation and duplicate receipt cannot install or apply a route twice',()=>{
  const points=[{x:480,y:190}];
  let state=story(8);
  const envelope=routeEnvelope(points,{generation:7,messageId:'stale',routeId:'stale-route'});
  state=M.markRoutePosted(state,{...envelope,generation:8,messageId:'expected',routeId:'stale-route'});
  const before=state;
  const stale=M.receiveStationMessage(state,receipt(envelope));
  assert.deepEqual(stale.acceptedRoute,[]);
  const current={...envelope,generation:8,messageId:'expected'};
  state=M.receiveStationMessage(state,receipt(current));
  assert.deepEqual(state.acceptedRoute,points);
  const duplicate=M.receiveStationMessage(state,receipt(current));
  assert.deepEqual(duplicate.acceptedRoute,points);
  assert.equal(duplicate.appliedRouteMessageId,'expected');
  assert.notEqual(state,before);
});
