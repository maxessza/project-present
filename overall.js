(function () {
  'use strict';
  const get = id => document.getElementById('sim-' + id);
  const model = window.OverallModel;
  const labsModel = window.OverallLabsModel;
  if (!labsModel) throw new Error('OverallLabsModel must load before overall.js');
  if (!model) throw new Error('OverallModel must load before overall.js');
  const mission = model.createMission();
  const {home, points, steps, sma} = mission;
  const wpNumber = index => points.length - index;
  const phaseNames = {prepare:'เตรียมภารกิจ',travel:'เดินทางตาม waypoint',arrive:'ยืนยันการเข้าถึง waypoint',sample:'ตรวจเงื่อนไขความขุ่น',spiral:'สำรวจบริเวณผิดปกติ',return:'RTH · กลับบ้านตาม bearing',done:'ภารกิจเสร็จสิ้น'};
  const fsmStages = Array.from(document.querySelectorAll('#sim-fsm [data-fsm-stage]'));
  const waypointNodes = Array.from(get('waypoints').querySelectorAll('.sim-waypoint')).map(group=>({group,dot:group.querySelector('.sim-waypoint-dot')}));
  const pathString = path => path.map((p,i)=>(i?'L':'M')+p.x.toFixed(2)+' '+p.y.toFixed(2)).join(' ');
  steps.forEach(step=>{
    step.lengths=[0];
    for(let i=1;i<step.path.length;i++)step.lengths.push(step.lengths[i-1]+Math.hypot(step.path[i].x-step.path[i-1].x,step.path[i].y-step.path[i-1].y));
    step.distance=step.lengths[step.lengths.length-1];
  });
  let current=-1, elapsed=0, running=false, lastTime=null, frame=null, visited=new Set(), trail=[], storyIndex=0, lastBoatAngle=0, smaRevealed=false;
  function setText(id,text){get(id).textContent=text;}

  function renderSmaChart(){
    const list=get('sma-samples');list.replaceChildren();
    sma.samples.forEach((value,index)=>{
      const item=document.createElement('li');item.style.setProperty('--bar',value+'%');
      const number=document.createElement('b');number.textContent=String(value);
      const bar=document.createElement('i');bar.setAttribute('aria-hidden','true');
      const label=document.createElement('small');label.textContent=String(index+1).padStart(2,'0');
      item.append(number,bar,label);list.append(item);
    });
    setText('sma-threshold-label',sma.threshold+' NTU · เกณฑ์');
    setText('sma-sum',String(sma.sum));setText('sma-count',String(sma.count));
    setText('sma-mean',sma.mean+' NTU');
    setText('sma-delta','สูงกว่าเกณฑ์ '+(sma.mean-sma.threshold)+' NTU');
    get('sma-plot').setAttribute('aria-label','ตัวอย่างสังเคราะห์ '+sma.samples.join(', ')+' NTU; ผลรวม '+sma.sum+' หาร '+sma.count+' ได้ค่าเฉลี่ย '+sma.mean+' NTU; เกณฑ์ '+sma.threshold+' NTU');
    const boundary=model.analyzeSma(Array(sma.count).fill(sma.threshold),sma.threshold);
    setText('sma-boundary','กรณีสอนแยก: SMA('+boundary.count+') = '+boundary.mean+' NTU · '+boundary.mean+' > '+boundary.threshold+' = '+boundary.triggered+' · ไม่เข้า SPIRAL');
    setText('story-sma',sma.mean+' > '+sma.threshold+' NTU');
  }
  function renderInspector(step){
    const info=step.inspector;
    setText('state',info.state);setText('inputs',info.inputs);setText('predicate',info.predicate);
    setText('result',info.result);setText('next-state',info.nextState);setText('action',info.action);
  }
  function renderFsm(step){
    fsmStages.forEach((item,index)=>{
      const active=index===step.fsmStage;
      item.classList.toggle('is-current',active);
      if(active)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');
    });
  }
  function renderReadings(step){
    setText('temp','—');setText('ph','—');setText('ntu','—');
    const hasReading=Boolean(step.readings);
    if(hasReading){
      smaRevealed=true;
      setText('ntu',String(step.readings.turbidityMeanNtu));
      setText('reading-note','SMA(8) จากตัวอย่างสังเคราะห์ · อุณหภูมิและ pH ไม่มีค่าในฉากนี้');
      document.querySelector('.sim-readings').classList.toggle('is-abnormal',sma.triggered);
      if(step.center && sma.triggered){
        get('anomaly').setAttribute('cx',step.center.x);get('anomaly').setAttribute('cy',step.center.y);get('anomaly').setAttribute('opacity','1');
      }
    }else{
      setText('reading-note','— ไม่มีตัวเลข sensor ที่ระบุใน step ปัจจุบัน');
      document.querySelector('.sim-readings').classList.remove('is-abnormal');
    }
    get('sma').hidden=!smaRevealed;
  }
  function playback(){
    const done=current>=steps.length;
    setText('start',done?'ภารกิจเสร็จแล้ว':running?'หยุดชั่วคราว ❚❚':current<0?'เริ่มภารกิจ ▶':'เล่นต่อ ▶');
    get('start').disabled=done;get('step').disabled=done;get('back').disabled=current<0;
    setText('playback',done?'เสร็จสิ้น':running?'กำลังจำลอง':current<0?'พร้อมเริ่ม':'หยุดชั่วคราว');
  }
  function log(text){const li=document.createElement('li');li.textContent=text;get('log').prepend(li);}
  function enter(index){
    current=index;elapsed=0;
    if(current>=steps.length){running=false;playback();return;}
    const step=steps[current];
    if(step.storyStep!==undefined)storyIndex=step.storyStep;
    get('home-zone').setAttribute('opacity',step.rth?'1':'0');
    document.querySelectorAll('#sim-storyline li').forEach((li,index)=>{
      li.classList.toggle('is-current',index===storyIndex);
      li.classList.toggle('is-complete',index<storyIndex);
      if(index===storyIndex)li.setAttribute('aria-current','step');else li.removeAttribute('aria-current');
    });
    setText('insight',step.insight || 'ติดตามเส้นทางหลัก WP1 → WP9; ค่าตรวจวัดและเวลาเดินทางในภาพเป็นข้อมูลจำลอง');
    get('spiral-plan').setAttribute('d',step.spiralPreview ? pathString(step.spiralPreview) : '');
    get('center').setAttribute('opacity',step.center ? '1' : '0');
    if(step.center)get('center').setAttribute('transform','translate('+step.center.x+' '+step.center.y+')');
    waypointNodes.forEach((node,index)=>node.group.classList.toggle('is-target',step.waypoint===index));
    setText('phase',phaseNames[step.phase]);setText('decision',step.title);setText('reason',step.reason);
    renderInspector(step);renderFsm(step);renderReadings(step);
    document.querySelectorAll('#sim-stages li').forEach(li=>li.classList.toggle('active',li.dataset.phase===step.phase));
    get('target').setAttribute('opacity',step.target?'1':'0');get('target').classList.toggle('is-active',Boolean(step.target));get('target').classList.toggle('is-arrived',step.phase==='arrive');if(step.target)get('target').setAttribute('transform','translate('+step.target.x+' '+step.target.y+')');
    log(step.title);draw(0);playback();
  }
  function draw(fraction){
    if(current<0){get('boat').setAttribute('transform','translate('+home.x+' '+home.y+')');get('trail').setAttribute('d','');get('trail-glow').setAttribute('d','');return;}
    const step=steps[Math.min(current,steps.length-1)];
    const distance=step.distance*fraction;
    let seg=1;while(seg<step.lengths.length-1 && step.lengths[seg]<distance)seg++;
    const a=step.path[seg-1],b=step.path[seg];
    const length=step.lengths[seg]-step.lengths[seg-1];const ratio=length?(distance-step.lengths[seg-1])/length:0;
    const p={x:a.x+(b.x-a.x)*ratio,y:a.y+(b.y-a.y)*ratio};
    const angle=length?Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI+90:lastBoatAngle;
    if(length)lastBoatAngle=angle;
    get('boat').setAttribute('transform','translate('+p.x.toFixed(2)+' '+p.y.toFixed(2)+') rotate('+angle.toFixed(2)+')');
    const traveledPath=step.suppressTrail?pathString(trail):pathString([...trail,...step.path.slice(0,seg),p]);
    get('trail-glow').setAttribute('d',traveledPath);get('trail').setAttribute('d',traveledPath);
    get('progress-fill').style.width=(Math.min(1,(Math.min(current,steps.length-1)+fraction)/steps.length)*100)+'%';
  }
  function finish(){
    const step=steps[current];draw(1);
    if(!step.suppressTrail)trail.push(...step.path.slice(1));
    if(step.phase==='arrive' && step.waypoint===points.length-1)trail=[step.path[step.path.length-1]];
    if(step.waypoint!==undefined && step.phase==='arrive'){visited.add(step.waypoint);waypointNodes[step.waypoint].dot.setAttribute('fill',step.waypoint===points.length-1?'#ffb35c':'#62e3d5');setText('count',visited.size+' / 9 จุด');}
    enter(current+1);
  }
  function tick(time){
    if(!running){frame=null;return;}
    if(lastTime!==null)elapsed+=Math.min(time-lastTime,100)*Number(get('speed').value);
    lastTime=time;
    const step=steps[current];
    if(elapsed>=step.duration)finish();else draw(elapsed/step.duration);
    if(running)frame=requestAnimationFrame(tick);else frame=null;
  }
  function pause(){running=false;lastTime=null;if(frame!==null)cancelAnimationFrame(frame);frame=null;playback();}
  const checkpointIndices=labsModel.getCheckpointIndices(mission);
  function restoreTo(index){
    pause();
    get('reset').click();
    if(index<0)return;
    enter(0);
    for(let completed=0;completed<index;completed++)finish();
    playback();
  }
  get('checkpoint').addEventListener('change',()=>{
    const index=checkpointIndices[get('checkpoint').value];
    if(index!==undefined)restoreTo(index);
  });
  get('back').addEventListener('click',()=>{
    if(current<0)return;
    restoreTo(current-1);
  });
  window.OverallControls={
    getCurrent:()=>current,
    getCheckpointIndices:()=>({...checkpointIndices}),
    restoreTo
  };
  get('start').addEventListener('click',()=>{
    if(running){pause();return;}
    if(current>=steps.length)return;
    if(current<0)enter(0);
    running=true;lastTime=null;playback();frame=requestAnimationFrame(tick);
  });
  get('step').addEventListener('click',()=>{pause();if(current<0)enter(0);else if(current<steps.length)finish();});
  get('reset').addEventListener('click',()=>{
    pause();current=-1;elapsed=0;visited.clear();trail=[];storyIndex=0;lastBoatAngle=0;get('checkpoint').value='';
    waypointNodes.forEach(node=>{node.dot.setAttribute('fill','#123849');node.group.classList.remove('is-target');});
    get('spiral-plan').setAttribute('d','');get('center').setAttribute('opacity','0');get('home-zone').setAttribute('opacity','0');setText('insight','เริ่มภารกิจเพื่อดูเงื่อนไขและการคำนวณทีละช่วง');
    smaRevealed=false;get('sma').hidden=true;
    document.querySelectorAll('#sim-storyline li').forEach((li,index)=>{li.classList.toggle('is-current',index===0);li.classList.remove('is-complete');if(index===0)li.setAttribute('aria-current','step');else li.removeAttribute('aria-current');});
    get('anomaly').setAttribute('opacity','0');get('target').setAttribute('opacity','0');get('target').classList.remove('is-active','is-arrived');get('progress-fill').style.width='0%';
    document.querySelectorAll('#sim-stages li').forEach(li=>li.classList.remove('active'));
    fsmStages.forEach(li=>{li.classList.remove('is-current');li.removeAttribute('aria-current');});
    document.querySelector('.sim-readings').classList.remove('is-abnormal');
    get('anomaly').setAttribute('cx','220');get('anomaly').setAttribute('cy','160');setText('count','0 / 9 จุด');setText('phase','เตรียมภารกิจ');setText('decision','รอเริ่มการสำรวจ');setText('reason','กำหนดเส้นทางไว้ 9 จุด เรือจะตรวจวัดตามจุดและกลับบ้านเมื่อทำภารกิจครบ');
    ['temp','ph','ntu','state','inputs','predicate','result','next-state','action'].forEach(id=>setText(id,'—'));setText('reading-note','ยังไม่มีค่าตัวอย่างใน step ปัจจุบัน');get('log').replaceChildren();log('พร้อมแสดงภารกิจจำลอง');draw(0);playback();
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden && running)pause();});
  renderSmaChart();draw(0);playback();
})();
