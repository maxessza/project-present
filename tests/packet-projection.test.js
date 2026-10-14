const test=require('node:test');const assert=require('node:assert/strict');const T=require('../src/js/mission/mission-start-telemetry-model.js');
test('accepted START projects GRID stage independently of subsequent motor rendering',()=>{
 const r=T.createRun(),s={step:5,acceptedStart:true,gpsReady:true,homeSet:true,routeReady:true,status:'playing'};
 const p=T.project(r,s);assert.equal(p.telemetry.current_mode,1);assert.equal(p.stage.current_stage,1);assert.equal(p.stage.next_stage,255);
 assert.equal(p.stage.flags&4,0,'START_PENDING is not inferred from accepted START');
 assert.equal(p.stage.reason,2);
});
test('progress uses STATUS_UPDATE and independent HOME readiness does not erase route flag',()=>{
 const r={...T.createRun(),eventNo:5};const s={step:6,acceptedStart:true,gpsReady:true,homeSet:false,routeReady:true,status:'playing'};
 const p=T.project(r,s);assert.equal(p.stage.reason,1);assert.equal(p.stage.flags&2,2);assert.equal(p.stage.flags&32,0);
 const boot=T.project(T.createRun(),{step:0,acceptedStart:false,routeReady:false,homeSet:false,gpsReady:false});assert.equal(boot.stage.intent,0);
});
