(() => {
  'use strict';
  const M = window.BoatMissionModel;
  const explorer = document.getElementById('explorer');
  // Presentation defaults are explicit synthetic inputs, not a readiness bypass.
  let state = M.setClockRate(M.readyPreset(M.createMission()), 4);
  let focus = 'whole';
  let timer = null;
  const el = id => document.getElementById(id);
  const mapped = p => ({ x:p.x, y:p.y });
  const titles = {
    whole:['ภาพรวมภารกิจ','สถานะการเดินทางและตัวตรวจน้ำของเรือลำนี้'],
    readiness:['อะไรทำให้ START ผ่าน?','เปลี่ยนอินพุตจริงของแบบจำลอง แล้วดู gate กับสถานะรอ START เปลี่ยนตาม'],
    navigation:['ตำแหน่ง → เป้าหมาย → bearing','ทุกมุมมองใช้ตำแหน่งเรือลำเดียวกัน · ไม่มีการเริ่ม mission ใหม่ตอนเจาะดู'],
    gps:['GPS: คุณภาพ fix และอายุข้อมูล','ข้อมูลรับเป็น synthetic · sample ที่ไม่ผ่านคุณภาพจะไม่ต่ออายุ last-valid fix'],
    compass:['Compass: พร้อมใช้หรือไม่','สถานะ calibration เป็น diagnostic เท่านั้น · readiness เช็ก present, fresh, fail count และ heading finite'],
    steering:['จาก error สู่เส้นทางที่เห็น','ตัวควบคุมเปลี่ยน heading ก่อน surge · ทั้งคู่ใช้กับตำแหน่งบนแผนที่เดียวกัน']
  };
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function dispatch(action) {
    switch (action.type) {
      case 'ready-preset': state = M.readyPreset(state); break;
      case 'gps': state = M.setGps(state, action.values); break;
      case 'compass': state = M.setCompass(state, action.values); break;
      case 'water': state = M.setWater(state, action.values); break;
      case 'home': state = M.setHome(state, action.enabled); break;
      case 'route': state = M.setRoute(state, action.sealed); break;
      case 'safety': state = M.setSafety(state, action.value); break;
      case 'start': state = M.start(state); break;
      case 'emergency': state = M.emergency(state); break;
      case 'clear-estop': state = M.clearEstop(state); break;
      case 'force-spiral': state = M.forceSpiral(state); break;
      case 'reset': stop(); state = M.setClockRate(M.readyPreset(M.reset()), 4); break;
      case 'speed': { const wasPlaying=timer!==null; stop(); state=M.setClockRate(state,Number(action.value)); if(wasPlaying) startPlaying(); break; }
      default: throw new RangeError(`unknown BoatSimulation action: ${action.type}`);
    }
    if (['ready-preset','reset'].includes(action.type)) syncInputs();
    render();
    if (action.type==='reset') revealBoat();
    return snapshot();
  }
  function snapshot() {
    return clone(Object.assign(M.snapshot(state), { focus, playing:Boolean(timer), activeLoop:timer ? 1 : 0 }));
  }
  function step(count = 1) {
    state = M.step(state, count);
    render();
    return snapshot();
  }
  function setText(id, value) { el(id).textContent = value; }
  function fmt(value, digits=1) { return Number.isFinite(value) ? value.toFixed(digits) : '—'; }
  function sensorInputs() {
    return {receiving:el('sim-gps-receiving').checked,locationValid:el('sim-gps-location-valid').checked,
      sats:Number(el('sim-gps-sats').value),hdop:Number(el('sim-gps-hdop').value),sampleAgeMs:Number(el('sim-gps-sample-age').value)};
  }
  function compassInputs() {
    return {present:el('sim-compass-present').checked,fresh:el('sim-compass-fresh').checked,
      failCount:Number(el('sim-compass-fail-count').value),headingDeg:Number(el('sim-compass-heading').value),
      calibrationLoaded:el('sim-compass-calibration').checked};
  }
  function syncInputs() {
    const g=state.gps,c=state.compass;
    el('sim-gps-receiving').checked=g.receiving; el('sim-gps-location-valid').checked=g.locationValid;
    el('sim-gps-sats').value=String(g.sats); el('sim-gps-hdop').value=String(g.hdop);
    el('sim-gps-sample-age').value=String(g.sampleAgeMs); el('sim-compass-present').checked=c.present;
    el('sim-compass-fresh').checked=c.fresh; el('sim-compass-fail-count').value=String(c.failCount);
    el('sim-compass-heading').value=String(c.headingDeg); el('sim-compass-calibration').checked=c.calibrationLoaded;
    el('sim-route-sealed').checked=state.routeSealed; el('sim-home-set').checked=Boolean(state.home);
    el('sim-water-ntu').value=String(state.water.inputNtu); el('sim-water-valid').checked=state.water.valid;
    el('sim-speed').value=String(state.clockRate);
  }
  function setFocus(next) {
    if (!Object.hasOwn(titles,next)) return;
    focus=next; explorer.dataset.level=next;
    document.querySelectorAll('#mission-focus [data-focus]').forEach(button => {
      if (button.dataset.focus===next) button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    });
    document.querySelectorAll('[data-focus-panel]').forEach(panel => { panel.hidden=panel.dataset.focusPanel!==next; });
    el('main-caption').textContent='จำลองภารกิจเรือ';
    setText('sim-focus-title',titles[next][0]); setText('sim-focus-copy',titles[next][1]);
    render();
  }
  function render() {
    const v=M.snapshot(state);
    const p=mapped(v.position),t=mapped(v.target),trail=v.trail.map(mapped);
    el('sim-boat').setAttribute('transform',`translate(${p.x.toFixed(3)} ${p.y.toFixed(3)}) rotate(${v.heading.toFixed(3)})`);
    el('sim-target').setAttribute('cx',t.x.toFixed(3)); el('sim-target').setAttribute('cy',t.y.toFixed(3));
    el('sim-target-line').setAttribute('x1',p.x.toFixed(3)); el('sim-target-line').setAttribute('y1',p.y.toFixed(3));
    el('sim-target-line').setAttribute('x2',t.x.toFixed(3)); el('sim-target-line').setAttribute('y2',t.y.toFixed(3));
    el('sim-trail').setAttribute('d',trail.length ? `M${trail[0].x.toFixed(2)} ${trail[0].y.toFixed(2)} ${trail.slice(1).map(q=>`L${q.x.toFixed(2)} ${q.y.toFixed(2)}`).join(' ')}` : '');
    const label=v.mode==='RTH'?'HOME':v.mode==='SPIRAL'?`SPIRAL ${v.spiralIndex+1}/25`:`WP${Math.min(v.waypointIndex+1,v.waypoints.length)}`;
    setText('sim-map-label',`เรือจำลอง · ${label}`);
    document.querySelectorAll('.survey-waypoint').forEach(point=>{
      const index=Number(point.dataset.surveyWp)-1;
      point.classList.toggle('is-current',v.mode==='GRID'&&index===v.waypointIndex);
      point.classList.toggle('is-passed',index<v.waypointIndex&&v.mode!=='SPIRAL');
    });
    setText('sim-mode',v.mode); setText('sim-waypoint',v.mode==='RTH'?'HOME':`WP${Math.min(v.waypointIndex+1,v.waypoints.length)} / ${v.waypoints.length}`);
    setText('sim-distance',`${fmt(v.targetDistanceM,1)} m`); setText('sim-bearing',`${fmt(v.targetBearing,1)}°`);
    setText('sim-heading',`${fmt(v.heading,1)}°`); setText('sim-error',`${fmt(v.headingError,1)}°`);
    setText('sim-turn',`${fmt(v.steering.turnRateDps,1)}°/s · ${fmt(v.speedMps,2)}m/s`);
    const gpsAge=v.gps.ageMs===null?'ไม่เคยมี valid fix':`${v.gps.ageMs} ms`;
    const gpsStatus=v.readiness.gps?'valid':`unavailable · ${v.gps.tier}`;
    const compassStatus=v.readiness.compass?'ok':'unavailable';
    setText('sim-gps-tier',`GPS: ${v.gps.tier} · age ${gpsAge}${v.gps.faultLatched?' · LATCHED':''}`);
    setText('sim-start-gate',`START: ${v.readiness.start?'ผ่าน':'รอ'} · NORMAL ${v.safety==='NORMAL'?'✓':'×'} · GPS ${v.readiness.gps?'✓':'×'} · compass ${v.readiness.compass?'✓':'×'} · route ${v.readiness.route?'✓':'×'} · HOME ${v.readiness.home?'มี':'ไม่มี'} (ไม่ใช่ gate)`);
    setText('sim-gps-detail',`location ${v.gps.locationValid?'valid':'invalid'} · ${v.gps.sats} sats · HDOP ${fmt(v.gps.hdop,2)} · accepted age ${gpsAge} · receiver ${v.gps.receiving?'receiving':'silent'} · ${gpsStatus}`);
    setText('sim-compass-detail',`present ${v.compass.present} · fresh ${v.compass.fresh} · failCount ${v.compass.failCount}/5 · heading ${fmt(v.compass.headingDeg,1)}° · calibration ${v.compass.calibrationLoaded?'loaded':'not loaded'} · ${compassStatus}`);
    setText('sim-input-value',`INPUT · GPS ${gpsStatus} / compass ${compassStatus}`);
    const gate=v.readiness.start?'START checks pass':v.pendingStart?'START pending: รอ sensor/route':'START gate not ready';
    setText('sim-check-value',`CHECK · ${gate}`);
    const action=v.mode==='ESTOP'?'hard stop · neutral':v.hold?`neutral · ${v.hold.phase} hold`:v.speedMps>0?`turn ${fmt(v.steering.turnRateDps,1)}°/s + surge ${fmt(v.speedMps,2)}m/s`:'neutral · inactive/unavailable';
    setText('sim-action-value',`ACTION · ${action}`);
    setText('sim-transition',v.lastTransition);
    setText('sim-water-summary',`Water SMA ${v.water.meanNtu.toFixed(1)} NTU · ${v.water.sampleCount}/${v.water.window} samples · ${v.water.valid?'valid':'invalid'} · ${v.water.trigger?'DIRTY trigger':'clean / wait'} · auto SPIRAL gated after WP1`);
    const missing=[];
    if(v.safety!=='NORMAL') missing.push('Safety NORMAL');
    if(!v.readiness.gps) missing.push('GPS');
    if(!v.readiness.compass) missing.push('เข็มทิศ');
    if(!v.readiness.route) missing.push('เส้นทาง');
    let headline='พร้อมเริ่มสำรวจ', detail='เซนเซอร์จำลองพร้อม · กด START เพื่อออกเดินทาง';
    if(v.mode==='ESTOP'){ headline='หยุดฉุกเฉิน';detail='เปิดดูตรรกะเพื่อตรวจและล้างเงื่อนไขก่อนเริ่มใหม่'; }
    else if(missing.length){ headline=`รอ ${missing.join(' / ')}`; detail=v.pendingStart?'รับ START แล้ว · ยังไม่ขับจนกว่าเงื่อนไขจะผ่าน':'ตรวจหรือแก้เงื่อนไขใน ดูตรรกะ / เซนเซอร์'; }
    else if(v.hold){ headline='หยุดเก็บตัวอย่างน้ำ';detail=v.hold.phase==='settle'?'รอน้ำและเรือนิ่งก่อนวัด':'กำลังวัดน้ำ · ครบเวลาแล้วจึงเดินทางต่อ'; }
    else if(['GRID','SPIRAL','RTH'].includes(v.mode)){
      headline=v.mode==='RTH'?'กำลังกลับ HOME':v.mode==='SPIRAL'?'สำรวจรอบจุดผิดปกติ':`กำลังไป WP${v.waypointIndex+1}`;
      detail=timer?`${fmt(v.targetDistanceM,1)} m ถึงเป้าหมาย · กดพักเพื่อตรวจดูแต่ละจังหวะ`:'พักการจำลอง · กดเล่นต่อ หรือทีละก้าว';
    }else if(v.clockMs>0&&!v.pendingStart){headline='จบภารกิจ';detail='กดเริ่มใหม่เพื่อกลับสู่จุดเริ่มต้น';}
    setText('sim-mission-headline',headline);setText('sim-mission-detail',detail);
    setText('sim-mode-label',timer?'กำลังจำลอง':'หยุดเวลา');
    setText('sim-gps-badge',v.readiness.gps?'GPS พร้อม':'GPS ไม่พร้อม');el('sim-gps-badge').dataset.ready=String(v.readiness.gps);
    setText('sim-compass-badge',v.readiness.compass?'เข็มทิศพร้อม':'เข็มทิศไม่พร้อม');el('sim-compass-badge').dataset.ready=String(v.readiness.compass);
    setText('sim-target-badge',`เป้าหมาย ${label}`);setText('sim-distance-badge',`${fmt(v.targetDistanceM,1)} m`);
    setText('sim-clock',`${(v.clockMs/1000).toFixed(2)} s`);
    el('sim-start').disabled=v.mode!=='STANDBY';
    el('sim-play').textContent=timer?'พัก':'เล่น';
    el('sim-play').disabled = timer === null && !v.pendingStart && !['GRID', 'SPIRAL', 'RTH'].includes(v.mode);
    el('sim-clear-estop').disabled=v.mode!=='ESTOP';
    el('sim-force-spiral').disabled=!(v.mode==='GRID'&&v.waypointIndex>=1&&!v.hold);
  }
  function stop() { if (timer!==null) window.clearInterval(timer); timer=null; }
  function startPlaying() {
    if (timer !== null || (!state.pendingStart && !['GRID', 'SPIRAL', 'RTH'].includes(state.mode))) return;
    timer=window.setInterval(()=>{
      if (!state.pendingStart && !['GRID', 'SPIRAL', 'RTH'].includes(state.mode)) { stop(); render(); return; }
      step(1);
    },M.DT_SECONDS*1000/state.clockRate);
  }
  function togglePlay() {
    if (timer!==null) stop(); else startPlaying();
    render();
  }
  function revealBoat() {
    if (!window.matchMedia('(max-width:760px)').matches) return;
    const pan=el('scene-pan'), area=pan.getBoundingClientRect(), boat=el('sim-boat').getBoundingClientRect();
    if(boat.bottom>area.bottom-72) pan.scrollTop+=boat.bottom-(area.bottom-72);
    else if(boat.top<area.top+96) pan.scrollTop-=area.top+96-boat.top;
    if(boat.right>area.right-28) pan.scrollLeft+=boat.right-(area.right-28);
    else if(boat.left<area.left+28) pan.scrollLeft-=area.left+28-boat.left;
  }
  function setInspector(open) {
    el('sim-inspector').hidden=!open;
    el('sim-inspect').setAttribute('aria-expanded',String(open));
    if(!open) el('sim-inspect').focus({preventScroll:true});
  }
  el('sim-inspect').addEventListener('click',()=>setInspector(el('sim-inspector').hidden));
  el('sim-close-inspector').addEventListener('click',()=>setInspector(false));
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!el('sim-inspector').hidden)setInspector(false);});
  document.querySelectorAll('#mission-focus [data-focus]').forEach(button=>button.addEventListener('click',()=>setFocus(button.dataset.focus)));
  el('sim-ready').addEventListener('click',()=>dispatch({type:'ready-preset'}));
  el('sim-start').addEventListener('click',()=>{ dispatch({type:'start'}); startPlaying(); render(); });
  el('sim-step').addEventListener('click',()=>step(1));
  el('sim-play').addEventListener('click',togglePlay);
  el('sim-reset').addEventListener('click',()=>dispatch({type:'reset'}));
  el('sim-speed').addEventListener('change',event=>dispatch({type:'speed',value:event.currentTarget.value}));
  el('sim-emergency').addEventListener('click',()=>dispatch({type:'emergency'}));
  el('sim-safety-normal').addEventListener('click',()=>dispatch({type:'safety',value:'NORMAL'}));
  el('sim-clear-estop').addEventListener('click',()=>dispatch({type:'clear-estop'}));
  el('sim-force-spiral').addEventListener('click',()=>dispatch({type:'force-spiral'}));
  for (const id of ['sim-gps-receiving','sim-gps-location-valid','sim-gps-sats','sim-gps-hdop','sim-gps-sample-age']) {
    el(id).addEventListener(id.includes('receiving')||id.includes('valid')?'change':'input',()=>dispatch({type:'gps',values:sensorInputs()}));
  }
  for (const id of ['sim-compass-present','sim-compass-fresh','sim-compass-fail-count','sim-compass-heading','sim-compass-calibration']) {
    el(id).addEventListener(id.includes('present')||id.includes('fresh')||id.includes('calibration')?'change':'input',()=>dispatch({type:'compass',values:compassInputs()}));
  }
  for (const id of ['sim-water-ntu','sim-water-valid']) el(id).addEventListener(id.endsWith('valid')?'change':'input',()=>dispatch({type:'water',values:{inputNtu:Number(el('sim-water-ntu').value),valid:el('sim-water-valid').checked}}));
  el('sim-route-sealed').addEventListener('change',event=>dispatch({type:'route',sealed:event.currentTarget.checked}));
  el('sim-home-set').addEventListener('change',event=>dispatch({type:'home',enabled:event.currentTarget.checked}));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();render();});
  window.addEventListener('pagehide',stop);
  window.BoatSimulation=Object.freeze({snapshot,step,dispatch});
  syncInputs(); setFocus('whole'); revealBoat();
})();