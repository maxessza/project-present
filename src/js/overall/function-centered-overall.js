(() => {
  'use strict';
  const mission=window.AutonomousMission, kernel=window.MissionKernel;
  const root=document.querySelector('[data-autonomous-mission]'), main=document.getElementById('main');
  if(!mission||!root||!kernel)return;
  const $=id=>document.getElementById(id);
  const fmt=(x,d=2)=>Number.isFinite(x)?x.toFixed(d):'ยังไม่มีค่าที่ใช้ได้';
  const point=p=>p?`(${fmt(p.x,1)}, ${fmt(p.y,1)}) หน่วยฉาก`:'ยังไม่มีจุด';
  const pair=p=>p?`${fmt(p.left,0)} / ${fmt(p.right,0)} signed PWM`:'รอคำสั่ง';
  const yes=v=>v?'ใช้ได้':'ยังใช้ไม่ได้';
  let svgLabelFrame=null;
  function updateSvgLabelScale(){
    for(const label of document.querySelectorAll('#am-map text,#fc-nav-segment text,#fc-nav-heading-dial text')){
      if(!label.dataset.fcBaseFontSize){
        const authored=parseFloat(getComputedStyle(label).fontSize);
        if(!Number.isFinite(authored)||authored<=0)continue;
        label.dataset.fcBaseFontSize=String(authored);
      }
      const matrix=label.getScreenCTM?.(),scale=matrix?Math.hypot(matrix.a,matrix.b):0;
      if(!Number.isFinite(scale)||scale<=0)continue;
      const authored=Number(label.dataset.fcBaseFontSize),minimum=Math.ceil(12/scale*1000)/1000;
      const next=`${Math.max(authored,minimum)}px`;
      if(label.style.fontSize!==next)label.style.fontSize=next;
      // Keep the enlarged boat caption above HOME without moving either marker.
      if(label.id==='am-boat-label'&&label.getAttribute('dy')!=='-38')label.setAttribute('dy','-38');
    }
  }
  function scheduleSvgLabelScale(){
    if(svgLabelFrame!==null)return;
    svgLabelFrame=window.requestAnimationFrame(()=>{svgLabelFrame=null;updateSvgLabelScale();});
  }
  function observeSvgLabelScale(){
    if('ResizeObserver' in window){
      const observer=new ResizeObserver(scheduleSvgLabelScale);
      for(const node of document.querySelectorAll('#fc-movie-stage,#fc-nav-visual,#fc-stage-map,#am-map,#fc-nav-segment,#fc-nav-heading-dial'))observer.observe(node);
    }
    window.addEventListener('resize',scheduleSvgLabelScale,{passive:true});
    scheduleSvgLabelScale();
  }
  const definitions=[
    ['setup','01','ภาพรวมทั้งภารกิจ','จากผู้ดูแลถึงเรือและรายงาน',['start-readiness','telemetry-lineage'],'ROUTE'],
    ['sensors','02','ส่งแผนและตรวจความพร้อม','เรือรับแผนก่อนเริ่มเดินทาง',['start-readiness'],'ROUTE'],
    ['segment','03','ตามแนวไปจุดสำรวจ','ตำแหน่ง · จุดเล็งนำทาง · ผลถึงจุด',['compass-acquisition','grid-los-reach'],'NAVIGATION'],
    ['heading','04','ปรับทิศและสั่งมอเตอร์','ทิศเป้า → มอเตอร์ → วัดกลับ',['grid-control','spiral-rth-control','grid-drive','drive-interlocks'],'CONTROL'],
    ['water','05','พักเรือและวัดน้ำ','pH · ความขุ่น · อุณหภูมิ',['sensor-conversion','waypoint-water-hold','publication-nan-cache'],'ANOMALY'],
    ['anomaly','06','ตรวจความขุ่นและสแกนเพิ่ม','ฉากสาธิต → จุดสแกน → กลับเส้นเดิม',['anomaly-eligibility','spiral-generation-progress','spiral-return'],'ANOMALY'],
    ['report','07','ส่งรายงานกลับสถานี','ค่าตัวอย่าง → รับยืนยัน',['telemetry-lineage','publication-nan-cache','log-lineage'],'DATA'],
    ['safety','08','กลับ HOME และหยุด','สำรวจครบ · ผู้ดูแล · แบตเตอรี่',['start-readiness','drive-interlocks','rth-dwell'],'CONTROL']
  ].map(([id,no,title,subtitle,sources,mode])=>({id,no,title,subtitle,sources,mode}));
  const beats={
    setup:'ภารกิจเดียว: รับแผน → เดินเรือ → วัดน้ำ → ส่งผล → กลับบ้าน',
    sensors:'รับแผน ตรวจแผน และตรวจความพร้อมก่อนเริ่มเดินทาง',
    segment:'WP หมายถึงจุดสำรวจ · LOS คือจุดเล็งนำทางบนแนวไปยังจุดถัดไป',
    heading:'เทียบทิศที่ต้องการกับทิศที่อ่าน แล้วดูผลที่มอเตอร์และการวัดรอบใหม่',
    water:'บางค่าต้องพักเรือก่อนอ่าน · “ยังไม่มีค่า” ไม่ใช่ค่า 0',
    anomaly:'ฉากน้ำขุ่นเป็นข้อมูลตัวอย่างต่อเนื่องเพื่ออธิบายการสแกนครบ ไม่ใช่น้ำจริง',
    report:'แยกค่าที่ส่งออกจากรายงานที่สถานียืนยันว่าได้รับแล้ว',
    safety:'กลับก่อนครบได้ตามคำสั่งหรือแบตเตอรี่ต่ำ · เหตุผลต้องไม่ปะปนกับสำรวจครบ'
  };
  const shell=document.createElement('section');shell.id='function-center';shell.className='fc-center';shell.lang='th';
  shell.innerHTML=`<header class="fc-heading"><div><p class="fc-eyebrow">SMART WATER BOAT · OVERALL SYSTEM</p><h1 id="fc-title">ภารกิจเดียว · จากจุดสำรวจสู่รายงานบนฝั่ง</h1><p class="fc-lede">เริ่มชม แล้วติดตามเรือรับแผน นำทาง วัดน้ำ ส่งผล และกลับจุดเริ่มต้น</p></div><a class="fc-back" href="#fc-tour-stages">ดูลำดับทั้งหมด ↑</a></header><div id="fc-controls"></div><section class="fc-tour-overview" aria-label="ลำดับเรื่องราวภารกิจ"><p id="fc-tour-lead">เลือกจุดสำรวจ → ส่งแผน → เริ่มเมื่อพร้อม → ดูผล → กลับและหยุด · แบบจำลองในเบราว์เซอร์</p><ol id="fc-tour-stages" class="fc-tour-stages"></ol><p id="fc-tour-status" role="status" aria-live="polite">พร้อม · กด START เพื่อเริ่มชมภารกิจ</p></section><p class="fc-step-note" id="fc-step-note">พักแล้วนาฬิกาและตำแหน่งเรือหยุด · เปลี่ยนฉากเพื่อดูคำอธิบาย โดยไม่เริ่มภารกิจใหม่</p><nav id="function-overview" aria-label="ลำดับการนำชม"><div class="fc-lane" id="fc-inputs"></div><p class="fc-join">เส้นทางที่เรือรับไว้ + ตำแหน่ง/ทิศที่ใช้ได้ ↓</p><div class="fc-lane fc-backbone" id="fc-backbone"></div><p class="fc-feedback">↖ feedback: ตำแหน่งและทิศรอบใหม่ → คำนวณซ้ำ · เมื่อผ่าน WP จึงเปลี่ยนช่วงเส้นทาง</p><div class="fc-lane fc-support" id="fc-support"></div><p class="fc-boundary">น้ำ / รายงาน / safety เชื่อมกับภารกิจหลัก แต่มีเงื่อนไขและรอบทำงานของตนเอง — ผังนี้ไม่ใช่ลำดับเวลา FreeRTOS</p></nav><section class="fc-detail" aria-labelledby="fc-detail-title"><p id="fc-tour-beat" class="fc-tour-beat"></p><p id="fc-detail-counter"></p><h2 id="fc-detail-title"></h2><p id="fc-short-purpose"></p><div id="fc-simple"><section><h3>ข้อมูลเข้า</h3><p id="fc-simple-input"></p><small id="fc-simple-input-note"></small></section><section><h3>ระบบทำอะไร</h3><p id="fc-simple-logic"></p></section><section><h3>ผลที่ส่งต่อ</h3><p id="fc-simple-output"></p><small id="fc-simple-output-note"></small></section></div><details id="fc-technical"><summary>ดูสูตร ค่าละเอียด และเครื่องมือจำลอง</summary><p id="fc-purpose"></p><div class="fc-facts"><section><h3>รับค่าอะไร</h3><dl id="fc-input-values"></dl></section><section><h3>ตรวจ / ตัดสินใจอะไร</h3><p id="fc-rule"></p><pre id="fc-formula"></pre><p id="fc-consumer"></p></section><section><h3>ผลที่ส่งต่อ</h3><dl id="fc-output-values"></dl></section></div><p id="fc-data-time"></p><details id="fc-source"><summary>แหล่งอ้างอิงและขอบเขต</summary><div id="fc-provenance"></div></details></details><div class="fc-actions" id="fc-actions"></div></section><p class="fc-boundary fc-simple-boundary">ตัวเลขและการเคลื่อนที่ในหน้านี้เป็นแบบจำลองเพื่ออธิบายแนวคิด · ไม่ใช่ข้อมูลสดจากเรือ</p>`;
  const intro=document.createElement('section');intro.id='fc-intro-brief';intro.setAttribute('aria-label','เป้าหมายและผู้ใช้ระบบ');
  intro.innerHTML='<p class="fc-intro-purpose"><strong>แนวคิดโครงงาน:</strong> ให้เรือสำรวจคุณภาพน้ำหลายจุด และส่งค่าพร้อมตำแหน่งกลับสถานี เพื่อให้ผู้ดูแลเปรียบเทียบข้อมูลแต่ละบริเวณ — ไม่ได้วินิจฉัยว่าน้ำปลอดภัยจากค่าเดียว</p><div class="fc-intro-columns"><section><h2>ใครทำอะไร</h2><p><strong>ผู้ดูแลที่สถานี</strong> เลือกจุด ส่งแผน เริ่มเมื่อเรือพร้อม ดูรายงาน และสั่งกลับหรือหยุดได้</p><p><strong>เรือ</strong> รับและตรวจแผน ใช้ GPS กับเข็มทิศนำทาง วัดน้ำ ส่งรายงาน แล้วกลับจุด HOME</p></section><section><h2>ข้อมูลที่เก็บ</h2><ul><li><strong>pH</strong> — ความเป็นกรด–ด่าง</li><li><strong>ความขุ่น (NTU)</strong> — อนุภาคที่ทำให้น้ำขุ่น</li><li><strong>อุณหภูมิ (°C)</strong> — ความร้อนของน้ำ</li></ul><p>แต่ละรายงานผูกกับตำแหน่งและสถานะเรือ</p></section></div><p class="fc-intro-boundary">ภาพยนตร์ใช้ตัวอย่างสังเคราะห์ในเบราว์เซอร์ รวมฉากน้ำขุ่นเพื่อให้เห็นการสแกนครบ — ไม่ได้เชื่อมเรือ เซ็นเซอร์ วิทยุ หรือระบบแผนที่จริง</p>';
  shell.insertBefore(intro,shell.querySelector('#fc-controls'));
  main.insertBefore(shell,root);
  // Retire duplicate live storyboards, preserving only bounded specialized inspectors.
  const labs=[['water',$('whatif-details')],['safety',$('rth-lab-details')]].filter(([,node])=>node);
  for(const [owner,node] of labs){node.dataset.functionReference=owner;$('fc-technical').append(node);}
  for(let node=root.nextElementSibling;node;){const next=node.nextElementSibling;node.remove();node=next;}
  root.hidden=false;root.classList.add('fc-evidence');
  $('am-disturbance').hidden=false;
  let selected='setup',latest=mission.snapshot(),generation=null,minimalReady=false,tourState='idle',tourIndex=0,tourTimer=null,movieStarted=false,autoHold=false,internalHoldAction=false,demoTurbidity=null;
  function lineItems(id,items){const dl=$(id);dl.replaceChildren();for(const [label,value] of items){const group=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=String(value);group.append(dt,dd);dl.append(group);}}
  function content(s){
    const active=s.mode==='GRID_PATROL'&&s.hasNavigationTarget,los=s.los,i=s.waypointIndex;
    const nav=s.rows.find(r=>r.key==='grid-los-reach');
    const ctrl=s.rows.find(r=>r.key==='grid-control'||r.key==='spiral-rth-control');
    const drive=s.rows.find(r=>r.key==='grid-drive'||r.key==='drive-interlocks');
    const a=i===0?s.missionOrigin:s.acceptedRoute[i-1],b=s.acceptedRoute[i];
    const row=ctrl,ci=row?.inputs,co=row?.output;
    const records={
      setup:{purpose:'เส้นทางที่สถานีวางแผนไว้ยังไม่ใช่เส้นทางที่เรือรับ และการรับเส้นทางไม่ใช่การอนุญาตให้มอเตอร์เริ่มทำงาน',input:[['แผนฝั่งสถานี',`${s.stationPlan.length} จุดตัวอย่าง`],['เรือเก็บเส้นทางแล้ว',`${s.acceptedRoute.length} จุด · ${s.routeSealed?'ปิดชุดแล้ว':'ยังไม่ปิดชุด'}`],['GPS / Compass',`${yes(s.gpsReady)} / ${yes(s.compassAvailable)}`]],rule:'รับและตรวจเส้นทาง → เก็บไว้บนเรือ → รับ START แยกต่างหาก → ตรวจ readiness กับ safety ก่อนเริ่ม HOME ไม่ใช่เงื่อนไขบังคับของ START',formula:'route received ≠ route accepted ≠ START permitted',output:[['ขั้นตอนปัจจุบัน',s.stationStage],['เหตุผล',s.stationReason],['สถานะเรือ',s.mode]],consumer:'เส้นทางที่ยอมรับแล้วส่งต่อให้ตัวเลือก active segment; ข้อมูล GPS/Compass ยังต้องใช้ได้ในรอบควบคุม'},
      sensors:{purpose:'แยกค่าที่รับเข้ามา ค่าที่ผ่านการตรวจ และทิศของตัวเรือจำลอง — flag พร้อมใช้ไม่ได้แปลว่าวัดได้แม่นยำ',input:[['ตำแหน่งที่ผ่าน acquisition',point(s.acquiredPosition)],['GPS ready',yes(s.gpsReady)],['Compass address / read',`${yes(s.inputs.compass)} / ${yes(s.inputs.compassReadOk)}`],['Raw X / Y (counts ตัวอย่าง)',`${s.compassPolicy?.rawX??s.inputs.compassRawX} / ${s.compassPolicy?.rawY??s.inputs.compassRawY}`]],rule:'GPS ต้องมีข้อมูลที่ใช้ได้; Compass อ่านสำเร็จ แปลง raw axes พร้อม offset/calibration แล้วได้ heading ที่ finite จึงส่งต่อได้ ตัวอย่างเริ่มต้นสร้าง raw ตาม hull จำลอง ไม่ใช่ compass จริง',formula:'raw axes → correction → heading° → available\nread failure → unavailable (ไม่แทนด้วย 0°)',output:[['Compass acquisition',`${fmt(s.acquiredHeading)}° · ${yes(s.compassAvailable)}`],['ทิศ hull จำลอง (แยกจากค่าที่อ่าน)',`${fmt(s.plantHeading)}°`]],consumer:'ตำแหน่ง → segment/LOS; heading ที่อ่านได้ → heading control; unavailable → final drive interlock'},
      segment:{purpose:'การนำทางไม่จำเป็นต้องหันตรงไป WP ตลอดเวลา: ต้องรู้ก่อนว่ากำลังติดตามช่วงเส้นใด และจุดเล็งอยู่ที่ไหนบนช่วงนั้น',input:[['เรือปัจจุบัน P',point(s.acquiredPosition)],['จุดเริ่มช่วง A',active?point(a):'รอรับเส้นทาง'],['จุดปลายช่วง B',active?point(b||s.target):'ยังไม่มี WP ที่ยอมรับ']],rule:'GRID เลือก A จาก mission origin หรือ WP ก่อนหน้า และ B จาก active index; project ตำแหน่ง P ลงบนแนว A→B เพื่อหา along-track และ cross-track',formula:'t = dot(P − A, B − A) / |B − A|²\nalong = t · |B − A|\ncross = signed perpendicular offset',output:[['ช่วงที่ใช้อยู่',active?`index ${i} → WP${i+1}`:'ยังไม่มี active segment'],['Along-track',`${fmt(los?.alongTrackM)} m`],['Cross-track',`${fmt(los?.crossTrackM)} m`]],consumer:'segment และระยะฉาย → LOS aim / WP acceptance; หลังเปลี่ยน index จึงเลือก A/B รอบใหม่'},
      waypoints:{purpose:'แยก WP ปลายช่วง, จุดเล็ง LOS และการตัดสินใจรับ WP ออกจากกัน จุดเล็งเลื่อนไปตามแนวช่วงและถูก clamp ไม่ให้เลยปลาย',input:[['ปลายช่วง (ปัจจุบัน)',active?point(s.target):'รอเส้นทาง'],['จุดเล็ง LOS (ปัจจุบัน)',los?.valid?point(los.lookahead):'ยังไม่มี LOS ที่ใช้ได้'],['ระยะถึง WP / ถึงจุดเล็ง',`${fmt(s.targetDistanceM)} / ${fmt(s.guidanceDistanceM)} m`]],rule:'GRID มองหน้า 6 m ตามแนว segment; รับ WP เมื่ออยู่ในรัศมี 3 m พร้อม along-track progress หรือเลยปลาย 0.5 m และยังอยู่ใกล้แนว (|cross| ≤ 3 m) SPIRAL ใช้เกณฑ์เฉพาะของมัน ไม่ยืม GRID ทั้งชุด',formula:'aim = A + clamp(along + 6 m, 0, length) · unit(A→B)\nreached/progress OR passed/near-track → advance WP',output:[['Bearing LOS ปัจจุบัน',los?.valid?`${fmt(los.bearingDeg)}°`:'รอข้อมูล'],['ผลตรวจจากรอบที่บันทึก',nav?`${nav.predicate.result?'ผ่าน WP เดิม':'ยังติดตาม WP เดิม'} · ${nav.decision}`:'รอรอบนำทาง'],['ระยะถึงเป้าเดิมที่ใช้ตรวจ',nav?`${fmt(nav.inputs.distanceM)} m · index ${nav.inputs.index}`:'ยังไม่มีการตรวจ']],consumer:'bearing → heading control; ผลรับ WP → active segment รอบใหม่ ไม่ใช้ระยะถึง WP ใหม่มาอธิบายการผ่านจุดเก่า'},
      heading:{purpose:'controller ใช้ความคลาดระหว่างทิศเป้าหมายกับทิศที่อ่านได้ ไม่ใช่แค่หมุนรูปหัวเรือให้ชี้ตามเส้น',input:[['ทิศเป้าหมายที่ใช้คำนวณล่าสุด',ci?`${fmt(ci.targetDeg??s.targetHeading)}°`:'ยังไม่คำนวณ'],['Compass ในรอบนั้น',ci?`${fmt(ci.headingDeg)}°`:'ยังไม่คำนวณ'],['ความคลาดในรอบนั้น',ci?`${fmt(ci.headingError)}°`:'ยังไม่คำนวณ']],rule:'GRID ใช้ continuous steering/surge พร้อม integral และการกรอง heading-rate; SPIRAL/RTH ใช้ HeadingController/PidController อีกเส้นทาง จึงไม่เรียกทุกโหมดว่า PID แบบเดียวกัน',formula:'error = wrap180(target° − measured°)\nGRID: error / integral / filtered rate → steering + surge\nSPIRAL / RTH: mode-specific HeadingController PID',output:[['controller ปัจจุบัน',s.controllerKind],['Steering / Surge (รอบ GRID ล่าสุด)',ci?`${fmt(ci.steeringPwm)} / ${fmt(ci.surgePwm)} PWM`:'รอรอบควบคุม'],['คำขอซ้าย / ขวาจาก controller',co?pair(co.requestedPwm||s.requestedPwm):'รอรอบควบคุม'],['หลัง final drive',pair(s.appliedPwm)]],consumer:'คำขอ PWM → final DriveController; motor/plant เปลี่ยนทิศ → Compass รอบถัดไปปิด feedback loop'},
      drive:{purpose:'ค่าที่ controller ขอ (requested) อาจไม่เท่ากับค่าที่อนุญาตให้จ่าย (applied) โดยเฉพาะระหว่าง safety stop, sampling hold หรือการกลับทิศ',input:[['Requested ปัจจุบัน',pair(s.requestedPwm)],['สถานะ / ช่วงวัด',`${s.mode} / ${s.hold.phase}`],['เหตุหยุดที่ final Drive ระบุ',s.driveDecision?.stopReason??'ยังไม่ประเมิน']],rule:'ทุกโหมดผ่าน final drive เดียว: ตรวจ source/state/interlock แล้วจำกัดค่า ยก floor คุม slew และ neutral ก่อนกลับทิศ ตาม policy เดิม',formula:'requested L/R → final drive policy → applied L/R\napplied / 178 → illustrative yaw / surge / pose',output:[['Applied ปัจจุบัน',pair(s.appliedPwm)],['Applied ในบันทึกรอบล่าสุด',drive?pair(drive.output.appliedPwm):'ยังไม่มีรอบขับ'],['ความเร็วใน plant ตัวอย่าง',`${fmt(s.speedMps)} m/s (ไม่ใช่ค่าที่วัดจริง)`]],consumer:'เฉพาะ applied ขับ plant สังเคราะห์; pose/heading รอบใหม่ส่งกลับ GPS/Compass ค่าจ่าย 0/0 ไม่พิสูจน์ว่าเรือจริงอยู่นิ่ง'},
      water:{purpose:'การแปลงเซ็นเซอร์ การเผยแพร่ค่า และ detector เป็นคนละเงื่อนไข; pH ที่ยังไม่มีค่าไม่ใช่ pH=0',input:[['pH / ความขุ่น / อุณหภูมิ',`${fmt(s.water.ph)} pH / ${fmt(s.water.ntu)} NTU / ${fmt(s.water.temp,1)} °C`],['Sample / Snapshot',`${s.sampleId} / ${s.snapshotId}`],['SMA ล่าสุด',`${s.anomaly.window.length}/8 ตัวอย่าง · ${fmt(s.anomaly.mean)} NTU`]],rule:'ทุก 2 WP พัก settle 3 s แล้ว measure 5 s; pH เผยแพร่เมื่อ quiet gate ผ่านและ applied เป็นศูนย์ Detector ใช้ SMA8: absolute mean>50 หรือ baseline branch พร้อม dwell/eligibility ไม่ใช่ความขุ่นสูงแล้วสั่ง SPIRAL ทันที',formula:'acquire → convert → sample window → detector / publish\npassed WP1 + eligible + trigger + safety → SPIRAL\nscan complete / clean timer / wall timer → resume GRID',output:[['Sampling hold',s.hold.phase],['สถานะการสแกน',`${s.missionState} · ผ่าน ${s.anomaly.spiralIndex}/25 จุดก้นหอย`],['เหตุ trigger ที่บันทึก',s.spiralCause?`เวลา ${fmt(s.spiralCause.atMs/1000)} s · mean ${fmt(s.spiralCause.mean)} NTU (เหตุการณ์เดิม)`:'ยังไม่มี trigger ที่บันทึก']],consumer:'ค่าที่เผยแพร่ได้ → immutable report; scan เก็บ GRID index เดิมไว้กลับไปต่อ ไม่ใช่สร้าง mission ใหม่'},
      report:{purpose:'แยกค่าบนเรือตอนนี้ รายงานที่กำลังส่ง และรายงานล่าสุดที่ฝั่งได้รับ เพื่อไม่เอาค่าใหม่ไปแทนแพ็กเก็ตเก่า',input:[['Snapshot บนเรือตอนนี้',`${s.snapshotId} · sample ${s.sampleId}`],['รายงานกำลังส่ง / ล่าสุดที่ส่ง',s.transport.active?.seq??s.transport.latestTx?.seq??'ยังไม่มี'],['รายงานล่าสุดที่ฝั่งรับ',s.transport.rx?.sequence??'ยังไม่ได้รับ']],rule:'model ทุก 1 s เตรียม immutable snapshot → encode → MessageChannel → decode/commit ที่ฝั่ง การส่งแล้วไม่เท่ากับได้รับ; loss/retry ต้องเก็บตัวตนข้อมูลเดิม แสดงรายละเอียด 9 ฟิลด์ด้านล่าง',formula:'current sample ≠ outgoing snapshot ≠ last received report\nencode → transport receipt → decode → shore display',output:[['สถานะการส่ง',s.transport.phase],['ลำดับข้อมูลล่าสุดที่ส่ง',s.transport.latestTx?.seq??'ยังไม่มี TX'],['ความเก่าของข้อมูลฝั่ง',s.transport.stale?'ฝั่งยังแสดงข้อมูลเดิม':'ดูชุดข้อมูลล่าสุดที่ได้รับ']],consumer:'ตารางด้านล่างอ่านค่าจาก immutable outgoing และ decoded receipt จริงของ browser; memory log เป็นตัวอย่าง ไม่ใช่ SD durability/replay'},
      safety:{purpose:'คำสั่ง/เงื่อนไขความปลอดภัยมีสิทธิ์เหนือการตามเส้นทาง และ RTH ต้องมี HOME ที่ใช้ได้ แต่ START ไม่ต้องบังคับ SET_HOME',input:[['Safety state / voltage ตัวอย่าง',`${s.safetyState} / ${fmt(s.batteryVoltage)} V`],['HOME / ระยะ',`${s.inputs.home?'มี HOME':'ไม่มี HOME'} · ${fmt(s.homeDistanceM)} m`],['โหมด / เหตุกลับ',`${s.mode} / ${s.returnCause??'ยังไม่มี'}`]],rule:'อธิบายเหตุหยุดจาก driveDecision.stopReason และ applied จริง; EMERGENCY_STOP อาจ latch แม้อินพุตกลับปกติ RTH มี departure/arrival dwell; ไม่สรุปว่าจบสำรวจเพียงเพราะกำลังกลับ',formula:'command / battery / readiness → FSM priority\nfinal stop reason → applied PWM\nRTH: HOME + departure / arrival gates → park / complete',output:[['เหตุหยุด authoritative',s.driveDecision?.stopReason??'ยังไม่ประเมิน'],['Applied ซ้าย / ขวา',pair(s.appliedPwm)],['สถานะเรือ',s.mode]],consumer:'ผล stop → final drive; RTH → guidance ของโหมดกลับบ้าน; ใช้คำสั่งทดลองด้านล่างกับ browser เท่านั้น ไม่ใช่การรับรอง fail-safe ของเรือจริง'}
    };
    records.anomaly=records.water;
    if(selected==='segment'&&!active){
      records.segment.input=[['โหมดปัจจุบัน',s.mode],['ตำแหน่งที่อ่านได้',point(s.acquiredPosition)],['GRID route ที่เก็บไว้',`${s.acceptedRoute.length} จุด`]];
      records.segment.output=[['Active GRID segment','ยังไม่ active ในโหมดนี้'],['Guidance ปัจจุบัน',s.mode==='RETURN_HOME'?'RTH ใช้ bearing ตรง HOME':s.mode==='SPIRAL_SCAN'?'SPIRAL ใช้ segment ของ planner':'รอการเริ่มนำทาง']];
    }
    if(selected==='waypoints'&&s.mode!=='GRID_PATROL'){
      records.waypoints.purpose=`โหมดปัจจุบัน ${s.mode} — สูตรด้านล่างเป็นเงื่อนไข GRID อ้างอิง ไม่อ้างว่ากำลังประมวลผล GRID อยู่ SPIRAL ใช้ LOS3m/เกณฑ์ของ planner; RTH ใช้ bearing ตรง HOME`;
      records.waypoints.input=[['โหมดปัจจุบัน',s.mode],['เป้าหมายของโหมดนี้',s.hasNavigationTarget?point(s.target):'ยังไม่มี navigation target']];
    }
    return records[selected];
  }
  function render(){
    const d=definitions.find(x=>x.id===selected),s=latest,c=content(s);
    shell.dataset.selected=selected;root.dataset.selectedFunction=selected;
    $('fc-tour-beat').textContent=beats[selected];$('fc-detail-counter').textContent=`ช่วง ${d.no} / 08 · ${d.subtitle}`;$('fc-detail-title').textContent=d.title;$('fc-purpose').textContent=c.purpose;
    lineItems('fc-input-values',c.input);$('fc-rule').textContent=c.rule;$('fc-formula').textContent=c.formula;lineItems('fc-output-values',c.output);$('fc-consumer').textContent=c.consumer;
    $('fc-data-time').textContent=`สถานะปัจจุบัน ${fmt(s.clockMs/1000)} s · snapshot ${s.snapshotId} · ช่องที่ระบุ “รอบล่าสุด” อ่านจากบันทึกการคำนวณรอบนั้น ไม่ใช่การนำค่าปัจจุบันมาคำนวณใหม่`;
    $('fc-provenance').replaceChildren();
    for(const key of d.sources){const ref=kernel.source(key),p=document.createElement('p');p.textContent=`${ref.path} · ${ref.function} · L${ref.lines.join('–')} · ${ref.browserHelper} · ${ref.boundary}`;$('fc-provenance').append(p);}
    const r=s.rows.filter(x=>d.sources.includes(x.key));const pre=document.createElement('pre');pre.textContent=JSON.stringify({atMs:s.clockMs,rows:r},null,2);$('fc-provenance').append(pre);
    for(const [owner,node] of labs)node.hidden=owner!==selected;
    $('am-spiral-demo').hidden=selected!=='water';
    $('fc-heading-lab').hidden=selected!=='heading';
    renderMinimal();
  }
  function select(id){const index=definitions.findIndex(d=>d.id===id);if(index<0)return;if(movieStarted&&mission.snapshot().playing)$('am-toggle').click();selected=id;tourIndex=index;if(tourState==='idle')tourState='manual';mission.setMode(definitions[index].mode);for(const key of ['fc-technical','fc-report-inventory'])if($(key))$(key).open=false;render();}
  $('fc-actions').innerHTML='<a id="fc-heading-lab" href="heading-pid.html">เปิด PID A/B lab · ตัวอย่างปรับค่าแยกจากภารกิจนี้ ↗</a><a href="#fc-tour-stages">กลับไปดูลำดับการนำชม ↑</a>';
  const refresh=()=>{$('fc-heading-lab').hidden=selected!=='heading';};
  function installMinimal(){
    shell.classList.add('fc-minimal');
    const overview=$('function-overview');overview.replaceChildren();overview.hidden=true;
    for(const d of definitions){
      const item=document.createElement('li'),button=document.createElement('button');
      item.dataset.tourStage=d.id;button.type='button';button.dataset.movieChapter=d.id;
      button.textContent=`${d.no} · ${d.title}`;item.append(button);$('fc-tour-stages').append(item);
    }
    $('fc-tour-stages').addEventListener('click',event=>{
      const button=event.target.closest('[data-movie-chapter]');if(button)select(button.dataset.movieChapter);
    });
    const player=root.querySelector('.am-transport');player.setAttribute('aria-label','ตัวควบคุมภาพยนตร์ภารกิจ');
    $('fc-controls').append(player);$('am-start').textContent='START';$('am-next').textContent='STEP';
    $('am-spiral-demo').hidden=true;
    const stage=document.createElement('section');stage.id='fc-movie-stage';stage.className='fc-movie-stage';stage.hidden=true;
    stage.setAttribute('aria-label','ฉากภารกิจที่เชื่อมกับสถานะจริงของแบบจำลอง');
    stage.innerHTML='<header class="fc-stage-heading"><div><span id="fc-stage-counter">01 / 08 · LIVE</span><h2 id="fc-stage-title">ภาพรวมทั้งระบบ</h2></div><p id="fc-stage-caption">สถานะจากภารกิจจำลองชุดเดียวกัน · เวลาเป็น model clock</p></header><div class="fc-stage-map" id="fc-stage-map"></div><div class="fc-causal-flow" id="fc-causal-flow" aria-label="ข้อมูลเข้า เงื่อนไข และผลที่เกิด"><article><span id="fc-input-label">ข้อมูลเข้า</span><strong id="fc-input-value">—</strong></article><i aria-hidden="true">→</i><article><span id="fc-check-label">เงื่อนไข / การคำนวณ</span><strong id="fc-check-value">—</strong></article><i aria-hidden="true">→</i><article><span id="fc-output-label">ผลในฉาก</span><strong id="fc-output-value">—</strong></article></div><div class="fc-stage-actions" id="fc-stage-actions"><span id="fc-stage-action-note">ฉากจำลอง · ค่าที่ไม่มีแสดงเป็น unavailable ไม่แทนด้วยศูนย์</span></div><p id="fc-stage-proof" class="fc-stage-proof" aria-live="polite"></p></section>';
    $('fc-controls').after(stage);
    const navVisual=document.createElement('section');navVisual.id='fc-nav-visual';navVisual.className='fc-nav-visual';navVisual.hidden=true;
    navVisual.setAttribute('aria-labelledby','fc-nav-title');
    navVisual.innerHTML='<header><div><h3 id="fc-nav-title">เรือวิ่งตามช่วง · แล้วจึงรับ WP</h3><p id="fc-nav-event">รอรอบนำทาง GRID ที่บันทึกไว้</p></div><span class="fc-nav-live-label">ภาพจาก event จริงของแบบจำลอง</span></header><div class="fc-nav-grid"><div class="fc-nav-track"><div class="fc-nav-track-heading"><strong>ช่วงปัจจุบัน A → B</strong><span>ภาพย่อตามแนวช่วง</span></div><svg id="fc-nav-segment" viewBox="0 0 320 104" role="img" aria-labelledby="fc-nav-segment-title fc-nav-segment-desc"><title id="fc-nav-segment-title">ตำแหน่งเรือ จุดฉาย จุดเล็ง LOS และเขตรับ waypoint</title><desc id="fc-nav-segment-desc">เส้น active segment A ถึง B; P แสดงตำแหน่งในรอบ GRID ที่บันทึก, เส้นตั้งคือ cross-track, เพชรคือจุดเล็ง LOS, วงรอบ B คือเขตรับ WP 3 เมตร</desc><line id="fc-nav-segment-line" x1="26" y1="48" x2="280" y2="48"/><circle id="fc-nav-acceptance" cx="280" cy="48" r="12"/><line id="fc-nav-cross" x1="120" y1="36" x2="120" y2="48"/><circle id="fc-nav-projection" cx="120" cy="48" r="3"/><circle id="fc-nav-pose" cx="120" cy="36" r="4"/><path id="fc-nav-los" d="M180 42L186 48L180 54L174 48Z"/><circle id="fc-nav-end" cx="280" cy="48" r="3"/><text id="fc-nav-a-label" x="26" y="91">A</text><text id="fc-nav-b-label" x="280" y="91">B · WP</text></svg><div class="fc-nav-legend"><span><i class="fc-nav-key-segment"></i>A→B</span><span><i class="fc-nav-key-pose"></i>P เรือ</span><span><i class="fc-nav-key-projection"></i>จุดฉาย / cross</span><span><i class="fc-nav-key-los"></i>LOS aim</span><span><i class="fc-nav-key-zone"></i>วงรับ WP</span></div><p id="fc-nav-cross-label" class="fc-nav-cross-label">cross-track: —</p></div><div class="fc-nav-feedback"><div class="fc-nav-heading-block"><div><strong>ทิศเป้าหมาย → Compass</strong><small id="fc-nav-heading-values">รอ GRID control</small></div><svg id="fc-nav-heading-dial" viewBox="0 0 96 96" role="img" aria-label="ทิศเป้าหมายและทิศ Compass ในรอบควบคุม"><circle cx="48" cy="48" r="32"/><text x="48" y="20">N</text><line id="fc-nav-heading-target" x1="48" y1="48" x2="48" y2="20"/><line id="fc-nav-heading-measured" x1="48" y1="48" x2="48" y2="27"/><circle cx="48" cy="48" r="2.5"/></svg></div><div class="fc-nav-motors"><strong>คำสั่ง PWM หลัง drive</strong><div class="fc-nav-motor-row"><span>ซ้าย</span><div class="fc-nav-meter"><i id="fc-nav-left-fill"></i></div><output id="fc-nav-left-value">—</output></div><div class="fc-nav-motor-row"><span>ขวา</span><div class="fc-nav-meter"><i id="fc-nav-right-fill"></i></div><output id="fc-nav-right-value">—</output></div><small>signed PWM เป็นคำสั่งซอฟต์แวร์ · ไม่ใช่แรงขับที่วัดได้</small></div></div><div class="fc-nav-wp-result"><strong id="fc-nav-outcome">รอการตรวจ WP</strong><span>เข้าเขต 3 m + เดินหน้าขั้นต่ำ · หรือเลยปลาย ≥ 0.5 m และ |cross| ≤ 3 m</span></div></div>';
    stage.insertBefore(navVisual,$('fc-causal-flow'));
    const map=document.createElement('div');map.id='fc-map';map.className='fc-live-map';
    map.append(root.querySelector('.am-layout'),$('am-data-panel'),$('am-current-reason'));
    $('fc-stage-map').append(map);
    const actions=$('fc-stage-actions'),forceRth=root.querySelector('[data-policy-command="FORCE_RTH"]');
    forceRth.id='fc-force-rth';forceRth.textContent='ขอกลับ HOME · FORCE_RTH';
    $('am-anomaly-activate').textContent='เปิดน้ำขุ่นสังเคราะห์';
    actions.append($('am-anomaly-activate'),forceRth);
    const inventory=document.createElement('details');inventory.id='fc-report-inventory';inventory.innerHTML='<summary>ดูข้อมูลรายงานทั้งหมด · 9 ฟิลด์</summary>';stage.after(inventory);inventory.append($('am-data-details'));
    const detail=shell.querySelector('.fc-detail'),readMore=document.createElement('details');readMore.id='fc-read-more';readMore.innerHTML='<summary>เปิดคำอธิบาย เทคนิค และ PID A/B</summary>';detail.before(readMore);readMore.append(detail);
    const technical=$('fc-technical'),advanced=document.createElement('details');advanced.id='fc-advanced-controls';advanced.innerHTML='<summary>ขอบเขต / เครื่องมือทดสอบเพิ่มเติม</summary>';technical.append(advanced);
    advanced.append(...[...root.children].filter(node=>!node.hidden&&!['am-layout','am-data-panel','am-current-reason'].includes(node.id)&&!node.classList.contains('am-transport')&&!node.classList.contains('am-lens-strip')));
    readMore.after(root);root.classList.add('fc-minimal-evidence');
    $('am-anomaly-activate').hidden=true;forceRth.hidden=true;
    const context=root.querySelector('.am-context-links');if(context)context.hidden=true;
    $('fc-tour-lead').textContent='แปดฉาก · การเปลี่ยนฉากผูกกับ event/state ที่เกิดจริง ไม่ใช่สไลด์ตามตัวจับเวลา';
    $('fc-step-note').textContent='START เริ่มภารกิจเดียวกัน · PAUSE หยุด model clock/pose; ข้อความอธิบายไม่ขยับเรือ';
    for(const a of shell.querySelectorAll('a[href="#fc-tour-stages"]')){a.textContent='ดูลำดับทั้ง 8 ฉาก ↑';a.addEventListener('click',e=>{e.preventDefault();$('fc-tour-stages').scrollIntoView({block:'start'});});}
    $('am-start').addEventListener('click',beginTour);
    $('am-toggle').addEventListener('click',onPlayerToggle);
    $('fc-tour-stages').addEventListener('keydown',event=>{
      if(!['ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
      const buttons=[...$('fc-tour-stages').querySelectorAll('[data-movie-chapter]')],index=buttons.indexOf(document.activeElement);
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
      event.preventDefault();select(buttons[next].dataset.movieChapter);buttons[next].focus();
    });
    minimalReady=true;
    observeSvgLabelScale();
  }
  function renderMinimal(){
    if(!minimalReady)return;
    const visible=tourState!=='idle',index=Math.max(0,definitions.findIndex(d=>d.id===selected)),d=definitions[index],s=latest;
    shell.dataset.view=visible?'movie':'intro';shell.dataset.chapter=d.id;
    $('fc-movie-stage').hidden=!visible;root.hidden=false;$('function-overview').hidden=true;
    $('fc-nav-visual').hidden=!visible||!['segment','heading'].includes(selected);renderNavVisual(s);
    $('fc-intro-brief').hidden=visible;
    $('am-start').textContent='START';$('am-toggle').textContent=s.playing?'พัก':'เล่นต่อ';$('am-next').textContent='ทีละจังหวะ';$('am-reset').textContent='เริ่มใหม่';
    $('fc-tour-status').textContent=!visible?'พร้อมชม · กด START เพื่อเริ่มภารกิจจำลอง':autoHold?'พักคำอธิบาย · เวลาและตำแหน่งเรือหยุด':tourState==='paused'?'พักโดยผู้ชม · กด เล่นต่อ เพื่อเดินหน้าต่อ':tourState==='finished'?'จบจากผลที่เกิดในแบบจำลอง · เรือหยุดแล้ว':`ฉาก ${d.no}/08 · ${d.title} · เวลา ${fmt(s.clockMs/1000)} วินาที`;
    $('fc-tour-lead').textContent=visible?'เปลี่ยนฉากเพื่อดูคำอธิบาย · แผนที่ยังเป็นภารกิจเดิม ไม่ย้อนตำแหน่ง':'เลือกจุดสำรวจ → ส่งแผน → เริ่มเมื่อพร้อม → ดูผล → กลับและหยุด · แบบจำลองในเบราว์เซอร์';
    for(const [i,item] of [...$('fc-tour-stages').children].entries()){
      item.classList.toggle('is-complete',visible&&i<index);
      item.classList.toggle('is-current',visible&&i===index);
      const button=item.querySelector('[data-movie-chapter]');
      if(visible&&i===index){item.setAttribute('aria-current','step');button.setAttribute('aria-current','step');}
      else{item.removeAttribute('aria-current');button.removeAttribute('aria-current');}
    }
    $('fc-stage-counter').textContent=`ฉาก ${d.no} / 08`;
    $('fc-stage-title').textContent=d.title;
    $('fc-stage-caption').textContent='แผนที่และคำอธิบายใช้ภารกิจจำลองชุดเดียวกัน · เปลี่ยนฉากไม่ย้ายเรือ';
    $('fc-stage-proof').textContent='ค่าที่แสดงมาจากสถานะล่าสุดของแบบจำลอง ไม่ใช่ข้อมูลสดจากเรือ';
    const receivedRoute=s.incoming.received.find(item=>item.kind==='route-upload');
    const appliedRoute=s.incoming.applied.find(item=>item.kind==='route-upload');
    const control=s.rows.find(row=>row.key==='grid-control'||row.key==='spiral-rth-control');
    const trigger=s.rows.find(row=>row.key==='anomaly-eligibility'&&row.predicate.result===true);
    const rx=s.transport.rx,tx=s.transport.latestTx;
    const scene={
      setup:[`สถานีเตรียม ${s.stationPlan.length} จุดสำรวจตัวอย่าง`,`เรือรับแผน ตรวจความพร้อม แล้วจึงเริ่ม`,`เรือพร้อมเริ่ม · ตำแหน่งและทิศจะป้อนการนำทาง`],
      sensors:[receivedRoute?'แผนจุดสำรวจมาถึงเรือแล้ว':'รอแผนจากสถานี',`ตรวจและเก็บ ${appliedRoute?s.acceptedRoute.length:0} จุด · คำสั่งเริ่มแยกจากแผน`,`เริ่มได้เมื่อ GPS เข็มทิศ และเงื่อนไขขับพร้อม`],
      segment:[`ตำแหน่งเรือ P · ทิศ ${Number.isFinite(s.acquiredHeading)?`${fmt(s.acquiredHeading)}°`:'ยังไม่มีค่าที่ใช้ได้'}`,s.los?.valid?`ฉาย P ลง A→B · คลาดจากแนว ${fmt(s.los.crossTrackM,1)} m · เล็งนำหน้า ${fmt(s.guidanceDistanceM,1)} m`:'รอตำแหน่งและช่วงเส้นทางที่ใช้ได้',`ติดตามจุดสำรวจ ${Math.min(s.waypointIndex+1,s.acceptedRoute.length||1)} · รับจุดเมื่อเข้าเกณฑ์ระยะและความคืบหน้า`],
      heading:[control?`ทิศเป้า ${fmt(control.inputs.targetDeg)}° · ทิศที่อ่าน ${Number.isFinite(control.inputs.headingDeg)?`${fmt(control.inputs.headingDeg)}°`:'ยังไม่มีค่า'} · คลาด ${fmt(control.inputs.headingError)}°`:'รอทิศเป้าและทิศที่อ่านได้',`${s.controllerKind.startsWith('GRID')?'GRID ปรับการเลี้ยวและความเร็วต่อเนื่อง':'โหมดนี้ใช้ตัวควบคุมทิศของตนเอง'} · GRID ไม่ใช่ PID แบบเดียวกับสแกน/กลับบ้าน`,`ขอ ${s.requestedPwm.left}/${s.requestedPwm.right} → จ่ายจริง ${s.appliedPwm.left}/${s.appliedPwm.right} PWM · วัดทิศใหม่`],
      water:[`pH ${Number.isFinite(s.water.ph)?fmt(s.water.ph,2):'ยังไม่มีค่า'} · ความขุ่น ${Number.isFinite(s.water.ntu)?`${fmt(s.water.ntu)} NTU`:'ยังไม่มีค่า'} · อุณหภูมิ ${Number.isFinite(s.water.temp)?`${fmt(s.water.temp,1)} °C`:'ยังไม่มีค่า'}`,s.hold.phase==='none'?'น้ำนิ่งบางช่วงจึงพักขับก่อนอ่านค่า':'พักขับเพื่อให้น้ำนิ่ง แล้วเก็บค่าตามช่วงวัด',`ค่าที่ยังอ่านไม่ได้แสดงว่าไม่มีค่า · ไม่แทนด้วย 0`],
      anomaly:[`น้ำขุ่นตัวอย่างสังเคราะห์ · ${demoTurbidity?'เปิดค้างตลอดฉาก':'ใช้ค่าที่ผู้ชมกำหนด'}`,trigger?`ค่าเฉลี่ย ${fmt(trigger.inputs.mean)} NTU · ผ่านจุดแรกและเงื่อนไขตรวจพบ`:`เฉลี่ย 8 ตัวอย่าง · รอผ่านจุดแรกและเกณฑ์ตรวจจับ`,`สแกน ${Math.min(s.anomaly.spiralIndex,25)}/25 · จะกลับไปต่อจุดสำรวจเดิม ${s.anomaly.interruptedIndex===null?'—':s.anomaly.interruptedIndex+1}`],
      report:[`ค่าที่วัดพร้อมตำแหน่ง · รายงานล่าสุด ${tx?'เตรียมส่งแล้ว':'กำลังรอบันทึก'}`,`ส่งผ่านช่องทางจำลองในเบราว์เซอร์ · รอฝั่งยืนยัน`,rx?'ฝั่งได้รับและแสดงรายงานแล้ว':'ยังไม่ได้รับ · ไม่ถือว่าค่าส่งแล้วถึงฝั่ง'],
      safety:[`ผู้ดูแลสั่งกลับได้ทุกเมื่อ · แบตเตอรี่ต่ำให้กลับก่อน`,`กลับ HOME แล้วรออยู่ในเขตปลายทางตามเวลาที่กำหนด`,`สาเหตุ: ${s.returnCause==='route-complete'?'สำรวจครบ 9 จุด':s.returnCause==='lowbattery'?'แบตเตอรี่ต่ำ':s.returnCause==='forced'?'ผู้ดูแลสั่งกลับ':'กำลังทำภารกิจ'} · จ่าย ${s.appliedPwm.left}/${s.appliedPwm.right} PWM`]
    }[selected];
    const labels={setup:['ผู้ดูแลเตรียมอะไร','เรือตรวจอะไร','จึงเกิดอะไร'],sensors:['แผนจากสถานี','การตรวจบนเรือ','พร้อมเริ่มเมื่อใด'],segment:['ตำแหน่งและทิศ','หาแนวและจุดเล็ง','การรับจุดสำรวจ'],heading:['ทิศเป้ากับทิศที่อ่าน','ปรับการบังคับ','มอเตอร์และการวัดรอบใหม่'],water:['ค่าที่วัด · หน่วย','พักและอ่านค่า','ค่าที่ส่งต่อ'],anomaly:['ตัวอย่างน้ำขุ่น','ตรวจค่าและเงื่อนไข','สแกนและกลับเส้นทาง'],report:['รายงานจากเรือ','ส่งและรอการยืนยัน','ผลที่สถานีได้รับ'],safety:['คำสั่งและแบตเตอรี่','กลับถึง HOME','เหตุผลและการหยุด']}[selected];
    ['input','check','output'].forEach((key,i)=>{$(`fc-${key}-label`).textContent=labels[i];$(`fc-${key}-value`).textContent=scene[i];});
    $('fc-causal-flow').dataset.chapter=selected;
    $('fc-report-inventory').hidden=!visible||selected!=='report';$('am-data-details').hidden=!visible||selected!=='report';
    const anomalyButton=$('am-anomaly-activate'),forceButton=$('fc-force-rth');
    anomalyButton.hidden=!visible||index<4||index>5;forceButton.hidden=!visible||index<6;
    $('fc-stage-action-note').textContent=selected==='anomaly'?(demoTurbidity?'ฉากสาธิตใช้อินพุตความขุ่นสังเคราะห์ต่อเนื่อง · ไม่ใช่เซ็นเซอร์จริง':'ใช้อินพุตที่ผู้ชมตั้งไว้ · ฉากนี้ไม่สั่งข้ามเงื่อนไขตรวจจับ'):selected==='safety'?'การกลับก่อนครบเป็นคนละเหตุผลกับสำรวจครบ · ไม่มีคำสั่งกลับอัตโนมัติเพื่อเร่งภาพยนตร์':'คำอธิบายอ้างอิงค่าล่าสุด · การพักหยุดนาฬิกาและตำแหน่ง';
    const copy={
      setup:['เรือสำรวจน้ำหลายตำแหน่ง',[`${s.stationPlan.length} จุดตัวอย่าง`,'แนวคิดไม่ใช่ผลวัดภาคสนาม'],'แผน → ตรวจพร้อม → สำรวจ → รายงาน → กลับ',[`${s.acceptedRoute.length} จุดที่เรือรับ`,'แบบจำลองเบราว์เซอร์']],
      sensors:['แผนต้องถึงและถูกตรวจ',[receivedRoute?'แผนมาถึงเรือแล้ว':'รอแผนจากสถานี','ยังไม่เท่ากับเริ่มเดินเรือ'],'เริ่มเมื่อเงื่อนไขความพร้อมผ่าน',[appliedRoute?`${s.acceptedRoute.length} จุดที่เรือเก็บไว้`:'รอตรวจแผน','คำสั่งเริ่มแยกจากการส่งแผน']],
      segment:['ตำแหน่งและทิศกำหนดทาง',[s.los?.valid?`คลาดแนว ${fmt(s.los.crossTrackM,1)} m`:'รอตำแหน่งที่ใช้ได้','ภาพระนาบตัวอย่าง ไม่ใช่พิกัดจริง'],'คำนวณจุดเล็งบนช่วง A→B',[s.los?.valid?`${fmt(s.los.bearingDeg)}°`:'รอจุดเล็ง','เรือใช้ทิศนี้ไปยังจุดสำรวจ']],
      heading:['เทียบทิศที่ต้องการกับที่อ่าน',[control?`คลาด ${fmt(control.inputs.headingError)}°`:'รอข้อมูลทิศ','ค่าจากรอบควบคุมล่าสุด'],'ตัวควบคุมโหมดนั้นปรับมอเตอร์',[`${s.appliedPwm.left}/${s.appliedPwm.right} PWM`,'ค่าที่จ่ายแล้วในแบบจำลอง']],
      water:['สามค่ามีคนละความหมาย',[`pH ${Number.isFinite(s.water.ph)?fmt(s.water.ph,2):'ยังไม่มีค่า'}`,`ขุ่น ${Number.isFinite(s.water.ntu)?`${fmt(s.water.ntu)} NTU`:'ยังไม่มีค่า'} · ${Number.isFinite(s.water.temp)?`${fmt(s.water.temp,1)} °C`:'อุณหภูมิยังไม่มีค่า'}`],'พักเรือก่อนอ่านบางค่า',[s.hold.phase==='none'?'ยังไม่ถึงช่วงพัก':'กำลังพัก/วัด',`ค่าที่ไม่มีไม่เท่ากับ 0`]],
      anomaly:['เปิดฉากตัวอย่างให้เห็นครบ',[demoTurbidity?'น้ำขุ่นสังเคราะห์ต่อเนื่อง':'อินพุตตามที่ผู้ชมตั้ง','ไม่ใช่น้ำหรือ sensor สด'],'ตรวจตามเกณฑ์จริง · ไม่บังคับโหมด',[`${Math.min(s.anomaly.spiralIndex,25)}/25 จุด`,s.anomaly.interruptedIndex===null?'ยังไม่มีจุดค้าง':`เก็บจุดสำรวจ ${s.anomaly.interruptedIndex+1} ไว้กลับต่อ`]],
      report:['รายงานส่งค่าพร้อมตำแหน่ง',[tx?'มีรายงานเตรียมส่ง':'รอรอบส่ง','ค่าปัจจุบันกับรายงานเป็นคนละชุด'],'แสดงผลเมื่อฝั่งรับยืนยันเท่านั้น',[rx?'ได้รับรายงานแล้ว':'ยังไม่ได้รับ','ที่เก็บในเว็บเป็นหน่วยความจำตัวอย่าง']],
      safety:['ผู้ดูแลสั่งกลับได้ · แบตต่ำมาก่อน',[s.returnCause==='route-complete'?'เก็บครบ 9 จุด':s.returnCause==='lowbattery'?'แบตเตอรี่ต่ำ':'ผู้ดูแลขอกลับ','สาเหตุต้องตรงกับเรื่องที่เล่า'],'HOME และเวลาหยุดยืนยันการจบ',[s.missionState==='COMPLETE'?'ถึง HOME และหยุด':s.missionState==='RTH'?'กำลังกลับ HOME':'รอคำสั่งกลับ',`${s.appliedPwm.left}/${s.appliedPwm.right} PWM`]]
    }[selected];
    $('fc-short-purpose').textContent=copy[0];$('fc-simple-input').textContent=copy[1][0];$('fc-simple-input-note').textContent=copy[1][1];$('fc-simple-logic').textContent=copy[2];$('fc-simple-output').textContent=copy[3][0];$('fc-simple-output-note').textContent=copy[3][1];
    const headingLab=$('fc-heading-lab');headingLab.hidden=selected!=='heading';
    scheduleSvgLabelScale();
  }
  function pauseForExplanation(){
    if(!latest.playing)return;
    internalHoldAction=true;$('am-toggle').click();internalHoldAction=false;autoHold=true;
    $('fc-stage-proof').dataset.hold='captured';clearTimeout(tourTimer);
    tourTimer=setTimeout(()=>{
      if(!autoHold||document.hidden||!movieStarted)return;
      autoHold=false;$('fc-stage-proof').dataset.hold='';
      if(mission.snapshot().missionState!=='COMPLETE'&&!mission.snapshot().playing)$('am-toggle').click();
    },1500);
    renderMinimal();
  }
  function moveChapter(index){
    if(index<0||index>=definitions.length||index<=tourIndex)return;
    tourIndex=index;selected=definitions[index].id;mission.setMode(definitions[index].mode);render();
    if(index===4&&latest.missionState==='GRID SCAN'&&latest.waypointIndex>=1&&!latest.anomaly.armed&&!latest.anomaly.used){
      const trigger=$('am-anomaly-activate');trigger.hidden=false;trigger.click();
    }
    if(index===5&&latest.missionState==='SPIRAL SCAN'&&latest.anomaly.used)installOwnedDemoInput();
    if(index===6&&latest.missionState==='GRID SCAN'&&latest.anomaly.used)releaseOwnedDemoInput();
    pauseForExplanation();
  }
  function advanceFromEvent(s){
    if(!movieStarted)return;
    if(s.missionState==='COMPLETE'){
      clearTimeout(tourTimer);autoHold=false;tourState='finished';selected='safety';tourIndex=7;releaseOwnedDemoInput();render();return;
    }
    if(!s.playing||tourState==='paused'||autoHold)return;
    if(tourIndex===0&&s.acceptedRoute.length>0&&s.routeSealed&&s.incoming.received.some(item=>item.kind==='route-upload')&&s.incoming.applied.some(item=>item.kind==='route-upload'))moveChapter(1);
    else if(tourIndex===1&&s.missionState==='GRID SCAN'&&s.stationStage==='moving'&&s.incoming.applied.some(item=>item.kind==='start'))moveChapter(2);
    else if(tourIndex===2&&s.missionState==='GRID SCAN'&&s.waypointIndex>=1)moveChapter(3);
    else if(tourIndex===3&&s.missionState==='GRID SCAN'&&s.hold.phase!=='none')moveChapter(4);
    else if(tourIndex===4&&s.missionState==='SPIRAL SCAN'&&s.anomaly.used)moveChapter(5);
    else if(tourIndex===5&&s.missionState==='GRID SCAN'&&s.anomaly.used&&s.waypointIndex===s.anomaly.interruptedIndex)moveChapter(6);
    else if(tourIndex===6&&s.missionState==='RTH')moveChapter(7);
    else if(tourIndex===7&&s.missionState==='RTH'&&s.rth.arrivalMs>=3000&&s.driveDecision?.stopReason==='RTH_PARK'){
      $('fc-stage-proof').textContent=`RTH arrival dwell ${s.rth.arrivalMs} ms · applied ${pair(s.appliedPwm)} · รอ state transition จริง`;
    }
  }
  function installOwnedDemoInput(){
    const input=main.querySelector('[data-policy-input="turbidityV"]');
    if(!input||input.value.trim()!=='')return false;
    const owner={input,value:'1.2',previousValue:input.value};demoTurbidity=owner;
    input.dataset.presentationOwned='true';input.value=owner.value;
    input.addEventListener('input',()=>{if(demoTurbidity===owner&&input.value!==owner.value){delete input.dataset.presentationOwned;demoTurbidity=null;}},{once:true});
    input.dispatchEvent(new Event('change',{bubbles:true}));
    return true;
  }
  function releaseOwnedDemoInput(){
    const owner=demoTurbidity;demoTurbidity=null;if(!owner)return;
    const {input,value,previousValue}=owner;
    if(input.dataset.presentationOwned!=='true')return;
    delete input.dataset.presentationOwned;
    if(input.value!==value)return;
    input.value=previousValue;input.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function beginTour(){
    if(movieStarted)return;
    movieStarted=true;tourIndex=0;selected='setup';tourState='playing';autoHold=false;
    $('fc-read-more').open=false;$('fc-technical').open=false;$('fc-report-inventory').open=false;
    mission.dispatch({type:'speed',value:4});mission.setMode('ROUTE');render();
  }
  function onPlayerToggle(){
    if(autoHold&&!internalHoldAction){clearTimeout(tourTimer);tourTimer=null;autoHold=false;$('fc-stage-proof').dataset.hold='';}
    if(movieStarted){const s=mission.snapshot();tourState=s.missionState==='COMPLETE'?'finished':s.playing?'playing':'paused';}
    renderMinimal();
  }
  let lastAcceptedGridEvent=null;
  function renderNavVisual(s){
    const event=s.latestEvent,rows=event?.rows||[],reach=rows.find(row=>row.key==='grid-los-reach');
    const control=rows.find(row=>row.key==='grid-control'),drive=rows.find(row=>row.key==='grid-drive');
    const geometry=reach?.inputs,look=reach?.output?.lookahead,index=geometry?.index;
    const start=Number.isInteger(index)?(index===0?s.missionOrigin:s.acceptedRoute[index-1]):null;
    const end=Number.isInteger(index)?s.acceptedRoute[index]:null;
    const ready=s.missionState==='GRID SCAN'&&reach?.predicate?.result!==undefined&&start&&end&&geometry?.position&&look&&
      [geometry.alongTrackM,geometry.crossTrackM].every(Number.isFinite);
    $('fc-nav-visual').dataset.eventId=event?.id??'';
    $('fc-nav-visual').dataset.waypointIndex=ready?String(index):'';
    $('fc-nav-visual').dataset.acceptedEventId=lastAcceptedGridEvent?.eventId??'';
    $('fc-nav-event').textContent=ready?'ตำแหน่งเรือ แนวเส้น และจุดเล็งจากการคำนวณรอบเดียวกัน':'รอรอบนำทางที่มีตำแหน่งและจุดเล็งใช้ได้';
    $('fc-nav-outcome').textContent='รอผลตรวจ WP';
    $('fc-nav-cross-label').textContent='cross-track: —';
    const geometryIds=['fc-nav-segment-line','fc-nav-acceptance','fc-nav-cross','fc-nav-projection','fc-nav-pose','fc-nav-los','fc-nav-end','fc-nav-a-label','fc-nav-b-label'];
    for(const id of geometryIds)$(id).setAttribute('visibility',ready?'visible':'hidden');
    if(ready){
      const dx=end.x-start.x,dy=end.y-start.y,lengthUnits=Math.hypot(dx,dy);
      const los=event.output?.los,scaleM=kernel.MAP_SCALE_M_PER_UNIT;
      const lengthM=Number.isFinite(los?.segmentLengthM)?los.segmentLengthM:lengthUnits*scaleM;
      const along=geometry.alongTrackM,cross=geometry.crossTrackM;
      const aimAlong=lengthUnits>0?(((look.x-start.x)*dx+(look.y-start.y)*dy)/(lengthUnits*lengthUnits))*lengthM:0;
      const minAlong=Math.min(0,lengthM,along,aimAlong),maxAlong=Math.max(lengthM,along,aimAlong);
      const pxPerM=Math.min(6,252/Math.max(maxAlong-minAlong,.1),36/Math.max(Math.abs(cross),window.GridGuidance.C.waypointRadiusM));
      const xFor=value=>34+(value-minAlong)*pxPerM,centerY=48,xA=xFor(0),xB=xFor(lengthM),xP=xFor(along),yP=centerY-cross*pxPerM,xAim=xFor(aimAlong);
      const setLine=(id,x1,y1,x2,y2)=>{const node=$(id);node.setAttribute('x1',x1.toFixed(2));node.setAttribute('y1',y1.toFixed(2));node.setAttribute('x2',x2.toFixed(2));node.setAttribute('y2',y2.toFixed(2));};
      const setCircle=(id,cx,cy,r)=>{const node=$(id);node.setAttribute('cx',cx.toFixed(2));node.setAttribute('cy',cy.toFixed(2));if(r!==undefined)node.setAttribute('r',r.toFixed(2));};
      setLine('fc-nav-segment-line',xA,centerY,xB,centerY);
      setCircle('fc-nav-acceptance',xB,centerY,window.GridGuidance.C.waypointRadiusM*pxPerM);
      setLine('fc-nav-cross',xP,yP,xP,centerY);
      setCircle('fc-nav-projection',xP,centerY,3);setCircle('fc-nav-pose',xP,yP,4);setCircle('fc-nav-end',xB,centerY,3);
      $('fc-nav-los').setAttribute('d',`M${xAim.toFixed(2)} ${(centerY-6).toFixed(2)}L${(xAim+6).toFixed(2)} ${centerY}L${xAim.toFixed(2)} ${(centerY+6).toFixed(2)}L${(xAim-6).toFixed(2)} ${centerY}Z`);
      $('fc-nav-a-label').setAttribute('x',xA.toFixed(2));$('fc-nav-b-label').setAttribute('x',xB.toFixed(2));
      $('fc-nav-a-label').textContent=`A · ${index===0?'เริ่ม':`WP${index}`}`;
      $('fc-nav-b-label').textContent=`B · WP${index+1}`;
      $('fc-nav-cross-label').textContent=`P ฉายบนแนว · cross-track ${cross>=0?'+':''}${fmt(cross,1)} m · LOS aim อยู่บน A→B`;
      const nextIndex=event.output?.waypointIndex;
      const accepted=reach.predicate.result===true&&Number.isInteger(nextIndex)&&nextIndex>index;
      $('fc-nav-outcome').textContent=accepted?`ผ่านจุดสำรวจ ${index+1} · รอบตรวจเดิม → เริ่มติดตามจุด ${nextIndex+1}`:reach.predicate.result===true?`เงื่อนไขผ่าน · รอผลยืนยันการเปลี่ยนจุด ${index+1}`:`ยังตามจุดสำรวจ ${index+1} · ระยะ/ความคืบหน้ายังไม่ครบ`;
    }
    const targetDeg=control?.inputs?.targetDeg,measuredDeg=control?.inputs?.headingDeg,applied=drive?.output?.appliedPwm;
    const hasHeading=Number.isFinite(targetDeg)&&Number.isFinite(measuredDeg);
    for(const id of ['fc-nav-heading-target','fc-nav-heading-measured'])$(id).setAttribute('visibility',hasHeading?'visible':'hidden');
    if(hasHeading){
      const pointAt=deg=>({x:48+Math.sin(deg*Math.PI/180)*28,y:48-Math.cos(deg*Math.PI/180)*28});
      const target=pointAt(targetDeg),measured=pointAt(measuredDeg);
      setNavDialLine('fc-nav-heading-target',target);setNavDialLine('fc-nav-heading-measured',measured);
      $('fc-nav-heading-values').textContent=`เป้า ${fmt(targetDeg,0)}° · Compass ${fmt(measuredDeg,0)}°`;
    }else $('fc-nav-heading-values').textContent='รอ GRID control ใน event';
    setNavMotor('left',applied?.left);setNavMotor('right',applied?.right);
    if(lastAcceptedGridEvent){
      const accepted=lastAcceptedGridEvent;
      if(!ready||accepted.eventId!==event?.id)$('fc-nav-outcome').textContent=`ผ่านจุดสำรวจ ${accepted.index+1} ในรอบก่อน · ต่อไปติดตามจุด ${accepted.nextIndex+1}`;
    }
  }
  function setNavDialLine(id,point){const node=$(id);node.setAttribute('x1','48');node.setAttribute('y1','48');node.setAttribute('x2',point.x.toFixed(2));node.setAttribute('y2',point.y.toFixed(2));}
  function setNavMotor(side,value){
    const finite=Number.isFinite(value),fill=$(`fc-nav-${side}-fill`),output=$(`fc-nav-${side}-value`);
    fill.style.left=`${finite&&value<0?50-Math.min(50,Math.abs(value)/window.GridGuidance.C.pwmLimit*50):50}%`;
    fill.style.width=`${finite?Math.min(50,Math.abs(value)/window.GridGuidance.C.pwmLimit*50):0}%`;
    fill.dataset.sign=finite&&value<0?'negative':'positive';output.textContent=finite?`${value>0?'+':''}${fmt(value,0)}`:'—';
  }
  function onReset(){releaseOwnedDemoInput();clearTimeout(tourTimer);tourTimer=null;autoHold=false;movieStarted=false;tourState='idle';tourIndex=0;selected='setup';lastAcceptedGridEvent=null;renderMinimal();}
  installMinimal();
  mission.subscribe(s=>{
    if(generation!==null&&generation!==s.incoming.generation){
      lastAcceptedGridEvent=null;
      onReset();
    }
    const acceptedEvent=s.latestEvent,reach=acceptedEvent?.rows?.find(row=>row.key==='grid-los-reach');
    if(reach?.predicate?.result===true&&Number.isInteger(reach.inputs?.index)&&Number.isInteger(acceptedEvent.output?.waypointIndex)&&acceptedEvent.output.waypointIndex>reach.inputs.index){
      lastAcceptedGridEvent={eventId:acceptedEvent.id,atMs:acceptedEvent.atMs,index:reach.inputs.index,nextIndex:acceptedEvent.output.waypointIndex};
    }
    generation=s.incoming.generation;latest=s;render();refresh();advanceFromEvent(s);
  });
  const transportObserver=new MutationObserver(()=>{if(selected==='report'){latest=mission.snapshot();render();}});
  for(const id of ['am-shore-value','am-packet-identity'])transportObserver.observe($(id),{childList:true,subtree:true,characterData:true});
  // Existing report callbacks can commit while mission time is paused. Reuse their DOM updates.
  const aliases={learn:'setup',overview:'segment',pid:'heading','mission-start':'setup','ms-uplink-panel':'report',operate:'setup',system:'setup'};
  function routeHash(){const id=aliases[location.hash.slice(1)];if(id){select(id);history.replaceState(null,'','#function-center');shell.scrollIntoView({block:'start'});}}
  document.addEventListener('visibilitychange',()=>{
    if(!document.hidden)return;
    clearTimeout(tourTimer);tourTimer=null;autoHold=false;
    if(movieStarted){if(mission.snapshot().playing)$('am-toggle').click();tourState='paused';renderMinimal();}
  });
  $('am-reset').addEventListener('click',onReset);
  window.addEventListener('hashchange',routeHash);routeHash();render();refresh();
})();
