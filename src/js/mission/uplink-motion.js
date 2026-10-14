(function (root, factory) {
  const api = factory();
  if (root && root.document) root.UplinkMotion = api.install(root.document, root);
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const PACKET_BYTES = 38;
  const STAGE_INDEX = { sample: 0, build: 1, io: 2, transmit: 3, retry: 3, decode: 4, shore: 5 };
  const PHASE_LABEL = {
    idle: ['พร้อมส่ง', 'ปรับค่าแล้วกดส่ง เพื่อเริ่มหนึ่งรอบ'],
    sample: ['① เก็บตัวอย่างแล้ว', 'snapshot นี้จะไม่เปลี่ยนระหว่างส่ง'],
    build: ['② สร้าง TelemetryPacket · 38 B', 'จัด byte ตาม packed little-endian'],
    io: ['③ เตรียม MessageChannel', 'ส่ง ArrayBuffer ไปยัง receiver แยก callback'],
    transmit: ['④ packet กำลังเดินทาง', 'ภาพคลื่นและการ drop เป็นแบบจำลอง'],
    retry: ['ส่งซ้ำด้วย packet เดิม', 'sequence และ bytes คงเดิม · ไม่สร้าง sample ใหม่'],
    decode: ['⑤ receiver ถอดรหัสแล้ว', 'จอฝั่งยังรอผลจาก callback'],
    shore: ['⑥ ฝั่งแสดงค่าที่ decode ได้', 'ค่าบนจอมาจาก ArrayBuffer ที่รับจริง'],
    failed: ['ส่งไม่สำเร็จ', 'ครบ 3 attempts · จอคงค่ารับล่าสุด'],
    paused: ['หยุดชั่วคราว', 'กลับมาพร้อมแล้วกดส่งใหม่เอง'],
    invalid: ['packet length ไม่ถูกต้อง', 'receiver ปฏิเสธข้อมูล · จอไม่เปลี่ยน']
  };

  function encodeTelemetry(packet) {
    const buffer = new ArrayBuffer(PACKET_BYTES);
    const view = new DataView(buffer);
    view.setUint32(0, packet.sequence_number >>> 0, true);
    view.setFloat64(4, packet.gps_lat, true);
    view.setFloat64(12, packet.gps_lon, true);
    view.setFloat32(20, packet.water_ph, true);
    view.setFloat32(24, packet.water_turbidity, true);
    view.setFloat32(28, packet.water_temp, true);
    view.setUint8(32, packet.current_mode);
    view.setUint8(33, packet.battery_percent);
    view.setFloat32(34, packet.heading_angle, true);
    return buffer;
  }

  function decodeTelemetry(buffer) {
    if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== PACKET_BYTES) return null;
    const view = new DataView(buffer);
    return {
      sequence_number: view.getUint32(0, true),
      gps_lat: view.getFloat64(4, true),
      gps_lon: view.getFloat64(12, true),
      water_ph: view.getFloat32(20, true),
      water_turbidity: view.getFloat32(24, true),
      water_temp: view.getFloat32(28, true),
      current_mode: view.getUint8(32),
      battery_percent: view.getUint8(33),
      heading_angle: view.getFloat32(34, true)
    };
  }

  function install(doc, win) {
    const root = doc.getElementById('uplink-motion');
    if (!root) return null;
    const get = id => doc.getElementById(id);
    const slider = get('um-turbidity');
    const modeInput = get('um-mode');
    const dropInput = get('um-drop-first');
    const linkOffInput = get('um-link-off');
    const sendButton = get('um-send');
    const resetButton = get('um-reset');
    const packetNode = get('um-packet');
    const reducedMotion = Boolean(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);
    let generation = 0;
    let timers = new Set();
    let animationFrame = null;
    let channel = null;
    let activeRun = null;
    let currentPromise = null;
    let currentResolve = null;
    let destroyed = false;

    let state = initialState();
    function initialState() {
      return { phase: 'idle', outcome: 'idle', sequence: 0, sample: null, decoded: null,
        attempts: [], receiverCallbacks: 0, decodedUpdates: 0, senderDetached: false,
        senderByteLengthAfterTransfer: null, wireHex: '', shoreValue: null, invalidLengthRejected: false,
        inFlight: false, eventNo: 0, eventLog: [] };
    }

    function formatNumber(value) {
      if (!Number.isFinite(value)) return 'NaN';
      return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
    }
    function hex(buffer) {
      return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, '0')).join(' ');
    }
    function renderBytes(id, buffer) {
      const holder = get(id);
      holder.replaceChildren();
      Array.from(new Uint8Array(buffer)).forEach((byte, index) => {
        const cell = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
        cell.setAttribute('x', String((index % 19) * 7));
        cell.setAttribute('y', String(Math.floor(index / 19) * 10));
        cell.setAttribute('width', '5');
        cell.setAttribute('height', '7');
        cell.setAttribute('rx', '1');
        cell.dataset.byte = String(byte);
        cell.setAttribute('fill', byte ? `hsl(170 65% ${35 + byte * 0.16}%)` : '#2a4b59');
        cell.style.animationDelay = `${index * 9}ms`;
        holder.appendChild(cell);
      });
    }
    function setPacketPosition(x) {
      packetNode.setAttribute('transform', `translate(${x} 178)`);
    }
    function setPacketLost(lost) { packetNode.classList.toggle('is-lost', Boolean(lost)); }

    function setPhase(phase, note) {
      state.phase = phase;
      root.dataset.phase = phase;
      get('um-phase-label').textContent = (PHASE_LABEL[phase] || PHASE_LABEL.idle)[0];
      get('um-phase-note').textContent = note || (PHASE_LABEL[phase] || PHASE_LABEL.idle)[1];
      const current = STAGE_INDEX[phase];
      root.querySelectorAll('.um-steps [data-stage]').forEach((item, index) => {
        item.classList.toggle('is-done', Number.isInteger(current) && index < current);
        if (Number.isInteger(current) && index === current) item.setAttribute('aria-current', 'step');
        else item.removeAttribute('aria-current');
      });
    }

    function appendEvent(message) {
      state.eventNo += 1;
      const text = `${state.eventNo}. ${message}`;
      state.eventLog.push(text);
      if (state.eventLog.length > 20) state.eventLog.shift();
      const list = get('um-events');
      list.textContent = '';
      state.eventLog.forEach(line => {
        const item = doc.createElement('li');
        item.textContent = line;
        list.appendChild(item);
      });
    }

    function updateInputPreview() {
      get('um-input-value').textContent = slider.value;
      if (!state.inFlight) get('um-svg-value').textContent = `${slider.value} NTU`;
    }

    function renderInspector() {
      get('um-sequence').textContent = state.sequence ? `SEQ ${state.sequence}` : 'SEQ —';
      get('um-byte-count').textContent = state.wireHex ? '38 B' : '38 B';
      get('um-byte-string').textContent = state.wireHex || 'ยังไม่มี packet';
      get('um-decoded-sequence').textContent = state.decoded ? String(state.decoded.sequence_number) : '—';
      get('um-decoded-turbidity').textContent = state.decoded ? formatNumber(state.decoded.water_turbidity) : '—';
      get('um-decoded-mode').textContent = state.decoded ? String(state.decoded.current_mode) : '—';
      get('um-decode-count').textContent = String(state.decodedUpdates);
    }

    function markStale(value) {
      get('um-stale').hidden = !value;
    }

    function updateShore(decoded) {
      // This is the only path that paints a received turbidity value.
      const turbidity = decoded.water_turbidity;
      state.shoreValue = Number.isFinite(turbidity) ? turbidity : null;
      if (Number.isFinite(turbidity)) {
        const clamped = Math.max(0, Math.min(100, turbidity));
        get('um-gauge-fill').setAttribute('width', String(108 * clamped / 100));
        get('um-gauge-fill').setAttribute('x', String(-54));
        get('um-svg-value').textContent = `${formatNumber(turbidity)} NTU`;
        doc.querySelector('[data-testid="shore-value"]').textContent = formatNumber(turbidity);
        doc.querySelector('[data-testid="shore-svg-value"]').textContent = formatNumber(turbidity);
      } else {
        get('um-gauge-fill').setAttribute('width', '0');
        get('um-svg-value').textContent = 'NaN · STANDBY';
        doc.querySelector('[data-testid="shore-value"]').textContent = 'NaN · STANDBY';
        doc.querySelector('[data-testid="shore-svg-value"]').textContent = 'NaN';
      }
      markStale(false);
      state.decodedUpdates += 1;
      renderInspector();
    }

    function schedule(fn, delay, runId) {
      const id = win.setTimeout(() => {
        timers.delete(id);
        if (destroyed || runId !== generation) return;
        fn();
      }, delay);
      timers.add(id);
      return id;
    }

    function clearPending() {
      timers.forEach(id => win.clearTimeout(id));
      timers.clear();
      if (animationFrame !== null && win.cancelAnimationFrame) win.cancelAnimationFrame(animationFrame);
      animationFrame = null;
      if (channel) {
        try { channel.port1.onmessage = null; channel.port2.onmessage = null; channel.port1.close(); channel.port2.close(); } catch (_) { /* already closed */ }
      }
      channel = null;
    }

    function closeRun(result) {
      state.inFlight = false;
      activeRun = null;
      sendButton.disabled = false;
      if (channel) {
        try { channel.port1.onmessage = null; channel.port2.onmessage = null; channel.port1.close(); channel.port2.close(); } catch (_) { /* already closed */ }
      }
      channel = null;
      const resolve = currentResolve;
      currentResolve = null;
      currentPromise = null;
      if (resolve) resolve(result);
    }

    function animatePacket(fromX, toX, duration, runId, done) {
      if (reducedMotion || !win.requestAnimationFrame) {
        setPacketPosition(toX);
        schedule(done, 160, runId);
        return;
      }
      const startAt = win.performance.now();
      const frame = now => {
        if (destroyed || runId !== generation) return;
        const t = Math.min(1, (now - startAt) / duration);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        setPacketPosition(fromX + (toX - fromX) * eased);
        if (t < 1) animationFrame = win.requestAnimationFrame(frame);
        else { animationFrame = null; done(); }
      };
      animationFrame = win.requestAnimationFrame(frame);
    }

    function finishFailure(run, reason) {
      if (run.id !== generation || !state.inFlight) return;
      state.outcome = 'failed';
      root.dataset.outcome = 'failed';
      setPhase('failed', reason || 'ครบ 3 attempts · จอคงค่ารับล่าสุด');
      setPacketLost(true);
      markStale(state.decoded !== null);
      appendEvent(`sequence ${run.packet.sequence_number}: failed after ${run.attemptNumber} attempts`);
      closeRun({ outcome: 'failed', attempts: run.attemptNumber, sequence: run.packet.sequence_number });
    }

    function beginRetry(run, reason) {
      if (run.id !== generation || !state.inFlight) return;
      if (run.attemptNumber >= 3) {
        finishFailure(run, reason || 'ครบ 3 attempts · จอคงค่ารับล่าสุด');
        return;
      }
      setPhase('retry');
      setPacketLost(true);
      appendEvent(`${reason}; retry ${run.attemptNumber + 1}/3 ด้วย sequence ${run.packet.sequence_number}`);
      schedule(() => {
        setPacketPosition(145);
        setPacketLost(false);
        schedule(() => runAttempt(run, run.attemptNumber + 1), reducedMotion ? 120 : 260, run.id);
      }, reducedMotion ? 120 : 300, run.id);
    }

    function receiverCallback(event, run) {
      if (run.id !== generation || !state.inFlight || activeRun !== run) return;
      state.receiverCallbacks += 1;
      const attempt = run.attemptNumber;
      const record = state.attempts[attempt - 1];
      if (record) record.receiverCallback = true;
      const decoded = decodeTelemetry(event.data);
      if (!decoded) {
        state.invalidLengthRejected = true;
        appendEvent(`receiver rejected ${event.data && event.data.byteLength} B; expected ${PACKET_BYTES} B`);
        beginRetry(run, 'receiver ปฏิเสธ length');
        return;
      }
      if (record) record.accepted = true;
      state.decoded = decoded;
      renderBytes('um-received-cells', event.data);
      setPhase('decode');
      appendEvent(`receiver callback decoded sequence ${decoded.sequence_number} · ${formatNumber(decoded.water_turbidity)} NTU`);
      renderInspector();
      schedule(() => {
        if (run.id !== generation || !state.inFlight) return;
        updateShore(decoded);
        state.outcome = 'received';
        root.dataset.outcome = 'received';
        setPhase('shore');
        setPacketLost(true);
        appendEvent(`shore rendered decoded sequence ${decoded.sequence_number}`);
        closeRun({ outcome: 'received', sequence: decoded.sequence_number, decoded: Object.assign({}, decoded) });
      }, reducedMotion ? 100 : 520, run.id);
    }

    function runAttempt(run, attemptNumber) {
      if (run.id !== generation || !state.inFlight) return;
      run.attemptNumber = attemptNumber;
      state.attempts.push({ sequence: run.packet.sequence_number, attempt: attemptNumber, bytesHex: run.wireHex,
        receiverCallback: false, accepted: false });
      setPhase(attemptNumber === 1 ? 'transmit' : 'retry', `attempt ${attemptNumber}/3 · sequence ${run.packet.sequence_number} · bytes เดิม`);
      setPacketLost(false);
      const modeledDrop = run.linkOff || (run.dropFirst && attemptNumber === 1);
      animatePacket(145, modeledDrop ? 650 : 790, reducedMotion ? 0 : 1260, run.id, () => {
        if (run.id !== generation || !state.inFlight || !channel) return;
        if (modeledDrop) {
          state.attempts[attemptNumber - 1].modeledDrop = true;
          setPacketLost(true);
          appendEvent(`attempt ${attemptNumber}: modeled loss before transport; no receiver delivery`);
          beginRetry(run, run.linkOff ? 'ลิงก์จำลองปิด' : 'drop ครั้งแรก');
          return;
        }
        const transfer = attemptNumber === 1 ? run.encodedBuffer : run.wireBytes.slice().buffer;
        try {
          channel.port1.postMessage(transfer, [transfer]);
          if (attemptNumber === 1) {
            state.senderDetached = run.encodedBuffer.byteLength === 0;
            state.senderByteLengthAfterTransfer = run.encodedBuffer.byteLength;
          }
          appendEvent(`attempt ${attemptNumber}: transferred ${PACKET_BYTES} B over MessageChannel`);
        } catch (error) {
          appendEvent(`MessageChannel transfer error: ${error.message}`);
          finishFailure(run, 'ส่งผ่าน MessageChannel ไม่สำเร็จ');
        }
      });
    }

    function send() {
      if (state.inFlight && currentPromise) return currentPromise;
      if (destroyed) return Promise.resolve({ outcome: 'destroyed' });
      const numeric = Number(slider.value);
      const mode = modeInput.value === 'standby' ? 0 : 1;
      const seq = state.sequence + 1;
      const previous = state;
      state = Object.assign(initialState(), { sequence: seq, receiverCallbacks: previous.receiverCallbacks,
        decodedUpdates: previous.decodedUpdates, shoreValue: previous.shoreValue, decoded: previous.decoded,
        wireHex: previous.wireHex, eventNo: previous.eventNo, eventLog: previous.eventLog.slice(), outcome: 'sending', inFlight: true,
        sample: { turbidity: mode === 0 ? NaN : numeric, selectedTurbidity: numeric, mode } });
      generation += 1;
      const runId = generation;
      state.sequence = seq;
      root.dataset.outcome = 'sending';
      sendButton.disabled = true;
      setPacketPosition(145);
      setPacketLost(true);
      markStale(state.decoded !== null);
      get('um-input-value').textContent = slider.value;
      get('um-svg-value').textContent = mode === 0 ? 'NaN · STANDBY' : `${formatNumber(numeric)} NTU`;
      get('um-svg-value').textContent = mode === 0 ? 'STANDBY · NaN' : `${formatNumber(numeric)} NTU`;
      get('um-sensor-node').classList.toggle('is-standby', mode === 0);
      doc.querySelector('[data-testid="sample-value"]').textContent = mode === 0 ? 'NaN · STANDBY' : `${formatNumber(numeric)} NTU`;
      get('um-sequence').textContent = `SEQ ${seq}`;

      const water = mode === 0 ? NaN : numeric;
      const packet = { sequence_number: seq, gps_lat: NaN, gps_lon: NaN, water_ph: mode === 0 ? NaN : 7.2,
        water_turbidity: water, water_temp: mode === 0 ? NaN : 22.5, current_mode: mode,
        battery_percent: 82, heading_angle: NaN };
      const run = { id: runId, packet, dropFirst: dropInput.checked, linkOff: linkOffInput.checked,
        attemptNumber: 0, encodedBuffer: null, wireBytes: null, wireHex: '' };
      activeRun = run;
      currentPromise = new Promise(resolve => { currentResolve = resolve; });
      setPhase('sample');
      appendEvent(`snapshot sample ${formatNumber(water)} NTU · sequence ${seq}`);
      renderInspector();
      schedule(() => {
        setPhase('build');
        run.encodedBuffer = encodeTelemetry(packet);
        run.wireBytes = new Uint8Array(run.encodedBuffer).slice();
        run.wireHex = hex(run.wireBytes.buffer);
        renderBytes('um-byte-cells', run.encodedBuffer);
        state.wireHex = run.wireHex;
        state.outcome = 'sending';
        renderInspector();
        appendEvent('encoded packed TelemetryPacket · 38 B');
        schedule(() => {
          setPhase('io');
          if (typeof win.MessageChannel !== 'function') {
            finishFailure(run, 'MessageChannel ไม่มีใน browser');
            return;
          }
          channel = new win.MessageChannel();
          channel.port2.onmessage = event => receiverCallback(event, run);
          if (channel.port2.start) channel.port2.start();
          appendEvent('receiver port ready');
          schedule(() => runAttempt(run, 1), 470, run.id);
        }, 550, run.id);
      }, 650, runId);
      return currentPromise;
    }

    function cancelFlight(reason) {
      if (!state.inFlight) return;
      const oldRun = activeRun;
      generation += 1;
      clearPending();
      setPacketLost(true);
      state.inFlight = false;
      state.outcome = reason;
      root.dataset.outcome = reason;
      setPhase(reason === 'paused' ? 'paused' : 'failed');
      markStale(state.decoded !== null);
      sendButton.disabled = false;
      activeRun = null;
      const resolve = currentResolve;
      currentResolve = null;
      currentPromise = null;
      if (resolve) resolve({ outcome: reason, sequence: oldRun ? oldRun.packet.sequence_number : state.sequence });
    }

    function reset() {
      generation += 1;
      clearPending();
      if (currentResolve) currentResolve({ outcome: 'reset' });
      currentResolve = null;
      currentPromise = null;
      activeRun = null;
      state = initialState();
      get('um-events').replaceChildren();
      root.dataset.outcome = 'idle';
      slider.value = '42';
      get('um-input-value').textContent = slider.value;
      setPacketPosition(145);
      setPacketLost(true);
      get('um-gauge-fill').setAttribute('width', '0');
      get('um-byte-cells').replaceChildren();
      get('um-received-cells').replaceChildren();
      get('um-svg-value').textContent = `${slider.value} NTU`;
      doc.querySelector('[data-testid="sample-value"]').textContent = '—';
      doc.querySelector('[data-testid="shore-value"]').textContent = '—';
      doc.querySelector('[data-testid="shore-svg-value"]').textContent = '—';
      get('um-input-value').textContent = slider.value;
      get('um-byte-count').textContent = '38 B';
      markStale(false);
      dropInput.checked = false;
      linkOffInput.checked = false;
      modeInput.value = 'grid';
      sendButton.disabled = false;
      setPhase('idle');
      renderInspector();
    }

    function verifyInvalidLength() {
      if (state.inFlight) return Promise.resolve({ accepted: false, skipped: true });
      const before = doc.querySelector('[data-testid="shore-value"]').textContent;
      return new Promise(resolve => {
        const probe = new win.MessageChannel();
        const finish = event => {
          const decoded = decodeTelemetry(event.data);
          state.receiverCallbacks += 1;
          state.invalidLengthRejected = !decoded && event.data.byteLength !== PACKET_BYTES;
          appendEvent(`verification probe ${event.data.byteLength} B · ${state.invalidLengthRejected ? 'rejected' : 'unexpected length'}`);
          probe.port1.onmessage = null;
          probe.port2.onmessage = null;
          probe.port1.close();
          probe.port2.close();
          resolve({ accepted: Boolean(decoded), invalidLengthRejected: state.invalidLengthRejected,
            shoreUnchanged: doc.querySelector('[data-testid="shore-value"]').textContent === before });
        };
        probe.port2.onmessage = finish;
        if (probe.port2.start) probe.port2.start();
        const invalid = new ArrayBuffer(PACKET_BYTES - 1);
        probe.port1.postMessage(invalid, [invalid]);
      });
    }

    slider.addEventListener('input', updateInputPreview);
    slider.addEventListener('change', updateInputPreview);
    sendButton.addEventListener('click', send);
    resetButton.addEventListener('click', reset);
    const visibilityChange = () => { if (doc.hidden) cancelFlight('paused'); };
    doc.addEventListener('visibilitychange', visibilityChange);
    const pageHide = () => { if (state.inFlight) cancelFlight('paused'); };
    win.addEventListener('pagehide', pageHide);

    setPacketPosition(145);
    setPacketLost(true);
    updateInputPreview();
    renderInspector();

    return Object.freeze({
      snapshot() {
        return { phase: state.phase, outcome: state.outcome, sequence: state.sequence,
          sample: state.sample ? { turbidity: state.sample.turbidity, selectedTurbidity: state.sample.selectedTurbidity, mode: state.sample.mode } : null,
          decoded: state.decoded ? Object.assign({}, state.decoded) : null,
          attempts: state.attempts.map(attempt => Object.assign({}, attempt)), receiverCallbacks: state.receiverCallbacks,
          decodedUpdates: state.decodedUpdates, senderDetached: state.senderDetached,
          senderByteLengthAfterTransfer: state.senderByteLengthAfterTransfer, wireHex: state.wireHex,
          shoreValue: state.shoreValue, invalidLengthRejected: state.invalidLengthRejected, inFlight: state.inFlight,
          eventLog: state.eventLog.slice(), pendingTimerCount: timers.size, hasOpenChannel: Boolean(channel) };
      },
      send,
      reset,
      verifyInvalidLength,
      destroy() {
        destroyed = true;
        cancelFlight('paused');
        clearPending();
        doc.removeEventListener('visibilitychange', visibilityChange);
        win.removeEventListener('pagehide', pageHide);
      }
    });
  }

  return Object.freeze({ install, encodeTelemetry, decodeTelemetry, PACKET_BYTES });
});
