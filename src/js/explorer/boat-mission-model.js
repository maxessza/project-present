(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BoatMissionModel = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const HOME = Object.freeze({ x: 335, y: 455 });
  const WAYPOINTS = Object.freeze([
    {x:440,y:170},{x:440,y:280},{x:440,y:390},{x:665,y:390},{x:665,y:280},
    {x:665,y:170},{x:890,y:170},{x:890,y:280},{x:890,y:390}
  ].map(Object.freeze));
  const MAP_SCALE_M_PER_UNIT = 0.15;
  const GPS_FRESH_MS = 2000;
  const GPS_SAFE_STOP_MS = 10000;
  const GPS_FAULT_MS = 120000;
  const DT_SECONDS = 0.25;
  const SAMPLE_SETTLE_MS = 3000;
  const SAMPLE_MEASURE_MS = 5000;
  const WATER_WINDOW = 8;
  const WATER_TRIGGER_NTU = 50;
  const WATER_COOLDOWN_MS = 600000;
  const SPIRAL_CLEAN_ABORT_MS = 8000;
  const SPIRAL_A_M = 4;
  const SPIRAL_MAX_M = 8;
  const SPIRAL_MAX_THETA = Math.PI * 6;
  const SPIRAL_DTHETA = Math.PI / 4;

  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function wrap180(degrees) {
    let value = (degrees + 180) % 360;
    if (value < 0) value += 360;
    return value - 180;
  }
  function wrap360(degrees) { return ((degrees % 360) + 360) % 360; }
  function distance(a, b) { return Math.hypot((b.x - a.x) * MAP_SCALE_M_PER_UNIT, (a.y - b.y) * MAP_SCALE_M_PER_UNIT); }
  function bearing(a, b) { return wrap360(Math.atan2(b.x - a.x, a.y - b.y) * 180 / Math.PI); }
  function validGpsQuality(gps) {
    return gps.locationValid && Number.isFinite(gps.sampleAgeMs) && gps.sampleAgeMs <= GPS_FRESH_MS &&
      Number.isFinite(gps.sats) && gps.sats >= 6 && Number.isFinite(gps.hdop) && gps.hdop < 2;
  }
  function gpsAgeMs(state) {
    return state.gps.lastValidAtMs === null ? null : Math.max(0, state.clockMs - state.gps.lastValidAtMs);
  }
  function gpsTier(state) {
    if (state.gps.faultLatched) return 'GPS_FAULT';
    const age = gpsAgeMs(state);
    if (age === null) return 'SAFE_STOP';
    if (age < GPS_SAFE_STOP_MS) return 'OK';
    return 'SAFE_STOP';
  }
  function gpsValid(state) {
    return validGpsQuality(state.gps) && state.gps.filterInitialized &&
      !state.gps.faultLatched && gpsAgeMs(state) !== null && gpsAgeMs(state) <= GPS_FRESH_MS;
  }
  function compassValid(state) {
    const c = state.compass;
    return c.present && c.fresh && c.failCount < 5 && Number.isFinite(c.headingDeg);
  }
  function routeValid(state) { return state.routeSealed && state.waypoints.length > 0; }
  function startReady(state) { return state.safety === 'NORMAL' && gpsValid(state) && compassValid(state) && routeValid(state); }
  function targetFor(state) {
    if (state.mode === 'RTH') return state.home || HOME;
    if (state.mode === 'SPIRAL') {
      const theta = state.spiralIndex * SPIRAL_DTHETA;
      const radius = Math.min(SPIRAL_MAX_M, SPIRAL_A_M + ((SPIRAL_MAX_M - SPIRAL_A_M) / SPIRAL_MAX_THETA) * theta);
      return { x: state.spiralCenter.x + radius * Math.cos(theta) / MAP_SCALE_M_PER_UNIT,
        y: state.spiralCenter.y - radius * Math.sin(theta) / MAP_SCALE_M_PER_UNIT };
    }
    return state.waypoints[Math.min(state.waypointIndex, state.waypoints.length - 1)] || state.position;
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function createMission() {
    return {
      clockMs: 0, clockRate: 1, mode: 'STANDBY', pendingStart: false, safety: 'NORMAL',
      gps: { receiving: true, locationValid: false, sats: 0, hdop: 99, sampleAgeMs: 0, filterInitialized: false, everHadFix: false, lastValidAtMs: null, faultLatched: false },
      compass: { present: false, fresh: false, failCount: 0, headingDeg: 0, calibrationLoaded: false },
      water: { inputNtu:5, valid:true, samples:[], meanNtu:5, trigger:false, cleanSinceMs:null, cooldownUntilMs:0 },
      home: null, waypoints: WAYPOINTS.map(p => ({...p})), routeSealed: true,
      position: {...HOME}, heading: 0, speedMps: 0, target: {...WAYPOINTS[0]}, waypointIndex: 0,
      trail: [{...HOME}], steering: { targetBearing: 0, error: 0, turnRateDps: 0, speedMps: 0, normalized: 0 },
      hold: null, departed: false, departedMs: 0, rthEntryDistanceM: null, arrivalMs: 0,
      spiralIndex: 0, spiralCenter: {...HOME}, lastTransition: 'รอ START · GPS/compass ยังไม่พร้อม',
      revision: 0
    };
  }
  function updateGpsValidTimestamp(state) {
    if (state.gps.receiving && validGpsQuality(state.gps)) {
      state.gps.filterInitialized = true;
      state.gps.everHadFix = true;
      state.gps.lastValidAtMs = state.clockMs - state.gps.sampleAgeMs;
    }
  }
  function readyPreset(state) {
    const s = clone(state);
    if (s.mode !== 'ESTOP' && !s.gps.faultLatched) s.safety = 'NORMAL';
    Object.assign(s.gps, {receiving:true,locationValid:true,sats:8,hdop:1.2,sampleAgeMs:0,filterInitialized:true,everHadFix:true});
    s.gps.lastValidAtMs = s.clockMs;
    Object.assign(s.compass, {present:true,fresh:true,failCount:0,headingDeg:s.heading,calibrationLoaded:true});
    s.home = {...HOME};
    s.routeSealed = true;
    s.lastTransition = 'ชุดข้อมูลจำลองพร้อม · GPS/compass + HOME preset';
    s.revision += 1;
    return s;
  }
  function setGps(state, values) {
    const s = clone(state);
    Object.assign(s.gps, values || {});
    updateGpsValidTimestamp(s);
    s.revision += 1;
    return s;
  }
  function setCompass(state, values) {
    const s = clone(state);
    Object.assign(s.compass, values || {});
    s.revision += 1;
    return s;
  }
  function setHome(state, enabled) {
    const s = clone(state);
    s.home = enabled ? (s.home || {...s.position}) : null;
    s.lastTransition = enabled ? 'กำหนด HOME จำลองจากตำแหน่งปัจจุบัน' : 'ไม่มี HOME · GRID จบแล้วเข้า STANDBY';
    s.revision += 1;
    return s;
  }
  function setWater(state, values) {
    const s=clone(state); Object.assign(s.water,values||{});
    s.water.valid=Boolean(s.water.valid) && Number.isFinite(s.water.inputNtu);
    s.revision+=1; return s;
  }
  function setRoute(state, sealed) {
    const s = clone(state);
    s.routeSealed = Boolean(sealed);
    s.revision += 1;
    return s;
  }
  function setClockRate(state, rate) {
    if (![1,4,12].includes(rate)) throw new RangeError('clock rate must be 1, 4, or 12');
    const s = clone(state); s.clockRate = rate; s.revision += 1; return s;
  }
  function setSafety(state, safety) {
    if (!['NORMAL','ESTOP'].includes(safety)) throw new RangeError('safety must be NORMAL or ESTOP');
    const s = clone(state);
    s.safety = safety;
    if (safety === 'ESTOP') { s.mode = 'ESTOP'; s.pendingStart = false; s.speedMps = 0; }
    s.revision += 1;
    return s;
  }
  function reset() { return createMission(); }
  function emergency(state) {
    const s = clone(state);
    s.safety = 'ESTOP'; s.mode = 'ESTOP'; s.pendingStart = false; s.speedMps = 0;
    s.lastTransition = 'E-STOP ชัดเจน · คำสั่งขับเป็นกลาง'; s.revision += 1;
    return s;
  }
  function clearEstop(state) {
    const s = clone(state);
    const freshGpsForClear = validGpsQuality(s.gps) && s.gps.filterInitialized &&
      gpsAgeMs(s) !== null && gpsAgeMs(s) <= GPS_FRESH_MS;
    if (s.mode !== 'ESTOP' || s.safety !== 'NORMAL' || !freshGpsForClear) {
      s.lastTransition = 'ล้าง E-STOP ไม่ผ่าน · ต้องมี GPS สดและ safety NORMAL';
    } else {
      s.gps.faultLatched = false; s.mode = 'STANDBY'; s.pendingStart = false; s.speedMps = 0;
      s.lastTransition = 'ล้าง E-STOP ผ่าน → STANDBY · ต้องกด START ใหม่';
    }
    s.revision += 1;
    return s;
  }
  function start(state) {
    const s = clone(state);
    if (s.mode === 'STANDBY') {
      s.pendingStart = true;
      s.lastTransition = 'รับคำขอ START · รอตรวจ NORMAL + GPS + compass + route';
    }
    s.revision += 1;
    return s;
  }
  function forceSpiral(state) {
    const s = clone(state);
    if (s.mode === 'GRID' && s.waypointIndex >= 1 && !s.hold) {
      s.mode = 'SPIRAL'; s.spiralIndex = 0; s.spiralCenter = {...s.position};
      s.spiralFromWater=false; s.spiralStartedMs=s.clockMs; s.water.cleanSinceMs=null;
      s.lastTransition = 'คำสั่ง SPIRAL demo ผ่าน · ผ่าน WP1 แล้ว';
    } else s.lastTransition = 'SPIRAL demo ยังไม่ผ่าน · ต้อง GRID หลัง WP1 และพ้น sample hold';
    s.revision += 1;
    return s;
  }
  function movePlant(s, dt) {
    const target = targetFor(s);
    const d = distance(s.position, target);
    const targetBearing = bearing(s.position, target);
    const error = wrap180(targetBearing - s.heading);
    const turnRate = clamp(error * 1.6, -40, 40);
    const heading = wrap360(s.heading + turnRate * dt);
    const speed = d <= (s.mode === 'SPIRAL' ? 2 : 3) ? 0.25 : 0.9;
    const r = heading * Math.PI / 180;
    const position = { x: s.position.x + speed * dt * Math.sin(r) / MAP_SCALE_M_PER_UNIT,
      y: s.position.y - speed * dt * Math.cos(r) / MAP_SCALE_M_PER_UNIT };
    s.target = target;
    s.heading = heading;
    s.position = position;
    s.speedMps = speed;
    s.compass.headingDeg = heading;
    s.steering = { targetBearing, error, turnRateDps: turnRate, speedMps: speed,
      normalized: clamp(turnRate / 40, -1, 1) };
    s.trail.push({...position});
    if (s.trail.length > 1200) s.trail.shift();
    return d;
  }
  function sampleWater(s) {
    const w=s.water;
    if (!w.valid || !Number.isFinite(w.inputNtu)) { w.samples=[]; w.trigger=false; return; }
    w.samples.push(w.inputNtu);
    if (w.samples.length>WATER_WINDOW) w.samples.shift();
    w.meanNtu=w.samples.reduce((sum,value)=>sum+value,0)/w.samples.length;
    w.trigger=w.samples.length===WATER_WINDOW && w.meanNtu>WATER_TRIGGER_NTU && s.clockMs>=w.cooldownUntilMs;
  }
  function tick(state) {
    const s = clone(state);
    s.clockMs += DT_SECONDS * 1000;
    updateGpsValidTimestamp(s);
    sampleWater(s);
    const age = gpsAgeMs(s);
    if (age !== null && age >= GPS_FAULT_MS) s.gps.faultLatched = true;
    if (s.mode==='GRID' && s.waypointIndex>=1 && !s.hold && s.water.trigger) {
      s.mode='SPIRAL'; s.spiralIndex=0; s.spiralCenter={...s.position};
      s.spiralFromWater=true; s.spiralStartedMs=s.clockMs; s.water.cleanSinceMs=null;
      s.lastTransition='Water SMA8 > 50 NTU · auto SPIRAL หลัง WP1';
    }
    if (s.mode==='SPIRAL' && s.spiralFromWater) {
      if (s.water.trigger) s.water.cleanSinceMs=null;
      else if (s.water.cleanSinceMs===null) s.water.cleanSinceMs=s.clockMs;
      if (s.clockMs-s.spiralStartedMs>=240000 || s.water.cleanSinceMs!==null && s.clockMs-s.water.cleanSinceMs>=SPIRAL_CLEAN_ABORT_MS) {
        s.mode='GRID'; s.speedMps=0; s.water.cooldownUntilMs=s.clockMs+WATER_COOLDOWN_MS;
        s.spiralFromWater=false; s.lastTransition='SPIRAL auto abort · clean dwell/timeout → pending GRID';
      }
    }
    if (s.home && gpsValid(s) && !s.departed) {
      s.departedMs = distance(s.position, s.home) >= 12 ? s.departedMs + DT_SECONDS * 1000 : 0;
      if (s.departedMs >= 2000) s.departed = true;
    } else if (!s.departed) s.departedMs = 0;
    if (s.safety === 'ESTOP' || s.gps.faultLatched) {
      s.mode = 'ESTOP'; s.pendingStart = false; s.speedMps = 0;
      s.lastTransition = s.gps.faultLatched ? 'GPS_FAULT latched · explicit Clear + fresh GPS required' : 'E-STOP · drive neutral';
    } else if (s.mode === 'STANDBY' && s.pendingStart) {
      if (s.safety !== 'NORMAL') {
        s.pendingStart = false;
        s.lastTransition = 'START consumed · safety ไม่ NORMAL';
      } else if (startReady(s)) {
        s.mode = 'GRID'; s.pendingStart = false; s.waypointIndex = 0;
        s.departed = false; s.departedMs = 0; s.rthEntryDistanceM = null;
        s.lastTransition = 'START accepted → GRID · การเคลื่อนที่เริ่ม tick ถัดไป';
      } else {
        s.lastTransition = 'START pending · GPS/compass/route ยังไม่ครบ · HOME ไม่ใช่ gate';
      }
    } else if (s.mode === 'ESTOP') {
      s.speedMps = 0;
    } else if (s.mode === 'GRID' || s.mode === 'SPIRAL' || s.mode === 'RTH') {
      if (!gpsValid(s) || !compassValid(s) || (s.mode === 'RTH' && !s.home)) {
        s.speedMps = 0;
        s.lastTransition = !gpsValid(s) ? 'NAVIGATION_UNAVAILABLE · GPS ไม่สด → drive neutral' :
          !compassValid(s) ? 'NAVIGATION_UNAVAILABLE · compass ไม่พร้อม → drive neutral' : 'RTH ไม่มี HOME · E-STOP';
        if (s.mode === 'RTH' && !s.home) { s.mode = 'ESTOP'; s.safety = 'ESTOP'; }
      } else if (s.hold && s.clockMs < s.hold.untilMs) {
        s.speedMps = 0;
        s.hold.phase = s.clockMs - s.hold.startMs < SAMPLE_SETTLE_MS ? 'settle' : 'measure';
        s.lastTransition = `sample hold · ${s.hold.phase} · drive neutral`;
      } else {
        if (s.hold) { s.hold = null; s.lastTransition = 'sample hold ครบ · เดินทางต่อ'; }
        const oldIndex = s.waypointIndex;
        const d = movePlant(s, DT_SECONDS);
        const radius = s.mode === 'SPIRAL' ? 2 : 3;
        if (s.mode === 'RTH') {
          const homeDistance = distance(s.position, s.home);
          const canArrive = s.home && gpsValid(s) && s.departed && s.rthEntryDistanceM > 4 && homeDistance <= 4;
          s.arrivalMs = canArrive ? s.arrivalMs + DT_SECONDS * 1000 : 0;
          if (s.arrivalMs >= 3000) {
            s.mode = 'STANDBY'; s.speedMps = 0; s.lastTransition = 'RTH arrived · ≤4m dwell 3s → STANDBY';
          }
        } else if (d <= radius) {
          if (s.mode === 'SPIRAL') {
            if (s.spiralIndex >= 24) { s.mode = 'GRID'; s.spiralFromWater=false; s.water.cooldownUntilMs=s.clockMs+WATER_COOLDOWN_MS; s.lastTransition = 'SPIRAL ครบ 25 จุด → กลับ GRID จุดถัดไป'; }
            else s.spiralIndex += 1;
          } else if (s.mode === 'GRID') {
            if (s.waypointIndex < s.waypoints.length - 1) {
              s.waypointIndex += 1;
              if (s.waypointIndex % 2 === 0 && s.waypointIndex < s.waypoints.length) {
                s.hold = { startMs:s.clockMs, untilMs:s.clockMs + SAMPLE_SETTLE_MS + SAMPLE_MEASURE_MS, phase:'settle' };
                s.speedMps = 0;
                s.lastTransition = `WP${s.waypointIndex} · sample hold 3s settle + 5s measure`;
              }
            } else {
              s.mode = s.home ? 'RTH' : 'STANDBY';
              s.rthEntryDistanceM = s.home ? distance(s.position, s.home) : null;
              s.arrivalMs = 0;
              s.lastTransition = s.home ? 'GRID complete → ตรวจ RTH HOME gate' : 'GRID complete · ไม่มี HOME → STANDBY';
            }
          }
          if (oldIndex !== s.waypointIndex) s.target = targetFor(s);
        }
      }
    } else s.speedMps = 0;
    if (!['GRID','SPIRAL','RTH'].includes(s.mode) || !gpsValid(s) || !compassValid(s) || s.hold) s.speedMps = 0;
    s.revision += 1;
    return s;
  }
  function step(state, count = 1) {
    if (!Number.isInteger(count) || count < 1 || count > 10000) throw new RangeError('step count must be 1..10000');
    let s = state;
    for (let i=0;i<count;i+=1) s = tick(s);
    return s;
  }
  function snapshot(state) {
    const target = targetFor(state);
    const available = gpsValid(state) && compassValid(state);
    const age = gpsAgeMs(state);
    const tier = gpsTier(state);
    return clone({
      revision:state.revision, clockMs:state.clockMs, clockRate:state.clockRate, mode:state.mode,
      pendingStart:state.pendingStart, safety:state.safety,
      readiness:{gps:gpsValid(state),compass:compassValid(state),route:routeValid(state),home:Boolean(state.home),start:startReady(state)},
      gps:{...state.gps, ageMs:age, tier, navigable:gpsValid(state)},
      compass:{...state.compass, ok:compassValid(state)},
      water:{...state.water, sampleCount:state.water.samples.length, window:WATER_WINDOW, partialDetector:true},
      home:state.home, routeSealed:state.routeSealed, waypoints:state.waypoints,
      position:state.position, heading:state.heading, speedMps:state.speedMps, target, waypointIndex:state.waypointIndex,
      targetBearing:bearing(state.position,target), targetDistanceM:distance(state.position,target),
      headingError:wrap180(bearing(state.position,target)-state.heading), steering:state.steering,
      trail:state.trail, hold:state.hold, departed:state.departed, departedMs:state.departedMs,
      homeDistanceM:state.home ? distance(state.position,state.home) : null,
      rthEntryDistanceM:state.rthEntryDistanceM, arrivalMs:state.arrivalMs,
      spiralIndex:state.mode==='SPIRAL'?state.spiralIndex:null, lastTransition:state.lastTransition,
      plantLabel:'illustrative coupled turn + surge; normalized request, not PWM/thrust'
    });
  }
  return Object.freeze({HOME,WAYPOINTS,MAP_SCALE_M_PER_UNIT,DT_SECONDS,SAMPLE_SETTLE_MS,SAMPLE_MEASURE_MS,WATER_WINDOW,WATER_TRIGGER_NTU,
    createMission,reset,readyPreset,setGps,setCompass,setHome,setWater,setRoute,setClockRate,setSafety,start,emergency,clearEstop,forceSpiral,step,snapshot,
    gpsValid,compassValid,startReady,wrap180,bearing,distance});
});