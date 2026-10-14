(function () {
  'use strict';
  const model = window.OverallLabsModel;
  if (!model) throw new Error('OverallLabsModel must load before overall-labs.js');
  const get = id => document.getElementById(id);
  let labAnnouncementTimer = null;
  let rthAnnouncementTimer = null;

  function announce(id, message, timerName) {
    const element = get(id);
    const timer = timerName === 'lab' ? labAnnouncementTimer : rthAnnouncementTimer;
    if (typeof window.clearTimeout === 'function' && timer !== null) window.clearTimeout(timer);
    if (typeof window.setTimeout === 'function') {
      const next = window.setTimeout(() => { element.textContent = message; }, 400);
      if (timerName === 'lab') labAnnouncementTimer = next;
      else rthAnnouncementTimer = next;
    } else element.textContent = message;
  }

  function numberField(id) {
    const raw = get(id).value;
    return String(raw).trim() === '' ? Number.NaN : Number(raw);
  }

  function formatNumber(value) {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }

  function sampleErrorText(error) {
    if (!error) return '';
    if (error === 'uninitialized-baseline') {
      return 'Combined mode needs a positive learned baseline. This lab omits EMA initialization that seeds a nonpositive baseline from the current SMA.';
    }
    return ({
      '': '', incomplete: 'ต้องมีข้อมูลครบ 8 ค่า · ข้อมูลบางส่วนแสดง mean ได้แต่ไม่ trigger',
      'empty-slot': 'มีช่องตัวอย่างว่าง · เติมค่าทุกช่องโดยไม่เว้น comma',
      'invalid-number': 'พบค่าที่ไม่ใช่ตัวเลข finite · ไม่รับ NaN หรือ Infinity',
      negative: 'ค่า NTU ต้องไม่ติดลบ', 'too-many-samples': 'มีมากกว่า 8 ค่า · ลบส่วนเกินก่อนประเมิน',
      'invalid-baseline': 'baseline ต้องเป็นตัวเลข finite ตั้งแต่ 0 NTU ขึ้นไป',
      'invalid-dwell': 'dwell ต้องเป็นตัวเลข finite ตั้งแต่ 0 วินาทีขึ้นไป',
      'invalid-mode': 'เลือก predicate mode ที่รองรับ'
    })[error] || 'ข้อมูลนำเข้าไม่ผ่านการตรวจสอบ';
  }

  function renderWhatIf() {
    const parsed = model.parseSamples(get('lab-samples').value);
    const result = model.evaluateWhatIf({
      samples: parsed.samples,
      sampleError: parsed.error,
      mode: get('lab-mode').value,
      baseline: numberField('lab-baseline'),
      dwellSeconds: numberField('lab-dwell'),
      passedWp1: get('lab-passed-wp1').checked,
      grid: get('lab-grid').checked,
      safety: get('lab-safety').checked
    });
    const error = result.error || parsed.error;
    get('lab-ready').textContent = result.ready ? 'พร้อม · SMA(8) ครบ' : 'ยังไม่พร้อม';
    get('lab-mean').textContent = result.mean === null ? '—' : formatNumber(result.mean) + ' NTU · ' + result.count + ' ค่า';
    get('lab-absolute').textContent = result.ready ? (result.absolutePass ? 'ผ่าน' : 'ไม่ผ่าน · ต้อง > 50') : 'รอข้อมูลครบ';
    const delta = result.mean === null ? null : result.mean - numberField('lab-baseline');
    get('lab-relative').textContent = delta === null || !Number.isFinite(delta)
      ? 'คำนวณไม่ได้' : formatNumber(delta) + ' NTU · ' + (result.baselinePass ? 'ผ่าน baseline dwell' : 'ไม่ผ่านหรือยังไม่ครบเวลา');
    const nextText = {
      'stay-grid': 'ไม่ trigger · คง GRID_PATROL',
      'blocked-wp1': 'trigger แล้ว · รอผ่าน WP1',
      'blocked-grid': 'trigger แล้ว · FSM ไม่ได้อยู่ GRID',
      'blocked-safety': 'trigger แล้ว · safety gate ยังไม่ผ่าน',
      'spiral-mapping': 'trigger และ gate ครบ · ตัวอย่างถัดไป SPIRAL_MAPPING'
    }[result.nextResult];
    get('lab-next').textContent = nextText;
    const reason = result.branch === 'absolute'
      ? 'เข้า absolute branch: มี 8 ค่าและ mean > 50 NTU'
      : result.branch === 'baseline-dwell'
        ? 'เข้า baseline branch: mean > 10, สูงกว่า baseline > 10 และ dwell ≥ 4 s'
        : result.ready ? 'ไม่มี predicate ที่ผ่าน · ตรวจ mean, baseline และ dwell' : 'ต้องมี 8 ค่าที่ valid ก่อนจึงจะ trigger ได้';
    get('lab-reason').textContent = reason;
    get('lab-error').textContent = sampleErrorText(error);
    announce('lab-announcement', reason + '. ' + nextText, 'lab');
  }

  for (const id of ['lab-samples', 'lab-mode', 'lab-baseline', 'lab-dwell', 'lab-passed-wp1', 'lab-grid', 'lab-safety']) {
    get(id).addEventListener('input', renderWhatIf);
    get(id).addEventListener('change', renderWhatIf);
  }
  const presets = {
    below: {samples: Array(8).fill(45).join(', '), mode: 'absolute-only'},
    equal: {samples: Array(8).fill(50).join(', '), mode: 'absolute-only'},
    above: {samples: Array(8).fill(51).join(', '), mode: 'absolute-only'},
    baseline: {samples: Array(8).fill(50).join(', '), mode: 'combined', baseline: '39', dwell: '4'},
    incomplete: {samples: '50, 50, 50', mode: 'absolute-only'}
  };
  document.querySelectorAll('[data-lab-preset]').forEach(button => button.addEventListener('click', () => {
    const preset = presets[button.dataset.labPreset];
    if (!preset) return;
    get('lab-samples').value = preset.samples;
    get('lab-mode').value = preset.mode;
    if (preset.baseline !== undefined) get('lab-baseline').value = preset.baseline;
    if (preset.dwell !== undefined) get('lab-dwell').value = preset.dwell;
    renderWhatIf();
  }));
  renderWhatIf();

  let rthState = model.createRthState();
  function rthInputs() {
    return {
      homeSet: get('rth-home-set').checked,
      fixValid: get('rth-fix-valid').checked,
      entryDistanceM: get('rth-entry-distance').value,
      distanceM: get('rth-distance').value
    };
  }
  function renderRth() {
    const outside = rthState.outsideSeconds * 1000;
    const inside = rthState.insideSeconds * 1000;
    get('rth-outside-ms').textContent = outside + ' / 2000 ms';
    get('rth-inside-ms').textContent = inside + ' / 3000 ms';
    get('rth-departed').textContent = rthState.departed ? 'latch ค้างจนกด reset' : 'ยังไม่ latch';
    get('rth-arrived').textContent = rthState.arrived ? 'ผ่าน · FSM อาจออกจาก RTH' : 'ยังไม่ผ่าน';
    get('rth-radius-status').textContent = !rthState.valid
      ? 'ระยะไม่ valid · ใช้ตัดสินเงื่อนไขไม่ได้'
      : rthState.distanceStopsMotors
        ? 'distance ≤ 4 m เป็นจริง · นี่เป็นเพียงเงื่อนไขระยะสำหรับหยุดมอเตอร์'
        : 'distance ≤ 4 m ยังไม่เป็นจริง · motor-stop distance condition ไม่ผ่าน';
    get('rth-reason').textContent = rthState.reason;
    announce('rth-announcement', rthState.reason, 'rth');
  }
  const rthInputIds = ['rth-home-set', 'rth-fix-valid', 'rth-entry-distance', 'rth-distance'];
  for (const id of rthInputIds) {
    get(id).addEventListener('input', () => { rthState = model.updateRth(rthState, rthInputs(), false); renderRth(); });
    get(id).addEventListener('change', () => { rthState = model.updateRth(rthState, rthInputs(), false); renderRth(); });
  }
  get('rth-tick').addEventListener('click', () => {
    rthState = model.updateRth(rthState, rthInputs(), true);
    renderRth();
  });
  get('rth-reset').addEventListener('click', () => {
    get('rth-home-set').checked = false;
    get('rth-fix-valid').checked = false;
    get('rth-entry-distance').value = '20';
    get('rth-distance').value = '20';
    rthState = model.createRthState();
    renderRth();
  });
  renderRth();
})();
