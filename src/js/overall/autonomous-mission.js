(() => {
  'use strict';
  const M = window.AutonomousMissionModel;
  const P = window.MissionPresentation;
  const root = document.querySelector('[data-autonomous-mission]');
  if (!M || !root) return;
  const byId = id => document.getElementById(id);
  // Teaching holds share the mission clock; these are not firmware/radio delays.
  const PRESENTATION_PACING_MS=1400;
  let state = M.createMission({presentationPacingMs:PRESENTATION_PACING_MS});
  let mode = 'ROUTE';
  let routeStep = 1;
  let speed = 2;
  let frameId = null;
  let previousFrameMs = null;
  let accumulatorMs = 0;
  let disturbanceDirection = 1;
  let latestEvent = null;
  let spiralCause = null;
  const snapshotListeners = new Set();
  let lastPublishedSnapshotKey = '';
  let resetInProgress = false;
  const transport=window.createMissionTransport(renderTransport);
  const incoming=window.createMissionIncoming(()=>render());
  let acceptedMarkerRoute='';
  function renderTransport(t) {
    const view=P.buildDataView(M.snapshot(state),t,window.UplinkCodec);
    byId('am-source-value').textContent=view.currentReadings;
    byId('am-packet-identity').textContent=view.outgoingStatus;
    byId('am-packet-dot').hidden=!t.active;
    byId('am-packet-dot').dataset.phase=t.phase;
    byId('am-shore-value').textContent=view.receivedStatus;
    const h=(t.latestTx?.hex||'').split(' ');
    byId('am-byte-detail').textContent=`38B little-endian · turbidity bytes24..27: ${h.slice(24,28).join(' ')||'—'} · TX: ${t.latestTx?.hex||'—'} · RX: ${t.rx?.hex||'—'}`;
    byId('am-wire-events').textContent=t.events.slice(-8).map(e=>`${e.type} SEQ${e.seq} ADS-${e.sampleId} snapshot-${e.snapshotId} ${e.attempt?'attempt'+e.attempt:''}`).join('\n');
    if(mode==='DATA') {
      renderDataDetails(view);
      renderExplanation(M.snapshot(state),t);
    }
  }
  function postStoryRoute(points=state.stationPlan,options={}) {
    const envelope=incoming.sendRoute(points,options);
    state=M.markRoutePosted(state,envelope);
    return envelope;
  }
  function syncStationMessages() {
    if(state.clockMs-state.stationStageAtMs<state.presentationPacingMs)return;
    if(state.stationStage==='preparing-route') postStoryRoute();
    else if(state.stationStage==='route-accepted'&&!state.startMessageId) {
      const envelope=incoming.sendStart(state.routeId);
      state=M.markStartPosted(state,envelope);
    }
  }
  function applyReceivedTick() {
    const receipt=state.clockMs-state.stationStageAtMs>=state.presentationPacingMs||incoming.snapshot().inbox[0]?.kind==='command'?incoming.takeNext():null;
    const result=M.stepOnce(state,receipt);
    state=result.state;
    if(receipt) incoming.markApplied(receipt,{stage:state.stationStage,routeId:state.routeId,acceptedRoute:state.acceptedRoute,pendingStart:state.pendingStart});
    syncStationMessages();
    return result;
  }
  function renderDataDetails(view) {
    byId('am-data-current').textContent=view.currentReadings;
    byId('am-data-received-status').textContent=view.receivedStatus;
    byId('am-outgoing-identity').textContent=view.outgoingSequence===null?'ยังไม่มีชุดข้อมูล':`ชุดที่ ${view.outgoingSequence}`;
    byId('am-received-identity').textContent=view.receivedSequence===null?'ยังไม่ได้รับ':`ชุดที่ ${view.receivedSequence}`;
    byId('am-battery-note').textContent=view.batteryNote;
    byId('am-data-notes').textContent=`${view.sourceNote} · ${view.timingNote} · ${view.roundingNote}`;
    const values=new Map(view.fields.map(field=>[field.id,field]));
    byId('am-data-table')?.querySelectorAll('[data-report-field]').forEach(row=>{
      const field=values.get(row.dataset.reportField);
      if(!field)return;
      row.querySelector('[data-report-value="outgoing"]').textContent=field.outgoingValue;
      row.querySelector('[data-report-value="outgoing"]').dataset.label='รายงานที่กำลังเตรียมหรือส่ง';
      row.querySelector('[data-report-value="received"]').textContent=field.receivedValue;
      row.querySelector('[data-report-value="received"]').dataset.label='รายงานล่าสุดที่ฝั่งได้รับ';
    });
  }
  const modeCopy = {
    ROUTE:'ขอบเขต → สุ่มตัวอย่าง 3 × 3 → เรียงลำดับ WP1–WP9; เป็นแผนผังสาธิต ไม่ใช่อัลกอริทึม firmware',
    NAVIGATION:'',
    CONTROL:'',
    ANOMALY:''
  };
  const tabs = [...root.querySelectorAll('[role="tab"][data-mode]')];
  const routeSteps = [...root.querySelectorAll('[data-route-step]')];
  const clampPoint = point => ({x:point.x,y:point.y});
  const fmt = (value,digits=1) => Number.isFinite(value) ? value.toFixed(digits) : '—';
  const signed = (value,digits=1) => `${value>=0?'+':''}${fmt(value,digits)}°`;
  const pointText = point => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  const pathFrom = points => points.length ? `M${pointText(points[0])}${points.slice(1).map(point=>`L${pointText(point)}`).join('')}` : '';
  function rememberSpiralCause(rows,atMs) {
    if(spiralCause) return;
    const trigger=rows.find(r=>r.key==='anomaly-eligibility'&&r.predicate.result===true);
    if(trigger) spiralCause=Object.freeze({atMs,mean:trigger.inputs.mean,window:Object.freeze([...trigger.inputs.window]),passedFirst:trigger.inputs.passedFirst});
  }
  function stationExplanation(v) {
    const transfer=incoming.snapshot();
    const arrived=transfer.received.some(item=>item.messageId===v.routeMessageId);
    const n=v.acceptedRoute.length;
    const copy={
      'preparing-route':['สถานีกำลังเตรียมแผนจุดสำรวจตัวอย่าง 9 จุด · ไม่ใช่ตัวสร้างเส้นทางจริง','เรือยังไม่มีเส้นทาง · เป้าหมายภายในฉากคงที่ตำแหน่งปัจจุบัน','ยังไม่เริ่มนำทาง เพราะจุดสำรวจยังอยู่ที่สถานี','กำลังส่งแผนผ่านช่องทางจำลอง'],
      'route-posted':[`สถานีส่งจุดสำรวจ ${v.stationPlan.length} จุด · แผนตัวอย่างนี้ไม่ใช่ข้อมูลพิกัดจริง`,arrived?'ข้อมูลถึงเรือแล้ว · รอจังหวะจำลองเพื่อตรวจ':'รอเรือรับข้อมูลผ่านช่องทางจำลอง',arrived?'ยังไม่ติดตั้งเส้นทางจนกว่าจะตรวจ':'ไม่มีเส้นทางที่เรือยอมรับ · มอเตอร์หยุด',arrived?'รอให้การเล่นต่อหรือกด NEXT STEP':'รอข้อมูลถึงเรือ · การส่งอย่างเดียวไม่ทำให้เรือเคลื่อน'],
      'route-accepted':['เรือรับจุดสำรวจและเก็บตามลำดับแล้ว','ตรวจจำนวนจุดและพิกัด x/y ที่ใช้ได้ · ชุดสั้นปิดแผนให้อัตโนมัติ','เส้นทางที่รับยังไม่เริ่มเคลื่อน','รอคำสั่งเริ่มจากสถานีซึ่งส่งแยกต่างหาก'],
      'start-posted':['สถานีส่งคำสั่งเริ่มแยกจากเส้นทาง',`เรือเก็บจุดสำรวจ ${n} จุดแล้ว · รอรับคำสั่งเริ่ม`,'ยังไม่ขยับก่อนรับคำสั่งและตรวจความพร้อม','รอการรับคำสั่งผ่านช่องทางจำลอง'],
      'start-received':['เรือรับคำสั่งเริ่มแล้ว','คำสั่งยังไม่ใช่การสั่งมอเตอร์โดยตรง','กำลังตรวจเส้นทาง GPS และเข็มทิศ','รอจังหวะจำลองถัดไป'],
      'checking-readiness':['คำสั่งเริ่มและเส้นทางที่เรือเก็บไว้','ตรวจเส้นทางที่พร้อม GPS เข็มทิศ และเงื่อนไขขับเคลื่อน · ไม่ต้องตั้ง HOME เพื่อเริ่ม','เรือยังหยุดระหว่างตรวจ','รอผลตรวจในจังหวะจำลอง'],
      'waiting-readiness':['เรือมีคำสั่งเริ่มที่รอตรวจ',`ตรวจความพร้อมตามค่าทดลอง · ${v.stationReason}`,'ยังไม่ขยับจนกว่าเงื่อนไขจำเป็นจะพร้อม','คำสั่งเดิมรอได้เมื่อ GPS/เข็มทิศหรือเส้นทางพร้อม'],
      'route-rejected':['เรือได้รับข้อมูลแต่ไม่เก็บเส้นทางไว้','รูปแบบ จำนวนจุด หรือพิกัดไม่รองรับในบทเรียนนี้','ไม่มีเส้นทางที่ติดตั้งและเรือไม่เคลื่อน',v.stationReason],
      'start-refused':['เรือได้รับคำสั่งเริ่มแล้ว','เงื่อนไขความปลอดภัยไม่พร้อมขณะรับคำสั่ง','ปฏิเสธคำสั่งนี้ · ไม่เริ่มเองเมื่อเงื่อนไขเปลี่ยน',v.stationReason]
    };
    return copy[v.stationStage]||['แผนตัวอย่างจากสถานี',n?`เรือเก็บเส้นทาง ${n} จุดแล้ว`:'รอการรับข้อมูลจากเรือ',v.stationReason,'การเคลื่อนที่จะเริ่มหลังรับคำสั่งและตรวจความพร้อม'];
  }
  function renderExplanation(v,t) {
    const spiral=v.missionState==='SPIRAL SCAN',returned=v.anomaly.used&&v.missionState==='GRID SCAN';
    const target=v.missionState==='READY'&&!v.acceptedRoute.length?'รอรับเส้นทาง':v.missionState==='RTH'?'HOME':v.missionState==='COMPLETE'?'จุดจบภารกิจ':spiral?`จุดก้นหอย ${v.anomaly.spiralIndex+1}/25`:`WP${v.waypointIndex+1}`;
    const routeSummary=v.acceptedRoute.length?`เส้นทางที่เรือรับ: ${v.acceptedRoute.length} จุด · HOME แยกจาก waypoint`:`แผนตัวอย่าง ${v.stationPlan.length} จุด · ยังไม่ใช่เส้นทางที่เรือรับ · HOME แยกจาก waypoint`;
    const phase=({READY:'พร้อมเริ่ม', 'GRID SCAN':'เดินตามเส้นตาราง', 'SPIRAL SCAN':'สแกนก้นหอย',RTH:'กลับ HOME',COMPLETE:'ภารกิจจบ'})[v.missionState]||v.missionState;
    byId('am-current-reason').textContent=v.stationStoryActive&&v.missionState==='READY'?v.stationReason:`${phase}${!v.playing&&!['READY','COMPLETE'].includes(v.missionState)?' · พักการจำลอง':''}`;
    let title,values;
    const scan=v.anomaly,planner=scan.planner||{},generated=Array.isArray(scan.spiralTargets)?scan.spiralTargets.length:0;
    const scanInitialized=planner.initialized===true;
    const scanCompleted=scanInitialized&&planner.done===true&&scan.spiralIndex>=25;
    if(mode==='ROUTE'&&v.stationStoryActive&&v.missionState==='READY') {
      title='จากแผนที่สถานี ถึงการตัดสินใจของเรือ';
      values=stationExplanation(v);
    } else if(mode==='ANOMALY') {
      title='น้ำขุ่นนำไปสู่การสแกนก้นหอยอย่างไร';
      let decision,effect;
      if(spiral) {decision='พักเส้นตาราง แล้วสแกนก้นหอยรอบจุดที่ตรวจพบ';effect=`ผ่านแล้ว ${v.anomaly.spiralIndex}/25 จุด · กำลังมุ่ง ${target} · จบแล้วต่อ WP${v.anomaly.interruptedIndex+1}`;}
      else if(returned) {decision='ออกจากสแกนก้นหอยแล้ว กลับไปทำภารกิจเดิม';effect=`ผ่าน ${v.anomaly.spiralIndex}/25 จุด · จบได้จากครบจุด/น้ำสะอาดต่อเนื่อง8s/เวลารวม240s · ${phase} · เป้าหมาย ${target}`;}
      else if(v.missionState==='COMPLETE'||v.missionState==='RTH') {
        if(!scan.used) {
          decision='รอบนี้ยังไม่ได้เกิดการสแกนก้นหอย';
          effect=v.missionState==='RTH'?'กำลังกลับ HOME · ไม่มีประวัติ SPIRAL ในภารกิจนี้':'ภารกิจจบแล้ว · ไม่มีประวัติ SPIRAL ในภารกิจนี้';
        } else if(!scanInitialized) {
          decision='เคยเข้าโหมด SPIRAL แต่ planner ยังไม่เริ่ม · ยังไม่มีจุดสแกนที่สร้าง';
          effect=`${phase} · เป้าหมาย ${target} · ไม่ถือว่าเกิดการสแกนครบ`;
        } else if(scanCompleted) {
          decision='สร้างและผ่านจุดสแกนก้นหอยครบ 25 จุดแล้ว';
          effect=`${phase} · ${v.missionState==='RTH'?'กำลังกลับ HOME':'ภารกิจจบแล้ว'} · ประวัติ SPIRAL ยังอยู่`;
        } else {
          decision=`ออกจากสแกนก้นหอยก่อนครบ 25 จุด · ผ่าน ${Math.min(scan.spiralIndex,25)}/25 · สร้างเป้าหมาย ${generated}/25`;
          effect=`${phase} · ${v.missionState==='RTH'?'กำลังกลับ HOME':'ภารกิจจบแล้ว'} · เป้าหมาย ${target} · เป็นประวัติสแกนที่ยังไม่ครบ`;
        }
      }
      else if(v.hold.phase!=='none') {decision='หยุดเก็บตัวอย่างน้ำ · detector ยังทำงานและอาจเปลี่ยนไป SPIRAL ตาม FSM';effect=`applied PWM ${v.appliedPwm.left}/${v.appliedPwm.right} · ${v.hold.phase==='settle'?'รอน้ำนิ่ง 3 วินาที':'ช่วงวัดนิ่ง 5 วินาที'}`;}
      else if(!v.anomaly.armed) {decision='ยังไม่ได้เปิดพื้นที่น้ำขุ่นจำลอง';effect='กด “เริ่มใหม่ · ซิมก้นหอย” · เรือจะไป WP1 ก่อน ไม่ข้ามเงื่อนไขตรวจน้ำ';}
      else if(v.waypointIndex<1) {decision='ยังไม่เข้าสแกน · รอผ่าน WP1 ก่อน';effect='กำลังเดินทางไป WP1 · พื้นที่แดงจะป้อนน้ำขุ่นเข้าเซ็นเซอร์จำลอง';}
      else if(v.anomaly.window.length<8) {decision='รอค่าที่ใช้ได้ให้ครบ 8 ตัวอย่าง';effect=`มี ${v.anomaly.window.length}/8 ตัวอย่าง · ยังตาม ${target}`;}
      else if(!v.anomaly.monitor.trigger) {decision='ยังไม่เกิด pending trigger · ตามเส้นตารางต่อ';effect=`absolute mean>50 หรือ mean>10 และ Δbaseline>10 ต่อเนื่อง4s · cooldown ${v.anomaly.monitor.cooldownActive?'ทำงาน':'ไม่ทำงาน'}`;}
      else {decision='ค่าปัจจุบันผ่านเกณฑ์ · รอการตรวจรอบถัดไป';effect=`ตอนนี้ยังตาม ${target} · ไม่สลับโหมดล่วงหน้าแทนตัวตรวจจับ`;}
      const gpsReady=v.gpsReady??v.inputs.gps!==false;
      const activeNavigation=['GRID SCAN','SPIRAL SCAN','RTH'].includes(v.missionState);
      const finalStop=v.driveDecision?.stopReason;
      const motorsStopped=v.appliedPwm?.left===0&&v.appliedPwm?.right===0;
      const navigationUnavailable=activeNavigation&&finalStop==='NAVIGATION_UNAVAILABLE'&&motorsStopped&&(!gpsReady||!v.compassAvailable);
      const hardSafetyStop=finalStop==='HARD_STOP'&&motorsStopped;
      const gridRouteUnavailable=v.missionState==='GRID SCAN'&&v.inputs.route===false&&finalStop==='INVALID_REQUEST'&&motorsStopped;
      if(hardSafetyStop) {
        decision='ระบบความปลอดภัยสั่งหยุดฉุกเฉิน · ภารกิจหยุดแล้ว';
        effect=`มอเตอร์หยุด · PWM ที่จ่ายซ้าย/ขวา ${v.appliedPwm.left}/${v.appliedPwm.right} · ตรวจและแก้เหตุด้านความปลอดภัยก่อนเริ่มภารกิจใหม่`;
      } else if(navigationUnavailable) {
        const missing=[];
        if(!gpsReady)missing.push('GPS fix ใช้ไม่ได้');
        if(!v.compassAvailable) {
          const compass=v.compassPolicy||{};
          missing.push(!compass.addressPresent?'ไม่พบอุปกรณ์เข็มทิศ':!compass.fresh?'เข็มทิศอ่านค่าไม่สำเร็จ/ไม่มีตัวอย่างใหม่':'อ่านเข็มทิศแล้วแต่ raw sample แปลงเป็นทิศที่ใช้ไม่ได้');
        }
        decision=`${missing.join(' และ ')} · การนำทางหยุด · ภารกิจยังอยู่ในโหมด ${phase}`;
        effect=`มอเตอร์หยุด · PWM ที่จ่ายซ้าย/ขวา ${v.appliedPwm.left}/${v.appliedPwm.right} · คงเป้าหมาย ${target}`;
      } else if(gridRouteUnavailable) {
        decision='เส้นทางไม่พร้อม · การเดินทางตามตารางหยุด';
        effect=`มอเตอร์หยุด · PWM ที่จ่ายซ้าย/ขวา ${v.appliedPwm.left}/${v.appliedPwm.right} · ตรวจเส้นทางก่อนเดินทางต่อ`;
      }
      const check=spiralCause?`ตอนตรวจพบ ${(spiralCause.atMs/1000).toFixed(2)} วินาที: SMA8 = ${fmt(spiralCause.mean)} NTU · absolute หรือ baseline dwell ผ่าน · ผ่าน WP1 แล้ว`:`SMA ${v.anomaly.window.length}/8 = ${fmt(v.anomaly.mean)} NTU · baseline ${fmt(v.anomaly.monitor.baseline)} · ROC ${fmt(v.anomaly.monitor.roc)} NTU/min เป็น diagnostic · ผ่าน WP1 จึงเข้า SPIRAL${!v.inputs.sensorValid?' · input invalid; stale reset evidence แต่รักษา issued trigger':''}`;
      values=[`ความขุ่นตอนนี้ ${fmt(v.anomaly.turbidityNtu)} NTU · อุณหภูมิ ${fmt(v.water.temp)} °C · pH ${Number.isFinite(v.water.ph)?fmt(v.water.ph,2):'ยังไม่เผยแพร่ (ต้องวัดนิ่ง)'}`,check,decision,effect];
      const stage=spiral?'spiral':returned?'return':v.waypointIndex>=1?'detect':'route';
      root.querySelectorAll('[data-spiral-stage]').forEach(e=>{if(e.dataset.spiralStage===stage)e.setAttribute('aria-current','step');else e.removeAttribute('aria-current');});
    } else if(mode==='DATA') {
      title='รายงานเรือจำลองมีอะไรบ้าง และฝั่งได้รับข้อมูลชุดใดแล้ว';
      const view=P.buildDataView(v,t,window.UplinkCodec);
      values=[view.currentReadings,
        'รายงานนี้มี 9 รายการ · ค่าที่กำลังส่งอ่านจากชุดข้อมูลที่เตรียมไว้ ไม่ดึงค่าปัจจุบันมาแทน · พิกัดและทิศจะแสดงเมื่อข้อมูลใช้ได้',
        view.outgoingStatus,
        view.receivedStatus];
    } else if(mode==='CONTROL') {
      title='ความคลาดทิศนำไปสู่คำสั่งมอเตอร์อย่างไร';
      const row=v.rows.find(r=>r.key==='grid-control'||r.key==='spiral-rth-control');
      const grid=v.missionState==='GRID SCAN';
      values=[`${row?'มุมที่ใช้คำนวณล่าสุด':'ยังไม่คำนวณคำสั่ง · มุมปัจจุบัน'} ${signed(row?.inputs.headingError??v.headingError)} · Compass ${v.compassAvailable?`${fmt(v.acquiredHeading)}°`:'unavailable'} · ${grid&&v.los?.valid?`LOS ${fmt(v.los.bearingDeg)}°`:target}`,
        grid?`อ่านช่วง waypoint ที่เรือรับไว้ · มองหน้า 6 m ตามแนวช่วง · rate จาก heading ที่วัดและกรอง · ลบ dead zone ก่อนจัดสรร yaw/surge`:'SPIRAL ใช้ segment LOS3m; RTH bearingตรง HOME · HeadingController/PidController P2.5/I0.05/D0.8 · D filter0.3 · pivotเข้า30°/ออก20°',
        `ขอ L/R ${v.requestedPwm.left}/${v.requestedPwm.right} signed PWM · hold/fault/park/source change ตรวจที่ final Drive เดียว`,
        `ผ่าน DriveController: L/R ${v.appliedPwm.left}/${v.appliedPwm.right} PWM · หาร178 ที่ขอบ plant เท่านั้น · ไม่ใช่แรงขับจริง`];
    } else if(mode==='NAVIGATION') {
      title='ตำแหน่งและทิศของเรือ บอกทางไปเป้าหมายอย่างไร';
      values=[`Compass ${v.compassAvailable?`${fmt(v.acquiredHeading)}°`:'unavailable'} · waypoint ${target} · ${v.missionState==='GRID SCAN'?'จุดเล็ง LOS':'เป้าหมายโหมดนี้'} ${fmt(v.targetHeading)}°`,
        v.missionState==='GRID SCAN'?`ใช้ accepted route · มองหน้า 6 m บน segment ปัจจุบัน · cross-track ${fmt(v.los?.crossTrackM)} m · LOS เป็นระนาบ schematic ที่ 0.15 m/หน่วย`:`bearing ไปเป้าหมาย ${fmt(v.targetHeading)}° · error สั้น ${signed(v.headingError)} · เหนือ 0° ตามเข็ม`,
        v.missionState==='COMPLETE'?'จบภารกิจแล้ว ไม่เลือกจุดเดินทางใหม่':v.missionState==='RTH'?'กลับ HOME · เข้าเขต 4 เมตรแล้วหยุดรอ 3 วินาทีต่อเนื่อง · ต้องผ่านเงื่อนไขออกจากบ้านและข้อมูลยังใช้ได้':v.missionState==='GRID SCAN'?'เลื่อน WP เมื่อเข้า radius 3 m พร้อม along-track progress หรือผ่านระยะ 0.5 m และอยู่ใกล้แนวช่วง':'SPIRAL ใช้ segment LOS มองหน้า3m · radius2m + along0.5m หรือผ่านปลายช่วง / timeout45s',
        v.missionState==='GRID SCAN'?`จุดเล็งห่าง ${fmt(v.guidanceDistanceM)} m · waypoint ห่าง ${fmt(v.targetDistanceM)} m · ส่ง bearing LOS ให้ GRID controller`:`ระยะถึง ${target} ตอนนี้ ${fmt(v.targetDistanceM)} m · ส่งความคลาดทิศให้ controller โหมดนี้`];
    } else {
      title='เรือกำลังทำขั้นตอนไหนของภารกิจ';
      values=[routeSummary,
        'ตรวจความพร้อม GPS เข็มทิศ เส้นทาง และเงื่อนไขขับเคลื่อนก่อนเริ่ม',
        `${phase}${spiral?' · พักเส้นตารางเพื่อสำรวจรอบน้ำขุ่น':''}`,
        v.missionState==='READY'?'กด SIM เพื่อวิ่งปกติ หรือ “เริ่มใหม่ · ซิมก้นหอย” เพื่อดูสถานการณ์น้ำขุ่น':`เป้าหมาย ${target} · ระยะเหลือ ${fmt(v.targetDistanceM)} เมตร`];
    }
    byId('am-explain-title').textContent=title;
    ['input','check','decision','effect'].forEach((key,i)=>byId('am-explain-'+key).textContent=values[i]);
  }
  function renderTrace(event) {
    latestEvent=event;
    if(event) rememberSpiralCause(event.rows,event.atMs);
    byId('am-trace-time').textContent=event?`EV-${event.id} · ${(event.atMs/1000).toFixed(2)} s`: 'ยังไม่มี event';
    byId('am-trace-inputs').textContent=event?`${event.inputs.missionState} · pose ${pointText(event.inputs.position)} · heading ${fmt(event.inputs.heading)}° · target ${pointText(event.inputs.target)} · e ${signed(event.inputs.headingError)}`:'—';
    byId('am-trace-predicate').textContent=event?`${event.predicate.name} → ${event.predicate.result}`:'—';
    byId('am-trace-decision').textContent=event?event.decision:'—';
    byId('am-trace-output').textContent=event?`pose ${pointText(event.output.position)} · heading ${fmt(event.output.heading)}° · demo request L/R ${event.output.request.left}/${event.output.request.right} · WP${event.output.waypointIndex+1}`:'—';
    byId('am-trace-source').textContent=event?`${event.source.path} · ${event.source.function} · L${event.source.lines[0]}–${event.source.lines[1]} · ${event.source.status} · SHA256 ${event.source.sha256} · ${event.source.browserHelper} · ${event.source.boundary}`:'—';
    const rows=byId('am-trace-rows');rows.replaceChildren();
    for(const r of event?.rows||[]){const item=document.createElement('p');item.textContent=`${r.key}: ${r.predicate.name} => ${JSON.stringify(r.predicate.result)} | ${r.decision} | inputs ${JSON.stringify(r.inputs)} | output ${JSON.stringify(r.output)} | ${r.source.function} ${r.source.path}:L${r.source.lines.join('–')} SHA256 ${r.source.sha256} | ${r.source.status}: ${r.source.boundary} | ${r.source.browserHelper}`;rows.append(item);}
  }
  function routePoints(view) {
    if (view.missionState==='SPIRAL SCAN') return [view.position,...view.anomaly.spiralTargets.slice(view.anomaly.spiralIndex)];
    if (view.missionState==='RETURN TO GRID') return [view.position,...view.acceptedRoute.slice(view.anomaly.interruptedIndex)];
    if (view.missionState==='READY'&&!view.acceptedRoute.length) return [M.HOME,...view.stationPlan];
    if (view.missionState==='READY') return [M.HOME,...view.acceptedRoute];
    if (view.missionState==='COMPLETE') return [view.position];
    if (view.missionState==='RTH') return [view.position,view.homePoint||M.HOME];
    return [view.position,...view.acceptedRoute.slice(view.waypointIndex)];
  }
  function renderStationTransfer(view) {
    const transfer=incoming.snapshot();
    const arrived=transfer.received.some(item=>item.messageId===view.routeMessageId);
    const stage=view.stationStage;
    root.dataset.stationStage=stage;
    const index=stage==='idle'||stage==='preparing-route'?0:stage==='route-posted'?(arrived?2:1):stage==='route-accepted'||stage==='start-posted'?3:stage==='moving'||['start-received','checking-readiness','waiting-readiness','start-refused'].includes(stage)?4:stage==='route-rejected'?2:0;
    const steps=[...root.querySelectorAll('[data-station-stage]')];
    steps.forEach((item,i)=>{if(i===index)item.setAttribute('aria-current','step');else item.removeAttribute('aria-current');});
    const rthReason=({lowbattery:'แบตเตอรี่ต่ำ · กำลังกลับจุดเริ่มต้น',forced:'ได้รับคำสั่ง FORCE_RTH · กำลังกลับจุดเริ่มต้น','route-complete':'สำรวจเส้นทางที่รับไว้ครบแล้ว · กำลังกลับจุดเริ่มต้น'})[view.returnCause]||'กำลังกลับจุดเริ่มต้น · เหตุผลยังไม่ระบุ';
    const movingReason=view.missionState==='SPIRAL SCAN'?`กำลังสแกนก้นหอย ${view.anomaly.spiralIndex+1}/25 จุด · แล้วกลับต่อเส้นทางที่รับไว้`:view.missionState==='RTH'?rthReason:view.missionState==='COMPLETE'?'ภารกิจจบแล้ว · เรือหยุด':`กำลังไปจุดสำรวจ ${view.waypointIndex+1} จาก ${view.acceptedRoute.length} จุดที่เรือรับไว้`;
    byId('am-station-reason').textContent=stage==='moving'?movingReason:stage==='route-posted'&&arrived?'ข้อมูลถึงเรือแล้ว · รอการตรวจในจังหวะจำลอง · ยังไม่เท่ากับยอมรับเส้นทาง':view.stationReason;
    byId('am-route-provenance').textContent=view.acceptedRoute.length?`เรือเก็บจุดสำรวจ ${view.acceptedRoute.length} จุด · ใช้ตามลำดับที่รับ`:`แผนตัวอย่าง ${view.stationPlan.length} จุด · ยังไม่อยู่บนเรือ`;
    const dot=byId('am-station-dot');
    const dotAt=stage==='route-posted'?(arrived?{x:326,y:450}:{x:310,y:440}):stage==='route-accepted'?{x:326,y:450}:stage==='start-posted'?{x:310,y:440}:['start-received','checking-readiness','waiting-readiness','route-rejected','start-refused'].includes(stage)?{x:326,y:450}:{x:294,y:430};
    dot.setAttribute('cx',dotAt.x);dot.setAttribute('cy',dotAt.y);dot.hidden=stage==='moving';
    const accepted=byId('am-accepted-waypoints');
    accepted.hidden=!view.acceptedRoute.length;byId('am-waypoints').hidden=!!view.acceptedRoute.length;
    const signature=JSON.stringify(view.acceptedRoute);
    if(signature!==acceptedMarkerRoute){
      accepted.replaceChildren();
      view.acceptedRoute.forEach((point,index)=>{
        const marker=document.createElementNS('http://www.w3.org/2000/svg','g');marker.setAttribute('class','am-waypoint');marker.dataset.wp=String(index);marker.setAttribute('transform',`translate(${point.x} ${point.y})`);
        const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');circle.setAttribute('r','15');
        const label=document.createElementNS('http://www.w3.org/2000/svg','text');label.setAttribute('y','5');label.textContent=String(index+1);
        marker.append(circle,label);accepted.append(marker);
      });
      acceptedMarkerRoute=signature;
    }
  }

  function updateSpiral(view) {
    const group=byId('am-spiral-points');
    group.replaceChildren();
    if (!view.anomaly.used) return;
    const generated=view.anomaly.spiralTargets;
    const active=view.missionState==='SPIRAL SCAN'?generated[view.anomaly.spiralIndex]:null;
    if(active){
      const previous=generated[view.anomaly.spiralIndex-1]||view.anomaly.center;
      group.innerHTML=`<circle class="am-spiral-point is-current" cx="${active.x.toFixed(2)}" cy="${active.y.toFixed(2)}" r="4"/>`;
      byId('am-route-progress').setAttribute('d',pathFrom([previous,active]));
    }
  }
  function routeDisclosure() {
    root.dataset.routeStage=String(routeStep);
    routeSteps.forEach(button=>{
      if (Number(button.dataset.routeStep)===routeStep) button.setAttribute('aria-current','step');
      else button.removeAttribute('aria-current');
    });
  }
  function setMode(next,focus=false) {
    if (!tabs.some(tab=>tab.dataset.mode===next)) return;
    mode=next;
    root.dataset.mode=mode;
    tabs.forEach(tab=>{
      const selected=tab.dataset.mode===mode;
      tab.setAttribute('aria-selected',String(selected));
      tab.tabIndex=selected?0:-1;
      if (selected && focus) tab.focus();
    });
    const selected=tabs.find(tab=>tab.dataset.mode===mode);
    byId('am-panel').setAttribute('aria-labelledby',selected.id);
    byId('am-route-steps').hidden=mode!=='ROUTE';
    byId('am-caption').hidden=mode!=='ROUTE';
    byId('am-data-details').hidden=mode!=='DATA';
    byId('am-navigation-note').hidden=mode!=='NAVIGATION';
    byId('am-control-note').hidden=mode!=='CONTROL';
    byId('am-anomaly-note').hidden=mode!=='ANOMALY';
    byId('am-disturbance').hidden=mode!=='CONTROL';
    byId('am-anomaly-activate').hidden=mode!=='ANOMALY';
    render();
  }
  function render() {
    const v=M.snapshot(state);
    renderStationTransfer(v);
    root.dataset.missionState=v.missionState;
    root.dataset.playing=String(v.playing);
    root.dataset.anomalyUsed=String(v.anomaly.used);
    routeDisclosure();
    byId('am-state').textContent=v.missionState;
    byId('am-waypoint').textContent=v.missionState==='COMPLETE'?'COMPLETE':!v.acceptedRoute.length&&v.missionState==='READY'?'รอรับเส้นทาง':`WP${v.waypointIndex+1} / ${v.acceptedRoute.length}${v.missionState==='SPIRAL SCAN'?` · SPIRAL ${v.anomaly.spiralIndex+1}/${M.SPIRAL_POINTS}`:v.missionState==='RETURN TO GRID'?' · RETURN':''}`;
    byId('am-target-heading').textContent=v.hasNavigationTarget?`${fmt(v.targetHeading)}°`:'รอรับเส้นทาง';
    byId('am-current-heading').textContent=`${v.compassAvailable?`${fmt(v.acquiredHeading)}°`:'—'}`;
    byId('am-heading-error').textContent=signed(v.headingError);
    byId('am-request-left').textContent=String(v.requestedPwm.left);
    byId('am-request-right').textContent=String(v.requestedPwm.right);
    byId('am-left-pwm').textContent=String(v.appliedPwm.left);
    byId('am-right-pwm').textContent=String(v.appliedPwm.right);
    byId('am-clock').textContent=`${(v.clockMs/1000).toFixed(2)} s`;

    byId('am-toggle').textContent=v.playing?'PAUSE':'RESUME';
    byId('am-toggle').disabled=!v.playing&&(['COMPLETE'].includes(v.missionState)||(!v.stationStoryActive&&v.missionState==='READY')||['route-rejected','start-refused'].includes(v.stationStage));
    byId('am-toggle').setAttribute('aria-label',v.playing?'Pause simulation':'Resume simulation');
    const currentTarget=v.missionState==='GRID SCAN'&&v.los?.valid?v.los.lookahead:v.target;
    byId('am-boat').setAttribute('transform',`translate(${v.position.x.toFixed(3)} ${v.position.y.toFixed(3)}) rotate(${v.heading.toFixed(3)}) translate(0 13)`);
    byId('am-boat').setAttribute('aria-label',`Boat tip at ${v.position.x.toFixed(1)}, ${v.position.y.toFixed(1)}; heading ${v.heading.toFixed(1)} degrees`);
    byId('am-boat-label').setAttribute('x',(v.position.x+15).toFixed(2));
    byId('am-boat-label').setAttribute('y',(v.position.y+26).toFixed(2));
    byId('am-target').setAttribute('cx',currentTarget.x.toFixed(2));
    byId('am-target').setAttribute('cy',currentTarget.y.toFixed(2));
    byId('am-target').setAttribute('visibility',v.hasNavigationTarget?'visible':'hidden');
    byId('am-target-vector').setAttribute('d',v.hasNavigationTarget?`M${pointText(v.position)}L${pointText(currentTarget)}`:'');
    const headingRadians=v.heading*Math.PI/180;
    const force=byId('am-force-vector');
    if (v.force.remainingSec>0) {
      const sideRadians=headingRadians+(v.force.direction>0?Math.PI/2:-Math.PI/2);
      force.setAttribute('x1',v.position.x.toFixed(2));force.setAttribute('y1',v.position.y.toFixed(2));
      force.setAttribute('x2',(v.position.x+Math.sin(sideRadians)*45).toFixed(2));
      force.setAttribute('y2',(v.position.y-Math.cos(sideRadians)*45).toFixed(2));
      force.classList.add('is-active');
    } else {
      force.classList.remove('is-active');
      force.setAttribute('x1',v.position.x.toFixed(2));force.setAttribute('y1',v.position.y.toFixed(2));
      force.setAttribute('x2',v.position.x.toFixed(2));force.setAttribute('y2',v.position.y.toFixed(2));
    }
    byId('am-trail').setAttribute('d',pathFrom(v.trail.map(clampPoint)));
    if (v.missionState!=='SPIRAL SCAN') byId('am-route-progress').setAttribute('d',pathFrom(routePoints(v)));
    byId('am-route-progress').classList.toggle('is-visible',routeStep===4||mode!=='ROUTE'||v.missionState!=='READY');
    document.querySelectorAll('#am-waypoints [data-wp],#am-accepted-waypoints [data-wp]').forEach(point=>{
      const index=Number(point.dataset.wp);
      point.classList.toggle('is-current',index===v.waypointIndex&&v.missionState!=='COMPLETE');
      point.classList.toggle('is-passed',index<v.waypointIndex);
    });
    updateSpiral(v);
    if (mode==='NAVIGATION') byId('am-navigation-note').textContent=v.missionState==='GRID SCAN'&&v.los?.valid?`accepted route · WP${v.waypointIndex+1} · LOS point ${pointText(v.los.lookahead)} · bearing ${fmt(v.targetHeading)}° − Compass ${v.compassAvailable?fmt(v.acquiredHeading):'—'}° = ${signed(v.headingError)} · มองหน้า6m; reached3m / pass0.5m + cross-track guard`:`เป้าหมาย ${fmt(v.target.x,0)}, ${fmt(v.target.y,0)} · bearing ${fmt(v.targetHeading)}° − Compass ${v.compassAvailable?fmt(v.acquiredHeading):'—'}° = ${signed(v.headingError)} · SPIRAL segment LOS3m; RTH direct HOME; final hold ยังไม่มี target ใหม่`;
    byId('am-control-note').dataset.disturbanceActive=String(v.force.remainingSec>0);
    byId('am-disturbance').textContent=v.force.remainingSec>0?'DISTURBANCE ACTIVE':'ADD DISTURBANCE';
    byId('am-anomaly-values').textContent=`น้ำขุ่น ${fmt(v.anomaly.turbidityNtu)} NTU · ค่าเฉลี่ย ${fmt(v.anomaly.mean)} NTU · ${v.anomaly.window.length}/8 ตัวอย่าง`;
    byId('am-water-detail').textContent=`${v.hold.phase} · pH ${fmt(v.water.ph,3)} (quiet mean n=${v.phCount}) · temp ${fmt(v.water.temp)} synthetic · log-${v.logId} / snapshot-${v.snapshotId} / ADS-${v.sampleId}`;
    root.querySelector('.am-control-chain').textContent=`${v.controllerKind} · PWM ขอ ${v.requestedPwm.left}/${v.requestedPwm.right} → applied ${v.appliedPwm.left}/${v.appliedPwm.right}`;
    byId('am-policy-status').textContent=`${v.mode} · Safety ${v.safetyState} · pack ${fmt(v.batteryVoltage,2)}V / ${v.batteryPercent??'—'}% · Compass ${v.compassAvailable?'fresh':'unavailable'} / fail ${v.compassPolicy?.failCount??'—'} · ${v.lastCommandRefusal||v.homeCaptureResult||v.lastCommand?.code||'ยังไม่มีคำสั่งทดลอง'}${v.homeCapture?' · กำลังจับ HOME':''}`;
    const plume=byId('am-anomaly-zone');
    plume.setAttribute('cx',String(M.ANOMALY_REGION.x));plume.setAttribute('cy',String(M.ANOMALY_REGION.y));plume.setAttribute('r',String(M.ANOMALY_REGION.radius));
    byId('am-home').setAttribute('transform',`translate(${v.homePoint.x} ${v.homePoint.y})`);
    plume.classList.toggle('is-triggered',v.anomaly.armed||v.anomaly.used);
    const wire=transport.snapshot();
    renderTransport(wire);
    renderExplanation(v,wire);
    byId('am-anomaly-activate').disabled=v.missionState!=='GRID SCAN'||v.anomaly.armed;
    byId('am-anomaly-activate').textContent=v.anomaly.armed?'เปิดพื้นที่น้ำขุ่นตัวอย่างช่วงหลัง WP1 แล้ว':'เปิดน้ำขุ่นจำลองช่วงหลัง WP1';
    notifySnapshotListeners();
  }
  function notifySnapshotListeners() {
    if(resetInProgress||!snapshotListeners.size||!window.AutonomousMission)return;
    const generation=incoming.snapshot().generation;
    const key=[generation,state.clockMs,state.missionState,state.mode,state.playing,state.stationStage,state.waypointIndex,state.position.x,state.position.y,state.heading,state.lastEvent,state.anomaly.used,state.anomaly.spiralIndex,speed,mode,routeStep].join('|');
    if(key===lastPublishedSnapshotKey)return;
    lastPublishedSnapshotKey=key;
    const snapshot=window.AutonomousMission.snapshot();
    for(const listener of [...snapshotListeners]) {
      try { listener(M.clone(snapshot)); }
      catch { snapshotListeners.delete(listener); }
    }
  }
  function stopLoop() {
    if (frameId!==null) window.cancelAnimationFrame(frameId);
    frameId=null;previousFrameMs=null;accumulatorMs=0;
  }
  function animationFrame(now) {
    frameId=null;
    if (!state.playing || document.hidden) return;
    if (previousFrameMs===null) previousFrameMs=now;
    const elapsed=Math.min(250,Math.max(0,now-previousFrameMs));
    previousFrameMs=now;
    accumulatorMs+=elapsed*speed;
    const stepMs=M.DT_SECONDS*1000;
    while (accumulatorMs>=stepMs && state.playing) {
      const result=applyReceivedTick();
      transport.offer(state);
      if (result.event) renderTrace(result.event);
      if (!['COMPLETE'].includes(state.missionState)&&!['route-rejected','start-refused'].includes(state.stationStage)) state=M.resume(state);
      accumulatorMs-=stepMs;
    }
    render();
    if (state.playing) frameId=window.requestAnimationFrame(animationFrame);
  }
  function startLoop() {
    if (!state.playing || frameId!==null) return;
    previousFrameMs=null;accumulatorMs=0;
    frameId=window.requestAnimationFrame(animationFrame);
  }
  function start() {
    if(!state.stationStoryActive&&state.missionState==='READY') {
      state=M.beginStory(state,incoming.snapshot().generation);
      syncStationMessages();
    } else if(!state.playing) state=M.resume(state);
    startLoop();render();
  }
  function startWithStationRoute(points,options={}) {
    if(state.stationStoryActive||state.missionState!=='READY') reset();
    state=M.beginStory(state,incoming.snapshot().generation);
    const envelope=postStoryRoute(points,options);
    startLoop();render();
    return envelope;
  }
  function startBeforeRouteForProbe() {
    if(state.stationStoryActive||state.missionState!=='READY') reset();
    state=M.beginStory(state,incoming.snapshot().generation);
    const envelope=incoming.sendStart(state.routeId||undefined);
    state=M.markStartPosted(state,envelope);
    startLoop();render();
    return envelope;
  }
  function sendRouteForProbe(points,options={}) {
    if(!state.stationStoryActive) state=M.beginStory(state,incoming.snapshot().generation);
    const envelope=postStoryRoute(points,{...options,routeId:options.routeId||state.routeId||undefined});
    startLoop();render();
    return envelope;
  }
  function nextStep() {
    stopLoop();
    if(!state.stationStoryActive&&state.missionState==='READY')state=M.beginStory(state,incoming.snapshot().generation);
    if(state.playing)state=M.pause(state);
    const result=applyReceivedTick();
    transport.offer(state);
    if(result.event)renderTrace(result.event);
    render();
  }
  function togglePlayback() {
    if (state.playing) { state=M.pause(state);stopLoop(); }
    else { state=M.resume(state);startLoop(); }
    render();
  }
  function reset() {
    resetInProgress=true;
    try {
      stopLoop();
      const retainedInputs=new Map();
      document.querySelectorAll('[data-mission-input]').forEach(e=>{
        retainedInputs.set(e.dataset.missionInput,e.dataset.presentationOwned==='true'?e.defaultChecked:e.checked);
      });
      document.querySelectorAll('[data-policy-input]').forEach(e=>{
        const owned=e.dataset.presentationOwned==='true';
        const value=owned?e.defaultValue:e.value;
        retainedInputs.set(e.dataset.policyInput,value.trim()===''?null:Number(value));
      });
      const generation=incoming.reset();
      state=M.reset({generation,presentationPacingMs:PRESENTATION_PACING_MS});
      acceptedMarkerRoute='';spiralCause=null;transport.reset();disturbanceDirection=1;renderTrace(null);
      document.querySelectorAll('input[type="checkbox"]:not([data-mission-input])').forEach(e=>{e.checked=e.defaultChecked;});
      document.querySelectorAll('[data-mission-input]').forEach(e=>{
        const key=e.dataset.missionInput;
        e.checked=retainedInputs.has(key)?Boolean(retainedInputs.get(key)):e.defaultChecked;
        delete e.dataset.presentationOwned;
        state.inputs[key]=e.checked;
      });
      document.querySelectorAll('[data-policy-input]').forEach(e=>{
        const key=e.dataset.policyInput,value=retainedInputs.get(key);
        e.value=value===null||value===undefined?'':String(value);
        delete e.dataset.presentationOwned;
        if(e.value==='')delete state.inputs[key];
        else state.inputs[key]=Number(e.value);
      });
      render();
    } finally {
      resetInProgress=false;
    }
    notifySnapshotListeners();
  }
  function startSpiralDemo() {
    reset();
    state=M.activateAnomaly(state);
    setMode('ANOMALY');
    start();
  }
  function handleVisibility() {
    if (document.hidden) { state=M.pause(state);stopLoop();render(); }
  }
  tabs.forEach(tab=>tab.addEventListener('click',()=>setMode(tab.dataset.mode)));
  byId('am-tabs').addEventListener('keydown',event=>{
    const index=tabs.indexOf(document.activeElement);
    let next=index;
    if (event.key==='ArrowRight') next=(index+1)%tabs.length;
    else if (event.key==='ArrowLeft') next=(index-1+tabs.length)%tabs.length;
    else if (event.key==='Home') next=0;
    else if (event.key==='End') next=tabs.length-1;
    else return;
    event.preventDefault();setMode(tabs[next].dataset.mode,true);
  });
  routeSteps.forEach(button=>button.addEventListener('click',()=>{routeStep=Number(button.dataset.routeStep);render();}));
  byId('am-start').addEventListener('click',start);
  byId('am-next').addEventListener('click',nextStep);
  byId('am-toggle').addEventListener('click',togglePlayback);
  byId('am-reset').addEventListener('click',reset);
  byId('am-spiral-demo').addEventListener('click',startSpiralDemo);
  byId('am-speed').addEventListener('change',event=>{speed=Number(event.currentTarget.value);render();});
  byId('am-disturbance').addEventListener('click',()=>{
    state=M.addDisturbance(state,disturbanceDirection);disturbanceDirection*=-1;startLoop();render();
  });
  byId('am-anomaly-activate').addEventListener('click',()=>{state=M.activateAnomaly(state);render();});
  function sendPolicyCommand(command,values={}){state=M.wakePolicyClock(state);const envelope=incoming.sendCommand(command,values);startLoop();render();return envelope;}
  root.querySelectorAll('[data-policy-command]').forEach(e=>e.addEventListener('click',()=>sendPolicyCommand(e.dataset.policyCommand,{manualSpeed:Number(e.dataset.manualSpeed)||0})));
  root.querySelectorAll('[data-policy-input]').forEach(e=>e.addEventListener('change',()=>{if(e.value==='')delete state.inputs[e.dataset.policyInput];else state.inputs[e.dataset.policyInput]=Number(e.value);render();}));
  document.addEventListener('visibilitychange',handleVisibility);
  window.addEventListener('pagehide',()=>{stopLoop();incoming.close();transport.close();});
  root.querySelectorAll('[data-mission-input]').forEach(e=>e.addEventListener('change',()=>{state.inputs[e.dataset.missionInput]=e.checked;if(!state.inputs.gps||!state.inputs.compass||!state.inputs.safety||!state.inputs.route){state.applied={left:0,right:0};state.motorPwm={left:0,right:0};state.speedMps=0;}render();}));
  byId('am-drop-first').addEventListener('change',e=>transport.configure({dropFirst:e.target.checked}));
  byId('am-loss-all').addEventListener('change',e=>transport.configure({lossAll:e.target.checked}));
  byId('am-wire-speed').addEventListener('change',e=>transport.configure({delay:Number(e.target.value)}));
  const aliases=new Map([['learn',{mode:'ROUTE',target:'learn'}],['overview',{mode:'ROUTE',target:'overview'}],['operate',{mode:'ROUTE',target:'operate'}],['mission-start',{mode:'ROUTE',target:'mission-start'}],['ms-uplink-panel',{mode:'DATA',target:'ms-uplink-panel'}]]);
  function routeLegacyAlias() {
    const alias=aliases.get(decodeURIComponent(window.location.hash.slice(1)));
    if (!alias) return;
    setMode(alias.mode);
    (byId(alias.target)||root).scrollIntoView({block:'start'});
    if(alias.mode==='DATA')byId('am-data-panel').focus({preventScroll:true});
  }
  window.addEventListener('hashchange',routeLegacyAlias);
  window.AutonomousMission=Object.freeze({
    snapshot:()=>Object.assign(M.snapshot(state),{focus:mode,routeStep,speed,activeLoop:frameId===null?0:1,latestEvent,spiralCause:M.clone(spiralCause),transport:transport.snapshot(),incoming:incoming.snapshot()}),
    subscribe(listener) {
      if(typeof listener!=='function')throw new TypeError('snapshot listener must be a function');
      if(snapshotListeners.size>=8)throw new RangeError('snapshot listener limit reached');
      snapshotListeners.add(listener);
      try { listener(M.clone(this.snapshot())); }
      catch { snapshotListeners.delete(listener); return ()=>false; }
      return ()=>snapshotListeners.delete(listener);
    },
    setMode:next=>setMode(next),
    fastForward(count) {
      stopLoop();
      if(!state.stationStoryActive&&state.missionState==='READY'){state=M.beginStory(state,incoming.snapshot().generation);syncStationMessages();}
      else if(!state.playing)state=M.resume(state);
      for(let i=0;i<count&&state.playing;i++){
        const result=applyReceivedTick();
        rememberSpiralCause(state.rows,state.clockMs);transport.offer(state);
        if(result.event)latestEvent=result.event;
        if(state.missionState==='COMPLETE'||['route-rejected','start-refused'].includes(state.stationStage))break;
        if(i+1<count)state=M.resume(state);
      }
      state=M.pause(state);render();return this.snapshot();
    },
    configureTransport:changes=>transport.configure(changes),
    configureIncoming:changes=>incoming.configure(changes),
    sendCommand:(command,values={})=>sendPolicyCommand(command,values),
    testStartWithRoute:(points,options={})=>startWithStationRoute(points,options),
    testStartBeforeRoute:()=>startBeforeRouteForProbe(),
    testSendRoute:(points,options={})=>sendRouteForProbe(points,options),
    testSendStart:()=>{const envelope=incoming.sendStart(state.routeId);state=M.markStartPosted(state,envelope);render();return envelope;},
    publishSnapshot:()=>transport.offer(state,true),
    reset,
    dispatch(action) {
      if (action.type==='start') start();
      else if (action.type==='step') nextStep();
      else if (action.type==='pause'&&state.playing) togglePlayback();
      else if (action.type==='resume'&&!state.playing) togglePlayback();
      else if (action.type==='reset') reset();
      else if (action.type==='disturbance') { state=M.addDisturbance(state,action.direction);startLoop();render(); }
      else if (action.type==='anomaly') { state=M.activateAnomaly(state);render(); }
      else if (action.type==='speed') { speed=Math.max(1,Math.min(4,Number(action.value)||1));byId('am-speed').value=String(speed);render(); }
      else throw new RangeError(`unknown autonomous mission action: ${action.type}`);
      return this.snapshot();
    }
  });
  root.dataset.mode=mode;
  routeDisclosure();
  render();
  routeLegacyAlias();
})();
