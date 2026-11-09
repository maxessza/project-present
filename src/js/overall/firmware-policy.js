(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FirmwarePolicy=api;})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  // Software policies only. Input acquisition, NVS, scheduling and actuators are not hardware emulations.
  const f=Math.fround,add=(a,b)=>f(f(a)+f(b)),sub=(a,b)=>f(f(a)-f(b)),mul=(a,b)=>f(f(a)*f(b)),div=(a,b)=>f(f(a)/f(b));
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),elapsed=(now,then)=>(now-then)>>>0;
  function wrap180(value){value=f(value);while(value>180)value=sub(value,360);while(value< -180)value=add(value,360);return value;}
  const COMPASS_FACTORY=Object.freeze({xMin:-2048,xMax:2048,yMin:-2048,yMax:2048});
  const COMPASS_EXAMPLE_CALIBRATION=Object.freeze({present:true,xMin:-1000,xMax:1000,yMin:-1200,yMax:1200,source:'EXAMPLE_ONLY; actual NVS unavailable'});
  const createCompass=()=>({addressPresent:true,fresh:false,failCount:0,rawX:0,rawY:0,headingDeg:NaN,lastGoodMs:0,updatedMs:0,calibrationLoaded:false,hardIron:{...COMPASS_FACTORY},isOk:false,available:false});
  function makeSyntheticCompassRaw(headingDeg,calibration=null){
    const c=calibration?.present===true&&[calibration.xMin,calibration.xMax,calibration.yMin,calibration.yMax].every(Number.isFinite)&&calibration.xMax-calibration.xMin>=600&&calibration.yMax-calibration.yMin>=600?calibration:COMPASS_FACTORY;
    const angle=(189.2-headingDeg)*Math.PI/180;
    return {rawX:Math.round((c.xMin+c.xMax)*.5+Math.cos(angle)*(c.xMax-c.xMin)*.4),rawY:Math.round((c.yMin+c.yMax)*.5+Math.sin(angle)*(c.yMax-c.yMin)*.4)};
  }
  function updateCompass(previous,sample,nowMs){
    const s={...previous,hardIron:{...previous.hardIron}},now=Number(nowMs)>>>0;
    s.addressPresent=sample?.addressPresent!==false;s.updatedMs=now;
    if(!s.addressPresent){s.fresh=false;s.headingDeg=NaN;s.isOk=false;s.available=false;return s;}
    if(sample?.readOk!==true){s.failCount=Math.min(255,s.failCount+1);s.fresh=false;s.headingDeg=NaN;s.isOk=false;s.available=false;return s;}
    const rawX=Number(sample.rawX),rawY=Number(sample.rawY);
    s.rawX=Number.isFinite(rawX)?clamp(Math.trunc(rawX),-32768,32767):0;
    s.rawY=Number.isFinite(rawY)?clamp(Math.trunc(rawY),-32768,32767):0;
    s.fresh=true;s.failCount=0;s.lastGoodMs=now;
    const c=sample.calibration,validCalibration=c?.present===true&&[c.xMin,c.xMax,c.yMin,c.yMax].every(Number.isFinite)&&c.xMax-c.xMin>=600&&c.yMax-c.yMin>=600;
    s.calibrationLoaded=validCalibration;s.hardIron=validCalibration?{xMin:c.xMin,xMax:c.xMax,yMin:c.yMin,yMax:c.yMax}:{...COMPASS_FACTORY};
    const xSpan=s.hardIron.xMax-s.hardIron.xMin,ySpan=s.hardIron.yMax-s.hardIron.yMin;
    const x=xSpan<1?s.rawX:(s.rawX-(s.hardIron.xMin+s.hardIron.xMax)*.5)/(xSpan*.5);
    const y=ySpan<1?s.rawY:(s.rawY-(s.hardIron.yMin+s.hardIron.yMax)*.5)/(ySpan*.5);
    let heading=(x*x+y*y)<1e-6?NaN:Math.atan2(y,x)*180/Math.PI;
    if(heading<0)heading+=360;
    if(Number.isFinite(heading)){
      heading=(heading-188.6-0.6)%360;if(heading<0)heading+=360;
      heading=360-heading;if(heading>=360)heading-=360;
    }
    s.headingDeg=heading;s.isOk=s.addressPresent&&s.fresh&&s.failCount<5;s.available=s.isOk&&Number.isFinite(heading);
    return s;
  }
  const createHeading=()=>({integral:0,previousError:0,derivative:0,hasPrevious:false,turnInPlace:false});
  function heading(previous,target,current,base,dt){
    const s={...previous},error=wrap180(sub(target,current));dt=f(dt);if(dt<=0)dt=f(.001);if(dt>.25)dt=f(.25);
    const delta=wrap180(sub(error,s.previousError)),raw=s.hasPrevious?div(delta,dt):0;
    const derivative=add(mul(.30,raw),mul(sub(1,.30),s.derivative)),increment=mul(error,dt);
    s.integral=add(s.integral,increment);let output=add(add(mul(2.5,error),mul(.05,s.integral)),mul(.80,derivative));
    if(output>178){output=178;s.integral=sub(s.integral,increment);}else if(output< -178){output=-178;s.integral=sub(s.integral,increment);}
    s.previousError=error;s.derivative=derivative;s.hasPrevious=true;
    if(s.turnInPlace){if(Math.abs(error)<=20)s.turnInPlace=false;}else if(Math.abs(error)>=30)s.turnInPlace=true;
    let left=0,right=0;
    if(s.turnInPlace||base<=0){if(Math.abs(error)>3){const turn=clamp(Math.trunc(Math.abs(output)),80,178);left=error>0?turn:-turn;right=-left;}}
    else {const corr=Math.trunc(output),lift=v=>v>0&&v<80?80:v;left=lift(clamp(base+corr,0,178));right=lift(clamp(base-corr,0,178));}
    return {state:s,error,output,request:{leftPwm:left,rightPwm:right,valid:true}};
  }
  const chooseBasePwm=(error,distance,cruise)=>Math.abs(f(error))>30?0:f(distance)<5?110:cruise;
  function safety(previous,voltage,underLoad){
    const v=f(voltage),threshold=f(underLoad?10.30:10.5),recover=add(10.5,.2);
    if(v<=f(10))return 'CRITICAL_STOP';
    if(previous==='CRITICAL_STOP'&&v<recover)return previous;
    if(v<=threshold)return 'LOW_BATTERY_RTH';
    if(previous==='LOW_BATTERY_RTH'&&v<recover)return previous;
    return 'NORMAL';
  }
  const createFsm=()=>({state:'STANDBY',forceCooldownStarted:false,forceCooldownMs:0});
  const forceCooldown=(s,now)=>s.forceCooldownStarted&&elapsed(now,s.forceCooldownMs)<600000;
  function fsm(previous,i){
    const s={...previous},exitSpiral=()=>{if(s.state==='SPIRAL_MAPPING'){s.forceCooldownStarted=true;s.forceCooldownMs=i.nowMs;}};
    if(i.emergencyCommand||i.gpsFault||['CRITICAL_STOP','OVERCURRENT_STOP','LEAK_STOP'].includes(i.safety)){exitSpiral();s.state='EMERGENCY_STOP';return s;}
    if(s.state==='RTH'&&i.arrivedHome){s.state='STANDBY';return s;}
    if((i.forceRthCommand||i.safety==='LOW_BATTERY_RTH')&&!['STANDBY','EMERGENCY_STOP','RTH'].includes(s.state)){exitSpiral();s.state=i.homeSet?'RTH':'EMERGENCY_STOP';return s;}
    if(s.state==='STANDBY'){if(i.startCommand&&i.safety==='NORMAL'&&i.gpsOk&&i.compassOk&&i.hasWaypoints)s.state='GRID_PATROL';}
    else if(s.state==='GRID_PATROL'){
      if((i.anomalyDetected||(i.forceSpiralCommand&&!forceCooldown(s,i.nowMs)))&&i.passedFirstWaypoint)s.state='SPIRAL_MAPPING';
      else if(i.gridComplete)s.state=i.homeSet?'RTH':'STANDBY';
    }else if(s.state==='SPIRAL_MAPPING'){
      if(i.spiralComplete||i.spiralAborted){exitSpiral();s.state='GRID_PATROL';}
    }else if(s.state==='EMERGENCY_STOP'&&i.clearEstop&&!i.gpsFault&&i.safety==='NORMAL')s.state='STANDBY';
    return s;
  }
  const createNavigator=()=>({points:[],index:0,expected:0,lastIndex:0,lastHash:0,haveAccepted:false,sealed:false});
  function packetHash(index,count,points){
    const bytes=new ArrayBuffer(2+16*Math.min(count,12)),v=new DataView(bytes);v.setUint8(0,index);v.setUint8(1,count);
    for(let i=0;i<Math.min(count,12);i++){v.setFloat64(2+i*16,points[i]?.lat??NaN,true);v.setFloat64(10+i*16,points[i]?.lon??NaN,true);}
    let hash=2166136261;for(const b of new Uint8Array(bytes))hash=Math.imul((hash^b)>>>0,16777619)>>>0;return hash;
  }
  function acceptBatch(previous,packet,allowNewMission){
    const index=packet.packetIndex,count=packet.count,points=packet.points;
    if(!Number.isInteger(index)||index<0||index>255||!Number.isInteger(count)||count<1||count>12||!Array.isArray(points)||points.length<count)return {state:previous,ok:false};
    const hash=packetHash(index,count,points),valid=slots=>count<=slots&&points.slice(0,count).every(p=>p&&Number.isFinite(p.lat)&&Math.abs(p.lat)<=90&&Number.isFinite(p.lon)&&Math.abs(p.lon)<=180);
    const load=()=>({points:points.slice(0,count).map(p=>({...p})),index:0,expected:1,lastIndex:0,lastHash:hash,haveAccepted:true,sealed:count<12});
    if(previous.haveAccepted&&index===previous.lastIndex&&hash===previous.lastHash){
      if(!allowNewMission)return {state:previous,ok:false};
      return {state:index===0&&previous.index>0&&valid(64)?load():previous,ok:true};
    }
    if(!allowNewMission)return {state:previous,ok:false};
    if(index===0)return valid(64)?{state:load(),ok:true}:{state:previous,ok:false};
    if(index!==previous.expected||!valid(64-previous.points.length))return {state:previous,ok:false};
    return {state:{...previous,points:[...previous.points,...points.slice(0,count).map(p=>({...p}))],expected:(index+1)&255,lastIndex:index,lastHash:hash,haveAccepted:true,sealed:count<12},ok:true};
  }
  function crossedBoundary(before,after,count,every=2){return every>0&&count>0&&before>=0&&after>before&&after<=count&&(Math.floor(before/every)+1)*every<=after;}
  const createAnomaly=()=>({buffer:Array(8).fill(0),idx:0,count:0,baseline:0,lastTurb:0,lastRocMs:0,haveLastTurb:false,lastValidMs:0,haveLastValid:false,raw:false,trigger:false,score:0,roc:0,cooldownMs:0,cooldownActive:false,baselineSince:0,baselineActive:false,mean:0});
  function resetEvidence(s,resetBaseline){s.raw=false;s.baselineActive=false;s.haveLastTurb=false;s.roc=0;if(resetBaseline)s.baseline=0;s.idx=0;s.count=0;s.buffer=Array(8).fill(0);}
  function clearAnomaly(previous){const s={...previous};s.trigger=false;resetEvidence(s,true);s.haveLastValid=false;return s;}
  function spiralDone(previous,now){return {...previous,trigger:false,cooldownMs:now,cooldownActive:true,baselineActive:false};}
  function anomaly(previous,turbidity,motion,now){
    const s={...previous,buffer:[...previous.buffer]};turbidity=f(turbidity);
    if(!Number.isFinite(turbidity)){
      if(s.haveLastValid&&elapsed(now,s.lastValidMs)>=1000){resetEvidence(s,false);s.haveLastValid=false;}return s;
    }
    if(s.haveLastValid&&elapsed(now,s.lastValidMs)>=1000)resetEvidence(s,false);
    s.lastValidMs=now;s.haveLastValid=true;s.buffer[s.idx]=turbidity;s.idx=(s.idx+1)%8;s.count=Math.min(s.count+1,8);
    let sum=0;for(let k=0;k<s.count;k++)sum=add(sum,s.buffer[k]);const avg=div(sum,s.count),ready=s.count>=8;s.mean=avg;
    if(!s.haveLastTurb){s.lastTurb=avg;s.lastRocMs=now;s.haveLastTurb=true;s.roc=0;}
    else if(motion){s.roc=0;s.lastTurb=avg;s.lastRocMs=now;}
    else if(elapsed(now,s.lastRocMs)>=2000){const dt=div(elapsed(now,s.lastRocMs),60000);s.roc=dt>f(.0001)&&dt<10?div(sub(avg,s.lastTurb),dt):0;s.lastTurb=avg;s.lastRocMs=now;}
    if(s.baseline<=0)s.baseline=avg;let deviation=sub(avg,s.baseline);const high=ready&&avg>50,dirty=avg>10;
    if(!dirty){s.baseline=add(mul(.98,s.baseline),mul(.02,avg));deviation=sub(avg,s.baseline);}
    const spike=ready&&!motion&&dirty&&s.roc>200,rising=ready&&dirty&&deviation>10;
    if(rising){if(!s.baselineActive){s.baselineActive=true;s.baselineSince=now;}}else s.baselineActive=false;
    const dwell=s.baselineActive&&elapsed(now,s.baselineSince)>=4000;let score=0;
    if(avg>10)score=add(score,mul(div(sub(avg,10),sub(50,10)),.4));if(deviation>0)score=add(score,Math.min(div(deviation,50),f(.3)));if(spike)score=add(score,.3);if(dwell)score=add(score,.2);s.score=f(Math.min(score,1.5));
    s.raw=s.raw?(avg>40||dwell):(high||dwell);
    if(s.cooldownActive&&elapsed(now,s.cooldownMs)>=600000)s.cooldownActive=false;
    if(s.raw){if(!s.cooldownActive)s.trigger=true;}else s.trigger=false;
    return s;
  }
  const createBattery=()=>({voltage:12.6,filtered:12.6,initialized:false,failCount:0});
  function battery(previous,millivolts){const s={...previous},v=mul(div(millivolts,1000),5);if(Number.isFinite(v)&&v>=5&&v<=15){s.failCount=0;s.filtered=s.initialized?add(mul(.15,v),mul(sub(1,.15),s.filtered)):v;s.initialized=true;s.voltage=s.filtered;}else {s.failCount=Math.min(255,s.failCount+1);if(s.failCount>=10){s.voltage=10;s.filtered=10;s.initialized=true;}}return s;}
  function batteryPercent(voltage){const v=f(voltage);let soc;if(v>=f(12.6))soc=100;else if(v<=10)soc=0;else if(v<=f(10.5))soc=mul(div(sub(v,10),sub(10.5,10)),10);else if(v>12)soc=add(80,mul(sub(v,12),33.3));else if(v>f(11.5))soc=add(50,mul(sub(v,11.5),60));else if(v>f(11.1))soc=add(20,mul(sub(v,11.1),75));else soc=add(10,mul(div(sub(v,10.5),sub(11.1,10.5)),10));return Math.trunc(add(clamp(soc,0,100),.5));}
  function turbidity(voltage,adsReady=true){const v=f(voltage);if(!adsReady||!Number.isFinite(v)||v<f(.01)||v>f(5.25))return {value:NaN,valid:false};const ntu=v>=f(1.93)?0:Math.max(0,div(mul(80,sub(1.93,v)),sub(1.93,1.20)));return {value:ntu,valid:v>=.5};}
  const EXAMPLE_CAL=Object.freeze({valid:true,v401:3.0095,v686:2.5725,v918:2.1836,source:'EXAMPLE_FACTORY_DEFAULT; actual NVS unavailable'});
  function ph(voltage,tempC,tempValid,adsReady=true,cal=EXAMPLE_CAL){
    const v=f(voltage);if(!adsReady||!Number.isFinite(v)||v<f(.01)||v>f(5.25))return {value:NaN,valid:false,reason:'ADC_INVALID_OR_UNAVAILABLE'};
    const tempOk=tempValid&&Number.isFinite(tempC)&&tempC>=-5&&tempC<=60,t=f(tempOk?tempC:25),ratio=div(add(t,273.15),298.15);
    let value;if(cal.valid){const slope=mul(Math.abs(div(sub(v>=f(cal.v686)?cal.v401:cal.v686,v>=f(cal.v686)?cal.v686:cal.v918),sub(v>=f(cal.v686)?4.01:6.86,v>=f(cal.v686)?6.86:9.18))),ratio);value=add(6.86,div(sub(cal.v686,v),slope));}
    else {const slope=mul(.05916,ratio);value=slope<f(.0001)?NaN:add(7,div(sub(2.5725,v),slope));}
    const electrode=v>=1.5&&v<=3.5,valid=electrode&&tempOk&&value>=1&&value<=13;
    return {value,valid,reason:!electrode?'ELECTRODE_RANGE':!tempOk?'TEMP_INVALID':value<1||value>13?'PH_IMPLAUSIBLE':'OK',effectiveTempC:t};
  }
  const gpsValid=i=>i.locationValid!==false&&i.ageMs<=2000&&i.sats>=6&&i.hdop<2;
  function gpsLoss(previous,valid,now){const s={...previous};if(valid){s.ever=true;s.lastValidMs=now;}const age=elapsed(now,s.lastValidMs);if(!s.fault&&s.ever&&age>=120000)s.fault=true;s.tier=s.fault?'GPS_FAULT':!s.ever||age>=10000?'SAFE_STOP':'OK';return s;}
  return Object.freeze({wrap180,COMPASS_FACTORY,COMPASS_EXAMPLE_CALIBRATION,createCompass,makeSyntheticCompassRaw,updateCompass,createHeading,heading,chooseBasePwm,safety,createFsm,fsm,forceCooldown,createNavigator,acceptBatch,packetHash,crossedBoundary,createAnomaly,anomaly,clearAnomaly,spiralDone,createBattery,battery,batteryPercent,turbidity,ph,EXAMPLE_CAL,gpsValid,gpsLoss});
});
