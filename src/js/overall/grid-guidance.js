(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GridGuidance=api;})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';

  // Allowlisted values from firmware-reference/config-numeric-extract.h.
  const C=Object.freeze({
    pwmLimit:178,minPwm:80,cruisePwm:110,kp:2.5,ki:.55,kd:.30,
    rateTau:.20,deadzoneDeg:2,steeringSlew:200,integralLimit:20,
    brakeHorizon:.25,brakeWindowDeg:60,brakeBlendStartDps:3,
    brakeBlendFullDps:12,surgeRotationDeg:15,surgeAlignDeg:30,
    surgeCurveDeg:90,surgeRise:30,mixYawWeight:9,driveSlew:600,
    navPeriodMs:50,losLookaheadM:6,waypointRadiusM:3,passMarginM:.5
  });
  const f=Math.fround;
  const add=(a,b)=>f(f(a)+f(b)),sub=(a,b)=>f(f(a)-f(b));
  const mul=(a,b)=>f(f(a)*f(b)),div=(a,b)=>f(f(a)/f(b));
  const clamp=(v,lo,hi)=>f(v<lo?lo:(v>hi?hi:v));
  const abs=v=>f(Math.abs(v));
  const wrap180=(target,current)=>{let e=sub(target,current);while(e>180)e=sub(e,360);while(e< -180)e=add(e,360);return e;};
  const emptyController=()=>({haveSample:false,turnInPlace:false,lastSampleUs:0,lastHeading:0,rate:0,integralPwm:0,steeringPwm:0,surgePwm:0});
  const emptyDrive=()=>({leftPwm:0,rightPwm:0,lastSource:'NONE'});
  const createState=()=>({controller:emptyController(),drive:emptyDrive()});
  const resetController=state=>({...state,controller:emptyController()});
  const invalidRequest=()=>({source:'GRID',leftPwm:0,rightPwm:0,valid:false});

  function allocate(surge,yaw,ceiling,requireMotion=false){
    const out={source:'GRID',leftPwm:0,rightPwm:0,valid:true};
    const mirror=yaw<0;yaw=abs(yaw);
    let bestScore=Infinity;
    const low=[-C.pwmLimit,0,C.minPwm],high=[-C.minPwm,0,C.pwmLimit],weight=f(C.mixYawWeight);
    const bound=(x,a,b)=>f(Math.max(a,Math.min(b,x)));
    const score=(l,r)=>{
      const y=sub(mul(.5,sub(l,r)),yaw),s=sub(mul(.5,add(l,r)),surge);
      return add(mul(weight,mul(y,y)),mul(s,s));
    };
    for(let a=0;a<3;a++)for(let b=0;b<3;b++){
      if(add(low[a],low[b])>2*ceiling||add(high[a],high[b])<0)continue;
      let bandScore=Infinity,bestL=0,bestR=0;
      const consider=(l,r)=>{
        l=f(l);r=f(r);
        if(requireMotion&&l===0&&r===0)return;
        if(l<low[a]||l>high[a]||r<low[b]||r>high[b]||add(l,r)<0||add(l,r)>2*ceiling)return;
        const cost=score(l,r);if(cost<bandScore){bandScore=cost;bestL=l;bestR=r;}
      };
      consider(add(surge,yaw),sub(surge,yaw));
      for(let k=0;k<2;k++){
        let l=k?high[a]:low[a],lo=f(Math.max(low[b],-l)),hi=f(Math.min(high[b],sub(2*ceiling,l)));
        if(lo<=hi)consider(l,bound(div(sub(add(mul(sub(weight,1),l),mul(2,surge)),mul(mul(2,weight),yaw)),add(weight,1)),lo,hi));
        let r=k?high[b]:low[b];lo=f(Math.max(low[a],-r));hi=f(Math.min(high[a],sub(2*ceiling,r)));
        if(lo<=hi)consider(bound(div(add(add(mul(sub(weight,1),r),mul(2,surge)),mul(mul(2,weight),yaw)),add(weight,1)),lo,hi),r);
        const common=k?ceiling:0;lo=f(Math.max(low[a],sub(mul(2,common),high[b])));hi=f(Math.min(high[a],sub(mul(2,common),low[b])));
        if(lo<=hi){l=bound(add(common,yaw),lo,hi);consider(l,sub(mul(2,common),l));}
      }
      if(!Number.isFinite(bandScore))continue;
      for(let x=0;x<2;x++)for(let y=0;y<2;y++){
        const l=x?Math.ceil(bestL):Math.floor(bestL),r=y?Math.ceil(bestR):Math.floor(bestR);
        if(requireMotion&&l===0&&r===0)continue;
        if(l<low[a]||l>high[a]||r<low[b]||r>high[b]||l+r<0||l+r>2*ceiling)continue;
        const cost=score(l,r);
        if(cost<bestScore||(cost===bestScore&&l+r>out.leftPwm+out.rightPwm)){bestScore=cost;out.leftPwm=l;out.rightPwm=r;}
      }
    }
    if(mirror){const left=out.leftPwm;out.leftPwm=out.rightPwm;out.rightPwm=left;}
    return out;
  }

  function updateController(previous,input){
    let s={...previous};
    const target=f(Number(input.targetDeg)),heading=f(Number(input.headingDeg)),base=Number(input.basePwm),sampleUs=Number(input.sampleUs)>>>0;
    if(!input.fresh||!Number.isFinite(target)||!Number.isFinite(heading)||target<0||target>360||heading<0||heading>360||!Number.isInteger(base)||base<0||base>C.pwmLimit){
      return {state:emptyController(),request:invalidRequest(),observation:{reset:true,rate:0,integralPwm:0,steeringPwm:0,surgePwm:0,error:0,controlError:0,brakeWeight:0,rotationWeight:0}};
    }
    let dt=f(C.navPeriodMs/1000);
    if(s.haveSample){
      const elapsed=(sampleUs-s.lastSampleUs)>>>0;
      if(elapsed<1000)return {state:emptyController(),request:invalidRequest(),observation:{reset:true,rate:0,integralPwm:0,steeringPwm:0,surgePwm:0,error:0,controlError:0,brakeWeight:0,rotationWeight:0}};
      if(elapsed>250000)s=emptyController();
      else {dt=f(elapsed/1000000);const measured=div(wrap180(heading,s.lastHeading),dt);const alpha=div(dt,add(C.rateTau,dt));s.rate=add(s.rate,mul(alpha,sub(measured,s.rate)));}
    }
    const acquiring=!s.haveSample;s.lastHeading=f(heading);s.lastSampleUs=sampleUs;s.haveSample=true;
    const error=wrap180(target,heading),absError=abs(error);
    const brakeWeight=clamp(sub(1,div(absError,C.brakeWindowDeg)),0,1);
    const rotationWeight=clamp(div(sub(abs(s.rate),C.brakeBlendStartDps),sub(C.brakeBlendFullDps,C.brakeBlendStartDps)),0,1);
    const damping=add(C.kd,mul(mul(C.kp,C.brakeHorizon),mul(brakeWeight,rotationWeight)));
    const controlError=error>C.deadzoneDeg?sub(error,C.deadzoneDeg):(error< -C.deadzoneDeg?add(error,C.deadzoneDeg):0);
    const integralWeight=base>0?mul(clamp(div(s.surgePwm,base),0,1),sub(1,rotationWeight)):0;
    const nextIntegral=clamp(add(s.integralPwm,mul(mul(mul(C.ki,controlError),dt),integralWeight)),-C.integralLimit,C.integralLimit);
    let desired=sub(add(mul(C.kp,controlError),nextIntegral),mul(damping,s.rate));
    if(!((desired>C.pwmLimit&&controlError>0)||(desired< -C.pwmLimit&&controlError<0)))s.integralPwm=nextIntegral;
    desired=clamp(sub(add(mul(C.kp,controlError),s.integralPwm),mul(damping,s.rate)),-C.pwmLimit,C.pwmLimit);
    const maxStep=mul(C.steeringSlew,dt);
    if(mul(desired,s.steeringPwm)<0)s.steeringPwm=0;
    else if(abs(desired)<abs(s.steeringPwm))s.steeringPwm=desired;
    s.steeringPwm=add(s.steeringPwm,clamp(sub(desired,s.steeringPwm),-maxStep,maxStep));
    const cosine=absError<C.surgeAlignDeg?f(Math.cos(mul(div(absError,C.surgeCurveDeg),f(1.570796326794897)))):0;
    const alignment=mul(cosine,cosine),rotation=div(mul(s.rate,C.brakeHorizon),C.surgeRotationDeg);
    const goal=div(mul(base,alignment),add(1,mul(rotation,rotation)));
    const floor=mul(Math.min(base,C.minPwm),alignment),surgeGoal=f(Math.max(goal,floor));
    if(acquiring)s.surgePwm=f(Math.min(surgeGoal,C.minPwm));
    else if(surgeGoal<s.surgePwm)s.surgePwm=surgeGoal;
    else s.surgePwm=f(Math.min(surgeGoal,add(s.surgePwm,mul(C.surgeRise,dt))));
    const request=allocate(s.surgePwm,s.steeringPwm,absError>=C.surgeAlignDeg||base===0?0:C.pwmLimit,abs(s.steeringPwm)>=.5||s.surgePwm>0);
    s.turnInPlace=request.leftPwm+request.rightPwm===0&&(request.leftPwm!==0||request.rightPwm!==0);
    return {state:s,request,observation:{reset:false,rate:s.rate,integralPwm:s.integralPwm,steeringPwm:s.steeringPwm,surgePwm:s.surgePwm,error,controlError,brakeWeight,rotationWeight,dt}};
  }

  function roundAway(v){return v<0?-Math.floor(-v+.5):Math.floor(v+.5);}
  function slewAxis(current,target,maxStep,minEffective){
    let effective=target,mag=Math.abs(target);
    if(target!==0&&mag<minEffective)effective=target>0?minEffective:-minEffective;
    if(effective===0){const next=Math.abs(current)-maxStep;if(next<minEffective)return 0;return current>0?next:-next;}
    if(current===0){if(minEffective>0)return effective>0?minEffective:-minEffective;if(effective>maxStep)return maxStep;if(effective< -maxStep)return -maxStep;return effective;}
    if((current>0)!==(effective>0)){const next=Math.abs(current)-maxStep;if(next<minEffective)return 0;return current>0?next:-next;}
    const delta=effective-current;if(delta>maxStep)return current+maxStep;if(delta< -maxStep)return current-maxStep;return effective;
  }
  function stopDrive(previous,reason){return {state:emptyDrive(),decision:{source:'NONE',stopReason:reason,leftPwm:0,rightPwm:0}};}
  function resolveDrive(previous,request,interlocks,dtSeconds){
    const fatal=['CRITICAL_STOP','OVERCURRENT_STOP','LEAK_STOP'].includes(interlocks.safety);
    if(interlocks.emergencyPending||fatal||interlocks.state==='EMERGENCY_STOP')return stopDrive(previous,'HARD_STOP');
    if(interlocks.state==='STANDBY')return stopDrive(previous,'INACTIVE_STATE');
    if(!interlocks.navigationAvailable)return stopDrive(previous,'NAVIGATION_UNAVAILABLE');
    if(interlocks.waterSampleHold)return stopDrive(previous,'WATER_SAMPLE');
    const allowed={GRID:['GRID_PATROL','MANUAL'],MANUAL:['GRID_PATROL','MANUAL'],SPIRAL:['SPIRAL_MAPPING'],RTH:['RTH']}[request.source]||[];
    if(!request.valid||!allowed.includes(interlocks.state))return stopDrive(previous,'INVALID_REQUEST');
    if(previous.lastSource!=='NONE'&&previous.lastSource!==request.source){const reset=stopDrive(previous,'SOURCE_CHANGE');return {state:{...reset.state,lastSource:request.source},decision:reset.decision};}
    const limit=C.pwmLimit,clampInt=v=>Math.max(-limit,Math.min(limit,Math.trunc(v)));
    const left=clampInt(request.leftPwm),right=clampInt(request.rightPwm);
    if(left===0&&right===0)return stopDrive(previous,'REQUESTED_STOP');
    const dt=clamp(dtSeconds,0,.25);let maxStep=mul(C.driveSlew,dt);
    if(maxStep<1)maxStep=1;
    const l=slewAxis(previous.leftPwm,left,maxStep,C.minPwm),r=slewAxis(previous.rightPwm,right,maxStep,C.minPwm);
    return {state:{leftPwm:l,rightPwm:r,lastSource:request.source},decision:{source:request.source,stopReason:'NONE',leftPwm:Math.max(-limit,Math.min(limit,roundAway(l))),rightPwm:Math.max(-limit,Math.min(limit,roundAway(r)))}};
  }
  function step(previous,input,interlocks){
    const control=updateController(previous.controller,input);
    const drive=resolveDrive(previous.drive,control.request,interlocks,input.dtSeconds??C.navPeriodMs/1000);
    return {state:{controller:control.state,drive:drive.state},request:control.request,applied:drive.decision,observation:control.observation};
  }

  function localLos(position,route,index,home,options={}){
    const scale=options.scale??.15,lookahead=options.lookaheadM??C.losLookaheadM,radius=options.radiusM??C.waypointRadiusM,margin=options.passMarginM??C.passMarginM;
    if(!Array.isArray(route)||index<0||index>=route.length)return {valid:false};
    const start=index>0?route[index-1]:home,end=route[index],dx=(end.x-start.x)*scale,dn=-(end.y-start.y)*scale,px=(position.x-start.x)*scale,pn=-(position.y-start.y)*scale;
    const len=Math.hypot(dx,dn),dist=Math.hypot((end.x-position.x)*scale,(end.y-position.y)*scale),reached=dist<=radius;
    if(len<.05){const bearing=wrap360(Math.atan2((end.x-position.x),position.y-end.y)*180/Math.PI);return {valid:true,bearingDeg:bearing,crossTrackM:0,alongTrackM:0,distToEndM:dist,lookAheadDistM:dist,reached,passed:false,lookahead:{...end},segmentLengthM:len};}
    const t=(px*dx+pn*dn)/(len*len),cross=(px*dn-pn*dx)/len,along=t*len,passed=t>=1&&along>=len+margin;
    const aimAlong=Math.max(0,Math.min(len,along+lookahead)),laE=aimAlong/len*dx,laN=aimAlong/len*dn;
    const look={x:start.x+laE/scale,y:start.y-laN/scale};
    const bearing=wrap360(Math.atan2(look.x-position.x,position.y-look.y)*180/Math.PI);
    const laDistance=Math.hypot((look.x-position.x)*scale,(look.y-position.y)*scale);
    return {valid:true,bearingDeg:bearing,crossTrackM:cross,alongTrackM:along,distToEndM:dist,lookAheadDistM:laDistance,reached,passed,lookahead:look,segmentLengthM:len};
  }
  function wrap360(deg){return ((deg%360)+360)%360;}
  return Object.freeze({C,createState,resetController,updateController,resolveDrive,step,allocate,localLos,wrap180,wrap360});
});
