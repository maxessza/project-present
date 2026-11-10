(function (root, factory) {
  const api = factory();
  if (root) root.MissionPresentation = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const UNAVAILABLE = 'ยังไม่มีค่าที่พร้อมเผยแพร่';
  const NO_POSITION = 'ยังไม่มีตำแหน่งที่ใช้ได้';
  const NO_HEADING = 'ยังไม่มีทิศทางที่ใช้ได้';
  const FIELDS = Object.freeze([
    { id: 'sequence_number', label: 'ชุดข้อมูลเลขที่', group: 'สถานะเรือและชุดข้อมูล', description: 'เลขที่ใช้แยกรายงานแต่ละชุดออกจากกัน', digits: 0 },
    { id: 'gps_lat', label: 'ตำแหน่งเหนือ–ใต้', group: 'ตำแหน่งและทิศทาง', description: 'พิกัดเหนือ–ใต้ แสดงเป็นองศา', digits: 6, unavailable: NO_POSITION, unit: '°' },
    { id: 'gps_lon', label: 'ตำแหน่งตะวันออก–ตะวันตก', group: 'ตำแหน่งและทิศทาง', description: 'พิกัดตะวันออก–ตะวันตก แสดงเป็นองศา', digits: 6, unavailable: NO_POSITION, unit: '°' },
    { id: 'water_ph', label: 'ความเป็นกรด–ด่างของน้ำ', group: 'คุณภาพน้ำ', description: 'ค่าความเป็นกรด–ด่างของน้ำ หน่วย pH; อาจรอวัดขณะน้ำนิ่ง และช่วงพักไม่มีค่า ไม่ได้หมายถึงศูนย์', digits: 2, unavailable: UNAVAILABLE, unit: ' pH' },
    { id: 'water_turbidity', label: 'ความขุ่นของน้ำ', group: 'คุณภาพน้ำ', description: 'ค่าที่บอกว่าน้ำขุ่นเพียงใด หน่วย NTU', digits: 2, unavailable: UNAVAILABLE, unit: ' NTU' },
    { id: 'water_temp', label: 'อุณหภูมิน้ำ', group: 'คุณภาพน้ำ', description: 'อุณหภูมิของน้ำ หน่วยองศาเซลเซียส', digits: 1, unavailable: UNAVAILABLE, unit: ' °C' },
    { id: 'current_mode', label: 'สิ่งที่เรือกำลังทำ', group: 'สถานะเรือและชุดข้อมูล', description: 'บอกว่าเรือกำลังรอ สำรวจตามจุดที่กำหนด สแกนก้นหอย หรือกลับจุดเริ่มต้น', digits: 0 },
    { id: 'battery_percent', label: 'แบตเตอรี่คงเหลือ', group: 'สถานะเรือและชุดข้อมูล', description: 'คำนวณตาม BatteryMonitor จากแรงดัน pack ที่ป้อนเป็นตัวอย่าง ไม่ได้อ่านแบตเตอรี่จริง', digits: 0, unit: '%' },
    { id: 'heading_angle', label: 'ทิศที่หัวเรือหัน', group: 'ตำแหน่งและทิศทาง', description: 'องศาทิศที่หัวเรือหัน โดยทิศเหนือคือ 0° และเพิ่มตามเข็มนาฬิกา', digits: 1, unavailable: NO_HEADING, unit: '°' }
  ]);

  function numberText(value, digits) {
    if (!Number.isFinite(value)) return null;
    return String(Number(value.toFixed(digits)));
  }

  function fieldValue(field, report) {
    if (!report || !Number.isFinite(report[field.id])) return field.unavailable || UNAVAILABLE;
    if (field.id === 'current_mode') {
      return ({
        0: 'เตรียมพร้อมหรือพักหลังจบภารกิจ',
        1: 'สำรวจตามจุดที่กำหนด',
        2: 'สแกนก้นหอย',
        3: 'กลับจุดเริ่มต้น',
        4: 'หยุดฉุกเฉิน · รอ CLEAR_ESTOP และเงื่อนไขปลอดภัย'
      })[report.current_mode] || UNAVAILABLE;
    }
    const text = numberText(report[field.id], field.digits);
    return `${text}${field.unit || ''}`;
  }

  function decodeHex(hex, codec) {
    if (typeof hex !== 'string' || !hex.trim() || !codec || typeof codec.decodeTelemetry !== 'function') return null;
    const parts = hex.trim().split(/\s+/);
    if (!Number.isInteger(codec.PACKET_BYTES) || parts.length !== codec.PACKET_BYTES || parts.some(part => !/^[\da-f]{2}$/i.test(part))) return null;
    const bytes = Uint8Array.from(parts, part => Number.parseInt(part, 16));
    return codec.decodeTelemetry(bytes.buffer);
  }

  function outgoingStatus(active, outgoing, phase) {
    if (!outgoing) return active ? 'ชุดข้อมูลนี้ยังแสดงค่าไม่ได้' : 'ยังไม่มีชุดข้อมูล';
    const sequence = outgoing.sequence_number;
    if (active && phase === 'queued' && active.attempt === 0) return `กำลังเตรียมชุดที่ ${sequence}`;
    if (phase === 'drop' || phase === 'retry') return `ส่งชุดที่ ${sequence} ไม่ถึง · กำลังลองใหม่ด้วยข้อมูลชุดเดิม`;
    if (phase === 'failed') return `ส่งชุดที่ ${sequence} ไม่ถึงหลังลองครบแล้ว · ฝั่งคงข้อมูลชุดเดิม`;
    if (phase === 'decoded') return `ฝั่งได้รับชุดที่ ${sequence} แล้ว · กำลังบันทึกข้อมูล`;
    if (phase === 'shore') return `ฝั่งได้รับชุดที่ ${sequence} แล้ว`;
    if (active) return `กำลังส่งชุดที่ ${sequence}`;
    return `รายงานล่าสุดที่ส่งออกคือชุดที่ ${sequence}`;
  }

  function receivedStatus(received, transport) {
    if (!received) return 'ฝั่งยังไม่ได้รับข้อมูลชุดใหม่';
    const sequence = received.sequence_number;
    if (transport.phase === 'decoded') return `ฝั่งกำลังบันทึกชุดใหม่ · ตารางยังแสดงชุดที่ ${sequence}`;
    if (transport.stale || ['drop', 'retry', 'failed'].includes(transport.phase)) return `ฝั่งยังไม่มีข้อมูลใหม่ จึงแสดงค่าเดิมจากชุดที่ ${sequence}`;
    return `รายงานล่าสุดที่ฝั่งได้รับคือชุดที่ ${sequence}`;
  }

  function currentReadings(current) {
    const water = current && current.water || {};
    const ph = Number.isFinite(water.ph) ? `${numberText(water.ph, 2)} pH` : UNAVAILABLE;
    const turbidity = Number.isFinite(water.ntu) ? `${numberText(water.ntu, 2)} NTU` : UNAVAILABLE;
    const temperature = Number.isFinite(water.temp) ? `${numberText(water.temp, 1)} °C` : UNAVAILABLE;
    return `บนเรือจำลองตอนนี้ · ความขุ่น ${turbidity} · pH ${ph} · อุณหภูมิ ${temperature}`;
  }

  function buildDataView(current, transport, codec) {
    const state = transport || {};
    const active = state.active || null;
    const record = active || state.latestTx || null;
    const outgoing = decodeHex(record && record.hex, codec);
    const received = state.rx && state.rx.decoded || null;
    return {
      fields: FIELDS.map(field => ({
        ...field,
        outgoingValue: outgoing ? fieldValue(field, outgoing) : record ? 'ชุดข้อมูลนี้ยังแสดงค่าไม่ได้' : 'ยังไม่มีชุดข้อมูล',
        receivedValue: received ? fieldValue(field, received) : 'ยังไม่ได้รับ'
      })),
      currentReadings: currentReadings(current),
      outgoing,
      received,
      outgoingStatus: outgoingStatus(active, outgoing, state.phase),
      receivedStatus: receivedStatus(received, state),
      outgoingSequence: outgoing ? outgoing.sequence_number : null,
      receivedSequence: received ? received.sequence_number : null,
      batteryNote: 'แบตเตอรี่คำนวณตาม BatteryMonitor จากแรงดัน pack ที่ป้อนเป็นตัวอย่าง · ไม่ใช่การวัดจริง',
      sourceNote: 'ตำแหน่ง น้ำ และการเคลื่อนที่เป็นข้อมูลจำลอง · ไม่ได้เชื่อมต่อเรือจริง',
      roundingNote: 'การแสดงผลปัดพิกัด 6 ตำแหน่ง, pH/ความขุ่น 2 ตำแหน่ง และอุณหภูมิ/ทิศ 1 ตำแหน่ง',
      timingNote: 'รอบรายงานทุก 1 วินาทีของเวลาจำลอง · NEXT STEP ขยับเวลาแต่ละครั้ง 50 มิลลิวินาที'
    };
  }

  return Object.freeze({ FIELDS, buildDataView, decodeHex });
});
