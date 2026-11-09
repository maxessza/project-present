"""Native Chromium regressions for truthful retained-scan and navigation-fault copy.
Uses root index.html, actual MessageChannel commands, visible inputs and renderer.
"""
from __future__ import annotations
import argparse, hashlib, json, time, traceback
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--out', required=True)
args = parser.parse_args()
OUT = Path(args.out); OUT.mkdir(parents=True, exist_ok=True)
report = {'started': time.time(), 'root': str(ROOT), 'checks': [], 'errors': [], 'commands': [], 'snapshots': {}, 'screenshots': []}

def check(name, ok, details=None):
    report['checks'].append({'name': name, 'passed': bool(ok), 'details': details})

def snapshot(page): return page.evaluate('AutonomousMission.snapshot()')
def pause(page):
    if snapshot(page)['playing']:
        page.evaluate('AutonomousMission.dispatch({type:"pause"})')
def drive(page, predicate, step=10, limit=1800):
    state = snapshot(page)
    for _ in range(limit):
        if predicate(state): return state
        state = page.evaluate('(n)=>AutonomousMission.fastForward(n)', step)
        page.wait_for_timeout(2)  # allow native MessageChannel receipts/event callbacks
    raise AssertionError(f'bounded native mission did not reach target: {state.get("missionState")} @ {state.get("clockMs")}ms')
def words(page):
    return {k: page.locator('#am-explain-'+k).inner_text() for k in ('input','check','decision','effect')}
def open_inputs(page): page.locator('.am-input-details').first.evaluate('(e)=>e.open=true')
def save_shot(page, name):
    path = OUT / name
    page.screenshot(path=str(path), full_page=True)
    report['screenshots'].append({'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
def summarize(state):
    return {k: state.get(k) for k in ('clockMs','missionState','waypointIndex','inputs','gpsReady','compassAvailable','appliedPwm','driveDecision','lastCommand')} | {
        'anomaly': {k: state['anomaly'].get(k) for k in ('used','spiralIndex','spiralTargets','planner','interruptedIndex')}}

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    def fresh():
        page = browser.new_page(viewport={'width':1440,'height':1000}, reduced_motion='reduce')
        page.add_init_script("""window.__nativePosts=[];const post=MessagePort.prototype.postMessage;MessagePort.prototype.postMessage=function(v){if(v&&v.kind==='command')window.__nativePosts.push(structuredClone(v));return post.apply(this,arguments)}""")
        page.on('pageerror', lambda e: report['errors'].append({'page': str(e)}))
        page.on('console', lambda m: report['errors'].append({'console':m.text}) if m.type=='error' else None)
        page.goto((ROOT/'index.html').as_uri(), wait_until='load')
        page.wait_for_function('!!window.AutonomousMission')
        return page

    # G1: native spiral-demo -> actual SPIRAL -> actual GRID resume -> native FORCE_RTH -> WATER.
    page = fresh()
    try:
        page.locator('#am-spiral-demo').click()
        page.wait_for_function("AutonomousMission.snapshot().stationStage==='moving'", timeout=15000)
        pause(page)
        scanned = drive(page, lambda s:s['missionState']=='SPIRAL SCAN' and s['anomaly']['used'] and len(s['anomaly']['spiralTargets'])>0, step=5)
        resumed = drive(page, lambda s:s['missionState']=='GRID SCAN' and s['anomaly']['used'], step=10)
        check('G1 precondition: real generated SPIRAL history retained after GRID resume', resumed['anomaly']['used'] and resumed['anomaly']['planner'] is not None and len(resumed['anomaly']['spiralTargets'])>0,
              {'scanned':summarize(scanned),'resumed':summarize(resumed)})
        open_inputs(page)
        page.locator('[data-policy-command="FORCE_RTH"]').first.click()
        state = drive(page, lambda s:s['missionState']=='RTH', step=1, limit=80)
        pause(page)
        page.locator('[role="tab"][data-mode="ANOMALY"]').click()
        page.wait_for_timeout(100)
        text = words(page); state = snapshot(page)
        native_posts = page.evaluate('window.__nativePosts')
        report['snapshots']['G1_RTH_after_scan'] = summarize(state)
        report['commands'].extend(native_posts)
        rth_truth = state['missionState']=='RTH' and state['anomaly']['used'] and any(x.get('command')=='FORCE_RTH' for x in native_posts)
        acknowledges_history = any(w in text['decision'] for w in ('สแกน','สำรวจ')) and any(w in text['decision'] for w in ('ก่อน','แล้ว','ออกจาก'))
        identifies_rth = any(w in text['decision']+' '+text['effect'] for w in ('กลับ HOME','HOME','กลับบ้าน'))
        denies_scan = 'ยังไม่ได้เกิดการสแกนก้นหอย' in text['decision']
        check('G1 native FORCE_RTH after actual scan acknowledges retained scan and actual RTH, not a false no-scan claim',
              rth_truth and acknowledges_history and identifies_rth and not denies_scan,
              {'explanation':text,'nativeCommands':native_posts,'state':summarize(state)})
        save_shot(page, 'g1-rth-after-retained-scan.png')
    except Exception as exc:
        report.setdefault('scenario_errors',[]).append({'scenario':'G1','error':repr(exc),'traceback':traceback.format_exc()})
    finally: page.close()

    # G1 positive control: actual native command without any scan must not invent scan history.
    page = fresh()
    try:
        page.locator('#am-start').click()
        page.wait_for_function("AutonomousMission.snapshot().stationStage==='moving'", timeout=15000)
        pause(page)
        open_inputs(page)
        page.locator('[data-policy-command="FORCE_RTH"]').first.click()
        state = drive(page, lambda s:s['missionState']=='RTH', step=1, limit=80)
        pause(page); page.locator('[role="tab"][data-mode="ANOMALY"]').click(); page.wait_for_timeout(80)
        text=words(page); posts=page.evaluate('window.__nativePosts')
        report['snapshots']['G1_RTH_without_scan']=summarize(snapshot(page))
        check('G1 positive control: RTH without scan does not invent prior scan history',
              not state['anomaly']['used'] and 'ยังไม่ได้เกิดการสแกนก้นหอย' in text['decision'] and any(x.get('command')=='FORCE_RTH' for x in posts),
              {'explanation':text,'nativeCommands':posts,'state':summarize(state)})
    except Exception as exc:
        report.setdefault('scenario_errors',[]).append({'scenario':'G1-positive-control','error':repr(exc),'traceback':traceback.format_exc()})
    finally: page.close()

    # G2: retain SPIRAL FSM state; actual acquired compass-read failure stops Drive.
    page = fresh()
    try:
        page.locator('#am-spiral-demo').click()
        page.wait_for_function("AutonomousMission.snapshot().stationStage==='moving'", timeout=15000)
        pause(page)
        healthy = drive(page, lambda s:s['missionState']=='SPIRAL SCAN' and s['anomaly']['used'], step=5)
        healthy = page.evaluate('n=>AutonomousMission.fastForward(n)', 5)
        page.wait_for_timeout(5)
        healthy = snapshot(page)
        healthy_text = words(page)
        healthy_motion = healthy['compassAvailable'] and healthy['driveDecision']['stopReason']=='NONE' and (healthy['appliedPwm']['left']!=0 or healthy['appliedPwm']['right']!=0)
        check('G2 healthy-availability control: active SPIRAL motion remains described as travelling', healthy_motion and 'กำลังมุ่ง' in healthy_text['effect'],
              {'state':summarize(healthy),'explanation':healthy_text})
        open_inputs(page)
        before_ms = healthy['clockMs']
        page.locator('[data-mission-input="compassReadOk"]').uncheck()
        page.locator('#am-next').click()
        page.wait_for_function('(t)=>AutonomousMission.snapshot().clockMs>=t+50', arg=before_ms, timeout=3000)
        page.locator('[role="tab"][data-mode="ANOMALY"]').click(); page.wait_for_timeout(80)
        failed = snapshot(page); text=words(page)
        report['snapshots']['G2_compass_read_failure'] = summarize(failed)
        no_motion_claim = 'กำลังมุ่ง' not in text['effect'] and not any(w in text['decision'] for w in ('เดินทางต่อได้','สแกนก้นหอยรอบจุดที่ตรวจพบ'))
        fault_explained = any(w in text['decision']+' '+text['effect'] for w in ('เข็มทิศ','compass')) and any(w in text['decision']+' '+text['effect'] for w in ('หยุด','รอ','ไม่พร้อม')) and not any(w in text['decision']+' '+text['effect'] for w in ('NAVIGATION_UNAVAILABLE','FSM'))
        check('G2 native NEXT STEP: acquired compass-read fault keeps SPIRAL history, final Drive stopped, and copy explains stop',
              failed['clockMs']==before_ms+50 and failed['missionState']=='SPIRAL SCAN' and failed['inputs']['compass'] and not failed['compassAvailable'] and failed['driveDecision']['stopReason']=='NAVIGATION_UNAVAILABLE' and failed['appliedPwm']=={'left':0,'right':0} and fault_explained and no_motion_claim,
              {'beforeClockMs':before_ms,'state':summarize(failed),'explanation':text,'healthyExplanation':healthy_text})
        save_shot(page, 'g2-compass-read-failure.png')
    except Exception as exc:
        report.setdefault('scenario_errors',[]).append({'scenario':'G2','error':repr(exc),'traceback':traceback.format_exc()})
    finally: page.close()
    # G2 regression: actual public safety input drops during a real SPIRAL mission.
    page = fresh()
    try:
        page.locator('#am-spiral-demo').click()
        page.wait_for_function("AutonomousMission.snapshot().stationStage==='moving'", timeout=15000)
        pause(page)
        moving = drive(page, lambda s:s['missionState']=='SPIRAL SCAN' and s['anomaly']['used'] and s['driveDecision']['stopReason']=='NONE' and (s['appliedPwm']['left']!=0 or s['appliedPwm']['right']!=0), step=5)
        open_inputs(page)
        before_ms = moving['clockMs']
        page.locator('[data-mission-input="safety"]').uncheck()
        page.locator('#am-next').click()
        page.wait_for_function('(t)=>AutonomousMission.snapshot().clockMs>=t+50', arg=before_ms, timeout=3000)
        page.locator('[role="tab"][data-mode="ANOMALY"]').click(); page.wait_for_timeout(80)
        stopped = snapshot(page); text=words(page)
        report['snapshots']['G2_safety_hard_stop'] = summarize(stopped)
        safety_copy = 'ฉุกเฉิน' in text['decision']+' '+text['effect'] and 'ความปลอดภัย' in text['decision']+' '+text['effect'] and 'หยุด' in text['decision']+' '+text['effect']
        hides_internal_code = not any(code in str(text) for code in ('HARD_STOP','INVALID_REQUEST','NAVIGATION_UNAVAILABLE','FSM'))
        no_false_motion = not any(w in text['decision']+' '+text['effect'] for w in ('ตามเส้นตารางต่อ','กำลังมุ่ง','pending trigger'))
        check('G2 native NEXT STEP: real SPIRAL safety input loss shows actual latched emergency stop and human safety reason',
              stopped['clockMs']==before_ms+50 and stopped['missionState']=='EMERGENCY STOP' and stopped['safetyState']=='CRITICAL_STOP' and stopped['inputs']['safety'] is False and stopped['driveDecision']['stopReason']=='HARD_STOP' and stopped['appliedPwm']=={'left':0,'right':0} and safety_copy and hides_internal_code and no_false_motion,
              {'beforeClockMs':before_ms,'precondition':summarize(moving),'state':summarize(stopped),'explanation':text})
        save_shot(page, 'g2-safety-hard-stop.png')
        # Restoring a healthy input does not itself clear the real emergency latch.
        before_ms = stopped['clockMs']
        page.locator('[data-mission-input="safety"]').check()
        page.locator('#am-next').click()
        page.wait_for_function('(t)=>AutonomousMission.snapshot().clockMs>=t+50', arg=before_ms, timeout=3000)
        held = snapshot(page); held_text = words(page)
        report['snapshots']['G2_emergency_latch_after_input_recovery'] = summarize(held)
        still_stopped = 'ฉุกเฉิน' in held_text['decision']+' '+held_text['effect'] and 'หยุด' in held_text['decision']+' '+held_text['effect']
        no_false_recovery = not any(w in str(held_text) for w in ('ตามเส้นตารางต่อ','กำลังมุ่ง','pending trigger','HARD_STOP','FSM'))
        check('G2 healthy safety input does not erase the actual emergency latch or its stopped explanation',
              held['clockMs']==before_ms+50 and held['inputs']['safety'] is True and held['safetyState']=='NORMAL' and held['missionState']=='EMERGENCY STOP' and held['driveDecision']['stopReason']=='HARD_STOP' and held['appliedPwm']=={'left':0,'right':0} and still_stopped and no_false_recovery,
              {'state':summarize(held),'explanation':held_text})
        save_shot(page, 'g2-emergency-latch-after-input-recovery.png')
    except Exception as exc:
        report.setdefault('scenario_errors',[]).append({'scenario':'G2-safety-hard-stop','error':repr(exc),'traceback':traceback.format_exc()})
    finally: page.close()

    # G2 regression: actual public route input loss while a real SIM route is moving.
    page = fresh()
    try:
        page.locator('#am-start').click()
        page.wait_for_function("AutonomousMission.snapshot().stationStage==='moving'", timeout=15000)
        pause(page)
        moving = drive(page, lambda s:s['missionState']=='GRID SCAN' and s['driveDecision']['stopReason']=='NONE' and (s['appliedPwm']['left']!=0 or s['appliedPwm']['right']!=0), step=5)
        open_inputs(page)
        before_ms = moving['clockMs']
        page.locator('[data-mission-input="route"]').uncheck()
        page.locator('#am-next').click()
        page.wait_for_function('(t)=>AutonomousMission.snapshot().clockMs>=t+50', arg=before_ms, timeout=3000)
        page.locator('[role="tab"][data-mode="ANOMALY"]').click(); page.wait_for_timeout(80)
        stopped = snapshot(page); text=words(page)
        report['snapshots']['G2_route_invalid_request'] = summarize(stopped)
        route_copy = 'เส้นทาง' in text['decision']+' '+text['effect'] and 'หยุด' in text['decision']+' '+text['effect']
        hides_internal_code = not any(code in str(text) for code in ('HARD_STOP','INVALID_REQUEST','NAVIGATION_UNAVAILABLE','FSM'))
        rejects_demo_invitation = 'ซิมก้นหอย' not in text['decision']+' '+text['effect']
        check('G2 native NEXT STEP: real GRID route-input loss shows unavailable-route stop, not just spiral-demo invitation',
              stopped['clockMs']==before_ms+50 and stopped['missionState']=='GRID SCAN' and stopped['inputs']['route'] is False and stopped['safetyState']=='NORMAL' and stopped['driveDecision']['stopReason']=='INVALID_REQUEST' and stopped['appliedPwm']=={'left':0,'right':0} and route_copy and hides_internal_code and rejects_demo_invitation,
              {'beforeClockMs':before_ms,'precondition':summarize(moving),'state':summarize(stopped),'explanation':text})
        save_shot(page, 'g2-route-unavailable-stop.png')
    except Exception as exc:
        report.setdefault('scenario_errors',[]).append({'scenario':'G2-route-unavailable-stop','error':repr(exc),'traceback':traceback.format_exc()})
    finally: page.close()

    browser.close()

report['source_sha256']={rel:hashlib.sha256((ROOT/rel).read_bytes()).hexdigest() for rel in ('pages/overall.html','src/js/overall/autonomous-mission.js','src/js/overall/mission-kernel.js')}
report['ended']=time.time()
report['exit_code']=0 if not report.get('scenario_errors') and not report['errors'] and all(c['passed'] for c in report['checks']) else 1
path=OUT/'overall-explanations-native.json';path.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'exit_code':report['exit_code'],'checks_passed':sum(c['passed'] for c in report['checks']),'checks_total':len(report['checks']),'scenario_errors':report.get('scenario_errors',[]),'report':str(path)},ensure_ascii=False))
raise SystemExit(report['exit_code'])
