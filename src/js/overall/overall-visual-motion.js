(function (global) {
  'use strict';

  const storyboards = Object.create(null);
  const samples = [74, 76, 77, 78, 79, 80, 78, 82];
  storyboards.sma = Object.freeze({
    id: 'sma',
    delayMs: 620,
    samples: Object.freeze(samples),
    frames: Object.freeze(samples.map((sample, index) => Object.freeze({
      stage: index + 1,
      sampleIndex: index,
      sample,
      count: index + 1,
      mean: index === 7 ? 78 : null,
      label: index === 7
        ? 'ตัวอย่าง 8/8 · SMA(8) = 78 NTU'
        : `ตัวอย่าง ${index + 1}/8 · ${sample} NTU · ยังไม่สรุป SMA(8)`
    })))
  });

  const spiralTargets = [
    [260.0, 180.0], [249.5, 150.5], [220.0, 136.7], [188.2, 148.2], [173.3, 180.0],
    [185.8, 214.2], [220.0, 230.0], [256.5, 216.5], [273.3, 180.0], [258.9, 141.1],
    [220.0, 123.3], [178.8, 138.8], [160.0, 180.0], [176.4, 223.6], [220.0, 243.3],
    [266.0, 226.0], [286.7, 180.0], [268.3, 131.7], [220.0, 110.0], [169.3, 129.3],
    [146.7, 180.0], [167.0, 233.0], [220.0, 256.7], [275.4, 235.4], [300.0, 180.0]
  ];
  const spiralFrames = [{ stage: 1, kind: 'grid-start', position: [118, 42], label: 'GRID · จุดเริ่มเส้นทาง' }];
  spiralTargets.forEach((position, targetIndex) => spiralFrames.push({
    stage: spiralFrames.length + 1,
    kind: 'spiral-target',
    targetIndex,
    position,
    label: `SPIRAL · เป้าหมาย ${targetIndex + 1}/25`
  }));
  spiralFrames.push({ stage: 27, kind: 'grid-return', position: [374, 42], label: 'กลับ GRID · ใช้ index เดิม' });
  storyboards.spiral = Object.freeze({
    id: 'spiral', delayMs: 320,
    targets: Object.freeze(spiralTargets.map(position => Object.freeze(position))),
    frames: Object.freeze(spiralFrames.map(frame => Object.freeze(frame)))
  });

  const dataRoutes = [
    { name: 'telemetry', direction: 'forward', tone: 'cyan', nodes: ['nav', 'stageQueue', 'io', 'radio'],
      positions: [[48, 44], [157, 44], [260, 44], [379, 44]], label: 'nav → stageQueue → io → radio' },
    { name: 'command', direction: 'back', tone: 'amber', nodes: ['io', 'stateMutex', 'stateMutex', 'nav'],
      positions: [[260, 70], [260, 92], [180, 92], [100, 92]], label: 'command · radio/io → stateMutex → nav' },
    { name: 'sd-log', direction: 'forward', tone: 'cyan', nodes: ['nav', 'logQueue', 'io', 'SD'],
      positions: [[48, 186], [157, 186], [260, 186], [379, 186]], label: 'nav → logQueue → io → SD' }
  ].map(route => Object.freeze({
    ...route,
    nodes: Object.freeze(route.nodes),
    positions: Object.freeze(route.positions.map(position => Object.freeze(position)))
  }));
  const dataFrames = dataRoutes.flatMap((route, routeIndex) => route.positions.map((position, nodeIndex) => Object.freeze({
    stage: routeIndex * 4 + nodeIndex + 1,
    route: route.name,
    direction: route.direction,
    tone: route.tone,
    node: route.nodes[nodeIndex],
    position,
    label: `${route.label} · ${route.nodes[nodeIndex]}`
  })));
  storyboards.data = Object.freeze({
    id: 'data', delayMs: 620,
    routes: Object.freeze(dataRoutes),
    frames: Object.freeze(dataFrames),
    limit: 'shore/dashboard is conceptual; packet delivery is not proven'
  });

  const homeFrames = [
    { stage: 1, kind: 'home-gps', gateIndex: 0, boat: [340, 112], label: 'HOME ตั้งแล้ว · GPS valid' },
    { stage: 2, kind: 'entry', gateIndex: 1, outsideStopRadius: true, boat: [330, 112], label: 'เริ่ม RTH นอกวงหยุด · entry > 4 m' },
    { stage: 3, kind: 'departure-dwell', gateIndex: 2, departureMs: 1000, departureDwellSeconds: 1, continuousExampleTime: true, boat: [350, 112], label: 'ออกห่าง ≥ 12 m · 1/2 s ต่อเนื่อง · EXAMPLE' },
    { stage: 4, kind: 'departure-dwell', gateIndex: 2, departureMs: 2000, departureDwellSeconds: 2, continuousExampleTime: true, boat: [365, 112], label: 'ออกห่าง ≥ 12 m · 2/2 s ต่อเนื่อง · ยืนยันออกเดินทาง' },
    { stage: 5, kind: 'approach', gateIndex: 2, boat: [320, 132], label: 'เข้าใกล้ HOME · ภาพ schematic' },
    { stage: 6, kind: 'stop-radius', gateIndex: 3, pwmStopped: true, arrived: false, boat: [260, 112], label: 'ข้ามเข้า ≤ 4 m · หยุด PWM · ยังไม่ arrival' },
    { stage: 7, kind: 'arrival-dwell', gateIndex: 3, arrivalMs: 1000, arrivalDwellSeconds: 1, continuousExampleTime: true, pwmStopped: true, arrived: false, boat: [260, 112], label: 'อยู่ในวง ≤ 4 m · 1/3 s ต่อเนื่อง · EXAMPLE' },
    { stage: 8, kind: 'arrival-dwell', gateIndex: 3, arrivalMs: 2000, arrivalDwellSeconds: 2, continuousExampleTime: true, pwmStopped: true, arrived: false, boat: [260, 112], label: 'อยู่ในวง ≤ 4 m · 2/3 s ต่อเนื่อง · EXAMPLE' },
    { stage: 9, kind: 'arrival-dwell', gateIndex: 3, arrivalMs: 3000, arrivalDwellSeconds: 3, continuousExampleTime: true, pwmStopped: true, arrived: true, boat: [260, 112], label: 'อยู่ในวงครบ 3/3 s ต่อเนื่อง · arrival gate ผ่าน' }
  ].map(frame => Object.freeze(frame));
  storyboards.home = Object.freeze({
    id: 'home', delayMs: 700,
    frames: Object.freeze(homeFrames),
    radiusAloneCompletes: false,
    resetsInterruptedDwell: true,
    limit: 'EXAMPLE time; not linked to OPERATE or boat telemetry'
  });

  storyboards.heading = Object.freeze({
    id: 'heading', delayMs: 720,
    frames: Object.freeze([
      Object.freeze({ stage: 1, current: 0, target: 15, error: 15, currentArrow: 'M128 145 L128 70', angleArc: 'M128 101 A44 44 0 0 1 139 102', label: 'ตัวอย่าง · heading 0° · เป้า 15° · error +15°' }),
      Object.freeze({ stage: 2, current: 5, target: 15, error: 10, currentArrow: 'M128 145 L134 70', angleArc: 'M132 101 A44 44 0 0 1 139 102', label: 'ตัวอย่าง · heading 5° · เป้า 15° · error +10°' }),
      Object.freeze({ stage: 3, current: 10, target: 15, error: 5, currentArrow: 'M128 145 L141 71', angleArc: 'M136 102 A44 44 0 0 1 139 102', label: 'ตัวอย่าง · heading 10° · เป้า 15° · error +5°' }),
      Object.freeze({ stage: 4, current: 15, target: 15, error: 0, currentArrow: 'M128 145 L150 73', angleArc: 'M139 102', label: 'ตัวอย่าง · heading 15° · เป้า 15° · error 0°' })
    ]),
    shortestWrap: Object.freeze({ current: 355, target: 5, error: 10 }),
    limit: 'illustrative frames; not a measurement or controller response'
  });

  storyboards.pid = Object.freeze({
    id: 'pid', delayMs: 700,
    frames: Object.freeze([
      Object.freeze({ stage: 1, focus: 'P', integralReveal: 0, damping: false, label: 'P · ตอบต่อ error ตอนนี้' }),
      Object.freeze({ stage: 2, focus: 'I', integralReveal: 0.35, damping: false, label: 'I · เริ่มสะสม error ตามเวลา' }),
      Object.freeze({ stage: 3, focus: 'I', integralReveal: 0.7, damping: false, label: 'I · สะสมต่อเนื่องในภาพแนวคิด' }),
      Object.freeze({ stage: 4, focus: 'D', integralReveal: 0.7, damping: true, label: 'D · ตอบต่อการเปลี่ยนเพื่อช่วยหน่วง' })
    ]),
    modes: Object.freeze([
      'SPIRAL / RTH · HeadingController PID; D responds to heading error change',
      'GRID · TURN → CAPTURE → TRACK; PI(error) − Kd × compass rate'
    ]),
    limit: 'conceptual curves; no gains or outputs'
  });

  storyboards.pwm = Object.freeze({
    id: 'pwm', delayMs: 620,
    frames: Object.freeze([
      Object.freeze({ stage: 1, node: 'e', position: [32, 47], direction: 'forward', label: 'error e' }),
      Object.freeze({ stage: 2, node: 'PID', position: [109, 47], direction: 'forward', label: 'e → PID' }),
      Object.freeze({ stage: 3, node: 'mixer', position: [194, 47], direction: 'forward', label: 'PID → mixer' }),
      Object.freeze({ stage: 4, node: 'Safety', position: [285, 47], direction: 'forward', label: 'mixer → Safety' }),
      Object.freeze({ stage: 5, node: 'PWM', position: [378, 47], direction: 'forward', label: 'Safety → PWM command' }),
      Object.freeze({ stage: 6, node: 'base+u', position: [344, 98], direction: 'motor-command', label: 'left · base + u · PWM command' }),
      Object.freeze({ stage: 7, node: 'base-u', position: [402, 126], direction: 'motor-command', label: 'right · base − u · PWM command' }),
      Object.freeze({ stage: 8, node: 'boat-yaw', position: [211, 212], direction: 'boat-response', label: 'boat responds · yaw illustration' }),
      Object.freeze({ stage: 9, node: 'compass', position: [211, 291], direction: 'measurement-feedback', label: 'compass measures heading' }),
      Object.freeze({ stage: 10, node: 'feedback', position: [112, 291], direction: 'feedback-to-error', label: 'measured heading → feedback path' }),
      Object.freeze({ stage: 11, node: 'feedback', position: [32, 291], direction: 'feedback-to-error', label: 'feedback continues toward error' }),
      Object.freeze({ stage: 12, node: 'e', position: [32, 80], direction: 'feedback-to-error', label: 'feedback → error e · cycle shown' })
    ]),
    limit: 'command illustration only; not thrust measurement or physical motor response'
  });

  const panels = [
    ['sma', 'ov-sma-plot', 'ตัวอย่าง SMA'], ['spiral', 'ov-spiral-plot', 'เส้นทาง GRID และ SPIRAL'],
    ['data', 'ov-data-flow', 'ทิศทางข้อมูล'], ['home', 'ov-home-radius', 'เงื่อนไข HOME'],
    ['heading', 'ov-heading-dial', 'ตัวอย่าง heading'], ['pid', 'ov-pid-sketch', 'บทบาท P I D'],
    ['pwm', 'ov-pid-flow', 'วงจร PWM และ feedback']
  ];

  function createController(doc, environment) {
    const env = environment || {};
    const setTimer = env.setTimeout || (global && global.setTimeout ? global.setTimeout.bind(global) : setTimeout);
    const clearTimer = env.clearTimeout || (global && global.clearTimeout ? global.clearTimeout.bind(global) : clearTimeout);
    let reducedMotion = Boolean(env.reducedMotion);
    let documentHidden = Boolean(env.documentHidden || (doc && doc.hidden));
    const states = Object.create(null);

    function render(state) {
      if (!state.root) return;
      const frame = state.stage ? state.story.frames[state.stage - 1] : null;
      const { svg, root } = state;
      const setMarker = (position, tone) => {
        if (!state.marker || !position) return;
        state.marker.setAttribute('cx', position[0]);
        state.marker.setAttribute('cy', position[1]);
        state.marker.setAttribute('fill', tone === 'amber' ? '#ffbd69' : '#43d2e8');
        state.marker.setAttribute('display', 'block');
      };
      if (state.id === 'sma') {
        const bars = svg.querySelectorAll('.ov-bars rect');
        bars.forEach((bar, index) => bar.setAttribute('opacity', frame && index !== frame.sampleIndex ? '.32' : '1'));
        const total = root.querySelector('.ov-stat');
        const calculation = root.querySelector('figure figcaption');
        const thresholdNote = root.querySelector('.ov-panel-note');
        const incomplete = frame && frame.mean === null;
        if (total) { total.style.visibility = incomplete ? 'hidden' : ''; total.setAttribute('aria-hidden', incomplete ? 'true' : 'false'); }
        if (calculation) { calculation.style.visibility = ''; calculation.setAttribute('aria-hidden', 'false'); }
        if (thresholdNote) { thresholdNote.style.visibility = ''; thresholdNote.setAttribute('aria-hidden', 'false'); }
        if (state.description) state.description.textContent = incomplete
          ? `Current SMA is incomplete: ${frame.count}/${state.story.samples.length} samples collected.`
          : state.originalDescription;
      } else if (state.id === 'spiral') {
        const targets = svg.querySelectorAll('.ov-spiral-target');
        targets.forEach((target, index) => {
          const active = frame && frame.kind === 'spiral-target' && index === frame.targetIndex;
          target.setAttribute('opacity', frame && frame.kind === 'spiral-target' ? (active ? '1' : '.35') : '1');
          target.setAttribute('r', active ? '6' : '3.2');
        });
        if (frame) setMarker(frame.position, frame.kind === 'spiral-target' ? 'amber' : 'cyan');
        else if (state.marker) state.marker.setAttribute('display', 'none');
      } else if (state.id === 'data' || state.id === 'pwm') {
        if (frame) setMarker(frame.position, frame.tone || 'cyan');
        else if (state.marker) state.marker.setAttribute('display', 'none');
      } else if (state.id === 'home') {
        const boat = svg.querySelector('[data-motion-boat]');
        if (boat) boat.setAttribute('transform', frame
          ? `translate(${frame.boat[0] - 276} ${frame.boat[1] - 133}) translate(276 133)`
          : 'translate(276 133)');
        root.querySelectorAll('.ov-gates li').forEach((gate, index) => gate.classList.toggle('ov-motion-current', Boolean(frame && index === frame.gateIndex)));
        root.querySelectorAll('.ov-dwell span').forEach((cell, index) => cell.classList.toggle('ov-motion-complete', Boolean(frame && frame.arrivalDwellSeconds >= index + 1)));
      } else if (state.id === 'heading') {
        const arrow = svg.querySelector('[data-motion-heading-current]');
        const arc = svg.querySelector('[data-motion-heading-arc]');
        const currentLabel = svg.querySelector('[data-motion-heading-label]');
        const errorLabel = svg.querySelector('[data-motion-heading-error]');
        if (arrow) arrow.setAttribute('d', frame ? frame.currentArrow : 'M128 145 L128 70');
        if (arc) arc.setAttribute('d', frame ? frame.angleArc : 'M128 101 A44 44 0 0 1 139 102');
        if (currentLabel) currentLabel.textContent = `จริง ${frame ? frame.current : 0}°`;
        if (errorLabel) errorLabel.textContent = frame ? `e = ${frame.error > 0 ? '+' : ''}${frame.error}°` : 'e = +15°';
      } else if (state.id === 'pid') {
        svg.querySelectorAll('[data-motion-pid]').forEach(node => node.classList.toggle('ov-motion-current', Boolean(frame && node.getAttribute('data-motion-pid') === frame.focus)));
        root.querySelectorAll('.ov-pid-roles p').forEach((row, index) => row.classList.toggle('ov-motion-current', Boolean(frame && ['P', 'I', 'D'][index] === frame.focus)));
        const integral = svg.querySelector('[data-motion-integral-curve]');
        const area = svg.querySelector('[data-motion-integral-area]');
        if (integral) integral.setAttribute('stroke-dasharray', frame ? `${Math.round(frame.integralReveal * 145)} 500` : '');
        if (area) area.setAttribute('fill-opacity', frame ? String(0.05 + frame.integralReveal * 0.27) : '.32');
      }
      const prefix = state.playing ? 'กำลังเล่น' : state.finished ? 'จบภาพ' : state.stage ? 'พักที่ขั้น' : 'ภาพนิ่ง';
      state.status.textContent = `${prefix} ${state.stage}/${state.story.frames.length}${frame ? ` · ${frame.label}` : ' · กดเล่นหรือถัดไป'}`;
      state.playButton.textContent = state.playing ? 'พัก' : 'เล่น';
      state.playButton.disabled = reducedMotion || documentHidden || !state.visible;
      state.nextButton.disabled = false;
    }

    function clear(state) {
      if (state.timer !== null) clearTimer(state.timer);
      state.timer = null;
    }
    function pauseState(state) {
      clear(state);
      state.playing = false;
      render(state);
    }
    function pauseOthers(id) {
      Object.keys(states).forEach(key => { if (key !== id && states[key].playing) pauseState(states[key]); });
    }
    function advance(state) {
      clear(state);
      if (state.stage < state.story.frames.length) state.stage += 1;
      state.finished = state.stage === state.story.frames.length;
      if (state.finished) state.playing = false;
      render(state);
    }
    function schedule(state) {
      state.timer = setTimer(() => {
        if (!state.playing || documentHidden || reducedMotion || !state.visible) { pauseState(state); return; }
        advance(state);
        if (state.playing) schedule(state);
      }, state.story.delayMs);
    }

    panels.forEach(([id, svgId, title]) => {
      const story = storyboards[id];
      const svg = doc && doc.getElementById(svgId);
      const root = svg && svg.closest('.ov-panel');
      const state = { id, story, svg, root, stage: 0, playing: false, finished: false, timer: null, visible: true, marker: null, status: null, playButton: null, nextButton: null, description: id === 'sma' && svg ? svg.querySelector('desc') : null };
      state.originalDescription = state.description ? state.description.textContent : null;
      states[id] = state;
      if (!root) return;
      if ((id === 'spiral' || id === 'data' || id === 'pwm') && doc.createElementNS) {
        state.marker = doc.createElementNS('http://www.w3.org/2000/svg', 'circle');
        state.marker.setAttribute('class', 'ov-motion-marker');
        state.marker.setAttribute('r', id === 'spiral' ? '7' : '6');
        state.marker.setAttribute('stroke', '#071827');
        state.marker.setAttribute('stroke-width', '2');
        state.marker.setAttribute('display', 'none');
        state.marker.setAttribute('aria-hidden', 'true');
        svg.appendChild(state.marker);
      }
      const controls = doc.createElement('div');
      controls.className = 'ov-motion-controls';
      const heading = doc.createElement('span'); heading.className = 'ov-motion-title'; heading.textContent = title;
      const playButton = doc.createElement('button'); playButton.type = 'button'; playButton.textContent = 'เล่น'; playButton.setAttribute('aria-label', `${title} · เล่นหรือพัก`);
      const nextButton = doc.createElement('button'); nextButton.type = 'button'; nextButton.textContent = 'ถัดไป'; nextButton.setAttribute('aria-label', `${title} · ขั้นถัดไป`);
      const resetButton = doc.createElement('button'); resetButton.type = 'button'; resetButton.textContent = 'เริ่มภาพนิ่ง'; resetButton.setAttribute('aria-label', `${title} · เริ่มภาพนิ่ง`);
      const status = doc.createElement('p'); status.className = 'ov-motion-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.setAttribute('aria-atomic', 'true');
      controls.append(heading, playButton, nextButton, resetButton, status);
      root.appendChild(controls);
      state.status = status; state.playButton = playButton; state.nextButton = nextButton;
      playButton.addEventListener('click', () => state.playing ? pauseState(state) : controller.play(id));
      nextButton.addEventListener('click', () => controller.next(id));
      resetButton.addEventListener('click', () => controller.reset(id));
      render(state);
    });

    const controller = {
      play(id) {
        const state = states[id];
        if (!state || reducedMotion || documentHidden || !state.visible || (doc && !state.root)) return false;
        pauseOthers(id);
        if (state.finished) { state.stage = 0; state.finished = false; }
        state.playing = true;
        if (state.stage === 0) advance(state);
        else render(state);
        if (state.playing) schedule(state);
        return true;
      },
      pause(id) { if (states[id]) pauseState(states[id]); },
      next(id) {
        const state = states[id]; if (!state) return false;
        Object.keys(states).forEach(key => { if (states[key].playing) pauseState(states[key]); });
        if (state.finished) return false;
        advance(state); return true;
      },
      reset(id) {
        const state = states[id]; if (!state) return false;
        pauseState(state); state.stage = 0; state.finished = false; render(state); return true;
      },
      setVisible(id, visible) { const state = states[id]; if (!state) return; state.visible = Boolean(visible); if (!state.visible) pauseState(state); else render(state); },
      setDocumentHidden(hidden) { documentHidden = Boolean(hidden); if (documentHidden) Object.keys(states).forEach(id => pauseState(states[id])); else Object.keys(states).forEach(id => render(states[id])); },
      setReducedMotion(reduced) { reducedMotion = Boolean(reduced); if (reducedMotion) Object.keys(states).forEach(id => pauseState(states[id])); else Object.keys(states).forEach(id => render(states[id])); },
      snapshot() { return Object.freeze(Object.keys(states).map(id => Object.freeze({ id, stage: states[id].stage, total: states[id].story.frames.length, playing: states[id].playing, finished: states[id].finished, visible: states[id].visible }))); }
    };

    if (doc) {
      doc.addEventListener('visibilitychange', () => controller.setDocumentHidden(doc.hidden));
      const media = env.matchMedia ? env.matchMedia('(prefers-reduced-motion: reduce)') : (global && global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null);
      if (media) {
        controller.setReducedMotion(media.matches);
        if (media.addEventListener) media.addEventListener('change', event => controller.setReducedMotion(event.matches));
        else if (media.addListener) media.addListener(event => controller.setReducedMotion(event.matches));
      }
      const Observer = env.IntersectionObserver || (global && global.IntersectionObserver);
      if (Observer) {
        const observer = new Observer(entries => entries.forEach(entry => {
          const state = Object.values(states).find(item => item.root === entry.target);
          if (state) controller.setVisible(state.id, entry.isIntersecting);
        }), { threshold: 0.01 });
        Object.values(states).forEach(state => { if (state.root) observer.observe(state.root); });
      } else if (global && global.addEventListener) {
        const checkViewport = () => Object.values(states).forEach(state => {
          if (!state.root || !state.root.getBoundingClientRect) return;
          const rect = state.root.getBoundingClientRect();
          controller.setVisible(state.id, rect.bottom > 0 && rect.right > 0 && rect.top < global.innerHeight && rect.left < global.innerWidth);
        });
        global.addEventListener('scroll', checkViewport, true);
        global.addEventListener('resize', checkViewport);
      }
    }
    return controller;
  }

  const api = Object.freeze({ storyboards: Object.freeze(storyboards), createController });
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (global && global.document) global.OverallVisualMotion = createController(global.document);
})(typeof window === 'undefined' ? null : window);
