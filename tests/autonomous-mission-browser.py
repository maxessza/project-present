#!/usr/bin/env python3
"""Native Chromium evidence for the Overall AUTONOMOUS MISSION section."""
from __future__ import annotations
import argparse
import hashlib
import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--out', required=True)
parser.add_argument('--red', action='store_true')
args = parser.parse_args()
OUT = Path(args.out)
OUT.mkdir(parents=True, exist_ok=True)
PAGE = ROOT / 'index.html'
SOURCES = [
    'index.html', 'pages/overall.html', 'src/css/autonomous-mission.css',
    'src/js/overall/mission-kernel.js', 'tests/autonomous-mission-model.test.js',
    'tests/autonomous-mission-browser.py', 'tests/overall-lowbattery-browser.py',
]
report = {
    'mode': 'expected-red' if args.red else 'acceptance',
    'started_unix': time.time(), 'url': PAGE.as_uri(), 'source_sha256': {},
    'viewport': {'desktop': [1440, 900], 'tablet': [1366, 768], 'phone': [390, 844]},
    'device_scale_factor': 1, 'media': 'no-preference', 'checks': [],
    'events': {}, 'screenshots': [],
}
for rel in SOURCES:
    path = ROOT / rel
    if path.exists():
        report['source_sha256'][rel] = hashlib.sha256(path.read_bytes()).hexdigest()

def check(name, passed, details=None):
    report['checks'].append({'name': name, 'passed': bool(passed), 'details': details})
    if not passed:
        raise AssertionError(f'{name}: {details!r}')

def watch(page, key):
    events = {'page_errors': [], 'console_errors': [], 'request_failures': []}
    page.on('pageerror', lambda error: events['page_errors'].append(str(error)))
    page.on('console', lambda msg: events['console_errors'].append(msg.text) if msg.type == 'error' else None)
    page.on('requestfailed', lambda req: events['request_failures'].append({'url': req.url, 'failure': req.failure}))
    report['events'][key] = events
    return events

def advance_until(page, predicate, label, step_count=40, limit=1500):
    state = None
    for _ in range(limit):
        state = page.evaluate('(n)=>AutonomousMission.fastForward(n)', step_count)
        if predicate(state):
            return state
        page.wait_for_timeout(5)
    raise AssertionError(f'bounded native mission drive did not reach {label}: {state!r}')

try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 1440, 'height': 900}, device_scale_factor=1, reduced_motion='no-preference')
        page.set_default_timeout(5000)
        desktop_events = watch(page, 'desktop')
        response = page.goto(PAGE.as_uri(), wait_until='load')
        check('root file journey lands on Overall', response is not None and page.url.endswith('/pages/overall.html'), {'status': response.status if response else None, 'url': page.url, 'title': page.title()})
        if args.red:
            page.screenshot(path=str(OUT / 'red-before-native-start.png'), full_page=True)
            report['screenshots'].append(str(OUT / 'red-before-native-start.png'))
            legacy_before = page.locator('#system-boat').get_attribute('transform')
            legacy_clock = page.locator('#system-clock').inner_text()
            page.locator('#system-start').click()
            page.wait_for_timeout(850)
            legacy_after = page.locator('#system-boat').get_attribute('transform')
            after_clock = page.locator('#system-clock').inner_text()
            check('RED: legacy START does not move the boat on a fresh unprepared page', legacy_after == legacy_before and after_clock == legacy_clock, {'before_transform': legacy_before, 'after_transform': legacy_after, 'before_clock': legacy_clock, 'after_clock': after_clock})
            check('RED: accepted compact mission START and one SVG scene do not exist yet', page.locator('#am-start').count() == 0 and page.locator('#am-map').count() == 0, {'new_start_count': page.locator('#am-start').count(), 'new_map_count': page.locator('#am-map').count()})
            check('RED: old sensor/transport dashboard remains in the section', page.locator('.system-controls-grid').count() == 1 and page.locator('.system-equations').count() == 1)
            page.screenshot(path=str(OUT / 'red-after-native-start.png'), full_page=True)
            report['screenshots'].append(str(OUT / 'red-after-native-start.png'))
        else:
            check('Overall contains exactly one integrated AUTONOMOUS MISSION section', page.locator('main > #system[data-autonomous-mission] #am-map').count() == 1 and page.locator('main > #system').count() == 1)
            check('all nine mission-side readouts distinguish control inputs, measured heading and applied outputs', page.locator('.am-readouts > div').count() == 9 and ['MISSION STATE','CURRENT WAYPOINT','CONTROL TARGET','COMPASS SAMPLE','CONTROL ERROR','REQUEST · L PWM','REQUEST · R PWM','APPLIED · L PWM','APPLIED · R PWM'] == page.locator('.am-readouts dt').all_text_contents())
            check('five accessible mission lens tabs and nine route points are present', page.locator('#am-tabs [role="tab"]').count() == 5 and page.locator('#am-waypoints [data-wp]').count() == 9)
            initial = page.evaluate('window.AutonomousMission.snapshot()')
            check('fresh local root starts paused at HOME with one trail point', initial['missionState']=='READY' and initial['clockMs']==0 and not initial['playing'] and initial['position']=={'x':335,'y':455} and len(initial['trail'])==1)
            page.screenshot(path=str(OUT/'desktop-initial.png'),full_page=True);report['screenshots'].append(str(OUT/'desktop-initial.png'))

            # Native SIM starts the actual route/START exchange, not an unreceived preset.
            page.locator('#am-start').click()
            page.wait_for_function("""() => {const s=window.AutonomousMission.snapshot();return s.stationStage==='moving' && (s.position.x!==335 || s.position.y!==455)}""",timeout=15000)
            started=page.evaluate('window.AutonomousMission.snapshot()')
            check('one native SIM click receives separate route and START before integrating the canonical plant',started['playing'] and started['clockMs']>0 and started['position']!=initial['position'] and started['trail'][-1]==started['position'] and len(started['acceptedRoute'])==9 and started['appliedRouteMessageId'] and started['appliedStartMessageId'],{'before':initial['position'],'after':started['position'],'clockMs':started['clockMs'],'routeId':started['appliedRouteMessageId'],'startId':started['appliedStartMessageId'],'routeCount':len(started['acceptedRoute'])})
            page.locator('#am-start').click()
            check('repeated native SIM keeps a single active RAF loop',page.evaluate('window.AutonomousMission.snapshot().activeLoop===1 && window.AutonomousMission.snapshot().playing'))
            page.screenshot(path=str(OUT/'desktop-native-start.png'),full_page=True);report['screenshots'].append(str(OUT/'desktop-native-start.png'))
            page.locator('#am-toggle').click()
            paused=page.evaluate('window.AutonomousMission.snapshot()')
            page.wait_for_timeout(180)
            settled=page.evaluate('window.AutonomousMission.snapshot()')
            check('PAUSE freezes time and pose and cancels the RAF loop',not paused['playing'] and paused['activeLoop']==0 and paused['clockMs']==settled['clockMs'] and paused['position']==settled['position'])

            # Every tab and route step is a lens on the same SVG/state.
            page.evaluate("window.__sameMissionSvg=document.querySelector('#am-map')")
            before_lenses=page.evaluate('window.AutonomousMission.snapshot()')
            for tab in ('ROUTE','NAVIGATION','CONTROL','ANOMALY'):
                page.locator(f'#am-tabs [data-mode="{tab}"]').click()
                current=page.evaluate('window.AutonomousMission.snapshot()')
                check(f'{tab} lens preserves SVG identity, clock, pose, waypoint and target',page.evaluate("document.querySelector('#am-map')===window.__sameMissionSvg") and current['clockMs']==before_lenses['clockMs'] and current['position']==before_lenses['position'] and current['waypointIndex']==before_lenses['waypointIndex'] and current['target']==before_lenses['target'] and current['activeLoop']==0)
                page.screenshot(path=str(OUT/f'desktop-{tab.lower()}.png'),full_page=True);report['screenshots'].append(str(OUT/f'desktop-{tab.lower()}.png'))
            page.locator('#am-tabs [data-mode="ROUTE"]').click()
            for step in range(1,5):
                page.locator(f'#am-route-steps [data-route-step="{step}"]').click()
                check(f'ROUTE disclosure step {step} does not reset or navigate the mission',page.evaluate("(v)=>{const s=window.AutonomousMission.snapshot();return s.clockMs===v.clockMs&&s.position.x===v.x&&s.position.y===v.y}",{'clockMs':before_lenses['clockMs'],'x':before_lenses['position']['x'],'y':before_lenses['position']['y']}))
            check('ROUTE stepper progressively reveals waypoints and the ordered sweep',page.locator('#am-route-progress').evaluate('(e)=>getComputedStyle(e).opacity')!='0' and page.locator('#am-waypoints .am-waypoint').count()==9)
            page.locator('#am-tabs [data-mode="NAVIGATION"]').click()
            nav_note=page.locator('#am-navigation-note').inner_text()
            check('NAVIGATION exposes the live LOS, Compass sample and signed error relationship','LOS point' in nav_note and 'Compass' in nav_note and ' = ' in nav_note and '°' in nav_note)
            page.locator('#am-tabs [data-mode="CONTROL"]').click()
            control_chain=page.locator('.am-control-chain').inner_text()
            check('CONTROL shows active controller owner and requested-to-applied Drive boundary','PWM ขอ' in control_chain and '→ applied' in control_chain and ('GRID · LOS' in control_chain or 'HeadingController' in control_chain),control_chain)

            ctm=page.evaluate("""() => {
              const s=window.AutonomousMission.snapshot(),svg=document.querySelector('#am-map'),boat=document.querySelector('#am-boat'),target=document.querySelector('#am-target');
              const screen=p=>{const q=svg.createSVGPoint();q.x=p.x;q.y=p.y;return q.matrixTransform(svg.getScreenCTM())};
              const origin=screen(s.position),tm=boat.getScreenCTM(),tip=svg.createSVGPoint();tip.x=0;tip.y=-13;const boatPoint=tip.matrixTransform(tm);
              const angle=(Math.atan2(-tm.c,tm.d)*180/Math.PI+360)%360;
              const liveTarget=s.missionState==='GRID SCAN'&&s.los?.valid?s.los.lookahead:s.target;
              const targetScreen=screen(liveTarget),tcx=Number(target.getAttribute('cx')),tcy=Number(target.getAttribute('cy'));
              const renderedTarget=screen({x:tcx,y:tcy});
              return {boatError:Math.hypot(origin.x-boatPoint.x,origin.y-boatPoint.y),targetError:Math.hypot(targetScreen.x-renderedTarget.x,targetScreen.y-renderedTarget.y),angle,heading:s.heading,target:s.target,liveTarget,renderedBoat:boat.getAttribute('transform'),error:s.headingError,metrics:s.headingMetrics,measuredHeading:s.measuredHeading,pwm:s.motorPwm};
            }""")
            wrapped=((ctm['angle']-ctm['heading']+180)%360)-180
            expected_target=f"{ctm['metrics']['targetHeadingDeg']:.1f}°"
            expected_compass=f"{ctm['metrics']['measuredHeadingDeg']:.1f}°"
            expected_error=f"{ctm['metrics']['errorDeg']:+.1f}°"
            readouts={'target':page.locator('#am-target-heading').inner_text(),'compass':page.locator('#am-current-heading').inner_text(),'error':page.locator('#am-heading-error').inner_text()}
            check('SVG pose stays plant-owned while heading readouts share one timestamped control sample',ctm['boatError']<1 and ctm['targetError']<1 and abs(wrapped)<.2 and 'rotate(' in ctm['renderedBoat'] and readouts=={'target':expected_target,'compass':expected_compass,'error':expected_error} and ctm['metrics']['clockMs']>0,{'pose':ctm,'readouts':readouts})
            check('both displayed PWM values are bounded synthetic 0..255 demo units',all(0<=ctm['pwm'][side]<=255 for side in ('left','right')))

            # Both actual sides of the temporary environmental force are tested in Node.
            # The native UI captures the visible pulse, unequal PWM, and recovery samples.
            page.locator('#am-speed').select_option('4')
            page.locator('#am-toggle').click()
            page.wait_for_timeout(120)
            before_force=page.evaluate('window.AutonomousMission.snapshot()')
            page.locator('#am-disturbance').click()
            page.wait_for_function('(x)=>window.AutonomousMission.snapshot().force.remainingSec>0 && window.AutonomousMission.snapshot().position.x!==x',arg=before_force['position']['x'],timeout=3000)
            peak=page.evaluate('window.AutonomousMission.snapshot()')
            page.wait_for_function('window.AutonomousMission.snapshot().force.remainingSec===0',timeout=5000)
            page.wait_for_timeout(3000)
            recovery=page.evaluate('window.AutonomousMission.snapshot()')
            def sample(v):
                return {'clockMs':v['clockMs'],'position':v['position'],'heading':v['heading'],'target':v['target'],'targetDistanceM':v['targetDistanceM'],'motorPwm':v['motorPwm'],'forceRemainingSec':v['force']['remainingSec'],'missionState':v['missionState']}
            report['disturbance_samples']={'before':sample(before_force),'peak':sample(peak),'recovery':sample(recovery)}
            check('native ADD DISTURBANCE changes position, heading and visible force while keeping the pending target',peak['force']['remainingSec']>0 and peak['position']!=before_force['position'] and peak['heading']!=before_force['heading'] and peak['target']==before_force['target'] and peak['motorPwm']['left']!=peak['motorPwm']['right'],report['disturbance_samples'])
            check('after force expiry, plant remains on its real recovery trajectory toward the same waypoint',recovery['force']['remainingSec']==0 and recovery['target']==before_force['target'] and recovery['targetDistanceM']<peak['targetDistanceM'],report['disturbance_samples'])

            # Native anomaly activation, visible threshold dwell, followed spiral, and exact resume.
            page.locator('#am-reset').click()
            page.locator('#am-speed').select_option('4')
            ready=page.evaluate('window.AutonomousMission.snapshot()')
            page.locator('#am-spiral-demo').click()
            rising=advance_until(page,lambda s:s['anomaly']['monitor']['trigger'],'strict source anomaly trigger',step_count=5)
            check('native later-route anomaly scenario crosses the strict source threshold only after received-route movement',rising['anomaly']['armed'] and rising['clockMs']>0 and rising['anomaly']['monitor']['trigger'] and rising['anomaly']['monitor']['mean']>rising['anomaly']['threshold'] and rising['position']!=ready['position'] and rising['appliedRouteMessageId'] and rising['appliedStartMessageId'],{'clockMs':rising['clockMs'],'position':rising['position'],'anomaly':rising['anomaly'],'routeId':rising['appliedRouteMessageId'],'startId':rising['appliedStartMessageId']})
            detected=advance_until(page,lambda s:s['missionState']=='SPIRAL SCAN','source FSM SPIRAL entry',step_count=5)
            check('strict source threshold crosses directly into SPIRAL and saves the pending grid index with one current target',detected['anomaly']['monitor']['trigger'] and detected['missionState']=='SPIRAL SCAN' and detected['anomaly']['interruptedIndex']==detected['waypointIndex'] and len(detected['anomaly']['spiralTargets'])==1,{'state':detected['missionState'],'index':detected['waypointIndex'],'interrupted':detected['anomaly']['interruptedIndex'],'targets':len(detected['anomaly']['spiralTargets']),'monitor':detected['anomaly']['monitor']})
            page.screenshot(path=str(OUT/'desktop-spiral-entry.png'),full_page=True);report['screenshots'].append(str(OUT/'desktop-spiral-entry.png'))
            interrupted=detected['waypointIndex']
            spiral=advance_until(page,lambda s:(s['missionState']=='SPIRAL SCAN' and s['anomaly']['spiralIndex']>=2) or (s['missionState']=='GRID SCAN' and s['anomaly']['used']),'incremental spiral progress or source abort')
            spiral_trail_count=len(spiral['trail'])
            returning=spiral if spiral['missionState']=='GRID SCAN' else advance_until(page,lambda s:s['missionState']=='GRID SCAN' and s['anomaly']['used'],'source spiral exit to GRID')
            generated=len(spiral['anomaly']['spiralTargets']);index=spiral['anomaly']['spiralIndex']
            check('spiral planner keeps only points generated so far and appends real trail samples',generated==min(index+1,25) and 1<=generated<=25 and len(spiral['trail'])>len(detected['trail']) and spiral['position']!=detected['position'],{'index':index,'generated':generated,'position':spiral['position'],'planner':spiral['anomaly']['planner']})
            planner=returning['anomaly']['planner'];elapsed=returning['clockMs']-planner['startedMs']
            source_exit=planner['done'] or elapsed>=240000 or (planner['cleanSinceMs'] is not None and returning['clockMs']-planner['cleanSinceMs']>=8000)
            check('firmware completion, wall, or clean-abort returns to GRID toward the exact pending waypoint',source_exit and returning['missionState']=='GRID SCAN' and returning['anomaly']['interruptedIndex']==interrupted and returning['target']==detected['acceptedRoute'][interrupted],{'clockMs':returning['clockMs'],'planner':planner,'elapsed':elapsed,'target':returning['target'],'interrupted':interrupted})
            resumed=returning
            check('plant returns to the exact interrupted grid index with a cleared trigger and one-shot anomaly state',resumed['missionState']=='GRID SCAN' and resumed['waypointIndex']==interrupted and resumed['anomaly']['used'] and not resumed['anomaly']['monitor']['trigger'],{'waypointIndex':resumed['waypointIndex'],'interrupted':interrupted,'anomaly':resumed['anomaly']})
            after_resume=advance_until(page,lambda s:s['clockMs']>=resumed['clockMs']+5000,'post-abort GRID cooldown',step_count=40)
            check('automatic SPIRAL clean-abort cooldown prevents immediate retrigger',after_resume['missionState']=='GRID SCAN' and after_resume['anomaly']['used'] and after_resume['anomaly']['planner']['cooldownUntilMs']>after_resume['clockMs'],{'clockMs':after_resume['clockMs'],'cooldownUntilMs':after_resume['anomaly']['planner']['cooldownUntilMs'],'missionState':after_resume['missionState']})
            report['anomaly_samples']={'rising':sample(rising),'detected':sample(detected),'spiral':sample(spiral),'returning':sample(returning),'resumed':sample(resumed),'interruptedIndex':interrupted,'spiralTargets':len(spiral['anomaly']['spiralTargets'])}
            page.screenshot(path=str(OUT/'desktop-anomaly-resumed.png'),full_page=True);report['screenshots'].append(str(OUT/'desktop-anomaly-resumed.png'))

            # Hidden documents pause; reduced-motion removes decor but does not disable explicit simulation.
            page.locator('#am-reset').click();page.locator('#am-start').click()
            page.wait_for_function('window.AutonomousMission.snapshot().clockMs>=250',timeout=5000)
            page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))")
            hidden=page.evaluate('window.AutonomousMission.snapshot()')
            page.wait_for_timeout(120)
            hidden_after=page.evaluate('window.AutonomousMission.snapshot()')
            page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))")
            check('visibilitychange pauses the hidden document without a duplicate loop',not hidden['playing'] and hidden['activeLoop']==0 and hidden['clockMs']==hidden_after['clockMs'])
            page.emulate_media(reduced_motion='reduce')
            transition=page.locator('#am-tabs button').first.evaluate('(e)=>getComputedStyle(e).transitionDuration')
            page.locator('#am-toggle').click();page.wait_for_timeout(220)
            reduced=page.evaluate('window.AutonomousMission.snapshot()')
            check('reduced-motion disables decoration transitions while explicit simulation remains usable',transition in ('0s','0s, 0s') and reduced['playing'] and reduced['clockMs']>hidden_after['clockMs'])

            # Keep the primary scene/readouts/transport above fold; supporting
            # policy and learning copy may continue as normal document scroll.
            for width,height,label in ((1440,900,'1440x900'),(1366,768,'1366x768')):
                vp=page if label=='1440x900' else browser.new_page(viewport={'width':width,'height':height},device_scale_factor=1,reduced_motion='no-preference')
                if vp is not page:
                    watch(vp,label);vp.goto(PAGE.as_uri(),wait_until='load')
                box=vp.locator('#system').bounding_box()
                scene=vp.locator('#am-map').bounding_box()
                readouts=vp.locator('.am-readouts').bounding_box()
                controls=vp.locator('.am-transport').bounding_box()
                fit=all(item is not None and item['y']>=0 and item['y']+item['height']<=height for item in (scene,readouts,controls))
                check(f'{label} primary scene, readouts and transport fit in the viewport with supporting copy scrollable',fit,{'section':box,'scene':scene,'readouts':readouts,'controls':controls,'viewport':[width,height]})
                check(f'{label} has no body-level horizontal overflow',vp.evaluate('document.documentElement.scrollWidth<=innerWidth && document.body.scrollWidth<=innerWidth'))
                vp.screenshot(path=str(OUT/f'layout-{label}.png'),full_page=True);report['screenshots'].append(str(OUT/f'layout-{label}.png'))
            mobile=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=1,is_mobile=True,has_touch=True,reduced_motion='reduce')
            mobile_events=watch(mobile,'390x844');mobile.goto(PAGE.as_uri(),wait_until='load')
            mobile.screenshot(path=str(OUT/'layout-390x844.png'),full_page=True);report['screenshots'].append(str(OUT/'layout-390x844.png'))
            check('390x844 direct-file phone has no body horizontal overflow and bounded map pan',mobile.evaluate('document.documentElement.scrollWidth<=innerWidth && document.body.scrollWidth<=innerWidth') and mobile.locator('.am-map-pan').evaluate('(e)=>e.scrollWidth>e.clientWidth') and mobile.locator('.am-pan-hint').is_visible())
            button_sizes=mobile.locator('#system button:visible').evaluate_all('els=>els.map(e=>({text:e.innerText,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))')
            check('all visible phone controls are at least 44px tall and 44px wide',bool(button_sizes) and all(b['height']>=44 and b['width']>=44 for b in button_sizes),button_sizes)
            mobile_fonts=mobile.locator('#am-waypoints .am-waypoint text').first.evaluate('(e)=>e.getBoundingClientRect().height')
            check('phone diagram waypoint numerals remain legible at the source scale',mobile_fonts>=11,{'firstWaypointTextHeight':mobile_fonts})
            boxes=mobile.locator('#am-waypoints .am-waypoint').evaluate_all("els=>els.map(e=>{const r=e.getBBox(),m=e.transform.baseVal.consolidate().matrix,s=e.ownerSVGElement.viewBox.baseVal,x=m.e+r.x,y=m.f+r.y,right=m.e+r.x+r.width,bottom=m.f+r.y+r.height;return {x,y,right,bottom,inView:x>=s.x&&y>=s.y&&right<=s.x+s.width&&bottom<=s.y+s.height}})")
            check('all numbered waypoint marks remain inside the SVG viewBox and can be panned into view',len(boxes)==9 and all(b['inView'] for b in boxes),boxes)

            for key,captured in report['events'].items():
                check(f'{key} Chromium page has no page, console, or resource errors',not captured['page_errors'] and not captured['console_errors'] and not captured['request_failures'],captured)
        browser.close()
        report['visual_capture']={'desktop':[1440,900],'second_desktop':[1366,768],'phone':[390,844],'device_scale_factor':1,'reduced_motion':'no-preference except explicit lifecycle/phone checks'}
        baseline_path=Path('D:/Presention/presention-current-grid-ui-20261023/overall-firmware-parity/completion/BASELINE.json')
        if baseline_path.exists():
            baseline=json.loads(baseline_path.read_text(encoding='utf-8'))['files']
            # F1/F2 repair scope: initialized planner fixture and truthful RTH/route renderer.
            # Keep the identity guard for every other baseline path; do not suppress it.
            approved_changes={'pages/overall.html','src/js/overall/mission-kernel.js','src/js/overall/autonomous-mission.js','tests/spiral-planner-policy.test.js','tests/autonomous-mission-browser.py','tests/autonomous-mission-model.test.js','tests/overall-station-browser.py','tests/overall-station.test.js','tests/mission-policies.test.js','docs/MIGRATION_MAP.json'}
            unchanged={name:item['sha256'] for name,item in baseline.items() if name not in approved_changes}
            changed=[name for name,item in baseline.items() if name in approved_changes and (not (ROOT/name).exists() or hashlib.sha256((ROOT/name).read_bytes()).hexdigest()!=item['sha256'])]
            dirty=[]
            for name,digest in unchanged.items():
                path=ROOT/name
                if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest()!=digest: dirty.append(name)
            check('all task-start baseline paths outside the explicitly scoped Overall implementation/test set remain byte-identical',not dirty,{'approved_task_changes':changed,'unexpected_baseline_drift':dirty})
            report['baseline_unchanged_count']=len(unchanged)-len(dirty)
        check('desktop and phone startup have no browser/page/resource errors',all(not ev['page_errors'] and not ev['console_errors'] and not ev['request_failures'] for ev in report['events'].values()),report['events'])
except Exception as error:
    report['failure'] = {'type': type(error).__name__, 'message': str(error)}
report['ended_unix'] = time.time()
report['exit_code'] = 1 if report.get('failure') or any(not item['passed'] for item in report['checks']) else 0
report_path = OUT / f"{report['mode']}.json"
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'mode': report['mode'], 'exit_code': report['exit_code'], 'checks_passed': sum(item['passed'] for item in report['checks']), 'checks_total': len(report['checks']), 'failure': report.get('failure'), 'report': str(report_path)}, ensure_ascii=False))
raise SystemExit(report['exit_code'])
