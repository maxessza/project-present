(() => {
  'use strict';
  const HeadingModel = window.HeadingModel;
  const SessionModel = window.SystemExplorerModel;
  const session = SessionModel.createSession(HeadingModel);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const explorer = document.getElementById('explorer');
  const stories = {
    whole: document.getElementById('story-whole'),
    navigation: document.getElementById('story-navigation'),
    heading: document.getElementById('story-heading'),
  };
  const button = id => document.getElementById(id);
  let level = 'whole';
  let playing = false;
  let rafId = null;
  let previousTime = null;
  let accumulator = 0;
  let highlightRafId = null;
  let highlightStart = null;
  let highlightedStage = -1;
  const causeStages = ['target', 'error', 'controller', 'motor', 'feedback'];

  function signed(value, places) {
    const sign = value < 0 ? '−' : '+';
    return `${sign}${Math.abs(value).toFixed(places)}`;
  }

  function setText(id, value) {
    button(id).textContent = value;
  }

  function render() {
    const state = session.snapshot();
    const last = state.lastTransition;
    const error = last ? last.error : HeadingModel.wrapError(state.target, state.model.heading);
    const control = last ? last.control : state.preview;
    const applied = Boolean(last);
    const motor = Math.max(-60, Math.min(60, control.u));
    const extent = Math.abs(motor) / 60 * 107;

    setText('target-bearing-value', `${state.target}°`);
    setText('gain-p-value', state.gains.p.toFixed(2));
    setText('gain-i-value', state.gains.i.toFixed(2));
    setText('gain-d-value', state.gains.d.toFixed(2));
    setText('target-readout', `${state.target}°`);
    setText('actual-heading', `${state.model.heading.toFixed(1)}°`);
    setText('heading-error', `${signed(error, 1)}°`);
    setText('controller-output', control.u.toFixed(1));
    setText('actual-heading-label', applied ? 'ทิศจริงหลังตอบสนอง' : 'ทิศจริงตอนนี้');
    setText('heading-error-label', applied ? 'error ก่อนก้าวล่าสุด' : 'error สำหรับก้าวถัดไป');
    setText('controller-output-label', applied ? 'แรงแก้ที่ใช้ล่าสุด · u' : 'แรงแก้รอบถัดไป · u');
    setText('chain-target', `${state.target}°`);
    setText('chain-error', `${signed(error, 1)}°`);
    setText('chain-control', `u ${control.u.toFixed(1)}`);
    setText('chain-motor', `u ${signed(motor, 1)}`);
    setText('chain-feedback', applied ? `ทิศ ${state.model.heading.toFixed(1)}°` : `รอ · ${state.model.heading.toFixed(1)}°`);
    setText('yaw-label', `ทิศจริง ${state.model.heading.toFixed(1)}°`);
    setText('motor-command-label', `คำสั่ง yaw จำลอง ${signed(motor, 1)} · normalized`);
    button('target-ray').setAttribute('transform', `translate(450 340) rotate(${state.target})`);
    button('yaw-arrow').setAttribute('transform', `translate(450 340) rotate(${state.model.heading})`);
    button('motor-fill').setAttribute('x', String(motor < 0 ? 450 - extent : 450));
    button('motor-fill').setAttribute('width', String(extent));
    for (const [index, name] of causeStages.entries()) {
      const stage = document.querySelector(`[data-cause-stage="${name}"]`);
      stage.classList.toggle('is-active', index === highlightedStage);
      stage.classList.toggle('is-complete', index < highlightedStage);
      stage.setAttribute('aria-current', index === highlightedStage ? 'step' : 'false');
    }
    setText('simulation-status', playing
      ? `กำลังเล่น · ${state.ticks} ก้าว · กดพักเพื่อหยุด`
      : reducedMotion.matches
        ? `ลดการเคลื่อนไหว · ${state.ticks} ก้าว · ใช้ทีละก้าว`
        : state.ticks > 0
          ? `พักอยู่ · ${state.ticks} ก้าว · ค่าทุกช่องมาจาก HeadingModel`
          : 'หยุดอยู่ · ไม่มี autoplay · กดทีละก้าวเพื่อเริ่ม');
    setText('play', playing ? 'พักการเล่น' : 'เล่น');
    button('play').disabled = reducedMotion.matches && !playing;
    button('step').disabled = playing;
  }

  function stopCauseHighlight() {
    if (highlightRafId !== null) cancelAnimationFrame(highlightRafId);
    highlightRafId = null;
    highlightStart = null;
  }

  function startCauseHighlight() {
    stopCauseHighlight();
    highlightedStage = 0;
    if (reducedMotion.matches) {
      highlightedStage = causeStages.length - 1;
      render();
      return;
    }
    render();
    const advance = now => {
      highlightRafId = null;
      if (level !== 'heading') return;
      if (highlightStart === null) highlightStart = now;
      const nextStage = Math.min(causeStages.length - 1, Math.floor((now - highlightStart) / 360));
      if (nextStage !== highlightedStage) {
        highlightedStage = nextStage;
        render();
      }
      if (nextStage < causeStages.length - 1) highlightRafId = requestAnimationFrame(advance);
    };
    highlightRafId = requestAnimationFrame(advance);
  }

  function setLevel(next) {
    if (!Object.hasOwn(stories, next)) return;
    if (level === 'heading' && next !== 'heading') {
      setPlaying(false);
      stopCauseHighlight();
      highlightedStage = -1;
    }
    level = next;
    explorer.dataset.level = level;
    for (const [name, section] of Object.entries(stories)) section.hidden = name !== level;
    button('experiment-details').hidden = level !== 'heading';
    button('experiment-controls').hidden = level !== 'heading';
    button('to-whole').setAttribute('aria-current', level === 'whole' ? 'page' : 'false');
    button('to-navigation').hidden = level === 'whole';
    button('to-navigation').setAttribute('aria-current', level === 'navigation' ? 'page' : 'false');
    button('breadcrumb-separator').hidden = level !== 'heading';
    button('breadcrumb-heading').hidden = level !== 'heading';
    const title = { whole: 'เรือสำรวจเชื่อมโยงถึงฝั่ง', navigation: 'ระบบนำทาง · รู้ทิศก่อนแก้ทิศ', heading: 'แก้ทิศ · เป้าหมายสู่การตอบสนอง' };
    button('main-caption').textContent = title[level];
    const pan = button('scene-pan');
    if (pan.scrollWidth > pan.clientWidth) {
      pan.scrollLeft = level === 'whole' ? 0 : (pan.scrollWidth - pan.clientWidth) / 2;
      pan.scrollTop = level === 'whole' ? 0 : (pan.scrollHeight - pan.clientHeight) / 2;
      window.scrollTo({ top: Math.max(0, explorer.getBoundingClientRect().top + window.scrollY - 12), behavior: 'instant' });
    }
    render();
  }

  function stepOnce() {
    if (playing || level !== 'heading') return;
    session.step();
    startCauseHighlight();
  }

  function frame(now) {
    rafId = null;
    if (!playing || level !== 'heading') return;
    if (previousTime === null) previousTime = now;
    accumulator += Math.min(.1, Math.max(0, (now - previousTime) / 1000));
    previousTime = now;
    while (accumulator >= stateStep() && playing) {
      session.step();
      accumulator -= stateStep();
    }
    render();
    if (playing) rafId = requestAnimationFrame(frame);
  }

  function stateStep() {
    return session.snapshot().dt;
  }

  function setPlaying(on) {
    if (on && (level !== 'heading' || reducedMotion.matches)) return;
    if (on === playing) return;
    playing = on;
    if (playing) {
      stopCauseHighlight();
      highlightedStage = causeStages.length - 1;
    }
    previousTime = null;
    accumulator = 0;
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    if (playing) rafId = requestAnimationFrame(frame);
    render();
  }

  button('enter-navigation').addEventListener('click', () => setLevel('navigation'));
  button('enter-heading').addEventListener('click', () => setLevel('heading'));
  button('to-whole').addEventListener('click', () => setLevel('whole'));
  button('to-navigation').addEventListener('click', () => setLevel('navigation'));

  button('target-bearing').addEventListener('input', event => {
    session.setTarget(event.currentTarget.valueAsNumber);
    stopCauseHighlight();
    highlightedStage = -1;
    render();
  });
  for (const term of ['p', 'i', 'd']) {
    button(`gain-${term}`).addEventListener('input', event => {
      session.setGain(term, event.currentTarget.valueAsNumber);
      stopCauseHighlight();
      highlightedStage = -1;
      render();
    });
  }
  button('step').addEventListener('click', stepOnce);
  button('play').addEventListener('click', () => setPlaying(!playing));
  button('reset').addEventListener('click', () => {
    setPlaying(false);
    stopCauseHighlight();
    session.reset();
    highlightedStage = -1;
    render();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      setPlaying(false);
      stopCauseHighlight();
    }
  });
  window.addEventListener('pagehide', () => {
    setPlaying(false);
    stopCauseHighlight();
  });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) {
      setPlaying(false);
      stopCauseHighlight();
      highlightedStage = causeStages.length - 1;
    }
    render();
  });

  window.SystemExplorer = {
    snapshot: () => ({ ...session.snapshot(), level, playing, activeLoop: rafId === null ? 0 : 1, highlightLoop: highlightRafId === null ? 0 : 1, highlightedStage: highlightedStage < 0 ? null : causeStages[highlightedStage], reduced: reducedMotion.matches }),
  };
  setLevel('whole');
})();
