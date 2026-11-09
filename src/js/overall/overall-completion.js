(() => {
  'use strict';
  const mission = window.AutonomousMission;
  const root = document.getElementById('operate');
  if (!mission || !root || typeof mission.subscribe !== 'function') return;

  const byId = id => document.getElementById(id);
  const historyLimit = 1200;
  const history = [];
  const checkpoints = new Map();
  let generation = null;
  let liveSnapshot = null;
  let viewedSnapshot = null;
  let viewedIndex = -1;
  let lastHistoryKey = '';
  let lastLogMessage = '';

  function point(value) {
    return value && Number.isFinite(value.x) && Number.isFinite(value.y)
      ? {x: value.x, y: value.y} : null;
  }
  function copyPointList(values, limit = Infinity) {
    return (Array.isArray(values) ? values : []).slice(-limit).map(point).filter(Boolean);
  }
  function capture(snapshot) {
    const anomaly = snapshot.anomaly || {};
    const incoming = snapshot.incoming || {};
    return {
      generation: incoming.generation ?? 0,
      clockMs: Number(snapshot.clockMs) || 0,
      missionState: snapshot.missionState || 'READY',
      mode: snapshot.mode || 'STANDBY',
      playing: Boolean(snapshot.playing),
      stationStoryActive: Boolean(snapshot.stationStoryActive),
      stationStage: snapshot.stationStage || 'idle',
      stationReason: snapshot.stationReason || '',
      waypointIndex: Number(snapshot.waypointIndex) || 0,
      position: point(snapshot.position) || {x: 335, y: 455},
      heading: Number(snapshot.heading) || 0,
      target: point(snapshot.target),
      targetHeading: Number.isFinite(snapshot.targetHeading) ? snapshot.targetHeading : null,
      headingError: Number.isFinite(snapshot.headingError) ? snapshot.headingError : null,
      hasNavigationTarget: Boolean(snapshot.hasNavigationTarget),
      acceptedRoute: copyPointList(snapshot.acceptedRoute),
      trail: copyPointList(snapshot.trail, 200),
      inputs: {...(snapshot.inputs || {})},
      water: {...(snapshot.water || {})},
      hold: {...(snapshot.hold || {})},
      phCount: Number(snapshot.phCount) || 0,
      sampleId: Number(snapshot.sampleId) || 0,
      anomaly: {
        armed: Boolean(anomaly.armed),
        used: Boolean(anomaly.used),
        mean: Number.isFinite(anomaly.mean) ? anomaly.mean : null,
        threshold: Number.isFinite(anomaly.threshold) ? anomaly.threshold : null,
        window: Array.isArray(anomaly.window) ? anomaly.window.filter(Number.isFinite) : [],
        spiralIndex: Number(anomaly.spiralIndex) || 0,
        spiralTargets: copyPointList(anomaly.spiralTargets),
        center: point(anomaly.center)
      },
      applied: {...(snapshot.applied || {})},
      appliedPwm: {...(snapshot.appliedPwm || {})},
      eventSequence: Number(snapshot.eventSequence) || 0,
      lastEvent: String(snapshot.lastEvent || ''),
      speed: Number(snapshot.speed) || 1
    };
  }
  function historyKey(s) {
    return [s.generation, s.clockMs, s.missionState, s.mode, s.playing, s.stationStage,
      s.waypointIndex, s.position.x, s.position.y, s.heading, s.eventSequence, s.speed].join('|');
  }
  function checkpointReached(s, key) {
    if (key === 'prepare') return s.missionState === 'READY' && s.clockMs === 0;
    if (key === 'afterWp1') return s.missionState === 'GRID SCAN' && s.waypointIndex >= 1;
    if (key === 'anomaly') return s.anomaly.used;
    if (key === 'firstSpiralTarget') return s.missionState === 'SPIRAL SCAN' && s.anomaly.spiralIndex >= 0;
    if (key === 'resumeGrid') return s.missionState === 'GRID SCAN' && s.anomaly.used && s.anomaly.spiralIndex >= 25;
    if (key === 'rth') return s.missionState === 'RTH';
    if (key === 'complete') return s.missionState === 'COMPLETE';
    return false;
  }
  function observe(snapshot) {
    const current = capture(snapshot);
    if (generation !== current.generation) {
      generation = current.generation;
      history.length = 0;
      checkpoints.clear();
      viewedSnapshot = null;
      viewedIndex = -1;
      lastHistoryKey = '';
      lastLogMessage = '';
    }
    liveSnapshot = current;
    const key = historyKey(current);
    if (key !== lastHistoryKey) {
      history.push(current);
      if (history.length > historyLimit) {
        history.shift();
        if (viewedSnapshot) viewedIndex = history.indexOf(viewedSnapshot);
      }
      lastHistoryKey = key;
      for (const name of ['prepare', 'afterWp1', 'anomaly', 'firstSpiralTarget', 'resumeGrid', 'rth', 'complete']) {
        if (!checkpoints.has(name) && checkpointReached(current, name)) checkpoints.set(name, current);
      }
      if (current.lastEvent && current.lastEvent !== lastLogMessage) {
        addHistoryLine(current.lastEvent);
        lastLogMessage = current.lastEvent;
      }
    }
    if (!viewedSnapshot) viewedIndex = history.length - 1;
    syncCheckpointOptions();
    render(viewedSnapshot || current, viewedSnapshot !== null);
  }
  function addHistoryLine(message) {
    const list = byId('sim-log');
    if (!list) return;
    const line = document.createElement('li');
    line.textContent = message;
    list.prepend(line);
    while (list.children.length > 20) list.lastElementChild.remove();
  }
  function syncCheckpointOptions() {
    const select = byId('sim-checkpoint');
    for (const option of select.options) {
      if (!option.value) continue;
      const item = checkpoints.get(option.value);
      option.disabled = !item;
      option.title = item
        ? `พบใน snapshot ของ mission · ${(item.clockMs / 1000).toFixed(2)} s`
        : 'รอให้ state นี้เกิดขึ้นจริงในรอบภารกิจปัจจุบัน';
    }
  }
  function project(pointValue) {
    if (!pointValue) return null;
    // Same local map-unit geometry as the canonical mission; presentation-only scaling.
    return {x: 130 + (pointValue.x - 295) * 0.8, y: 80 + (pointValue.y - 120) * 0.8};
  }
  function pathString(points) {
    return points.map((p, index) => {
      const xy = project(p);
      return `${index ? 'L' : 'M'}${xy.x.toFixed(2)} ${xy.y.toFixed(2)}`;
    }).join(' ');
  }
  function text(id, value) {
    const element = byId(id);
    if (element) element.textContent = value;
  }
  function setOpacity(element, visible) {
    if (element) element.setAttribute('opacity', visible ? '1' : '0');
  }
  function fmt(value, digits = 1) {
    return Number.isFinite(value) ? value.toFixed(digits) : '—';
  }
  function liveStatus() {
    if (!liveSnapshot) return 'LIVE · กำลังอ่าน mission snapshot';
    const count = checkpoints.size;
    return `LIVE · ${(liveSnapshot.clockMs / 1000).toFixed(2)} s · ${liveSnapshot.missionState} · ${count}/7 checkpoints พบแล้ว · ดูย้อนหลังเป็น read-only; ไม่ย้อนสถานะ mission`;
  }
  function syncControls(s) {
    const start = byId('sim-start');
    const step = byId('sim-step');
    const back = byId('sim-back');
    byId('sim-live').disabled = viewedSnapshot === null;
    const ended = s.missionState === 'COMPLETE';
    start.disabled = ended;
    start.innerHTML = s.playing
      ? 'พักภารกิจ <span aria-hidden="true">Ⅱ</span>'
      : s.missionState === 'READY' && !s.stationStoryActive
        ? 'เริ่มภารกิจ <span aria-hidden="true">▶</span>'
        : 'เล่นต่อ <span aria-hidden="true">▶</span>';
    step.disabled = ended;
    step.title = ended ? 'ภารกิจจบแล้ว · กด RESET ก่อนเริ่มรอบใหม่' : 'ขยับ mission clock จริงหนึ่ง tick (50 ms) แล้วพัก';
    const index = viewedSnapshot ? viewedIndex : history.length - 1;
    back.disabled = index <= 0;
    back.title = index <= 0
      ? 'ยังไม่มี snapshot ก่อนหน้าใน generation นี้'
      : 'เปิด snapshot ก่อนหน้าแบบ read-only · ไม่เปลี่ยน mission state, clock หรือ pose';
    byId('sim-speed').value = String(s.speed);
    const primarySpeed = byId('am-speed');
    if (primarySpeed) primarySpeed.value = String(s.speed);
  }
  function renderMap(s) {
    const home = s.homePoint || window.MissionKernel?.HOME || {x: 335, y: 455};
    const homeXY = project(home);
    byId('sim-home-marker').setAttribute('transform', `translate(${homeXY.x.toFixed(2)} ${homeXY.y.toFixed(2)})`);
    const homeZone = byId('sim-home-zone');
    if (homeZone) homeZone.setAttribute('transform', `translate(${homeXY.x.toFixed(2)} ${homeXY.y.toFixed(2)})`);
    setOpacity(homeZone, s.missionState === 'RTH');

    const route = s.acceptedRoute;
    const planned = byId('sim-planned');
    planned.setAttribute('d', route.length ? pathString([home, ...route]) : '');
    byId('sim-waypoints').setAttribute('visibility', route.length ? 'visible' : 'hidden');
    const markers = [...document.querySelectorAll('#sim-waypoints .sim-waypoint')];
    markers.forEach((marker, domIndex) => {
      const index = route.length - domIndex - 1;
      const p = index >= 0 ? project(route[index]) : null;
      marker.hidden = !p;
      marker.style.display = p ? '' : 'none';
      if (!p) return;
      marker.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
      const circle = marker.querySelector('.sim-waypoint-dot');
      circle.setAttribute('cx', '0'); circle.setAttribute('cy', '0');
      const label = marker.querySelector('.sim-waypoint-label');
      label.setAttribute('x', '13'); label.setAttribute('y', '-12'); label.textContent = `WP ${index + 1}`;
      marker.classList.toggle('is-target', s.missionState !== 'COMPLETE' && index === s.waypointIndex);
      marker.classList.toggle('is-passed', index < s.waypointIndex);
    });

    const boat = project(s.position);
    byId('sim-boat').setAttribute('transform', `translate(${boat.x.toFixed(2)} ${boat.y.toFixed(2)}) rotate(${s.heading.toFixed(2)})`);
    byId('sim-boat').setAttribute('aria-label', `Synthetic boat at ${s.position.x.toFixed(1)}, ${s.position.y.toFixed(1)}; heading ${s.heading.toFixed(1)} degrees`);
    const trail = s.trail.length > 1 ? pathString(s.trail) : '';
    byId('sim-trail').setAttribute('d', trail);
    byId('sim-trail-glow').setAttribute('d', trail);
    const target = byId('sim-target');
    if (s.target && s.hasNavigationTarget) {
      const xy = project(s.target);
      target.setAttribute('transform', `translate(${xy.x.toFixed(2)} ${xy.y.toFixed(2)})`);
      setOpacity(target, true);
    } else setOpacity(target, false);

    const center = s.anomaly.center;
    const region = center || (s.anomaly.armed ? window.MissionKernel?.ANOMALY_REGION : null);
    const hotspot = byId('sim-anomaly');
    if (region) {
      const xy = project(region);
      hotspot.setAttribute('cx', xy.x.toFixed(2)); hotspot.setAttribute('cy', xy.y.toFixed(2));
      hotspot.setAttribute('r', String((window.MissionKernel?.ANOMALY_REGION?.radius || 36) * 0.8));
    }
    setOpacity(hotspot, Boolean(region && (s.anomaly.armed || s.anomaly.used)));
    const centerMarker = byId('sim-center');
    if (center) {
      const xy = project(center);
      centerMarker.setAttribute('transform', `translate(${xy.x.toFixed(2)} ${xy.y.toFixed(2)})`);
    }
    setOpacity(centerMarker, Boolean(center));
    const generatedSpiral=s.missionState==='SPIRAL SCAN'
      ? s.anomaly.spiralTargets.slice(Math.max(0,s.anomaly.spiralIndex-1),s.anomaly.spiralIndex+1) : [];
    byId('sim-spiral-plan').setAttribute('d', generatedSpiral.length > 1 ? pathString(generatedSpiral) : '');
    const progress = route.length ? Math.min(100, (s.waypointIndex / route.length) * 100) : 0;
    byId('sim-progress-fill').style.width = `${progress}%`;
    text('sim-count', `${Math.min(s.waypointIndex, route.length)} / ${route.length} จุด`);
    text('sim-map-note', route.length
      ? `${s.stationStage === 'moving' ? 'เรือกำลังใช้ route ที่รับไว้' : `route ที่เรือรับไว้ · ${route.length} จุด`} · แผนภาพพิกัดจำลอง ไม่ใช่ GPS จริง${s.missionState === 'RTH' ? ' · กลับ HOME ตาม mission state' : ''}`
      : s.stationStage === 'route-posted'
        ? 'สถานีกำลังส่ง route · ยังไม่แสดงเป็น route ที่เรือยอมรับ'
        : s.stationStage === 'route-rejected'
          ? 'เรือปฏิเสธ route · ไม่มีเส้นทางติดตั้ง'
          : 'ยังไม่มี route ที่เรือยอมรับ · ตำแหน่งและระยะในภาพเป็นแผนภาพจำลอง ไม่ใช่ GPS จริง');
  }
  function renderReadings(s) {
    const water = s.water || {};
    text('sim-temp', fmt(water.temp, 1));
    text('sim-ph', fmt(water.ph, 2));
    text('sim-ntu', fmt(s.anomaly.mean, 1));
    text('sim-reading-note', `ตัวอย่างจาก mission state จำลอง · ${s.sampleId} sample · pH เผยแพร่หลังวัดนิ่ง (${s.phCount} ค่า)`);
    const values = s.anomaly.window;
    const figure = byId('sim-sma');
    figure.hidden = values.length === 0;
    const list = byId('sim-sma-samples');
    list.replaceChildren();
    values.forEach((value, index) => {
      const item = document.createElement('li');
      item.style.setProperty('--bar', `${Math.max(2, Math.min(100, value))}%`);
      const number = document.createElement('b'); number.textContent = fmt(value, 1);
      const bar = document.createElement('i'); bar.setAttribute('aria-hidden', 'true');
      const label = document.createElement('small'); label.textContent = String(index + 1).padStart(2, '0');
      item.append(number, bar, label); list.append(item);
    });
    const sum = values.reduce((total, value) => total + value, 0);
    text('sim-sma-sum', values.length ? fmt(sum, 1) : '—');
    text('sim-sma-count', String(values.length));
    text('sim-sma-mean', fmt(s.anomaly.mean, 1) + (Number.isFinite(s.anomaly.mean) ? ' NTU' : ''));
    text('sim-sma-threshold-label', Number.isFinite(s.anomaly.threshold) ? `${fmt(s.anomaly.threshold, 0)} NTU · threshold` : 'threshold —');
    text('sim-sma-delta', Number.isFinite(s.anomaly.mean) && Number.isFinite(s.anomaly.threshold)
      ? `${fmt(s.anomaly.mean - s.anomaly.threshold, 1)} NTU จาก threshold` : '—');
    text('sim-sma-boundary', values.length
      ? `window ${values.length}/8 · mean ${fmt(s.anomaly.mean, 1)} NTU · อ้างอิงค่าที่ mission สุ่มตัวอย่าง`
      : 'ยังไม่มีตัวอย่างจากภารกิจ');
    text('sim-story-sma', values.length ? `${values.length}/8 · mean ${fmt(s.anomaly.mean, 1)} NTU` : 'รอ sample จาก mission');
  }
  function decisionText(s) {
    if (s.missionState === 'READY') return s.stationReason || 'รอเส้นทางและคำสั่งเริ่มจากสถานี';
    if (s.missionState === 'COMPLETE') return 'ภารกิจจำลองเสร็จแล้ว · หยุดมอเตอร์';
    if (!s.inputs.safety) return 'หยุดรอ · เงื่อนไขความปลอดภัยไม่พร้อม';
    if (!s.inputs.gps || !s.inputs.compass || !s.inputs.route) return 'หยุดรอ · ตรวจ GPS เข็มทิศ และเส้นทาง';
    if (s.hold.phase === 'settle') return 'พักเรือให้น้ำนิ่งก่อนวัดค่า';
    if (s.hold.phase === 'measure') return 'กำลังเก็บค่าคุณภาพน้ำขณะพักเรือ';
    if (s.missionState === 'SPIRAL SCAN') return `สแกนก้นหอย · เป้าหมาย ${Math.min(s.anomaly.spiralIndex + 1, s.anomaly.spiralTargets.length)} / ${s.anomaly.spiralTargets.length}`;
    if (s.missionState === 'RTH') return 'เดินทางกลับ HOME · ตรวจเงื่อนไขการถึงจุดเริ่มต้น';
    return `มุ่งสู่จุดสำรวจที่ ${Math.min(s.waypointIndex + 1, s.acceptedRoute.length)} / ${s.acceptedRoute.length}`;
  }
  function renderStory(s) {
    const storyIndex = s.missionState === 'RTH' || s.missionState === 'COMPLETE' ? 4
      : s.missionState === 'SPIRAL SCAN' ? 3
        : s.anomaly.used ? 2
          : s.missionState === 'GRID SCAN' && s.waypointIndex > 0 ? 1 : 0;
    document.querySelectorAll('#sim-storyline li').forEach((item, index) => {
      item.classList.toggle('is-current', index === storyIndex);
      item.classList.toggle('is-complete', index < storyIndex);
      if (index === storyIndex) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
    const fsmIndex = ({GRID_PATROL: 0, SPIRAL_SCAN: 1, RETURN_HOME: 3, STANDBY: s.missionState === 'COMPLETE' ? 4 : -1})[s.mode] ?? -1;
    document.querySelectorAll('#sim-fsm [data-fsm-stage]').forEach(item => {
      const active = Number(item.dataset.fsmStage) === fsmIndex;
      item.classList.toggle('is-current', active);
      if (active) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
    const phase = s.missionState === 'READY' ? 'เตรียม / route และ START'
      : s.missionState === 'GRID SCAN' ? 'GRID · สำรวจตาม route ที่รับไว้'
        : s.missionState === 'SPIRAL SCAN' ? 'SPIRAL · เป้าหมายจาก anomaly จริงใน model'
          : s.missionState === 'RTH' ? 'RTH · กลับ HOME'
            : s.missionState === 'COMPLETE' ? 'COMPLETE · ภารกิจจบ' : s.missionState;
    text('sim-phase', phase);
    text('sim-decision', decisionText(s));
    text('sim-reason', s.stationReason || `${s.missionState} · WP${s.waypointIndex + 1} · clock ${(s.clockMs / 1000).toFixed(2)} s`);
    text('sim-state', `${s.missionState} · ${s.mode}`);
    text('sim-inputs', `clock ${(s.clockMs / 1000).toFixed(2)} s · pose ${fmt(s.position.x, 2)}, ${fmt(s.position.y, 2)} · heading ${fmt(s.heading, 2)}° · GPS ${s.inputs.gps ? 'valid' : 'off'} · compass ${s.inputs.compass ? 'valid' : 'off'}`);
    text('sim-predicate', s.lastEvent || 'ยังไม่มี event จาก mission');
    text('sim-result', s.missionState);
    text('sim-next-state', s.mode);
    text('sim-action', `applied L/R ${fmt(s.applied.left, 3)} / ${fmt(s.applied.right, 3)} · PWM ${s.appliedPwm.left ?? '—'} / ${s.appliedPwm.right ?? '—'}`);
    text('sim-insight', `${decisionText(s)} · เวลาจำลอง ${(s.clockMs / 1000).toFixed(2)} s · ${s.hasNavigationTarget && s.target ? `ตำแหน่งเป้าหมาย ${fmt(s.target.x, 1)}, ${fmt(s.target.y, 1)}` : 'ยังไม่มีเป้าหมายนำทาง'}`);
    document.querySelectorAll('#sim-stages li').forEach(item => item.classList.toggle('active', item.dataset.phase === (
      s.missionState === 'READY' ? 'prepare' : s.missionState === 'GRID SCAN' ? 'travel'
        : s.missionState === 'SPIRAL SCAN' ? 'spiral' : s.missionState === 'RTH' ? 'return' : 'done')));
  }
  function render(s, historical) {
    if (!s) return;
    syncControls(liveSnapshot || s);
    text('sim-clock', `${(s.clockMs / 1000).toFixed(2)} s`);
    text('sim-pose-readout', `${s.position.x.toFixed(1)}, ${s.position.y.toFixed(1)} · ${s.heading.toFixed(1)}°`);
    text('sim-playback', historical ? 'HISTORICAL · READ ONLY' : s.playing ? 'กำลังจำลอง' : s.missionState === 'READY' ? 'พร้อมเริ่ม' : 'พักภารกิจ');
    if (historical) {
      const live = liveSnapshot ? ` · LIVE ${(liveSnapshot.clockMs / 1000).toFixed(2)} s / ${liveSnapshot.missionState}` : '';
      text('sim-history-status', `HISTORICAL · ${(s.clockMs / 1000).toFixed(2)} s / ${s.missionState} · snapshot ที่บันทึกไว้เท่านั้น; canonical mission ไม่เปลี่ยน${live}`);
    } else text('sim-history-status', liveStatus());
    renderMap(s);
    renderReadings(s);
    renderStory(s);
  }
  function showHistory(index, recordedSnapshot) {
    const selected = recordedSnapshot || history[index];
    if (!selected) return;
    viewedIndex = index;
    viewedSnapshot = selected;
    byId('sim-checkpoint').value = '';
    render(viewedSnapshot, true);
  }
  function showLive() {
    viewedSnapshot = null;
    viewedIndex = history.length - 1;
    byId('sim-checkpoint').value = '';
    render(liveSnapshot, false);
  }
  function dispatch(action) {
    if (viewedSnapshot) showLive();
    const result = mission.dispatch(action);
    liveSnapshot = capture(result);
    if (!history.length || historyKey(liveSnapshot) !== lastHistoryKey) observe(result);
    else render(liveSnapshot, false);
    return result;
  }

  byId('sim-start').addEventListener('click', () => {
    const s = mission.snapshot();
    dispatch({type: s.playing ? 'pause' : 'start'});
  });
  byId('sim-step').addEventListener('click', () => dispatch({type: 'step'}));
  byId('sim-live').addEventListener('click', showLive);
  byId('sim-reset').addEventListener('click', () => {
    viewedSnapshot = null;
    viewedIndex = -1;
    mission.dispatch({type: 'reset'});
  });
  byId('sim-back').addEventListener('click', () => {
    const index = viewedSnapshot ? viewedIndex - 1 : history.length - 2;
    showHistory(index);
  });
  byId('sim-checkpoint').addEventListener('change', event => {
    const item = checkpoints.get(event.currentTarget.value);
    if (!item) {
      event.currentTarget.value = '';
      text('sim-history-status', 'ยังไม่มี snapshot ของ checkpoint นี้ในรอบปัจจุบัน · รอ state ที่เกิดจริง');
      return;
    }
    const index = history.lastIndexOf(item);
    showHistory(index, item);
    event.currentTarget.value = [...checkpoints].find(([, snapshot]) => snapshot === item)?.[0] || '';
  });
  byId('sim-speed').addEventListener('change', event => dispatch({type: 'speed', value: event.currentTarget.value}));

  mission.subscribe(observe);
})();
