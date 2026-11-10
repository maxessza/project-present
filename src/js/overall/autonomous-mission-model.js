(function (root, factory) {
  // Compatibility entry; the canonical kernel replaces the historical toy below.
  const api = typeof module === 'object' && module.exports
    ? require('./mission-kernel.js') : root.MissionKernel;
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AutonomousMissionModel = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const HOME = Object.freeze({x:335,y:455});
  const WAYPOINTS = Object.freeze([
    {x:440,y:170},{x:440,y:280},{x:440,y:390},{x:665,y:390},{x:665,y:280},
    {x:665,y:170},{x:890,y:170},{x:890,y:280},{x:890,y:390}
  ].map(Object.freeze));
  const MAP_SCALE_M_PER_UNIT = 0.15;
  const DT_SECONDS = 0.05;
  const MAX_SPEED_MPS = 2.3;
  const MAX_TURN_RATE_DPS = 45;
  const ARRIVAL_RADIUS_UNITS = 4;
  const PWM_NEUTRAL = 127.5;
  const PWM_RANGE = 127.5;
  const PID = Object.freeze({kp:0.02,ki:0.0002,kd:0.0008});
  const INTEGRAL_LIMIT = 120;
  const ANOMALY_THRESHOLD = 70;
  const ANOMALY_REGION = Object.freeze({x:440,y:170,radius:36});
  const SPIRAL_POINTS = 24;
  const SPIRAL_MAX_RADIUS = 22;
  const GEOFENCE = Object.freeze({minX:295,maxX:930,minY:120,maxY:495});
  const FORCE_DURATION_SECONDS = 2.5;

  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function wrap180(degrees) {
    let value = (degrees + 180) % 360;
    if (value < 0) value += 360;
    return value - 180;
  }
  function wrap360(degrees) { return ((degrees % 360) + 360) % 360; }
  function distance(a, b) { return Math.hypot(b.x-a.x,b.y-a.y); }
  function bearing(a, b) { return wrap360(Math.atan2(b.x-a.x,a.y-b.y)*180/Math.PI); }
  function inGeofence(point) {
    return point.x >= GEOFENCE.minX && point.x <= GEOFENCE.maxX && point.y >= GEOFENCE.minY && point.y <= GEOFENCE.maxY;
  }
  function crossesThreshold(score, threshold = ANOMALY_THRESHOLD) { return score > threshold; }
  function mixPwm(output) {
    const u = clamp(Number.isFinite(output) ? output : 0,-1,1);
    return {
      left:Math.round(clamp(PWM_NEUTRAL+u*PWM_RANGE,0,255)),
      right:Math.round(clamp(PWM_NEUTRAL-u*PWM_RANGE,0,255))
    };
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function freezeTrace(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(key => freezeTrace(value[key]));
    return Object.freeze(value);
  }
  function makeSpiral(center) {
    return Array.from({length:SPIRAL_POINTS},(_,index) => {
      const ratio = index/(SPIRAL_POINTS-1);
      const radius = 7 + ratio*(SPIRAL_MAX_RADIUS-7);
      const theta = index*Math.PI/4;
      return {x:center.x+radius*Math.cos(theta),y:center.y+radius*Math.sin(theta)};
    });
  }
  function targetFor(state) {
    if (state.missionState === 'SPIRAL SCAN') return state.anomaly.spiralTargets[state.anomaly.spiralIndex] || state.position;
    if (state.missionState === 'RETURN TO GRID') return WAYPOINTS[state.anomaly.interruptedIndex] || state.position;
    return WAYPOINTS[Math.min(state.waypointIndex,WAYPOINTS.length-1)] || state.position;
  }
  function controllerOutput(error, integral, errorRate) {
    return clamp(PID.kp*error + PID.ki*integral + PID.kd*errorRate,-1,1);
  }
  function refreshControl(state) {
    state.target = {...targetFor(state)};
    state.targetHeading = bearing(state.position,state.target);
    state.headingError = wrap180(state.targetHeading-state.heading);
    const errorRate = state.previousError === null ? 0 : wrap180(state.headingError-state.previousError)/DT_SECONDS;
    const proposedIntegral = clamp(state.integral + state.headingError*DT_SECONDS,-INTEGRAL_LIMIT,INTEGRAL_LIMIT);
    const raw = PID.kp*state.headingError + PID.ki*proposedIntegral + PID.kd*errorRate;
    const saturated = Math.abs(raw)>1 && Math.sign(raw)===Math.sign(state.headingError);
    state.integral = saturated ? state.integral : proposedIntegral;
    state.controlOutput = controllerOutput(state.headingError,state.integral,errorRate);
    state.errorRateDps = errorRate;
    state.motorPwm = mixPwm(state.controlOutput);
    state.previousError = state.headingError;
  }
  function createMission() {
    const state = {
      missionState:'READY',playing:false,clockMs:0,waypointIndex:0,
      position:{...HOME},heading:0,target:{...WAYPOINTS[0]},targetHeading:0,headingError:0,
      integral:0,previousError:null,errorRateDps:0,controlOutput:0,motorPwm:{left:128,right:128},speedMps:0,
      trail:[{...HOME}],force:{direction:0,remainingSec:0,durationSec:FORCE_DURATION_SECONDS},drift:{x:0,y:0},
      anomaly:{armed:false,used:false,turbidityNtu:5,score:0,threshold:ANOMALY_THRESHOLD,
        interruptedIndex:null,detectedRemainingSec:0,spiralIndex:0,spiralTargets:[],center:null},
      lastEvent:'กด SIM เพื่อเริ่มภารกิจ · แบบจำลองสังเคราะห์',eventSequence:0
    };
    refreshControl(state);
    return state;
  }
  function reset() { return createMission(); }
  function start(state) {
    if (state.missionState !== 'READY' || state.playing) return state;
    const next = clone(state);
    next.missionState='GRID SCAN'; next.playing=true;
    next.lastEvent='เริ่มสแกนเส้นทาง GRID';
    refreshControl(next);
    return next;
  }
  function pause(state) {
    if (!state.playing) return state;
    const next=clone(state);next.playing=false;next.lastEvent='พักภารกิจ';return next;
  }
  function resume(state) {
    if (state.playing || ['READY','COMPLETE'].includes(state.missionState)) return state;
    const next=clone(state);next.playing=true;next.lastEvent='เล่นภารกิจต่อ';return next;
  }
  function addDisturbance(state,direction=1) {
    let next=state;
    if (next.missionState==='READY') next=start(next);
    else if (!next.playing) next=resume(next);
    if (!next.playing || next.missionState==='ANOMALY DETECTED') return next;
    next=clone(next);
    next.force={direction:direction<0?-1:1,remainingSec:FORCE_DURATION_SECONDS,durationSec:FORCE_DURATION_SECONDS};
    next.lastEvent='แรงรบกวนสังเคราะห์กำลังเปลี่ยนทิศและตำแหน่งจริงใน plant';
    return next;
  }
  function activateAnomaly(state) {
    if (!state.playing || state.missionState!=='GRID SCAN' || state.anomaly.used || state.anomaly.armed) return state;
    const next=clone(state);next.anomaly.armed=true;
    next.lastEvent='เปิด anomaly zone สังเคราะห์ · วัดขณะเรือกำลังเคลื่อนที่';
    return next;
  }
  function gridArrival(state) {
    if (state.waypointIndex < WAYPOINTS.length-1) {
      state.waypointIndex+=1;
      state.lastEvent=`ถึง WP${state.waypointIndex} · เดินทางต่อ`;
    } else {
      state.missionState='COMPLETE';state.playing=false;state.speedMps=0;
      state.lastEvent='GRID ครบ 9 จุด · ภารกิจเสร็จ';
    }
  }
  function advanceTarget(state) {
    if (state.missionState==='SPIRAL SCAN') {
      if (state.anomaly.spiralIndex < SPIRAL_POINTS-1) state.anomaly.spiralIndex+=1;
      else {
        state.anomaly.spiralIndex=SPIRAL_POINTS;
        state.missionState='RETURN TO GRID';
        state.lastEvent=`SPIRAL ครบ ${SPIRAL_POINTS} เป้าหมาย · กลับ WP${state.anomaly.interruptedIndex+1}`;
      }
    } else if (state.missionState==='RETURN TO GRID') {
      state.missionState='GRID SCAN';
      state.waypointIndex=state.anomaly.interruptedIndex;
      state.lastEvent=`กลับ GRID · ต่อที่ WP${state.waypointIndex+1} เดิม`;
    } else if (state.missionState==='GRID SCAN') gridArrival(state);
  }
  function integratePlant(state) {
    const target=targetFor(state);
    const remaining=distance(state.position,target);
    const pwm=state.motorPwm;
    const motorMean=(pwm.left+pwm.right)/255;
    const speed=MAX_SPEED_MPS*motorMean*Math.min(1,remaining/60);
    const turn=((pwm.left-pwm.right)/255)*MAX_TURN_RATE_DPS;
    const forceActive=state.force.remainingSec>0;
    const forceYaw=forceActive?state.force.direction*12:0;
    const heading=wrap360(state.heading+(turn+forceYaw)*DT_SECONDS);
    const radians=heading*Math.PI/180;
    const side={x:Math.cos(radians),y:Math.sin(radians)};
    if (forceActive) {
      state.drift.x+=state.force.direction*0.48*side.x*DT_SECONDS;
      state.drift.y+=state.force.direction*0.48*side.y*DT_SECONDS;
    }
    const decay=Math.exp(-0.7*DT_SECONDS);
    state.drift.x*=decay;state.drift.y*=decay;
    const forward={x:Math.sin(radians),y:-Math.cos(radians)};
    const proposed={
      x:state.position.x+(forward.x*speed+state.drift.x)*DT_SECONDS/MAP_SCALE_M_PER_UNIT,
      y:state.position.y+(forward.y*speed+state.drift.y)*DT_SECONDS/MAP_SCALE_M_PER_UNIT
    };
    state.position={x:clamp(proposed.x,GEOFENCE.minX,GEOFENCE.maxX),y:clamp(proposed.y,GEOFENCE.minY,GEOFENCE.maxY)};
    state.heading=heading;
    state.speedMps=speed;
    state.force.remainingSec=Math.max(0,state.force.remainingSec-DT_SECONDS);
    if (!state.force.remainingSec) state.force.direction=0;
    if (state.force.remainingSec===0 && Math.hypot(state.drift.x,state.drift.y)<0.002) state.drift={x:0,y:0};
    state.trail.push({...state.position});
    if (state.trail.length>1600) {
      const last=state.trail[state.trail.length-1];
      state.trail=state.trail.filter((_,index)=>index%2===0);
      if (state.trail[state.trail.length-1]!==last) state.trail.push(last);
    }
  }
  function anomalyAtPosition(state) {
    return state.anomaly.armed && !state.anomaly.used && state.missionState==='GRID SCAN' &&
      distance(state.position,ANOMALY_REGION)<=ANOMALY_REGION.radius && state.speedMps>0;
  }
  function triggerAnomaly(state) {
    state.anomaly.used=true;state.anomaly.armed=false;
    state.anomaly.interruptedIndex=state.waypointIndex;
    state.anomaly.detectedRemainingSec=1.5;
    state.anomaly.center={...state.position};
    state.anomaly.spiralTargets=makeSpiral(state.position);
    state.anomaly.spiralIndex=0;
    state.missionState='ANOMALY DETECTED';
    state.speedMps=0;state.force={direction:0,remainingSec:0,durationSec:FORCE_DURATION_SECONDS};
    state.drift={x:0,y:0};
    state.lastEvent='คะแนนเกิน threshold · ANOMALY DETECTED';
  }
  function tick(state) {
    if (!state.playing) return state;
    const next=state;
    next.clockMs+=DT_SECONDS*1000;
    if (next.missionState==='ANOMALY DETECTED') {
      next.anomaly.detectedRemainingSec=Math.max(0,next.anomaly.detectedRemainingSec-DT_SECONDS);
      if (!next.anomaly.detectedRemainingSec) {
        next.missionState='SPIRAL SCAN';
        next.lastEvent='เริ่มติดตามเป้าหมาย SPIRAL ที่สร้างรอบ anomaly';
      }
      refreshControl(next);
      return next;
    }
    if (['GRID SCAN','SPIRAL SCAN','RETURN TO GRID'].includes(next.missionState)) {
      integratePlant(next);
      if (anomalyAtPosition(next)) {
        next.anomaly.score=Math.min(100,next.anomaly.score+36*DT_SECONDS);
        next.anomaly.turbidityNtu=5+next.anomaly.score*1.3;
        if (crossesThreshold(next.anomaly.score,next.anomaly.threshold)) triggerAnomaly(next);
      }
      if (next.missionState==='SPIRAL SCAN' || next.missionState==='RETURN TO GRID' || next.missionState==='GRID SCAN') {
        const target=targetFor(next);
        if (distance(next.position,target)<=ARRIVAL_RADIUS_UNITS) advanceTarget(next);
      }
    }
    refreshControl(next);
    return next;
  }
  function advance(state,count=1) {
    if (!Number.isInteger(count)||count<1||count>100000) throw new RangeError('step count must be 1..100000');
    let next=state;for(let i=0;i<count;i+=1)next=tick(next);return next;
  }
  function stepOnce(state) {
    let next=clone(state);
    if (next.missionState==='READY') next=start(next);
    else if (!next.playing) next=resume(next);
    if (!next.playing) return Object.freeze({state:next,event:null});
    const before=snapshot(next);
    next=tick(next);
    const after=snapshot(next);
    next=pause(next);
    const id=(state.eventSequence||0)+1;
    next.eventSequence=id;
    const event=freezeTrace({id,atMs:after.clockMs,
      inputs:{missionState:before.missionState,position:before.position,heading:before.heading,target:before.target,
        targetHeading:before.targetHeading,headingError:before.headingError,request:before.motorPwm},
      predicate:{name:'fixed navigation tick',evaluated:true,result:after.lastEvent},decision:after.lastEvent,
      output:{position:after.position,heading:after.heading,request:after.motorPwm,waypointIndex:after.waypointIndex},
      source:{path:'src/core/Tasks.cpp',function:'navigationTask · GRID subset',lines:[898,958],
        sha256:'6ea523f9c8e12f6e324922c033fdb24f866d551c9600c21df78fd9ad563dc495',status:'simplified',
        browserHelper:'src/js/overall/autonomous-mission-model.js:201-227'}});
    return Object.freeze({state:next,event});
  }
  function snapshot(state) {
    const target=targetFor(state);
    const targetHeading=bearing(state.position,target);
    const headingError=wrap180(targetHeading-state.heading);
    return clone({
      missionState:state.missionState,playing:state.playing,clockMs:state.clockMs,waypointIndex:state.waypointIndex,
      position:state.position,heading:state.heading,target,targetHeading,headingError,
      controlOutput:state.controlOutput,motorPwm:state.motorPwm,speedMps:state.speedMps,
      trail:state.trail,force:state.force,drift:state.drift,
      anomaly:state.anomaly,integral:state.integral,errorRateDps:state.errorRateDps,
      lastEvent:state.lastEvent,targetDistanceM:distance(state.position,target)*MAP_SCALE_M_PER_UNIT,
      plantLabel:'fixed-step differential PWM + surge + transient environmental force; illustrative, not calibrated'
    });
  }
  return Object.freeze({HOME,WAYPOINTS,MAP_SCALE_M_PER_UNIT,DT_SECONDS,PID,ANOMALY_REGION,ANOMALY_THRESHOLD,SPIRAL_POINTS,SPIRAL_MAX_RADIUS,GEOFENCE,
    createMission,reset,start,pause,resume,addDisturbance,activateAnomaly,tick,advance,stepOnce,snapshot,wrap180,wrap360,bearing,distance,mixPwm,controllerOutput,crossesThreshold,makeSpiral,inGeofence});
});
