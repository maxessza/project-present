'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const Grid = require('../src/js/overall/grid-guidance.js');

const repo = path.resolve(__dirname, '..');
const firmware = process.env.GRID_FIRMWARE_ROOT || 'C:/Users/Icezy/OneDrive/Desktop/source/1_Firmware';
const compiler = process.env.CXX || 'C:/msys64/ucrt64/bin/g++.exe';
const evidence = process.env.GRID_EVIDENCE_DIR || path.join(repo, 'evidence/builder');
const sourceHashes = {
  'src/control/GridHeadingController.cpp': '50d024e13191747b9026b1548a3e466e7618f6a99ad7d4b0ad46efd1e3e04fcb',
  'src/control/GridHeadingController.h': '9c165c3e88dfe0b75f0527a6eb22bcf22573abcef3eaf1757457866f6f35c799',
  'src/control/GridMotorMixer.h': 'c5a07d693f1aad69b82fa937f49d2817c76643fe56e660eb206e9b9c4dd897ff',
  'src/control/DriveController.cpp': '78cee95ca6ba7b68dfceda61f045a2e9d4dab6fd785ee7a31c843e868f0eef6a',
  'src/control/DriveController.h': '8053f725257c2e4b7acb6b7f2c18690d89654288fb0a873b4c1a2cae0f6371a5',
  'src/control/HeadingController.cpp': '69d202548159dd507cba4a82efe9bafa23c629a05a0900d95c34fa3e91e84d23',
  'src/control/HeadingController.h': '4fbbb1056e29c017adabd640c49682545a3a61a48b488b8d3de3389b85423333'
};
const rows = [
  ['turn-positive',0,90,350,110,1000000,1,1,0,0,1,0,.05,1,1,0,2,0,0,1],
  ['turn-positive',1,90,355,110,1050000,1,1,0,0,1,0,.05,0,0,0,2,0,0,1],
  ['wrap-359-to-0',0,90,0,110,1100000,1,1,0,0,1,0,.05,0,0,0,2,0,0,1],
  ['target-change-no-D-kick',0,270,1,110,1150000,1,1,0,0,1,0,.05,0,0,0,2,0,0,1],
  ['turn-negative',0,270,10,110,1200000,1,1,0,0,1,0,.05,0,0,0,2,0,0,1],
  ['invalid-sample',0,270,12,110,1250000,0,1,0,0,1,0,.05,0,0,0,2,0,0,1],
  ['reacquire',0,270,12,110,1300000,1,1,0,0,1,0,.05,0,0,0,2,0,0,1],
  ['sample-gap-reset',0,270,20,110,1600000,1,1,0,0,1,0,.05,0,0,0,2,0,0,1],
  ['hold-stop',0,270,21,110,1650000,1,1,0,0,1,1,.05,0,0,0,2,0,0,1],
  ['after-hold',0,270,22,110,1700000,1,1,0,0,1,0,.05,0,0,0,2,0,0,1],
  ['safety-stop',0,270,23,110,1750000,1,1,4,0,1,0,.05,0,0,0,2,0,0,1],
  ['safety-clear',0,270,24,110,1800000,1,1,0,0,1,0,.05,0,0,0,2,0,0,1],
  ['navigation-stop',0,270,25,110,1850000,1,1,0,0,0,0,.05,0,0,0,2,0,0,1],
  ['manual-source',0,270,26,110,1900000,1,1,0,0,1,0,.05,0,0,1,1,100,100,1],
  ['return-grid-source',0,270,27,110,1950000,1,1,0,0,1,0,.05,0,0,0,2,0,0,1],
  ['limit-request',0,360,359,110,2000000,1,1,0,0,1,0,.05,0,0,1,2,999,-999,1],
  ['invalid-request',0,360,359,110,2050000,1,1,0,0,1,0,.05,0,0,1,2,999,-999,0]
];
const state = Grid.createState();
const stopReason = ['NONE','HARD_STOP','INACTIVE_STATE','NAVIGATION_UNAVAILABLE','WATER_SAMPLE','INVALID_REQUEST','SOURCE_CHANGE','REQUESTED_STOP'];
const sourceName = {1:'MANUAL',2:'GRID',3:'SPIRAL',4:'RTH'};
const interlocksFor = r => ({state:r[7]===0?'STANDBY':r[7]===1?'GRID_PATROL':r[7]===2?'SPIRAL_MAPPING':'RTH',safety:r[8]===4?'CRITICAL_STOP':r[8]===1?'LOW_BATTERY_RTH':'NORMAL',emergencyPending:!!r[9],navigationAvailable:!!r[10],waterSampleHold:!!r[11]});

function verifySources() {
  for (const [relative, expectedHash] of Object.entries(sourceHashes)) {
    const bytes = fs.readFileSync(path.join(firmware, relative));
    const actual = crypto.createHash('sha256').update(bytes).digest('hex');
    assert.equal(actual, expectedHash, `source drift at ${relative}`);
  }
}

function runComparison() {
  verifySources();
  fs.mkdirSync(evidence, {recursive:true});
  const exe = path.join(evidence, 'grid-guidance-native.exe');
  const driver = path.join(__dirname, 'grid-guidance-native.cpp');
  const sources = ['control/GridHeadingController.cpp','control/DriveController.cpp','control/HeadingController.cpp','control/PidController.cpp'].map(p => path.join(firmware,'src',p));
  const compileArgs = ['-std=c++17','-O0','-DUSV_NATIVE_TEST',`-I${path.join(firmware,'include')}`,`-I${path.join(firmware,'src')}`,`-I${path.join(firmware,'src/control')}`,driver,...sources,'-o',exe];
  const compile = spawnSync(compiler, compileArgs, {encoding:'utf8',windowsHide:true});
  fs.writeFileSync(path.join(evidence,'grid-guidance-native-build.log'),`command: ${compiler} ${compileArgs.join(' ')}\nexit_status: ${compile.status}\n${compile.stdout||''}${compile.stderr||''}`);
  assert.equal(compile.status,0,`native firmware build failed: ${compile.stderr}`);
  const input = rows.map(r=>r.join(',')).join('\n')+'\n';
  const native = spawnSync(exe, [], {input,encoding:'utf8',windowsHide:true});
  fs.writeFileSync(path.join(evidence,'grid-guidance-native.csv'),native.stdout||'');
  fs.writeFileSync(path.join(evidence,'grid-guidance-native-run.log'),`exit_status: ${native.status}\n${native.stderr||''}`);
  assert.equal(native.status,0,`native firmware execution failed: ${native.stderr}`);
  const nativeRows = native.stdout.trim().split(/\r?\n/).slice(1).map(line=>line.split(','));
  assert.equal(nativeRows.length,rows.length);
  const jsRows=[];
  rows.forEach((r,i)=>{
    if(r[13]) state.controller=Grid.createState().controller;
    if(r[14]) state.drive=Grid.createState().drive;
    const req = r[15] ? {source:sourceName[r[16]],leftPwm:r[17],rightPwm:r[18],valid:!!r[19]} : null;
    let control;
    if(req) control={state:state.controller,request:req,observation:{rate:state.controller.rate,integralPwm:state.controller.integralPwm,steeringPwm:state.controller.steeringPwm,surgePwm:state.controller.surgePwm}};
    else {
      control=Grid.updateController(state.controller,{targetDeg:r[2],headingDeg:r[3],basePwm:r[4],sampleUs:r[5],fresh:!!r[6]});
      state.controller=control.state;
    }
    const drive=Grid.resolveDrive(state.drive,control.request,interlocksFor(r),r[12]);
    state.drive=drive.state;
    const o=[r[0],r[1],control.request.valid?1:0,control.request.leftPwm,control.request.rightPwm,control.observation.rate,control.observation.integralPwm,control.observation.steeringPwm,control.observation.surgePwm,drive.decision.leftPwm,drive.decision.rightPwm,drive.decision.stopReason];
    jsRows.push(o.join(','));
    const a=nativeRows[i];
    assert.equal(a[0],String(o[0]));assert.equal(Number(a[1]),Number(o[1]));
    for(const col of [2,3,4,9,10]) assert.equal(Number(a[col]),Number(o[col]),`${r[0]}[${i}] column ${col}`);
    for(const col of [5,6,7,8]) assert.ok(Math.abs(Number(a[col])-Number(o[col]))<=0.03,`${r[0]}[${i}] col ${col}: C++=${a[col]} JS=${o[col]}`);
    assert.equal(Number(a[11]),stopReason.indexOf(drive.decision.stopReason),`${r[0]} stop reason`);
  });
  fs.writeFileSync(path.join(evidence,'grid-guidance-js.csv'),'case,index,valid,request_left,request_right,rate,integral,steering,surge,applied_left,applied_right,stop_reason\n'+jsRows.join('\n')+'\n');
  return nativeRows.length;
}

test('GRID controller, motor allocation and DriveController match executed current C++ source across control and interlock sequences', () => {
  const count=runComparison();
  assert.equal(count,rows.length);
});
