(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MissionStartTelemetry = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const LOG_LIMIT = 80;
  const BLOCKERS = Object.freeze([['gpsReady', 'GPS พร้อม'], ['homeSet', 'กำหนด HOME'], ['routeReady', 'เส้นทาง 9 จุด']]);

  function createRun() {
    return { eventNo: 0, elapsedMs: 0, telemetrySequence: 20, stageSequence: 3, log: [] };
  }

  function project(run, snapshot) {
    const motorsActive = Boolean(snapshot.acceptedStart && snapshot.step >= 6);
    const boatMoved = Boolean(snapshot.acceptedStart && snapshot.step >= 7);
    const mode = snapshot.acceptedStart ? 1 : 0;
    let flags = 0;
    if (snapshot.routeReady) flags |= 1 << 1;
    if (snapshot.gpsReady) flags |= 1 << 3;
    if (snapshot.homeSet) flags |= 1 << 5;
    return {
      telemetry: {
        sequence_number: run.telemetrySequence,
        gps_lat: null,
        gps_lon: null,
        water_ph: mode === 0 ? Number.NaN : null,
        water_turbidity: mode === 0 ? Number.NaN : null,
        water_temp: mode === 0 ? Number.NaN : null,
        current_mode: mode,
        battery_percent: null,
        heading_angle: null
      },
      stage: {
        sequence_number: run.stageSequence,
        current_stage: mode,
        intent: mode ? 4 : snapshot.routeReady ? 2 : 0,
        next_stage: mode ? 255 : 1,
        reason: mode ? (snapshot.step === 5 ? 2 : 1) : run.eventNo <= 1 ? 0 : 1,
        flags,
        waypoint_count: snapshot.routeReady ? 9 : 0,
        waypoint_index: boatMoved ? 1 : 0,
        expected_batch_index: null
      },
      projection: true
    };
  }

  function record(run, input) {
    const snapshot = input.snapshot;
    const eventNo = run.eventNo + 1;
    const elapsedMs = run.elapsedMs + (Number.isFinite(input.timeDeltaMs) ? input.timeDeltaMs : 1000);
    const telemetrySequence = run.telemetrySequence + 1;
    const stageSequence = run.stageSequence + 1;
    const next = { eventNo, elapsedMs, telemetrySequence, stageSequence, log: run.log.slice() };
    const readiness = Object.fromEntries(BLOCKERS.map(([key]) => [key, Boolean(snapshot[key])]));
    const blockers = BLOCKERS.filter(([key]) => !snapshot[key]).map(([, label]) => label);
    const transition = input.fromStep === snapshot.step ? 'ไม่มีการเปลี่ยนขั้น' : `${input.fromTitle || `ขั้น ${input.fromStep + 1}`} → ${input.toTitle || `ขั้น ${snapshot.step + 1}`}`;
    const movement = snapshot.acceptedStart && snapshot.step >= 7
      ? { label: 'WP1 · schematic map pixels', x: 440, y: 170 }
      : { label: 'HOME · schematic map pixels', x: 335, y: 455 };
    const packet = project(next, snapshot);
    next.log.push({
      eventNo, elapsedMs, actor: input.actor, direction: input.direction, action: input.action,
      decision: snapshot.status, readiness, blockers, transition, movement,
      telemetrySequence, stageSequence, packet
    });
    if (next.log.length > LOG_LIMIT) next.log.splice(0, next.log.length - LOG_LIMIT);
    return next;
  }

  return Object.freeze({ LOG_LIMIT, createRun, project, record });
});
