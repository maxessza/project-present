(function (root, factory) {
  const model = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = model;
  if (root) root.OverallModel = model;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const HOME = Object.freeze({x: 380, y: 440});
  // SVG positions are stored WP9-to-WP1; the mission visits them in reverse.
  const POINTS = Object.freeze([
    {x: 220, y: 160}, {x: 420, y: 160}, {x: 610, y: 160},
    {x: 610, y: 260}, {x: 420, y: 260}, {x: 220, y: 260},
    {x: 220, y: 360}, {x: 420, y: 360}, {x: 610, y: 360}
  ]);
  const SMA_THRESHOLD_NTU = 50;
  const SMA_SAMPLES_NTU = Object.freeze([74, 76, 77, 78, 79, 80, 78, 82]);
  const SPIRAL = Object.freeze({
    startRadiusM: 4,
    endRadiusM: 8,
    finalThetaRad: 6 * Math.PI,
    thetaStepRad: Math.PI / 4,
    mapPixelsPerMeter: 10
  });

  function analyzeSma(values, threshold = SMA_THRESHOLD_NTU) {
    if (!Array.isArray(values) || values.length === 0 ||
        values.some(value => !Number.isFinite(value))) {
      throw new TypeError('SMA inputs must be a non-empty array of finite numbers');
    }
    if (!Number.isFinite(threshold)) throw new TypeError('SMA threshold must be finite');
    const samples = values.slice();
    const sum = samples.reduce((total, value) => total + value, 0);
    const mean = sum / samples.length;
    return {
      samples,
      count: samples.length,
      sum,
      mean,
      threshold,
      triggered: mean > threshold
    };
  }

  function generateSpiralTargets() {
    const targetCount = Math.round(SPIRAL.finalThetaRad / SPIRAL.thetaStepRad) + 1;
    const radiusRate = (SPIRAL.endRadiusM - SPIRAL.startRadiusM) / SPIRAL.finalThetaRad;
    return Array.from({length: targetCount}, (_, index) => {
      const thetaRad = index * SPIRAL.thetaStepRad;
      const radiusM = Math.min(SPIRAL.endRadiusM, SPIRAL.startRadiusM + radiusRate * thetaRad);
      return {
        index: index + 1,
        thetaRad,
        thetaDeg: index * 45,
        radiusM,
        eastM: radiusM * Math.cos(thetaRad),
        northM: radiusM * Math.sin(thetaRad)
      };
    });
  }

  function createMission() {
    const sma = analyzeSma(SMA_SAMPLES_NTU);
    const spiralTargets = generateSpiralTargets();
    const steps = [];
    let position = HOME;
    let fsmStage = 0;

    function add(phase, title, reason, action, goal, path, duration, extra = {}) {
      const stateByPhase = {
        prepare: 'PRE-MISSION · ฉากจำลอง',
        travel: 'GRID_PATROL',
        arrive: 'GRID_PATROL',
        sample: 'GRID_PATROL',
        spiral: 'SPIRAL_MAPPING',
        return: 'STATE_RTH',
        done: 'STANDBY'
      };
      const state = extra.fsmState || stateByPhase[phase];
      const defaultInputs = phase === 'prepare'
        ? 'GPS / เข็มทิศ / แบตเตอรี่: สมมติว่าพร้อมในฉากนี้'
        : '—';
      const inspector = {
        state,
        inputs: extra.inputs || defaultInputs,
        predicate: extra.predicate || '—',
        result: extra.result || '—',
        nextState: extra.nextState || state,
        action
      };
      const step = {
        phase, title, reason, action, goal, path, duration,
        inspector,
        fsmStage: extra.fsmStage === undefined ? fsmStage : extra.fsmStage,
        ...extra
      };
      steps.push(step);
      position = path[path.length - 1];
    }

    add('prepare', 'ตรวจความพร้อมก่อนออกเดินทาง',
      'ฉากนี้สมมติว่า GPS เข็มทิศ และแบตเตอรี่พร้อม จึงบันทึก HOME และเริ่มภารกิจจำลอง',
      'บันทึก HOME และรับเส้นทาง 9 จุด', 'จุดเริ่มต้น HOME', [HOME, HOME], 1800,
      {fsmState: 'PRE-MISSION · ฉากจำลอง', fsmStage: -1,
        predicate: 'เริ่มการเล่นจำลอง', result: 'แสดง HOME และเส้นทาง 9 จุด',
        nextState: 'GRID_PATROL'});

    const remaining = POINTS.map((_, index) => index).reverse();
    let investigated = false;
    while (remaining.length) {
      const index = remaining.shift();
      const point = POINTS[index];
      const number = POINTS.length - index;
      const anomaly = number === 1;
      add('travel', 'กำลังเข้า waypoint ' + number,
        'เลือก WP' + number + ' ตามลำดับ GRID; ตำแหน่งเรือในภาพเป็นภาพประกอบ ไม่ใช่ GPS telemetry',
        'เคลื่อนเรือจำลองไปยัง marker WP' + number, 'WP' + number + ' · จุดถัดไป',
        [position, point], 2400,
        {target: point, waypoint: index, suppressTrail: anomaly,
          inputs: 'WP' + number + ' · เป้าหมายตาม route plan (ไม่มี GPS coordinates ในฉาก)',
          predicate: 'ลำดับ waypoint ถัดไปในฉากจำลอง',
          result: 'กำลังเคลื่อนไปยัง WP' + number});
      add('arrive', 'เข้าถึง waypoint ' + number,
        'แอนิเมชันถึง marker นี้แล้ว จึงทำเครื่องหมาย waypoint ว่าผ่าน',
        'ทำเครื่องหมาย WP' + number + ' ว่าผ่านแล้ว', 'WP' + number + ' · marker ในภาพ',
        [point, point], 850,
        {target: point, waypoint: index, suppressTrail: anomaly,
          inputs: 'WP' + number + ' · marker ในภาพ schematic',
          predicate: 'เรือจำลองถึง marker WP' + number,
          result: 'ทำเครื่องหมาย WP' + number + ' ว่าผ่านแล้ว',
          storyStep: number === 1 ? 0 : undefined,
          insight: number === 1
            ? 'กำลังยืนยัน WP1 · เมื่อผ่านแล้ว Navigator index จะเป็น 1; FSM ยังรอ anomaly และ safety gate'
            : 'ยืนยัน waypoint ในฉากแล้ว; ลำดับ GRID เดินหน้าต่อ'});

      if (anomaly) {
        const nextIndex = remaining[0];
        const nextPoint = POINTS[nextIndex];
        const passedFix = {
          x: point.x + (nextPoint.x - point.x) * 0.5,
          y: point.y + (nextPoint.y - point.y) * 0.5
        };
        add('travel', 'ผ่าน WP1 แล้ว · เดินต่อใน GRID',
          'Navigator ผ่าน WP1 แล้วและเริ่มเดินต่อไป WP2; ตำแหน่งกึ่งกลางช่วงนี้เป็นเพียงภาพสาธิต GPS fix ปัจจุบัน',
          'คง GRID_PATROL · เป้าหมายถัดไปคือ WP2', 'ช่วง WP1 → WP2',
          [point, passedFix], 900,
          {target: nextPoint, waypoint: nextIndex, storyStep: 1,
            inputs: 'Navigator index = 1 · GRID target = WP2',
            predicate: 'passedFirstWaypoint = true',
            result: 'ยังอยู่ GRID_PATROL ระหว่าง WP1 → WP2',
            nextState: 'GRID_PATROL · รอเงื่อนไข anomaly + safety',
            insight: 'เฟิร์มแวร์ผ่าน WP1 ก่อน; จุดศูนย์กลาง SPIRAL มาจาก GPS fix เมื่อเข้าโหมด ไม่ใช่ WP1'});
      }

      if (anomaly || index % 2 === 1) {
        const isAnomaly = anomaly && sma.triggered;
        const inputs = isAnomaly
          ? sma.samples.join(' + ') + ' = ' + sma.sum + ' NTU · ' + sma.count + ' ค่า'
          : '— · ไม่มีชุดตัวเลข sensor สำหรับ step นี้';
        add('sample', isAnomaly
            ? 'ตรวจพบ SMA ความขุ่นสูงหลังผ่าน WP1'
            : 'รอบ waypoint นี้ไม่แสดงค่าตัวอย่าง',
          isAnomaly
            ? 'ตัวอย่างความขุ่นสังเคราะห์ 8 ค่าให้ SMA = ' + sma.mean + ' NTU ซึ่งสูงกว่าเกณฑ์; safety gate ยังต้องผ่าน'
            : 'มีจังหวะบันทึกตัวอย่างในลำดับเรื่อง แต่ฉากนี้ไม่ได้กำหนดตัวเลข sensor จึงไม่สรุปผล anomaly จากจุดนี้',
          isAnomaly
            ? 'แจ้ง anomaly ให้ Mission FSM · เข้า SPIRAL เมื่อผ่านเงื่อนไข safety'
            : 'แสดงจังหวะบันทึกโดยไม่สร้างเลข sensor เพิ่ม',
          isAnomaly ? 'GRID · WP1 → WP2 · SMA(8)' : 'WP' + number + ' · ไม่มีค่าแสดง',
          [position, position], 2000,
          {readings: isAnomaly ? {turbidityMeanNtu: sma.mean} : null,
            center: isAnomaly ? position : null,
            waypoint: isAnomaly ? remaining[0] : index,
            storyStep: isAnomaly ? 2 : undefined,
            inputs,
            predicate: isAnomaly
              ? 'SMA(8) > ' + sma.threshold + ' NTU'
              : 'ไม่มี SMA inputs ใน step นี้ · ไม่ประเมิน trigger',
            result: isAnomaly
              ? sma.mean + ' > ' + sma.threshold + ' = ' + sma.triggered + ' · anomaly'
              : '— · ไม่มีข้อสรุป sensor จากฉากนี้',
            nextState: isAnomaly
              ? 'SPIRAL_MAPPING เมื่อ passedFirstWaypoint และ safety ผ่าน'
              : 'GRID_PATROL',
            fsmState: 'GRID_PATROL',
            insight: isAnomaly
              ? sma.samples.join(' + ') + ' = ' + sma.sum + '; ' + sma.sum + ' ÷ ' + sma.count + ' = ' + sma.mean + ' NTU > ' + sma.threshold + ' NTU'
              : '— ไม่มีค่าตัวอย่างในฉากนี้ จึงไม่สร้างค่าอุณหภูมิ pH หรือ NTU ขึ้นมา'});
      }

      if (anomaly && !investigated) {
        investigated = true;
        const spiralCenter = position;
        fsmStage = 1;
        add('spiral', 'ผ่านเงื่อนไขแล้ว · เปลี่ยนเป็น SPIRAL_MAPPING',
          'ตัวอย่างนี้ผ่าน WP1 และมี anomaly; จึงแสดงทางเข้า SPIRAL เมื่อ GPS/safety พร้อมตามเงื่อนไข FSM',
          'ล็อก GPS fix จำลองเป็นศูนย์กลาง และพักลำดับ GRID',
          'ศูนย์กลางจาก GPS fix จำลอง · ช่วง WP1 → WP2', [position, position], 2000,
          {fsmState: 'SPIRAL_MAPPING', fsmStage: 1,
            storyStep: 3, center: spiralCenter, waypoint: remaining[0],
            inputs: 'passedFirstWaypoint = true · SMA trigger = true · safety = ผ่าน (สมมติในฉาก)',
            predicate: 'GRID_PATROL ∧ passedFirstWaypoint ∧ anomaly ∧ safety พร้อม',
            result: 'เงื่อนไขครบในฉาก → SPIRAL_MAPPING',
            nextState: 'SPIRAL_MAPPING',
            insight: 'ศูนย์กลางคือ GPS fix จำลองเมื่อเข้าโหมด; ภาพวางไว้หลัง WP1 บนช่วง WP1 → WP2'});

        const spiral = [spiralCenter];
        for (const target of spiralTargets) {
          const mapTarget = {
            x: spiralCenter.x + target.eastM * SPIRAL.mapPixelsPerMeter,
            y: spiralCenter.y - target.northM * SPIRAL.mapPixelsPerMeter
          };
          spiral.push(mapTarget);
          const targetName = 'S' + String(target.index).padStart(2, '0');
          const round = Math.min(3, Math.floor((target.index - 1) / 8) + 1);
          const math = 'θ = ' + target.thetaDeg + '° · r = ' + target.radiusM.toFixed(2) +
            ' m · East ' + target.eastM.toFixed(2) + ' m · North ' + target.northM.toFixed(2) + ' m';
          const spiralMeta = {
            fsmState: 'SPIRAL_MAPPING', fsmStage: 1,
            target: mapTarget, spiralPreview: spiral.slice(), center: spiralCenter,
            waypoint: remaining[0], vertex: target.index - 1,
            spiralTarget: target, insight: 'สร้างเป้าหมายจาก GPS fix จำลอง · ' + math
          };
          add('spiral', 'สร้างเป้าหมาย ' + targetName + ' / 25',
            'คำนวณเป้าหมายใหม่จากศูนย์กลาง โดยเพิ่ม θ ทีละ 45°; เป้าหมายนี้ยังไม่ใช่การเดินทาง',
            'สร้าง ' + targetName + ' · ' + math,
            targetName + ' · รอบ ' + round, [position, position], 900,
            {...spiralMeta, spiralOperation: 'generate',
              inputs: 'GPS fix ศูนย์กลาง (แผนผัง) · θ = ' + target.thetaDeg + '°',
              predicate: 'θ ≤ 6π · Δθ = 45°',
              result: targetName + ' ถูกสร้าง · r = ' + target.radiusM.toFixed(2) + ' m',
              nextState: 'SPIRAL_MAPPING · เดินทางไป ' + targetName});
          add('spiral', 'เดินทางไป ' + targetName + ' / 25',
            'เป้าหมาย ' + targetName + ' ถูกสร้างแล้ว; ภาพจึงเคลื่อนเรือไปยังจุดนี้ก่อนเปิดเผยจุดถัดไป',
            'นำทางจำลองไปยัง ' + targetName,
            targetName + ' · รอบ ' + round, [position, mapTarget], 750,
            {...spiralMeta, spiralOperation: 'travel',
              inputs: targetName + ' · r = ' + target.radiusM.toFixed(2) + ' m',
              predicate: 'จุดเดินทาง = เป้าหมายที่เพิ่งสร้าง',
              result: 'แอนิเมชันถึง ' + targetName + ' · ไม่ใช่ GPS arrival จริง',
              nextState: 'SPIRAL_MAPPING · คำนวณ target ถัดไป'});
        }

        add('spiral', 'ครบ 25 เป้าหมาย · ออกจากก้นหอย',
          'ถึง θ = 6π แล้ว จึงไม่มีเป้าหมายใหม่ในฉากและแสดงทางกลับสู่ GRID_PATROL',
          'จบ SPIRAL จำลอง · เริ่ม cooldown ตามคำอธิบาย firmware',
          'กลับลำดับ waypoint ที่พักไว้', [position, position], 1800,
          {fsmState: 'SPIRAL_MAPPING', fsmStage: 1, center: spiralCenter,
            waypoint: remaining[0], inputs: 'สร้าง/เดินทางครบ 25 targets · θ สุดท้าย = 6π',
            predicate: 'ไม่มี target ถัดไป', result: 'ออกจาก SPIRAL_MAPPING ในฉาก',
            nextState: 'GRID_PATROL · ใช้ index เดิม',
            insight: 'รัศมีปลายทาง 8 m · 25 เป้าหมายรวม θ = 0° และ 6π'});
        fsmStage = 2;
        const next = remaining[0];
        add('travel', 'กลับทำเส้นทางต่อที่ WP' + (POINTS.length - next),
          'กลับไป waypoint ถัดไปตาม Navigator index ที่พักไว้ ไม่เลือกจุดใกล้ที่สุดใหม่',
          'เปลี่ยนกลับ GRID_PATROL แล้วเดินทางตามลำดับเดิม',
          'WP' + (POINTS.length - next) + ' · index เดิม', [position, position], 1800,
          {fsmState: 'GRID_PATROL', fsmStage: 2, target: POINTS[next],
            waypoint: next, inputs: 'Navigator index ที่พักไว้ระหว่าง SPIRAL',
            predicate: 'จบ SPIRAL อัตโนมัติ', result: 'กลับ GRID ตามลำดับ waypoint เดิม',
            nextState: 'GRID_PATROL',
            insight: 'ฉากกลับไปยัง index ที่เหลือ ไม่จัดลำดับ waypoint ใหม่ตามระยะใกล้'});
      }
    }

    function rthStopPoint(from) {
      const dx = HOME.x - from.x;
      const dy = HOME.y - from.y;
      const length = Math.hypot(dx, dy) || 1;
      const radius = 30; // visual ring only; it has no px-to-meter map scale
      return {x: HOME.x - dx / length * radius, y: HOME.y - dy / length * radius};
    }

    fsmStage = 3;
    const homeStop = rthStopPoint(position);
    add('return', 'RTH · มุ่งตรงไปยัง HOME',
      'GRID ครบแล้ว; ฉากแสดง bearing ตรงจาก GPS ปัจจุบันไป SET_HOME โดยไม่ย้อนตาม WP1–WP9',
      'เคลื่อนเรือจำลองตรงไป HOME · วง 4 m เป็นสัญลักษณ์เท่านั้น',
      'HOME · direct bearing', [position, homeStop], 3500,
      {target: homeStop, suppressTrail: true, rth: true, fsmStage: 3, storyStep: 4,
        inputs: 'GPS ปัจจุบัน / SET_HOME · ไม่มีพิกัดตัวเลขในฉาก',
        predicate: 'GRID ครบและ HOME ตั้งไว้ → STATE_RTH',
        result: 'แสดงการกลับ HOME ตาม bearing ตรง', nextState: 'STATE_RTH · ตรวจ arrival gate',
        insight: 'RTH ใช้ทิศตรงไป SET_HOME; เส้นทางและวงรัศมีบนภาพไม่ใช่มาตราส่วนจริง'});
    add('return', 'อยู่ในวง HOME · รอยืนยัน arrival gate',
      'ภาพตัวอย่างสมมติว่าผ่านเงื่อนไขออกห่าง HOME แล้ว; เมื่ออยู่ในวง 4 m จะหยุด PWM และรอเวลายืนยัน',
      'แสดง PWM = 0 ที่ระยะ ≤ 4 m · คงฉาก 3 s แบบย่อ',
      'HOME · วง 4 m (schematic)', [homeStop, homeStop], 3000,
      {target: homeStop, suppressTrail: true, rth: true, fsmStage: 3, storyStep: 4,
        inputs: 'HOME set / GPS valid / RTH entry > 4 m (สมมติ) · departure ≥ 12 m นาน 2 s · arrival ≤ 4 m',
        predicate: 'HOME set ∧ GPS valid ∧ RTH entry > 4 m ∧ departed ≥ 12 m for 2 s ∧ distance ≤ 4 m for 3 s',
        result: 'ผ่าน arrival gate ในฉากจำลอง', nextState: 'STANDBY',
        insight: 'จุดหยุดที่วง 4 m และการเปลี่ยนเป็น STANDBY เป็นคนละเงื่อนไข: ต้องผ่าน departure latch และ hold ครบ'});
    fsmStage = 4;
    add('done', 'ยืนยัน HOME แล้ว · เข้าสู่ STANDBY',
      'เมื่อ arrival gate ผ่าน FSM จึงออกจาก STATE_RTH; ป้ายนี้เป็นผลในฉากจำลอง',
      'หยุดแอนิเมชันและแสดงภารกิจจำลองเสร็จ', 'HOME · STANDBY',
      [homeStop, homeStop], 1000,
      {fsmState: 'STANDBY', fsmStage: 4, suppressTrail: true,
        inputs: 'arrival gate: ผ่านตามสมมติฐานของฉาก',
        predicate: 'RTH arrival gate = true', result: 'STATE_RTH → STANDBY · จบการแสดงผล',
        nextState: 'STANDBY'});

    return {home: HOME, points: POINTS, steps, sma, spiralTargets};
  }

  return {
    HOME,
    POINTS,
    SMA_THRESHOLD_NTU,
    SMA_SAMPLES_NTU,
    SPIRAL,
    analyzeSma,
    generateSpiralTargets,
    createMission
  };
});
