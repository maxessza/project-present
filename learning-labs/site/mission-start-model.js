(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MissionStartModel = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const STEPS = Object.freeze([
    { title: 'เปิดระบบ', caption: 'เปิดไฟเลี้ยงและตรวจความพร้อมของระบบ', phase: 'power' },
    { title: 'รอ GPS', caption: 'เรือรอพิกัดที่ใช้เริ่มภารกิจ · มอเตอร์ยังไม่ทำงาน', phase: 'gps' },
    { title: 'กำหนด HOME', caption: 'บันทึกจุดกลับบ้านก่อนออกเดินทาง', phase: 'home' },
    { title: 'กริด 3 × 3 · 9 จุด', caption: 'WP1–WP3 ใกล้สถานี · กวาดลง–ขึ้น–ลงไปแนวกลางและแนวไกล', phase: 'route' },
    { title: 'รอ START จากฝั่ง', caption: 'คำสั่งจากผู้ควบคุมยังไม่มา · เรือคงอยู่ที่ HOME', phase: 'wait-start' },
    { title: 'ผ่าน readiness gate', caption: 'ตัวอย่างนี้ผ่านเงื่อนไข GPS, HOME และเส้นทาง', phase: 'ready' },
    { title: 'เปิดมอเตอร์', caption: 'มอเตอร์เริ่มทำงานหลังรับ START ที่ผ่าน gate', phase: 'motors' },
    { title: 'มุ่งหน้า WP1', caption: 'เรือเริ่มเคลื่อนจาก HOME ไปยัง waypoint แรก', phase: 'wp1' }
  ]);

  function createState() {
    return { step: 0, gpsReady: false, homeSet: false, routeReady: false,
      acceptedStart: false, status: 'ready', message: 'เริ่มทัวร์เพื่อดูตัวอย่างลำดับการเตรียมเรือ' };
  }
  function copy(state, changes) { return Object.assign({}, state, changes); }
  function advance(state) {
    if (state.step === 1 && !state.gpsReady) return copy(state, { status: 'waiting-gps', message: 'ยังไม่มี GPS พร้อมใช้ · เรือจึงรออยู่ที่จุดเริ่มต้น' });
    if (state.step === 4) return copy(state, { status: 'waiting-start', message: 'รอคำสั่ง START จากฝั่ง · กด START จำลองเมื่อพร้อม' });
    if (state.step >= 7) return copy(state, { status: 'complete', message: 'ถึง WP1 แล้ว · ทัวร์ตัวอย่างจบ' });
    const step = state.step + 1;
    return copy(state, {
      step,
      homeSet: state.homeSet || step >= 2,
      routeReady: state.routeReady || step >= 3,
      status: step === 7 ? 'complete' : step === 4 ? 'waiting-start' : 'playing',
      message: step === 7 ? 'ถึง WP1 แล้ว · ทัวร์ตัวอย่างจบ' : step === 4 ? 'รอคำสั่ง START จากฝั่ง · เรือยังอยู่ที่ HOME และ PWM ยังไม่ทำงาน' : STEPS[step].caption
    });
  }
  function simulateGpsReady(state) {
    if (state.step !== 1) return state;
    return copy(state, { gpsReady: true, step: 2, status: 'ready', message: 'จำลอง GPS พร้อมแล้ว · ต่อไปกำหนด HOME' });
  }
  function setReadiness(state, key, value) {
    if (!['gpsReady', 'homeSet', 'routeReady'].includes(key)) return state;
    return copy(state, { [key]: Boolean(value), message: 'ปรับ readiness ตัวอย่างแล้ว · ตรวจ gate ก่อนออกเดินทาง' });
  }
  function acceptStart(state) {
    if (state.step !== 4) return copy(state, { message: 'ต้องรอถึงจุดรับ START ก่อน' });
    const missing = [];
    if (!state.gpsReady) missing.push('GPS');
    if (!state.homeSet) missing.push('HOME');
    if (!state.routeReady) missing.push('เส้นทาง 9 จุด');
    if (missing.length) return copy(state, { status: 'blocked', message: `ยังออกเดินทางไม่ได้ · ขาด ${missing.join(', ')}` });
    return copy(state, { step: 5, acceptedStart: true, status: 'playing', message: 'รับ START จำลองแล้ว · readiness gate ผ่าน' });
  }
  function play(state) {
    if (state.step === 4) return copy(state, { status: 'waiting-start', message: 'ทัวร์หยุดที่ START · ใช้ปุ่ม START จำลองเพื่อไปต่อ' });
    if (state.step === 1 && !state.gpsReady) return copy(state, { status: 'waiting-gps', message: 'รอ GPS · ใช้ปุ่มจำลอง GPS พร้อมเพื่อไปต่อ' });
    if (state.step >= 7) return state;
    return copy(state, { status: 'playing', message: STEPS[state.step].caption });
  }
  function pause(state) { if (state.step >= 7) return state; return copy(state, { status: 'paused', message: 'พักทัวร์แล้ว · ใช้ปุ่มเล่นหรือขั้นถัดไปเมื่อพร้อม' }); }
  function reset() { return createState(); }
  function motorsActive(state) { return state.acceptedStart && state.step >= 6; }
  function boatMoved(state) { return state.acceptedStart && state.step >= 7; }

  return Object.freeze({ STEPS, createState, advance, simulateGpsReady, setReadiness, acceptStart, play, pause, reset, motorsActive, boatMoved });
});
