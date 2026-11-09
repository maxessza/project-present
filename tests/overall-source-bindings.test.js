const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const MissionKernel = require('../src/js/overall/mission-kernel.js');
const GridGuidance = require('../src/js/overall/grid-guidance.js');
const FirmwarePolicy = require('../src/js/overall/firmware-policy.js');

const ROOT = process.env.OVERALL_FIRMWARE_ROOT;
const bindings = {
  'start-readiness': {path:'src/core/Tasks.cpp', fn:'navigationTask START/readiness input and MissionFsm caller', lines:[619,714], anchors:['in.startCommand','ctx->fsm->tick'], helper:'src/js/overall/mission-kernel.js::evaluatePendingStart/readiness/start/decide -> src/js/overall/firmware-policy.js::fsm'},
  'grid-los-reach': {path:'src/navigation/Navigator.cpp', fn:'Navigator::skipReached/computeSegmentLos/computeLos', lines:[217,323], anchors:['Navigator::skipReached','Navigator::computeSegmentLos','Navigator::computeLos'], helper:'src/js/overall/mission-kernel.js::navigate/currentLos -> src/js/overall/grid-guidance.js::localLos'},
  'grid-control': {path:'src/control/GridHeadingController.cpp', fn:'GridHeadingController::update', lines:[34,122], anchors:['GridHeadingController::update'], helper:'src/js/overall/mission-kernel.js::control -> src/js/overall/grid-guidance.js::updateController -> allocate'},
  'grid-drive': {path:'src/control/DriveController.cpp', fn:'DriveController::resolve', lines:[87,145], anchors:['DriveController::resolve','DriveStopReason::NAVIGATION_UNAVAILABLE'], helper:'src/js/overall/mission-kernel.js::control -> src/js/overall/grid-guidance.js::resolveDrive'},
  'spiral-rth-control': {path:'src/control/HeadingController.cpp', fn:'HeadingController::calculateThrusterOutputs', lines:[17,65], anchors:['HeadingController::calculateThrusterOutputs'], helper:'src/js/overall/mission-kernel.js::control -> src/js/overall/firmware-policy.js::chooseBasePwm/heading'},
  'drive-interlocks': {path:'src/control/DriveController.cpp', fn:'DriveController::resolve interlocks and stop priority', lines:[87,144], anchors:['DriveController::resolve','navigationAvailable'], helper:'src/js/overall/mission-kernel.js::control -> src/js/overall/grid-guidance.js::resolveDrive'},
  'waypoint-water-hold': {path:'src/core/WaterSamplePolicy.cpp', fn:'WaterSamplePolicy::crossedBoundary/missionCompleteForFsm', lines:[3,18], anchors:['WaterSamplePolicy::crossedBoundary','missionCompleteForFsm'], helper:'src/js/overall/mission-kernel.js::navigate/holdPolicy -> src/js/overall/firmware-policy.js::crossedBoundary'},
  'sensor-conversion': {path:'src/core/Tasks.cpp', fn:'navigationTask ADS/temp acquisition and WaterSensors conversion caller', lines:[277,325], anchors:['updateTemperatureNonBlocking','pollAds','updateTurbidity'], helper:'src/js/overall/mission-kernel.js::acquire/sample -> src/js/overall/firmware-policy.js::turbidity/ph'},
  'publication-nan-cache': {path:'src/core/Tasks.cpp', fn:'navigationTask post-Drive suppression and TelemetryPacket publication', lines:[1134,1209], anchors:['lastPh = NAN','ctx->snapshot.water_ph','ctx->snapshot.water_turbidity'], helper:'src/js/overall/mission-kernel.js::publishWater'},
  'anomaly-eligibility': {path:'src/detection/WaterAnomalyMonitor.cpp', fn:'WaterAnomalyMonitor::updateTurbidity/notifyTurbidityInvalid', lines:[29,151], anchors:['WaterAnomalyMonitor::updateTurbidity','notifyTurbidityInvalid','_triggerSpiral'], helper:'src/js/overall/mission-kernel.js::sample -> src/js/overall/firmware-policy.js::anomaly'},
  'spiral-generation-progress': {path:'src/navigation/SpiralPlanner.cpp', fn:'SpiralPlanner::begin/calculateSpiralOffset/nextSpiralPoint', lines:[11,52], anchors:['SpiralPlanner::begin','SpiralPlanner::calculateSpiralOffset','SpiralPlanner::nextSpiralPoint'], helper:'src/js/overall/mission-kernel.js::navigate -> spiralTarget (incremental runtime); makeSpiral is teaching-preview-only'},
  'spiral-abort-timing': {path:'src/core/Tasks.cpp', fn:'navigationTask initialized-only spiral abort gate', lines:[630,645], anchors:['g_spiralInitialized','SPIRAL_MAX_MS','SPIRAL_CLEAR_ABORT_MS'], helper:'src/js/overall/mission-kernel.js::decide'},
  'spiral-planner-initialization': {path:'src/core/Tasks.cpp', fn:'navigationTask valid-fix planner initialization and lazy first target', lines:[974,997], anchors:['g_spiralInitialized','spiralPlanner->begin','nextSpiralPoint'], helper:'src/js/overall/mission-kernel.js::navigate'},
  'spiral-return': {path:'src/core/MissionFsm.cpp', fn:'MissionFsm::tick SPIRAL completion/abort transition', lines:[103,155], anchors:['MissionFsm::tick','in.spiralComplete','in.spiralAborted'], helper:'src/js/overall/mission-kernel.js::decide -> src/js/overall/firmware-policy.js::fsm/spiralDone'},
  'rth-dwell': {path:'src/core/MissionFsm.cpp', fn:'MissionFsm::latchDeparted/isArrivedHome', lines:[11,45], anchors:['MissionFsm::latchDeparted','MissionFsm::isArrivedHome'], helper:'src/js/overall/mission-kernel.js::rthPolicy'},
  'telemetry-lineage': {path:'src/core/Tasks.cpp', fn:'ioTask snapshot-to-sendTelemetry caller', lines:[1477,1531], anchors:['sendTelemetry(tp)','ctx->snapshot.sequence_number'], helper:'src/js/overall/autonomous-mission.js::applyReceivedTick -> mission-kernel.js::stepOnce/tick; autonomous-mission.js::transport.offer -> mission-transport.js::offer'},
  'log-lineage': {path:'src/core/Tasks.cpp', fn:'navigationTask log-record assembly and logQueue publication', lines:[1253,1320], anchors:['logRec.sequence_number','ctx->logQueue'], helper:'src/js/overall/mission-kernel.js::tick memoryLog append (bounded 32 only; no SD implementation)'},
  'compass-acquisition': {path:'src/sensors/Compass.cpp', fn:'Compass::update/getHeadingDeg/loadCalibration', lines:[129,326], anchors:['Compass::update','Compass::getHeadingDeg','Compass::loadCalibration'], helper:'src/js/overall/mission-kernel.js::acquire -> src/js/overall/firmware-policy.js::updateCompass'},
};

test('all 18 declared bindings pin current firmware bytes and real source ranges', () => {
  assert.ok(ROOT, 'set OVERALL_FIRMWARE_ROOT to the explicit read-only firmware checkout');
  const failures=[];
  for (const [key, expected] of Object.entries(bindings)) {
    const source=MissionKernel.source(key);
    if (!source) { failures.push(`${key}: source() returned no binding`); continue; }
    if (source.path !== expected.path) failures.push(`${key}: wrong firmware file ${source.path}`);
    if (source.function !== expected.fn) failures.push(`${key}: inaccurate function/caller label ${source.function}`);
    if (JSON.stringify(source.lines) !== JSON.stringify(expected.lines)) failures.push(`${key}: inaccurate line range ${JSON.stringify(source.lines)}`);
    if (!/^[a-f0-9]{64}$/.test(source.sha256)) { failures.push(`${key}: malformed SHA-256 ${source.sha256}`); continue; }
    const file=path.join(ROOT, ...source.path.split('/'));
    if (!fs.existsSync(file)) { failures.push(`${key}: missing firmware source ${file}`); continue; }
    const actual=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if (actual !== source.sha256) failures.push(`${key} ${source.path}: reference ${source.sha256}, actual ${actual}`);
    const lines=fs.readFileSync(file,'utf8').split(/\r?\n/);
    if (!(source.lines[0]>=1 && source.lines[1]>=source.lines[0] && source.lines[1]<=lines.length)) { failures.push(`${key}: line range outside ${source.path}`); continue; }
    const excerpt=lines.slice(source.lines[0]-1,source.lines[1]).join('\n');
    for (const anchor of expected.anchors) if (!excerpt.includes(anchor)) failures.push(`${key}: range ${source.lines.join('-')} misses ${anchor}`);
  }
  assert.deepEqual(failures, [], `source binding failures:\n${failures.join('\n')}`);
});

test('all 18 browser-helper attributions follow actual callers and exports', () => {
  assert.ok(ROOT, 'set OVERALL_FIRMWARE_ROOT to the explicit read-only firmware checkout');
  const mismatches=[];
  for (const [key, expected] of Object.entries(bindings)) {
    const actual=MissionKernel.source(key)?.browserHelper;
    if (actual !== expected.helper) mismatches.push(`${key}: expected ${expected.helper}; actual ${actual}`);
    if (!MissionKernel.source(key)?.boundary) mismatches.push(`${key}: abstraction boundary missing`);
  }
  assert.deepEqual(mismatches, [], `caller/helper attribution failures:\n${mismatches.join('\n')}`);
  for (const name of ['localLos','updateController','resolveDrive','step','allocate'])
    assert.equal(typeof GridGuidance[name], 'function', `GridGuidance export ${name} must exist`);
  for (const name of ['chooseBasePwm','heading','fsm','spiralDone','crossedBoundary','turbidity','ph','anomaly','updateCompass'])
    assert.equal(typeof FirmwarePolicy[name], 'function', `FirmwarePolicy export ${name} must exist`);
  const spiral=MissionKernel.source('spiral-generation-progress').browserHelper;
  assert.match(spiral, /incremental runtime/);
  assert.match(spiral, /makeSpiral is teaching-preview-only/);
});

test('browser memory log is labelled reference-only, not a port of current SD recovery', () => {
  const log = MissionKernel.source('log-lineage');
  assert.equal(log.status, 'reference-only · bounded browser memory illustration');
  assert.notEqual(log.status, MissionKernel.source('telemetry-lineage').status);
  assert.match(log.boundary, /does not model or prove SD\/replay\/durability/);
});
