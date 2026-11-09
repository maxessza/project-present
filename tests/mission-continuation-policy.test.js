'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../src/js/overall/mission-kernel.js');
test('final even waypoint completes settle+measure before FSM may leave GRID',()=>{
 let s=M.start(M.createFixtureMission());s.acceptedRoute=s.acceptedRoute.slice(0,2);s.waypointIndex=1;s.position={...s.acceptedRoute[1]};
 s=M.tick(s);assert.equal(s.waypointIndex,2);assert.equal(s.hold.phase,'settle');assert.equal(s.missionState,'GRID SCAN');
 const at=s.clockMs;s=M.advance(s,159);assert.equal(s.missionState,'GRID SCAN');assert.equal(s.clockMs-at,7950);assert.equal(s.hold.phase,'measure');assert.deepEqual(s.appliedPwm,{left:0,right:0});
 s=M.tick(s);assert.equal(s.hold.phase,'none');assert.equal(s.missionState,'GRID SCAN'); // FSM sees active hold before navigation releases it
 s=M.tick(s);assert.equal(s.missionState,'RTH');assert.ok(Number.isNaN(s.water.ph));
});
test('final route length four completes its final even-waypoint sample before returning home',()=>{
 let s=M.start(M.createFixtureMission());s.acceptedRoute=s.acceptedRoute.slice(0,4);s.waypointIndex=3;s.position={...s.acceptedRoute[3]};
 s=M.tick(s);assert.equal(s.waypointIndex,4);assert.equal(s.hold.phase,'settle');assert.equal(s.missionState,'GRID SCAN');
 const at=s.clockMs;s=M.advance(s,159);assert.equal(s.clockMs-at,7950);assert.equal(s.hold.phase,'measure');assert.equal(s.missionState,'GRID SCAN');
 s=M.tick(s);assert.equal(s.hold.phase,'none');assert.equal(s.missionState,'GRID SCAN');
 s=M.tick(s);assert.equal(s.missionState,'RTH');assert.ok(Number.isNaN(s.water.ph));
});
function receive(s,index,points,id='batch-'+index){const e={generation:s.stationGeneration,kind:'route-upload',packetIndex:index,count:points.length,points,messageId:id,routeId:'route'};s=M.markRoutePosted(s,e);return M.receiveStationMessage(s,{envelope:e});}
test('Navigator accepts ordered batches, repeats without append, seals short tail and refuses active mutation',()=>{
 let s=M.beginStory(M.createMission());const batch=Array.from({length:12},(_,i)=>({x:400+i,y:200}));
 s=receive(s,0,batch);assert.equal(s.acceptedRoute.length,12);assert.equal(s.routeSealed,false);
 s=receive(s,1,[{x:600,y:300}]);assert.equal(s.acceptedRoute.length,13);assert.equal(s.routeSealed,true);
 s=receive(s,1,[{x:600,y:300}],'repeat');assert.equal(s.acceptedRoute.length,13);
 s.missionState='GRID SCAN';s.mode='GRID_PATROL';s=receive(s,0,[{x:1,y:1}],'active');assert.equal(s.acceptedRoute.length,13);
});
test('SPIRAL uses source HeadingController signed PWM and shares final Drive ownership',()=>{
 let s=M.start(M.createFixtureMission());s.waypointIndex=1;s.missionState='SPIRAL SCAN';s.mode='SPIRAL_SCAN';s.anomaly.center={...s.position};s.anomaly.spiralTargets=[M.makeSpiral(s.position)[0]];s.anomaly.planner={nextTheta:Math.PI/4,startedMs:0,pointStartedMs:0,fromForce:true,cleanSinceMs:null};
 s=M.tick(s);assert.ok(s.requestedPwm.left>=80);assert.ok(s.requestedPwm.right<=-80);assert.equal(s.appliedPwm.left,80);assert.equal(s.appliedPwm.right,-80);assert.equal(s.motorPwm.left,s.appliedPwm.left/178);
});
test('injected voltage goes through sensor conversion, baseline dwell and automatic clean abort',()=>{
 let s=M.start(M.createFixtureMission());s.waypointIndex=1;s.hold={phase:'settle',sinceMs:0};s.inputs.turbidityV=1.93;s=M.advance(s,40);
 assert.equal(s.cache.ntu,0);s.inputs.turbidityV=1.65625;s=M.advance(s,140);assert.equal(s.missionState,'SPIRAL SCAN');assert.ok(s.anomaly.mean<50);
 s.inputs.turbidityV=1.93;for(let i=0;i<250&&s.missionState==='SPIRAL SCAN';i++)s=M.tick(s);assert.equal(s.missionState,'GRID SCAN');assert.ok(s.anomaly.monitor.cooldownActive);
});
test('command priority, premature FORCE clear, battery critical latch and clear guard',()=>{
 let s=M.start(M.createFixtureMission());s.commands={forceSpiral:true};s=M.tick(s);assert.equal(s.commands.forceSpiral,false);assert.equal(s.missionState,'GRID SCAN');
 s.inputs.batteryVoltage=9.9;s=M.tick(s);assert.equal(s.missionState,'EMERGENCY STOP');assert.deepEqual(s.appliedPwm,{left:0,right:0});
 s.inputs.batteryVoltage=10.6;s.commands.clearEstop=true;s=M.tick(s);assert.equal(s.missionState,'EMERGENCY STOP');
 s.inputs.batteryVoltage=10.8;s=M.tick(s);assert.equal(s.missionState,'READY');assert.equal(s.commands.clearEstop,false);
});
