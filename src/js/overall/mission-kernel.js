(function(root,factory){const common=typeof module==='object'&&module.exports,grid=common?require('./grid-guidance.js'):root.GridGuidance,policy=common?require('./firmware-policy.js'):root.FirmwarePolicy;const api=factory(grid,policy);if(common)module.exports=api;else root.MissionKernel=api;})(typeof window!=='undefined'?window:globalThis,function(Grid,Policy){
  'use strict';
  const HOME=Object.freeze({x:335,y:455});
  const WAYPOINTS=Object.freeze([{x:440,y:170},{x:440,y:280},{x:440,y:390},{x:665,y:390},{x:665,y:280},{x:665,y:170},{x:890,y:170},{x:890,y:280},{x:890,y:390}].map(Object.freeze));
  const DT_SECONDS=.05,MAP_SCALE_M_PER_UNIT=.15,SPIRAL_A_M=4,SPIRAL_MAX_RADIUS=8,SPIRAL_MAX_THETA=6*Math.PI,SPIRAL_DTHETA=Math.PI/4,SPIRAL_POINTS=Math.round(SPIRAL_MAX_THETA/SPIRAL_DTHETA)+1,ANOMALY_THRESHOLD=50;
  // A labelled synthetic plume example placed on a later route leg, not WP1.
  const ANOMALY_REGION=Object.freeze({x:555,y:390,radius:28});
  const GEOFENCE=Object.freeze({minX:285,maxX:945,minY:115,maxY:495});
  const PID=Object.freeze({kp:2.5,ki:.05,kd:.8});
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const wrap360=d=>((d%360)+360)%360,wrap180=Policy.wrap180;
  const distance=(a,b)=>Math.hypot(b.x-a.x,b.y-a.y);
  const bearing=(a,b)=>wrap360(Math.atan2(b.x-a.x,a.y-b.y)*180/Math.PI);
  const clone=v=>Array.isArray(v)?v.map(clone):v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,clone(x)])):v;
  function freeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;}
  const TASK_HASH='66b80f1b16bf2a35801a4e5e0c422f1a39f30a1d6e239ed1b7fda36759d8d977';
  const REFS={
    'start-readiness':['src/core/Tasks.cpp','navigationTask START/readiness input and MissionFsm caller',[619,714],TASK_HASH],
    'grid-los-reach':['src/navigation/Navigator.cpp','Navigator::skipReached/computeSegmentLos/computeLos',[217,323],'020c56e73be4665b655c4c475be364b5890cc07118e3e3bc589d5c2bedcb92e6'],
    'grid-control':['src/control/GridHeadingController.cpp','GridHeadingController::update',[34,122],'50d024e13191747b9026b1548a3e466e7618f6a99ad7d4b0ad46efd1e3e04fcb'],
    'grid-drive':['src/control/DriveController.cpp','DriveController::resolve',[87,145],'78cee95ca6ba7b68dfceda61f045a2e9d4dab6fd785ee7a31c843e868f0eef6a'],
    'spiral-rth-control':['src/control/HeadingController.cpp','HeadingController::calculateThrusterOutputs',[17,65],'69d202548159dd507cba4a82efe9bafa23c629a05a0900d95c34fa3e91e84d23'],
    'drive-interlocks':['src/control/DriveController.cpp','DriveController::resolve interlocks and stop priority',[87,144],'78cee95ca6ba7b68dfceda61f045a2e9d4dab6fd785ee7a31c843e868f0eef6a'],
    'waypoint-water-hold':['src/core/WaterSamplePolicy.cpp','WaterSamplePolicy::crossedBoundary/missionCompleteForFsm',[3,18],'3c8a714091b4f0c682ed1a178517967766c3bb9bd86cf8483fe1b56c528ff104'],
    'sensor-conversion':['src/core/Tasks.cpp','navigationTask ADS/temp acquisition and WaterSensors conversion caller',[277,325],TASK_HASH],
    'publication-nan-cache':['src/core/Tasks.cpp','navigationTask post-Drive suppression and TelemetryPacket publication',[1134,1209],TASK_HASH],
    'anomaly-eligibility':['src/detection/WaterAnomalyMonitor.cpp','WaterAnomalyMonitor::updateTurbidity/notifyTurbidityInvalid',[29,151],'d28eda2292a5f568bec6a7ee915310ffa4f3ffc58e4359b3c0077edff90c9385'],
    'spiral-generation-progress':['src/navigation/SpiralPlanner.cpp','SpiralPlanner::begin/calculateSpiralOffset/nextSpiralPoint',[11,52],'918638ec26cae675782212f390b3ec952762791c95dfe5177ec67767be536587'],
    'spiral-abort-timing':['src/core/Tasks.cpp','navigationTask initialized-only spiral abort gate',[630,645],TASK_HASH],
    'spiral-planner-initialization':['src/core/Tasks.cpp','navigationTask valid-fix planner initialization and lazy first target',[974,997],TASK_HASH],
    'spiral-return':['src/core/MissionFsm.cpp','MissionFsm::tick SPIRAL completion/abort transition',[103,155],'eb2aff28c0e6f5456e8dc3472253964ddb245f580679c49398901b1b7973e632'],
    'rth-dwell':['src/core/MissionFsm.cpp','MissionFsm::latchDeparted/isArrivedHome',[11,45],'eb2aff28c0e6f5456e8dc3472253964ddb245f580679c49398901b1b7973e632'],
    'telemetry-lineage':['src/core/Tasks.cpp','ioTask snapshot-to-sendTelemetry caller',[1477,1531],TASK_HASH],
    'log-lineage':['src/core/Tasks.cpp','navigationTask log-record assembly and logQueue publication',[1253,1320],TASK_HASH],
    'compass-acquisition':['src/sensors/Compass.cpp','Compass::update/getHeadingDeg/loadCalibration',[129,326],'367281241b54c120f7ae4c316b591c41ad6f45c6815589c23e4ac3dc14f29f55']
  };
  const OMISSIONS={
    'grid-los-reach':'6m LOS, 3m radius, progress/pass guard and one-call progression; schematic-local metres replace geodesic ENU; injected GPS, not measured',
    'grid-control':'current continuous GRID controller and joint mixer ported; signed PWM-to-pose response remains illustrative, not calibrated thrust/GPS',
    'grid-drive':'one source-derived final DriveController across GRID/manual/SPIRAL/RTH; no physical actuator or task scheduling claim',
    'spiral-rth-control':'source HeadingController/PidController, chooseBasePwm, filtered angular D, saturation undo-I, pivot30/20 and PWM floor/limit; illustrative hull only',
    'drive-interlocks':'source/state/interlocks plus clamp/floor/slew/reversal-neutral; voltage safety port; reserved overcurrent/leak have no producer',
    'anomaly-eligibility':'streaming source SMA/baseline dwell/ROC-motion/hysteresis/stale/reset/cooldown; source notify vs clear and separate force cooldown; injected voltage example',
    'spiral-generation-progress':'runtime generates one current target at a time; local schematic projection replaces GPS/ENU precision; timeout/abort behavior is source-derived in the canonical policy',
    'spiral-abort-timing':'automatic 8s clean and 240s wall timers start only after g_spiralInitialized; GPS-invalid FSM entry is distinct from planner initialization',
    'spiral-planner-initialization':'planner begins at the then-current valid GPS fix independent of compass; compass/navigation availability separately gates motion and target progression',
    'spiral-return':'retain pending GRID index; no separate firmware RETURN_TO_GRID enum',
    'publication-nan-cache':'finite conversion may publish despite pH quality=false; post-drive applied-zero quiet gate; config example calibration, actual NVS unknown; no mutex contention',
    'telemetry-lineage':'1000ms model snapshot; browser MessageChannel, not radio/FreeRTOS',
    'log-lineage':'Tasks.cpp builds and queues source SD records; current DataLogger adds journal/pending-row/recovery/backpressure. Browser only appends a bounded 32-entry in-memory illustration; it does not model or prove SD/replay/durability.',
    'start-readiness':'source command/FSM consumption and voltage safety; injected GPS/compass availability, route batch/seal and START distinct; HOME independent; UI stage pacing is not firmware delay',
    'sensor-conversion':'WaterSensors conversion/validity/temp policy with injected voltage/temperature and explicit example factory calibration; ADS250ms/temp750ms nominal only, ADC hardware/library gain not emulated',
    'rth-dwell':'source departure/arrival/entry gates and forced/low-battery paths; SET_HOME capture into browser memory, not NVS; schematic distances',
    'waypoint-water-hold':'every second reached WP; settle3000ms/measure5000ms',
    'compass-acquisition':'injected signed raw axes/read result and example-or-factory hard-iron only; default teaching input follows the illustrative plant but is explicitly synthetic, not measured; no QMC5883P I2C, actual NVS calibration, sampling scheduler, or physical heading accuracy'
  };
  const BROWSER_HELPERS=Object.freeze({
    'start-readiness':'src/js/overall/mission-kernel.js::evaluatePendingStart/readiness/start/decide -> src/js/overall/firmware-policy.js::fsm',
    'grid-los-reach':'src/js/overall/mission-kernel.js::navigate/currentLos -> src/js/overall/grid-guidance.js::localLos',
    'grid-control':'src/js/overall/mission-kernel.js::control -> src/js/overall/grid-guidance.js::updateController -> allocate',
    'grid-drive':'src/js/overall/mission-kernel.js::control -> src/js/overall/grid-guidance.js::resolveDrive',
    'spiral-rth-control':'src/js/overall/mission-kernel.js::control -> src/js/overall/firmware-policy.js::chooseBasePwm/heading',
    'drive-interlocks':'src/js/overall/mission-kernel.js::control -> src/js/overall/grid-guidance.js::resolveDrive',
    'waypoint-water-hold':'src/js/overall/mission-kernel.js::navigate/holdPolicy -> src/js/overall/firmware-policy.js::crossedBoundary',
    'sensor-conversion':'src/js/overall/mission-kernel.js::acquire/sample -> src/js/overall/firmware-policy.js::turbidity/ph',
    'publication-nan-cache':'src/js/overall/mission-kernel.js::publishWater',
    'anomaly-eligibility':'src/js/overall/mission-kernel.js::sample -> src/js/overall/firmware-policy.js::anomaly',
    'spiral-generation-progress':'src/js/overall/mission-kernel.js::navigate -> spiralTarget (incremental runtime); makeSpiral is teaching-preview-only',
    'spiral-abort-timing':'src/js/overall/mission-kernel.js::decide',
    'spiral-planner-initialization':'src/js/overall/mission-kernel.js::navigate',
    'spiral-return':'src/js/overall/mission-kernel.js::decide -> src/js/overall/firmware-policy.js::fsm/spiralDone',
    'rth-dwell':'src/js/overall/mission-kernel.js::rthPolicy',
    'telemetry-lineage':'src/js/overall/autonomous-mission.js::applyReceivedTick -> mission-kernel.js::stepOnce/tick; autonomous-mission.js::transport.offer -> mission-transport.js::offer',
    'log-lineage':'src/js/overall/mission-kernel.js::tick memoryLog append (bounded 32 only; no SD implementation)',
    'compass-acquisition':'src/js/overall/mission-kernel.js::acquire -> src/js/overall/firmware-policy.js::updateCompass'
  });
  function source(key){const [path,fn,lines,sha256]=REFS[key];const browserHelper=BROWSER_HELPERS[key];if(!browserHelper)throw new Error(`Missing browser caller mapping for source binding ${key}`);return {path,function:fn,lines,sha256,status:key==='log-lineage'?'reference-only · bounded browser memory illustration':'current-source policy port · bounded host model',boundary:OMISSIONS[key],browserHelper};}
  function row(s,key,inputs,name,result,decision,output){s.rows.push({key,inputs:clone(inputs),predicate:{name,result},decision,output:clone(output),source:source(key)});s.lastEvent=decision;}
  function analyzeSma(values){const v=values.filter(Number.isFinite).slice(-8),mean=v.length?v.reduce((a,b)=>a+b,0)/v.length:NaN;return {count:v.length,mean,eligible:v.length===8,trigger:v.length===8&&mean>50};}
  function spiralTarget(center,theta){const r=Math.min(SPIRAL_MAX_RADIUS,SPIRAL_A_M+(SPIRAL_MAX_RADIUS-SPIRAL_A_M)*theta/SPIRAL_MAX_THETA),east=r*Math.cos(theta),north=r*Math.sin(theta);return {x:center.x+east/MAP_SCALE_M_PER_UNIT,y:center.y-north/MAP_SCALE_M_PER_UNIT};}
  // Explicit teaching preview only. Mission execution never calls this full-shape helper.
  function makeSpiral(center){return Array.from({length:SPIRAL_POINTS},(_,i)=>spiralTarget(center,i*SPIRAL_DTHETA));}
  const targetFor=s=>s.missionState==='COMPLETE'?s.position:s.missionState==='RTH'?(s.homePoint||HOME):s.missionState==='SPIRAL SCAN'?(s.anomaly.spiralTargets[s.anomaly.spiralIndex]||s.position):(s.acceptedRoute[Math.min(s.waypointIndex,s.acceptedRoute.length-1)]||s.position);
  function createMission(options={}){const acceptedRoute=options.preloadedRoute?clone(WAYPOINTS):[];const first=acceptedRoute[0]||{...HOME};return {missionState:'READY',mode:'STANDBY',playing:false,clockMs:0,eventSequence:0,waypointIndex:0,position:{...HOME},heading:0,stationPlan:clone(WAYPOINTS),acceptedRoute,routeSealed:!!options.preloadedRoute,routeId:options.preloadedRoute?'fixture-route':null,stationStoryActive:false,stationStage:'idle',stationStageAtMs:0,presentationPacingMs:Number.isFinite(options.presentationPacingMs)?Math.max(0,options.presentationPacingMs):0,stationGeneration:Number.isInteger(options.generation)?options.generation:0,routeMessageId:null,startMessageId:null,appliedRouteMessageId:null,appliedStartMessageId:null,pendingStart:false,startRefused:false,stationReason:'ยังไม่มีเส้นทางอยู่บนเรือ',returnCause:null,target:{...first},targetHeading:bearing(HOME,first),headingError:bearing(HOME,first),headingRateDps:0,previousError:null,controlKey:null,gridGuidance:Grid.createState(),gridControlKey:null,los:null,integral:0,errorRateDps:0,controlDerivative:0,controllerKind:'GRID · LOS + steering/surge',controlOutput:0,request:{left:0,right:0},applied:{left:0,right:0},requestedPwm:{left:0,right:0},appliedPwm:{left:0,right:0},motorPwm:{left:0,right:0},speedMps:0,trail:[{...HOME}],force:{direction:0,remainingSec:0},drift:{x:0,y:0},compassPolicy:Policy.updateCompass(Policy.createCompass(),{addressPresent:true,readOk:true,rawX:-2019,rawY:-328},0),inputs:{gps:true,compass:true,compassReadOk:true,compassFollowPlant:true,compassCalibrationExample:false,compassRawX:-2019,compassRawY:-328,route:true,safety:true,home:true,sensorValid:true},hold:{phase:'none',sinceMs:0},phSum:0,phCount:0,sampleId:0,snapshotId:0,logId:0,txDue:0,memoryLog:[],water:{ph:NaN,ntu:NaN,temp:NaN},cache:{ntu:NaN,temp:NaN},anomaly:{armed:false,used:false,turbidityNtu:NaN,score:0,threshold:50,window:[],mean:NaN,eligible:false,interruptedIndex:null,spiralIndex:0,spiralTargets:[],planner:null,center:null},rth:{departed:false,departureMs:0,entryOutside:false,arrivalMs:0},homePoint:{...HOME},missionOrigin:{...HOME},homeDistanceM:0,safetyState:'NORMAL',battery:Policy.createBattery(),batteryVoltage:12.6,batteryPercent:100,gpsPolicy:{ever:false,lastValidMs:0,fault:false,tier:'SAFE_STOP'},rawGpsValid:true,gpsFixValid:true,gpsReady:true,compassAvailable:true,acquiredPosition:{...HOME},acquiredHeading:0,headingMetrics:null,headingControl:Policy.createHeading(),lastManualMode:false,lastAbsPwm:0,requestedPwm:{left:0,right:0},appliedPwm:{left:0,right:0},driveDecision:{stopReason:'REQUESTED_STOP',leftPwm:0,rightPwm:0},commands:{},fsm:Policy.createFsm(),navigator:Policy.createNavigator(),anomalyMonitor:null,rows:[],lastEvent:'',startTracePending:false,policyClockActive:false,homeCapture:null,homeCaptureResult:'',txSequence:0,routeState:'idle',routeError:null};}
  const routeStored=s=>s.acceptedRoute.length>0&&s.routeSealed;
  const routeReady=s=>routeStored(s)&&s.waypointIndex<s.acceptedRoute.length;
  const compassReady=s=>s.inputs.compass!==false&&s.inputs.compassReadOk!==false&&s.compassPolicy?.available===true;
  const driveReady=s=>(s.gpsReady??s.inputs.gps)&&compassReady(s)&&s.inputs.safety;
  const readiness=s=>routeReady(s)&&driveReady(s);
  const modes={'READY':'STANDBY','COMPLETE':'STANDBY','GRID SCAN':'GRID_PATROL','SPIRAL SCAN':'SPIRAL_MAPPING','RTH':'RTH','EMERGENCY STOP':'EMERGENCY_STOP'};
  const toGeo=p=>({lat:18+(HOME.y-p.y)*MAP_SCALE_M_PER_UNIT/111320,lon:99+(p.x-HOME.x)*MAP_SCALE_M_PER_UNIT/(111320*Math.cos(18*Math.PI/180))});
  function initialize(s){
    s.commands=Object.assign({start:false,clearEstop:false,emergency:false,emergencyPending:false,forceRth:false,forceSpiral:false,setHome:false,sealMissionUpload:false,manualMode:false,manualSpeed:0,manualSteer:0,lastManualMs:0},s.commands);
    if(!s.fsm)s.fsm=Policy.createFsm();s.fsm.state=modes[s.missionState];
    if(!s.navigator)s.navigator=Policy.createNavigator();
    if(!s.headingControl)s.headingControl=Policy.createHeading();
    if(!s.anomaly.monitor)s.anomaly.monitor=Policy.createAnomaly();
    if(!s.battery)s.battery=Policy.createBattery();
    if(!s.gpsPolicy)s.gpsPolicy={ever:false,lastValidMs:0,fault:false,tier:'SAFE_STOP'};
    if(!s.homePoint)s.homePoint={...HOME};if(!s.missionOrigin)s.missionOrigin={...HOME};
    if(!s.safetyState)s.safetyState='NORMAL';if(!s.sensor)s.sensor={temp:25,tempValid:false,lastTempMs:0,ph:{value:NaN,valid:false},ntu:{value:NaN,valid:false},calibration:Policy.EXAMPLE_CAL.source};
    if(!Object.hasOwn(s,'acquiredHeading'))s.acquiredHeading=s.compassPolicy?.available?s.compassPolicy.headingDeg:NaN;
    return s;
  }
  function beginStory(s,generation=s.stationGeneration){if(s.stationStoryActive||s.missionState!=='READY')return s;const n=clone(s);n.stationStoryActive=true;n.stationGeneration=generation;n.stationStage='preparing-route';n.stationStageAtMs=n.clockMs;n.stationReason='สถานีกำลังเตรียมแผนจุดสำรวจตัวอย่าง · ยังไม่อยู่บนเรือ';n.playing=true;n.lastEvent=n.stationReason;return n;}
  function markRoutePosted(s,envelope){const n=clone(s);n.stationStage='route-posted';n.stationStageAtMs=n.clockMs;n.routeMessageId=envelope.messageId;n.routeId=envelope.routeId;n.stationReason='สถานีกำลังส่งจุดสำรวจ';n.lastEvent=n.stationReason;return n;}
  function markStartPosted(s,envelope){const n=clone(s);n.stationStage='start-posted';n.stationStageAtMs=n.clockMs;n.startMessageId=envelope.messageId;n.routeId=n.routeId||envelope.routeId;n.stationReason='เรือเก็บจุดสำรวจแล้ว · สถานีกำลังส่งคำสั่งเริ่ม';n.lastEvent=n.stationReason;return n;}
  function rejectRoute(s,reason){s.stationReason=reason;s.lastEvent=reason;if(!s.acceptedRoute.length){s.stationStage='route-rejected';s.playing=false;stop(s);}}
  function receiveStationMessage(state,receipt){let n=initialize(clone(state));const e=receipt&&receipt.envelope;if(!e||e.generation!==n.stationGeneration||!n.stationStoryActive)return n;
    if(!n.appliedMessages)n.appliedMessages=[];if(n.appliedMessages.includes(e.messageId))return n;n.appliedMessages.push(e.messageId);
    if(e.kind==='route-upload'){
      n.appliedRouteMessageId=e.messageId;n.navigator.index=n.waypointIndex;
      const points=Array.isArray(e.points)?e.points.map(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)?{...p,...toGeo(p)}:p):e.points;
      const result=Policy.acceptBatch(n.navigator,{...e,points},modes[n.missionState]==='STANDBY');
      n.routeAck={packetIndex:e.packetIndex,status:result.ok?'ACK_OK':'ACK_NACK',generated:true,delivery:'NOT SIMULATED — receipt/storage do not prove ACK delivery'};
      if(!result.ok){rejectRoute(n,'เรือได้รับข้อมูลแล้ว แต่ปฏิเสธ batch · คงเส้นทางเดิม ไม่รับประกันการส่ง ACK');return n;}
      n.navigator=result.state;n.acceptedRoute=result.state.points.map(p=>({x:p.x,y:p.y}));n.routeSealed=result.state.sealed;n.routeId=e.routeId;n.waypointIndex=result.state.index;
      n.gridGuidance=Grid.resetController(n.gridGuidance);n.gridControlKey=null;n.stationStage=n.pendingStart?'waiting-readiness':'route-accepted';n.stationStageAtMs=n.clockMs;n.stationReason='เรือเก็บ batch แล้ว · seal/START/ความพร้อมเป็นคนละขั้นกับ receipt และ ACK';n.lastEvent=n.stationReason;return n;
    }
    if(e.kind==='start'){n.appliedStartMessageId=e.messageId;n=command(n,'START_ARM');n.stationStage=n.acceptedRoute.length?'start-received':'waiting-readiness';n.stationStageAtMs=n.clockMs;n.stationReason=n.acceptedRoute.length?'รับคำสั่งเริ่มแล้ว · กำลังตรวจความพร้อม':'รับคำสั่งเริ่มแล้ว · รอข้อมูลเส้นทางจากสถานี';n.lastEvent=n.stationReason;return n;}
    if(e.kind==='command')return command(n,e.command,e);
    return n;
  }
  function command(state,code,values={}){
    const n=initialize(clone(state)),c=n.commands;code=String(code).replace(/^CMD_/,'');
    if(code==='EMERGENCY_STOP'){c.emergency=true;c.emergencyPending=true;c.start=false;c.clearEstop=false;c.manualMode=false;c.manualSpeed=0;c.manualSteer=0;}
    else if(code==='FORCE_RTH'){c.forceRth=true;c.emergency=false;}
    else if(code==='START_ARM'){c.start=true;n.pendingStart=true;n.startRefused=false;}
    else if(code==='CLEAR_ESTOP'){c.clearEstop=true;c.emergency=false;c.forceRth=false;c.start=false;c.forceSpiral=false;c.manualMode=false;c.manualSpeed=0;c.manualSteer=0;n.pendingStart=false;}
    else if(code==='MISSION_UPLOAD_DONE')c.sealMissionUpload=true;
    else if(code==='SET_HOME')c.setHome=true;
    else if(code==='FORCE_SPIRAL')c.forceSpiral=true;
    else if(code==='NORMAL'){c.forceRth=false;c.manualSpeed=clamp(Math.trunc(Number(values.manualSpeed)||0),-255,255);c.manualSteer=clamp(Math.trunc(Number(values.manualSteer)||0),-255,255);c.manualMode=c.manualSpeed!==0||c.manualSteer!==0;if(c.manualMode)c.lastManualMs=n.clockMs;}
    n.policyClockActive=true;if(n.missionState==='COMPLETE')n.missionState='READY';n.lastCommand={code,atMs:n.clockMs};return n;
  }
  function evaluatePendingStart(s){
    if(['start-received','checking-readiness'].includes(s.stationStage)&&s.clockMs-s.stationStageAtMs<s.presentationPacingMs)return false;
    if(s.stationStage==='start-received'&&s.presentationPacingMs){s.stationStage='checking-readiness';s.stationStageAtMs=s.clockMs;s.stationReason='กำลังตรวจความพร้อมของเส้นทาง GPS และเข็มทิศ';return false;}
    if(!readiness(s)||!s.inputs.route){s.stationStage='waiting-readiness';s.stationReason=!routeReady(s)?'รอเส้นทางที่เรือเก็บไว้ให้พร้อม':!s.gpsReady?'รอข้อมูล GPS ที่ใช้ได้':!compassReady(s)?'รอตัวอย่างเข็มทิศที่ใช้ได้':'รอ route input ที่เปิดใช้';return false;}
    return true;
  }
  function start(s){if(s.missionState!=='READY'||s.playing||!readiness(s)||!s.inputs.route)return s;const n=initialize(clone(s));n.rows=[];n.startTracePending=true;n.missionState='GRID SCAN';n.mode='GRID_PATROL';n.fsm.state='GRID_PATROL';n.playing=true;n.stationStoryActive=false;n.missionOrigin={...n.position};n.anomaly.monitor=Policy.clearAnomaly(n.anomaly.monitor);row(n,'start-readiness',n.inputs,'accepted route sealed && GPS && compass && route input && safety NORMAL (HOME not required)',true,'เริ่ม GRID จากเส้นทางที่จัดเตรียมไว้โดย fixture',{mode:n.mode});return n;}
  function pause(s){if(!s.playing)return s;const n=clone(s);n.playing=false;return n;}
  function wakePolicyClock(s){const n=initialize(clone(s));n.stationStoryActive=true;n.policyClockActive=true;n.playing=true;return n;}
  function resume(s){if(s.playing||s.missionState==='COMPLETE'||s.missionState==='READY'&&!s.stationStoryActive&&!s.policyClockActive)return s;const n=clone(s);n.playing=true;return n;}
  function stop(s){s.applied={left:0,right:0};s.motorPwm={...s.applied};s.requestedPwm={left:0,right:0};s.appliedPwm={left:0,right:0};s.speedMps=0;s.headingRateDps=0;s.drift={x:0,y:0};}
  function holdPolicy(s){if(s.hold.phase==='none')return;const elapsed=s.clockMs-s.hold.sinceMs;if(elapsed>=8000){s.hold.phase='none';s.gridGuidance=Grid.resetController(s.gridGuidance);s.gridControlKey=null;}else s.hold.phase=elapsed>=3000?'measure':'settle';row(s,'waypoint-water-hold',{elapsed,waypointIndex:s.waypointIndex},'elapsed >=3000 / >=8000 ms',s.hold.phase,s.hold.phase==='none'?'water hold จบ · เดินทางต่อ':`หยุดน้ำ · ${s.hold.phase}`,{phase:s.hold.phase});}
  function rthPolicy(s){const d=distance(s.position,s.homePoint)*MAP_SCALE_M_PER_UNIT,valid=s.inputs.home&&s.gpsFixValid;s.homeDistanceM=valid?d:NaN;
    if(!valid)s.rth.departureMs=0;else if(!s.rth.departed){s.rth.departureMs=d>=12?s.rth.departureMs+50:0;if(s.rth.departureMs>=2000)s.rth.departed=true;}
    const inside=valid&&d<=4;s.rth.arrivalMs=s.missionState==='RTH'&&inside&&s.rth.departed&&s.rth.entryOutside?s.rth.arrivalMs+50:0;
    if(s.missionState==='RTH')row(s,'rth-dwell',{distanceM:d,valid,departed:s.rth.departed,entryOutside:s.rth.entryOutside},'valid && departed && entry>4m && distance<=4m continuous3000ms',s.rth.arrivalMs,inside?'RTH park · applied=0 รอ dwell':'RTH เดินทางกลับ HOME',{arrivalMs:s.rth.arrivalMs,mode:s.mode});
  }
  function finish(s,reason){s.missionState='COMPLETE';s.mode='STANDBY';s.playing=false;stop(s);s.lastEvent=reason;}
  function currentLos(s,index=s.waypointIndex){return Grid.localLos(s.position,s.acceptedRoute,index,s.missionOrigin||HOME,{scale:MAP_SCALE_M_PER_UNIT});}
  function skipReached(s){const los=currentLos(s),segment=los.segmentLengthM||0,minAlong=s.waypointIndex>0?(segment<.05?0:Math.min(2,segment*.75)):.5;const reached=los.valid&&((los.reached&&los.alongTrackM>=minAlong)||(los.passed&&Math.abs(los.crossTrackM)<=3));if(reached){s.waypointIndex++;s.gridGuidance=Grid.resetController(s.gridGuidance);s.gridControlKey=null;}return reached;}
  function enterSpiral(s,fromForce){
    if(s.gpsFixValid)skipReached(s);
    const a=s.anomaly;a.used=true;a.interruptedIndex=s.waypointIndex;a.spiralIndex=0;a.spiralTargets=[];a.center=null;
    a.planner={nextTheta:SPIRAL_DTHETA,initialized:!!s.gpsFixValid,startedMs:s.gpsFixValid?s.clockMs:null,pointStartedMs:s.gpsFixValid?s.clockMs:null,fromForce,cleanSinceMs:null,done:false};
    if(s.gpsFixValid){a.center={...s.position};a.spiralTargets=[spiralTarget(a.center,0)];}
    row(s,'spiral-generation-progress',{center:a.center,target:a.spiralTargets[0],fromForce},'entry skipReached once; begin fixed current fix; request ONE current target',true,'เริ่ม SPIRAL · สร้างเฉพาะเป้าหมายปัจจุบัน',{generated:a.spiralTargets.length,pendingIndex:s.waypointIndex});
  }
  function captureHome(s){
    const c=s.commands,valid=s.gpsReady&&s.gpsFixValid,standby=modes[s.missionState]==='STANDBY';
    if(c.setHome){c.setHome=false;if(!s.homeCapture&&standby&&valid)s.homeCapture={startedMs:s.clockMs,lastSampleMs:null,points:[]};else s.homeCaptureResult='REFUSED — need STANDBY and GPS OK';}
    const cap=s.homeCapture;if(!cap)return;
    if(!standby||!valid||(s.inputs.speedKmh??Math.abs(s.speedMps)*3.6)>1.5){s.homeCapture=null;s.homeCaptureResult='ABORTED — mode/GPS/motion';return;}
    if(cap.lastSampleMs===null||s.clockMs-cap.lastSampleMs>=250){cap.points.push({...s.position});cap.lastSampleMs=s.clockMs;}
    if(s.clockMs-cap.startedMs>=5000){const xs=cap.points.map(p=>p.x),ys=cap.points.map(p=>p.y),spread=Math.hypot(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))*MAP_SCALE_M_PER_UNIT;
      if(cap.points.length>=20&&spread<=8){s.homePoint={x:xs.reduce((a,b)=>a+b,0)/xs.length,y:ys.reduce((a,b)=>a+b,0)/ys.length};s.inputs.home=true;s.rth.departed=false;s.rth.departureMs=0;s.homeCaptureResult='CAPTURED — browser memory only; no NVS write';}
      else s.homeCaptureResult='REFUSED — samples/spread';s.homeCapture=null;
    }
  }
  function decide(s){
    const c=s.commands,before=s.fsm.state;c.start=c.start||s.pendingStart;
    if(c.sealMissionUpload||(c.start&&s.acceptedRoute.length&&!s.routeSealed)){if(s.acceptedRoute.length){s.routeSealed=true;s.navigator.sealed=true;}c.sealMissionUpload=false;}
    if(c.clearEstop&&before!=='EMERGENCY_STOP')c.clearEstop=false;if(c.forceRth&&before==='STANDBY')c.forceRth=false;
    if(c.manualMode&&s.clockMs-c.lastManualMs>500){c.manualMode=false;c.manualSpeed=0;c.manualSteer=0;}
    if(s.lastManualMode!==c.manualMode){s.headingControl=Policy.createHeading();s.controlKey=null;s.lastManualMode=c.manualMode;}
    s.safetyState=Policy.safety(s.safetyState,s.inputs.safety?s.batteryVoltage:9.9,(s.lastAbsPwm||0)>=80||s.motionDisturbance);
    if(c.clearEstop&&before==='EMERGENCY_STOP'&&s.rawGpsValid){s.gpsPolicy.fault=false;s.gpsPolicy.tier='OK';s.gpsFixValid=true;s.gpsReady=true;}
    captureHome(s);rthPolicy(s);
    if(c.forceSpiral&&(before!=='GRID_PATROL'||s.waypointIndex<1||Policy.forceCooldown(s.fsm,s.clockMs))){c.forceSpiral=false;s.lastCommandRefusal='FORCE_SPIRAL refused and cleared — GRID/WP1/cooldown';}
    const p=s.anomaly.planner,automatic=!p?.fromForce,detected=s.anomaly.monitor.trigger,plannerInitialized=!!p?.initialized;
    if(before==='SPIRAL_MAPPING'&&plannerInitialized){if(automatic&&!detected){if(p.cleanSinceMs===null)p.cleanSinceMs=s.clockMs;}else p.cleanSinceMs=null;}
    const wall=before==='SPIRAL_MAPPING'&&plannerInitialized&&s.clockMs-p.startedMs>=240000,clean=before==='SPIRAL_MAPPING'&&plannerInitialized&&automatic&&p.cleanSinceMs!==null&&s.clockMs-p.cleanSinceMs>=8000;
    if(before==='SPIRAL_MAPPING'&&p)row(s,'spiral-abort-timing',{initialized:plannerInitialized,fromForce:p.fromForce,startedMs:p.startedMs,cleanSinceMs:p.cleanSinceMs,nowMs:s.clockMs},'Tasks abort timers require g_spiralInitialized; clean=8s automatic, wall=240s',!!(wall||clean),wall?'wall':clean?'clean':plannerInitialized?'initialized · timers not due':'uninitialized · timers disabled',{wall,clean});
    const startReady=before==='STANDBY'&&c.start?evaluatePendingStart(s):true;
    const i={nowMs:s.clockMs,startCommand:c.start&&startReady,clearEstop:c.clearEstop,emergencyCommand:c.emergency||(c.emergencyPending&&!c.clearEstop),gpsFault:s.gpsPolicy.fault,forceRthCommand:c.forceRth,forceSpiralCommand:c.forceSpiral,safety:s.safetyState,anomalyDetected:detected,passedFirstWaypoint:s.waypointIndex>=1,spiralComplete:!!p?.done,spiralAborted:!!(wall||clean),gridComplete:s.acceptedRoute.length>0&&s.waypointIndex>=s.acceptedRoute.length&&s.hold.phase==='none',arrivedHome:s.rth.arrivalMs>=3000,gpsOk:s.gpsReady,compassOk:compassReady(s),hasWaypoints:routeReady(s)&&s.inputs.route,homeSet:s.inputs.home};
    s.fsm=Policy.fsm(s.fsm,i);const after=s.fsm.state,changed=after!==before;
    if(c.start&&before==='STANDBY'&&(after==='GRID_PATROL'||s.safetyState!=='NORMAL')){c.start=false;s.pendingStart=false;if(after!=='GRID_PATROL'){s.startRefused=true;s.stationStage='start-refused';s.stationReason='START ปฏิเสธเพราะ safety ไม่ NORMAL · ต้องส่งใหม่';}}
    if(c.clearEstop&&before==='EMERGENCY_STOP'&&after==='STANDBY'){c.clearEstop=false;c.emergencyPending=false;}
    if(changed){
      s.headingControl=Policy.createHeading();s.controlKey=null;s.gridGuidance=Grid.resetController(s.gridGuidance);s.gridControlKey=null;
      if(before==='SPIRAL_MAPPING'){s.anomaly.monitor=automatic&&after==='GRID_PATROL'&&(i.spiralComplete||i.spiralAborted)?Policy.spiralDone(s.anomaly.monitor,s.clockMs):Policy.clearAnomaly(s.anomaly.monitor);if(p)p.cooldownUntilMs=s.clockMs+600000;row(s,'spiral-return',{pendingIndex:s.waypointIndex,reason:wall?'wall':clean?'clean':i.spiralComplete?'complete':'interrupted'},'source exit: automatic complete/abort notifies; forced/interruption clears; separate FORCE cooldown',true,'ออก SPIRAL · คง pending GRID index',{waypointIndex:s.waypointIndex});}
      if(after==='EMERGENCY_STOP'){c.start=false;s.pendingStart=false;c.clearEstop=false;c.forceSpiral=false;c.manualMode=false;c.manualSpeed=0;c.manualSteer=0;}
      if(after==='GRID_PATROL'&&before==='STANDBY'){s.anomaly.monitor=Policy.clearAnomaly(s.anomaly.monitor);s.missionOrigin={...s.position};s.rth={departed:false,departureMs:0,entryOutside:false,arrivalMs:0};s.stationStage='moving';s.stationReason='กำลังไปจุดสำรวจแรก';}
      if(after==='RTH'){s.returnCause=c.forceRth?'forced':s.safetyState==='LOW_BATTERY_RTH'?'lowbattery':before==='GRID_PATROL'&&i.gridComplete?'route-complete':null;s.rth.entryOutside=Number.isFinite(s.homeDistanceM)&&s.homeDistanceM>4;s.rth.arrivalMs=0;}
      if(after==='STANDBY'&&before==='RTH'){c.start=false;c.forceRth=false;}
    }
    s.missionState=({STANDBY:before==='RTH'||before==='GRID_PATROL'?'COMPLETE':'READY',GRID_PATROL:'GRID SCAN',SPIRAL_MAPPING:'SPIRAL SCAN',RTH:'RTH',EMERGENCY_STOP:'EMERGENCY STOP'})[after];
    s.mode=({STANDBY:'STANDBY',GRID_PATROL:'GRID_PATROL',SPIRAL_MAPPING:'SPIRAL_SCAN',RTH:'RETURN_HOME',EMERGENCY_STOP:'EMERGENCY_STOP'})[after];
    if(changed&&after==='SPIRAL_MAPPING'){const fromForce=!!c.forceSpiral;c.forceSpiral=false;enterSpiral(s,fromForce);}
    if(after!=='GRID_PATROL')s.hold.phase='none';
    if(s.missionState==='COMPLETE')finish(s,'ภารกิจจบ · STANDBY');
    row(s,'start-readiness',{before,commands:c,safety:s.safetyState,gps:s.gpsPolicy.tier,anomaly:detected},'Tasks command consumption + MissionFsm priorities',after,changed?`${before} → ${after}`:s.stationReason,{state:after,pendingStart:s.pendingStart,forceCooldown:Policy.forceCooldown(s.fsm,s.clockMs),wall,clean});
  }
  function navigate(s){
    if(s.missionState==='GRID SCAN'){
      const los=currentLos(s),segment=los.segmentLengthM||0,minAlong=s.waypointIndex>0?(segment<.05?0:Math.min(2,segment*.75)):.5;
      const reachedWithProgress=los.valid&&los.reached&&los.alongTrackM>=minAlong;
      const passedNearTrack=los.valid&&los.passed&&Math.abs(los.crossTrackM)<=Grid.C.waypointRadiusM;
      const reached=reachedWithProgress||passedNearTrack;
      s.los=los;
      row(s,'grid-los-reach',{position:s.position,target:s.acceptedRoute[s.waypointIndex],index:s.waypointIndex,alongTrackM:los.alongTrackM,crossTrackM:los.crossTrackM,distanceM:los.distToEndM,lookahead:los.lookahead},'reached && along-track progress OR passed waypoint + near-track',reached,reached?`LOS ผ่าน WP${s.waypointIndex+1} · advance หนึ่งจุด`:`ติดตาม LOS 6 m ไป WP${s.waypointIndex+1}`,{lookahead:los.lookahead,bearingDeg:los.bearingDeg});
      if(!reached)return;
      s.waypointIndex++;s.gridGuidance=Grid.resetController(s.gridGuidance);s.gridControlKey=null;
      if(Policy.crossedBoundary(s.waypointIndex-1,s.waypointIndex,s.acceptedRoute.length)){s.hold={phase:'settle',sinceMs:s.clockMs};s.phSum=0;s.phCount=0;s.lastPh=NaN;row(s,'waypoint-water-hold',{reachedCount:s.waypointIndex},'WaterSamplePolicy.crossedBoundary',true,`WP${s.waypointIndex} · settle3000ms แล้ว measure5000ms`,s.hold);}

      return;
    }
    const a=s.anomaly,p=a.planner;if(!p)return;
    if(!p.initialized){if(!s.gpsFixValid)return;a.center={...s.position};a.spiralTargets=[spiralTarget(a.center,0)];p.initialized=true;p.startedMs=s.clockMs;p.pointStartedMs=s.clockMs;row(s,'spiral-planner-initialization',{gpsFixValid:s.gpsFixValid,compassReady:compassReady(s),center:a.center,generated:a.spiralTargets.length,startedMs:p.startedMs},'begin at current valid GPS fix independently of compass; nextSpiralPoint lazily requests one target',true,'initialized at current fix · one target',{center:a.center,generated:a.spiralTargets.length});}
    if(!driveReady(s))return;
    const t=targetFor(s),start=a.spiralTargets[a.spiralIndex-1]||a.center;
    const los=Grid.localLos(s.position,[start,t],1,HOME,{scale:MAP_SCALE_M_PER_UNIT,lookaheadM:3,radiusM:2,passMarginM:.5});
    const reachedWithProgress=los.valid&&los.reached&&los.alongTrackM>=.5,passedEnd=los.valid&&los.passed;
    const pointTimeout=s.clockMs-p.pointStartedMs>=45000;
    s.los=los;
    const advance=reachedWithProgress||passedEnd||pointTimeout;
    row(s,'spiral-generation-progress',{position:s.position,target:t,index:a.spiralIndex,distanceM:los.distToEndM,alongTrackM:los.alongTrackM,passed:los.passed,pointTimeout},'segment LOS reached <=2m && along >=0.5m OR passed end+0.5m OR point timeout45s; FSM wall/clean resolved first',advance,advance?'SPIRAL segment passed · request one next planner point':'follow current segment LOS',{advance,generated:a.spiralTargets.length});
    if(!advance)return;
    if(advance&&a.spiralIndex+1<SPIRAL_POINTS){
      a.spiralIndex++;a.spiralTargets.push(spiralTarget(a.center,p.nextTheta));p.nextTheta+=SPIRAL_DTHETA;p.pointStartedMs=s.clockMs;s.headingControl=Policy.createHeading();
      row(s,'spiral-generation-progress',{index:a.spiralIndex,target:a.spiralTargets[a.spiralIndex],generated:a.spiralTargets.length},'request exactly one nextSpiralPoint after current segment predicate',true,'สร้างเป้าหมายปัจจุบันหนึ่งจุด · ไม่สร้างจุดอนาคต',{target:a.spiralTargets[a.spiralIndex]});
      return;
    }
    a.spiralIndex=SPIRAL_POINTS;p.done=true;s.headingControl=Policy.createHeading();
    row(s,'spiral-return',{pendingIndex:a.interruptedIndex,reason:'complete'},'SpiralPlanner exhausted; spiralDone is consumed by NEXT FSM tick',true,`SPIRAL จบ · รอ FSM กลับ GRID`,{waypointIndex:s.waypointIndex});
  }
  function control(s){
    s.target={...targetFor(s)};
    const grid=s.missionState==='GRID SCAN',manual=grid&&s.commands.manualMode;
    let request={source:'NONE',leftPwm:0,rightPwm:0,valid:false};
    const compassHeading=s.compassPolicy?.available?s.compassPolicy.headingDeg:NaN;
    s.targetHeading=bearing(s.position,s.target);s.headingError=wrap180(s.targetHeading-compassHeading);
    if(manual){
      s.hold.phase='none';request={source:'MANUAL',leftPwm:clamp(s.commands.manualSpeed+s.commands.manualSteer,-178,178),rightPwm:clamp(s.commands.manualSpeed-s.commands.manualSteer,-178,178),valid:true};s.controllerKind='MANUAL · command expires after500ms';
    }else if(grid&&s.hold.phase==='none'&&routeReady(s)&&s.inputs.route&&driveReady(s)){
      const los=currentLos(s),key=`GRID SCAN:${s.waypointIndex}:${s.target.x}:${s.target.y}`,memoryReset=key!==s.gridControlKey;
      if(memoryReset){s.gridGuidance=Grid.resetController(s.gridGuidance);s.gridControlKey=key;}
      s.los=los;s.targetHeading=los.valid?los.bearingDeg:s.targetHeading;s.headingError=wrap180(s.targetHeading-compassHeading);
      const result=Grid.updateController(s.gridGuidance.controller,{targetDeg:s.targetHeading,headingDeg:compassHeading,basePwm:110,sampleUs:(s.clockMs*1000)>>>0,fresh:los.valid&&compassReady(s)});
      s.gridGuidance.controller=result.state;request=result.request;
      s.headingRateDps=result.observation.rate;s.integral=result.observation.integralPwm;s.errorRateDps=0;s.controlDerivative=-result.observation.rate;
      s.controllerKind='GRID · LOS + continuous steering/surge';s.controlOutput=result.observation.steeringPwm/178;
      row(s,'grid-control',{targetDeg:s.targetHeading,headingDeg:compassHeading,plantHeadingDeg:s.heading,headingError:s.headingError,basePwm:110,sampleUs:(s.clockMs*1000)>>>0,fresh:true,rateDps:result.observation.rate,integralPwm:result.observation.integralPwm,steeringPwm:result.observation.steeringPwm,surgePwm:result.observation.surgePwm,reset:memoryReset||result.observation.reset},'GridHeadingController.update + joint mixer (not generic PID)',request.valid,s.controllerKind,{requestedPwm:{left:request.leftPwm,right:request.rightPwm},los});
    }else if(['SPIRAL SCAN','RTH'].includes(s.missionState)&&driveReady(s)){
      const spiral=s.missionState==='SPIRAL SCAN',a=s.anomaly,key=s.missionState+':'+a.spiralIndex,memoryReset=key!==s.controlKey;
      if(memoryReset){s.headingControl=Policy.createHeading();s.controlKey=key;}
      const los=spiral&&a.center&&!a.planner?.done?Grid.localLos(s.position,[a.spiralTargets[a.spiralIndex-1]||a.center,s.target],1,HOME,{scale:MAP_SCALE_M_PER_UNIT,lookaheadM:3,radiusM:2,passMarginM:.5}):null;
      if(spiral&&los?.valid)s.targetHeading=los.bearingDeg;
      s.headingError=wrap180(s.targetHeading-compassHeading);const d=spiral?los?.distToEndM:distance(s.position,s.homePoint)*MAP_SCALE_M_PER_UNIT;
      const valid=spiral?!!los?.valid:s.inputs.home,park=!spiral&&d<=4;
      if(valid){
        const base=Policy.chooseBasePwm(s.headingError,d,spiral?110:130),result=Policy.heading(s.headingControl,s.targetHeading,compassHeading,base,DT_SECONDS);
        if(!park)s.headingControl=result.state;
        request={...result.request,source:spiral?'SPIRAL':'RTH',leftPwm:park?0:result.request.leftPwm,rightPwm:park?0:result.request.rightPwm};
        s.integral=result.state.integral;s.controlDerivative=result.state.derivative;s.errorRateDps=result.state.derivative;s.controlOutput=result.output/178;s.controllerKind='HeadingController · source PID + pivot hysteresis';
        row(s,'spiral-rth-control',{error:s.headingError,headingError:s.headingError,targetDeg:s.targetHeading,headingDeg:compassHeading,plantHeadingDeg:s.heading,integral:s.integral,errorDerivative:s.controlDerivative,basePwm:base,reset:memoryReset,park},'wrapped error PID; filtered D; saturation undo-I; pivot30/20; stop3; PWM80..178',request.valid,s.controllerKind,{request});
      }
    }
    if(!grid||manual||s.hold.phase!=='none')s.gridGuidance.controller=Grid.createState().controller;
    s.headingMetrics={clockMs:s.clockMs,position:{...s.acquiredPosition},target:{...s.target},measuredHeadingDeg:compassHeading,targetHeadingDeg:s.targetHeading,errorDeg:s.headingError};
    const drive=Grid.resolveDrive(s.gridGuidance.drive,request,{state:modes[s.missionState],safety:s.safetyState,emergencyPending:s.commands.emergency||s.commands.emergencyPending,navigationAvailable:driveReady(s),waterSampleHold:grid&&!manual&&s.hold.phase!=='none'},DT_SECONDS);
    s.gridGuidance.drive=drive.state;s.driveDecision=drive.decision;
    if(drive.decision.stopReason!=='NONE'){s.headingControl=Policy.createHeading();if(drive.decision.stopReason!=='REQUESTED_STOP')s.gridGuidance.controller=Grid.createState().controller;}
    s.requestedPwm={left:request.leftPwm,right:request.rightPwm};s.appliedPwm={left:drive.decision.leftPwm,right:drive.decision.rightPwm};
    s.request={left:request.leftPwm/178,right:request.rightPwm/178};s.applied={left:s.appliedPwm.left/178,right:s.appliedPwm.right/178};s.motorPwm={...s.applied};
    s.lastAbsPwm=Math.max(Math.abs(s.appliedPwm.left),Math.abs(s.appliedPwm.right));if(s.lastAbsPwm>=80)s.lastHardThrustMs=s.clockMs;
    row(s,grid?'grid-drive':'drive-interlocks',{request:s.requestedPwm,stopReason:drive.decision.stopReason,state:modes[s.missionState],hold:s.hold.phase},'ONE final DriveController.resolve: source/state/interlocks/clamp/floor/reversal-neutral/slew',drive.decision.stopReason==='NONE',drive.decision.stopReason,{appliedPwm:s.appliedPwm});
    if(grid)row(s,'drive-interlocks',{ready:driveReady(s),hold:s.hold.phase},'only final applied signedPWM drives plant',drive.decision.stopReason==='NONE',drive.decision.stopReason,{applied:s.applied});
    if(!driveReady(s)||s.appliedPwm.left===0&&s.appliedPwm.right===0){s.speedMps=0;s.drift={x:0,y:0};return;}
    const force=s.force.remainingSec>0?s.force.direction:0;const yaw=(s.applied.left-s.applied.right)*45+force*12;s.heading=wrap360(s.heading+yaw*DT_SECONDS);const radians=s.heading*Math.PI/180;
    s.speedMps=(s.applied.left+s.applied.right)/2*2.3;
    s.drift={x:force*.25*Math.cos(radians),y:force*.25*Math.sin(radians)};
    s.position={x:s.position.x+(Math.sin(radians)*s.speedMps+s.drift.x)*DT_SECONDS/MAP_SCALE_M_PER_UNIT,y:s.position.y+(-Math.cos(radians)*s.speedMps+s.drift.y)*DT_SECONDS/MAP_SCALE_M_PER_UNIT};s.force.remainingSec=Math.max(0,s.force.remainingSec-DT_SECONDS);
    s.trail.push({...s.position});if(s.trail.length>1000)s.trail=s.trail.filter((_,i)=>i%2===0);
  }
  function acquire(s){
    s.acquiredPosition={...s.position};
    const calibration=s.inputs.compassCalibrationExample?Policy.COMPASS_EXAMPLE_CALIBRATION:null;
    const syntheticRaw=s.inputs.compassFollowPlant!==false?Policy.makeSyntheticCompassRaw(s.heading,calibration):null;
    s.compassPolicy=Policy.updateCompass(s.compassPolicy,{addressPresent:s.inputs.compass!==false,readOk:s.inputs.compassReadOk!==false,rawX:syntheticRaw?.rawX??s.inputs.compassRawX,rawY:syntheticRaw?.rawY??s.inputs.compassRawY,calibration},s.clockMs);
    s.compassAvailable=s.compassPolicy.available;s.acquiredHeading=s.compassAvailable?s.compassPolicy.headingDeg:NaN;
    row(s,'compass-acquisition',{addressPresent:s.compassPolicy.addressPresent,readOk:s.inputs.compassReadOk!==false,rawX:s.compassPolicy.rawX,rawY:s.compassPolicy.rawY,failCount:s.compassPolicy.failCount,calibrationLoaded:s.compassPolicy.calibrationLoaded,headingDeg:s.compassPolicy.headingDeg},'Compass.update fresh/read-success + isOk + finite getHeadingDeg; source config yaw/declination/hard-iron',s.compassAvailable,s.compassAvailable?'Compass sample usable':'Compass stale/unavailable',{available:s.compassAvailable,headingDeg:s.acquiredHeading});
    s.rawGpsValid=s.inputs.gps&&Policy.gpsValid({locationValid:true,ageMs:s.inputs.gpsAgeMs??0,sats:s.inputs.gpsSats??8,hdop:s.inputs.gpsHdop??1});
    s.gpsPolicy=Policy.gpsLoss(s.gpsPolicy,s.rawGpsValid,s.clockMs);s.gpsFixValid=s.rawGpsValid&&!s.gpsPolicy.fault;s.gpsReady=s.gpsFixValid&&s.gpsPolicy.tier==='OK';
    if(Object.hasOwn(s.inputs,'batteryMv')){s.battery=Policy.battery(s.battery,s.inputs.batteryMv);s.batteryVoltage=s.battery.voltage;}
    else s.batteryVoltage=Number.isFinite(s.inputs.batteryVoltage)?s.inputs.batteryVoltage:12.15; // explicitly injected FILTERED pack voltage
    s.batteryPercent=Policy.batteryPercent(s.batteryVoltage);
    s.motionDisturbance=s.lastHardThrustMs!==undefined&&s.clockMs-s.lastHardThrustMs<3000;
    if(s.clockMs-s.sensor.lastTempMs>=750){const temp=s.inputs.sensorValid?(s.inputs.tempC??27):NaN;s.sensor.lastTempMs=s.clockMs;s.sensor.tempValid=Number.isFinite(temp)&&temp> -55&&temp<125;if(s.sensor.tempValid)s.sensor.temp=temp;}
    if(s.sensor.tempValid)s.cache.temp=s.sensor.temp;
  }
  function sample(s){
    s.sampleId++;const high=s.anomaly.armed&&distance(s.position,ANOMALY_REGION)<=ANOMALY_REGION.radius,voltage=s.inputs.turbidityV??(high?1.2:1.884375),adsReady=s.inputs.sensorValid&&s.inputs.adsReady!==false;
    s.sensor.ntu=Policy.turbidity(voltage,adsReady);s.sensor.ph=Policy.ph(s.inputs.phV??2.532,s.sensor.temp,s.sensor.tempValid,adsReady);
    const ntu=s.sensor.ntu.value;if(s.sensor.ntu.valid&&Number.isFinite(ntu))s.cache.ntu=ntu;
    const watch=['GRID SCAN','SPIRAL SCAN'].includes(s.missionState);
    if(watch)s.anomaly.monitor=Policy.anomaly(s.anomaly.monitor,s.sensor.ntu.valid?ntu:NaN,s.motionDisturbance,s.clockMs);
    const m=s.anomaly.monitor;s.anomaly.window=m.buffer.slice(0,m.count);s.anomaly.mean=m.count?m.mean:NaN;s.anomaly.score=m.score;s.anomaly.turbidityNtu=ntu;s.anomaly.eligible=m.count===8&&s.waypointIndex>=1;
    const elapsed=s.clockMs-s.hold.sinceMs,quiet=s.missionState==='GRID SCAN'&&s.hold.phase!=='none'&&elapsed>=3000&&elapsed<8000;
    if(quiet&&Number.isFinite(s.sensor.ph.value)){s.phSum=Math.fround(s.phSum+s.sensor.ph.value);s.phCount++;s.lastPh=Math.fround(s.phSum/s.phCount);}
    else if(!quiet)s.lastPh=NaN;
    row(s,'sensor-conversion',{sampleId:s.sampleId,voltage,adsReady,tempValid:s.sensor.tempValid,calibration:s.sensor.calibration},'shared ADS acquisition: loop0 then every5x50ms; temperature750ms; finite pH conversion retained even quality-invalid',s.sensor.ntu.valid,`ADS-${s.sampleId}`,{ntu:s.sensor.ntu,ph:s.sensor.ph,temp:s.sensor.temp,phCount:s.phCount});
    row(s,'anomaly-eligibility',{window:s.anomaly.window,mean:s.anomaly.mean,full:m.count===8,passedFirst:s.waypointIndex>=1,baseline:m.baseline,baselineSince:m.baselineSince,roc:m.roc,motion:s.motionDisturbance,raw:m.raw,cooldown:m.cooldownActive},'WaterAnomalyMonitor: SMA8 absolute OR baseline dwell; ROC diagnostic; hysteresis/stale/cooldown; FSM independently gates WP1',watch&&m.trigger&&s.waypointIndex>=1,m.trigger?'anomaly pending':'monitoring source anomaly predicate',{trigger:m.trigger,score:m.score});
  }
  function publishWater(s){const standby=['READY','COMPLETE'].includes(s.missionState),quiet=s.missionState==='GRID SCAN'&&s.hold.phase==='measure'&&s.appliedPwm.left===0&&s.appliedPwm.right===0;
    if(!quiet)s.lastPh=NaN;s.water={ph:standby?NaN:s.lastPh??NaN,ntu:standby?NaN:s.cache.ntu,temp:standby?NaN:s.cache.temp};
    row(s,'publication-nan-cache',{quiet,standby,phCount:s.phCount,applied:s.applied},'post-drive: GRID measure && appliedPWM==0; STANDBY waterNaN; valid NTU/temp cache retained',quiet,standby?'STANDBY · water NaN':quiet?'quiet finite pH mean':'pH NaN; NTU/temp last-good',s.water);
  }
  function tick(s,receipt=null){if(!s.playing)return s;initialize(s);s.rows=s.startTracePending?clone(s.rows):[];s.startTracePending=false;s.clockMs+=50;s.eventSequence++;s.snapshotId++;s.logId++;
    // Production caller ordering: acquisition/anomaly BEFORE route/commands/FSM;
    // FSM sees the old hold flag; navigation releases it later; final Drive precedes publication.
    acquire(s);if((s.eventSequence-1)%5===0)sample(s);if(receipt)s=receiveStationMessage(s,receipt);decide(s);
    if(s.missionState==='GRID SCAN'&&!s.commands.manualMode)holdPolicy(s);
    if(s.missionState==='SPIRAL SCAN')navigate(s);else if(driveReady(s)&&s.hold.phase==='none'&&!s.commands.manualMode&&s.missionState==='GRID SCAN'&&routeReady(s)&&s.inputs.route)navigate(s);
    control(s);
    publishWater(s);s.memoryLog.push({logId:s.logId,sampleId:s.sampleId,snapshotId:s.snapshotId});if(s.memoryLog.length>32)s.memoryLog.shift();
    if(s.clockMs%1000===0){s.txDue++;row(s,'telemetry-lineage',{sampleId:s.sampleId,snapshotId:s.snapshotId,water:s.water},'model clock %1000ms ==0',true,'TX due · immutable snapshot ไป browser queue',{txDue:s.txDue});}return s;}
  function advance(s,count=1){if(!Number.isInteger(count)||count<1||count>100000)throw new RangeError('step count must be 1..100000');for(let i=0;i<count;i++)s=tick(s);return s;}
  function stepOnce(state,receipt=null){let n=clone(state);if(n.policyClockActive||receipt?.envelope?.kind==='command')n.playing=true;else if(n.stationStoryActive){if(!n.playing)n=resume(n);}else if(n.missionState==='READY')n=start(n);else n=resume(n);if(!n.playing)return {state:n,event:null};const before=snapshot(n);n=tick(n,receipt);const rows=clone(n.rows),last=rows.at(-1)||{predicate:{name:'station setup tick',result:n.stationStage},decision:n.stationReason,source:source('start-readiness')};const event=freeze({id:n.eventSequence,atMs:n.clockMs,inputs:{missionState:before.missionState,position:before.position,heading:before.heading,target:before.target,targetHeading:before.targetHeading,headingError:before.headingError,request:before.request,requestedPwm:before.requestedPwm,appliedPwm:before.appliedPwm,stationStage:before.stationStage},predicate:last.predicate,decision:last.decision,output:{position:clone(n.position),heading:n.heading,request:clone(n.request),applied:clone(n.applied),requestedPwm:clone(n.requestedPwm),appliedPwm:clone(n.appliedPwm),los:clone(n.los),waypointIndex:n.waypointIndex,stationStage:n.stationStage},source:last.source,rows});n.playing=false;return {state:n,event};}
  function snapshot(s){const n=clone(s);n.target={...targetFor(s)};n.hasNavigationTarget=s.missionState==='RTH'||s.missionState==='SPIRAL SCAN'&&!!s.anomaly.center||routeReady(s);n.routeReady=routeReady(s);n.los=s.missionState==='GRID SCAN'&&routeReady(s)?currentLos(s):s.missionState==='SPIRAL SCAN'&&s.anomaly.center&&!s.anomaly.planner?.done?Grid.localLos(s.position,[s.anomaly.spiralTargets[s.anomaly.spiralIndex-1]||s.anomaly.center,n.target],1,HOME,{scale:MAP_SCALE_M_PER_UNIT,lookaheadM:3,radiusM:2,passMarginM:.5}):null;
    const metrics=s.headingMetrics;n.plantHeading=s.heading;n.measuredHeading=metrics?.measuredHeadingDeg??(s.compassPolicy?.available?s.compassPolicy.headingDeg:NaN);n.headingMetrics=metrics?clone(metrics):null;
    n.liveTargetHeading=n.los?.valid?n.los.bearingDeg:bearing(s.position,n.target);n.targetHeading=metrics?.targetHeadingDeg??n.liveTargetHeading;n.headingError=metrics?.errorDeg??wrap180(n.liveTargetHeading-n.measuredHeading);
    n.targetDistanceM=n.hasNavigationTarget?distance(s.position,n.target)*MAP_SCALE_M_PER_UNIT:null;n.guidanceDistanceM=n.los?.valid?n.los.lookAheadDistM:null;n.plantLabel='ALL modes: final applied signedPWM / 178 -> illustrative uncalibrated yaw/surge/pose';return n;}
  function activateAnomaly(s){const n=clone(s);n.anomaly.armed=true;return n;}
  function addDisturbance(s,direction=1){let n=s.missionState==='READY'?start(s):resume(s);n=clone(n);n.force={direction:direction<0?-1:1,remainingSec:2.5};return n;}
  function telemetry(s,sequence){const geo=toGeo(s.acquiredPosition||s.position);return {sequence_number:sequence,gps_lat:(s.gpsFixValid??s.inputs.gps)?geo.lat:NaN,gps_lon:(s.gpsFixValid??s.inputs.gps)?geo.lon:NaN,water_ph:s.water.ph,water_turbidity:s.water.ntu,water_temp:s.water.temp,current_mode:({STANDBY:0,GRID_PATROL:1,SPIRAL_SCAN:2,RETURN_HOME:3,EMERGENCY_STOP:4})[s.mode],battery_percent:s.batteryPercent??Policy.batteryPercent(12.15),heading_angle:compassReady(s)?s.acquiredHeading:NaN};}
  return Object.freeze({HOME,WAYPOINTS,DT_SECONDS,MAP_SCALE_M_PER_UNIT,PID,ANOMALY_REGION,ANOMALY_THRESHOLD,SPIRAL_POINTS,SPIRAL_MAX_RADIUS,GEOFENCE,createMission:options=>initialize(createMission(options)),createFixtureMission:()=>initialize(createMission({preloadedRoute:true})),reset:options=>initialize(createMission(options)),start,beginStory,markRoutePosted,markStartPosted,receiveStationMessage,command,wakePolicyClock,pause,resume,tick,advance,stepOnce,snapshot,clone,wrap180,wrap360,bearing,distance,makeSpiral,analyzeSma,addDisturbance,activateAnomaly,telemetry,source,localLos:Grid.localLos,inGeofence:p=>p.x>=GEOFENCE.minX&&p.x<=GEOFENCE.maxX&&p.y>=GEOFENCE.minY&&p.y<=GEOFENCE.maxY});
});
