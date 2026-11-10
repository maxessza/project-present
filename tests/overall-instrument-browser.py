#!/usr/bin/env python3
"""Native Chromium evidence for the Overall visual instrument increment."""
from __future__ import annotations
import argparse
import hashlib
import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PAGE_URL = (ROOT / 'index.html').as_uri()
parser = argparse.ArgumentParser()
parser.add_argument('--stage', choices=('before', 'after'), required=True)
parser.add_argument('--out', required=True)
args = parser.parse_args()
OUT = Path(args.out)
OUT.mkdir(parents=True, exist_ok=True)
report = {
    'stage': args.stage, 'started_unix': time.time(), 'url': PAGE_URL,
    'viewports': {}, 'checks': [], 'events': {}, 'source_sha256': {},
    'screenshots': [], 'failures': [],
}
SOURCES = ['pages/overall.html', 'src/css/autonomous-mission.css',
           'src/css/overall-instrument.css', 'src/js/overall/autonomous-mission.js',
           'src/js/overall/autonomous-mission-model.js', 'src/js/overall/mission-kernel.js',
           'src/js/overall/mission-transport.js', 'src/js/mission/uplink-motion.js',
           'tests/overall-instrument.test.js', 'tests/overall-instrument-browser.py']
for rel in SOURCES:
    file = ROOT / rel
    report['source_sha256'][rel] = hashlib.sha256(file.read_bytes()).hexdigest()

def check(name, passed, details=None):
    row = {'name': name, 'passed': bool(passed), 'details': details}
    report['checks'].append(row)
    if not passed:
        report['failures'].append(row)
        if args.stage == 'after':
            raise AssertionError(f'{name}: {details!r}')

def watch(page, key):
    events = {'page_errors': [], 'console_errors': [], 'request_failures': []}
    page.on('pageerror', lambda error: events['page_errors'].append(str(error)))
    page.on('console', lambda msg: events['console_errors'].append(msg.text) if msg.type == 'error' else None)
    page.on('requestfailed', lambda req: events['request_failures'].append({'url': req.url, 'failure': req.failure}))
    report['events'][key] = events
    return events

CONTRAST_JS = """(selectors) => {
  const parse = value => { const m=value.match(/[\\d.]+/g)||[]; return m.slice(0,3).map(Number); };
  const lum = color => { const c=parse(color).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4); return .2126*c[0]+.7152*c[1]+.0722*c[2]; };
  return selectors.map(selector => {
    const el=document.querySelector(selector), style=getComputedStyle(el); let node=el, bg='';
    while(node && !bg){ const value=getComputedStyle(node).backgroundColor; if(value && !value.includes('rgba(0, 0, 0, 0)') && !value.includes('transparent')) bg=value; else node=node.parentElement; }
    if(!bg) bg=getComputedStyle(document.body).backgroundColor;
    const a=lum(style.color), b=lum(bg); return {selector, fontSize:style.fontSize, color:style.color, background:bg, ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
  });
}"""

try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        for width, height, label in ((1366, 768, '1366x768'), (1440, 900, '1440x900'), (390, 844, '390x844')):
            mobile = width == 390
            page = browser.new_page(viewport={'width': width, 'height': height}, device_scale_factor=1,
                                   is_mobile=mobile, has_touch=mobile, reduced_motion='no-preference')
            events = watch(page, label)
            response = page.goto(PAGE_URL, wait_until='load')
            page.wait_for_function('!!window.AutonomousMission', timeout=8000)
            page.evaluate('scrollTo(0,0)')
            box = page.locator('#system').bounding_box()
            scene = page.locator('.am-layout').bounding_box()
            controls = page.locator('.am-transport').bounding_box()
            overflow = page.evaluate('document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth')
            layout = {'root': box, 'scene': scene, 'controls': controls, 'viewport': [width, height], 'body_horizontal_overflow': overflow}
            report['viewports'][label] = layout
            check(f'{label} direct root journey reaches Overall', response is not None and page.url.endswith('/pages/overall.html'), {'status': response.status if response else None, 'url': page.url})
            check(f'{label} has no body horizontal overflow', not overflow)
            if width > 1000:
                fits = bool(scene and controls and scene['y'] + scene['height'] <= height and controls['y'] + controls['height'] <= height)
                check(f'{label} keeps scene and primary controls together in viewport', fits, layout)
            if mobile:
                pan = page.locator('.am-map-pan').evaluate('(e)=>({scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,overflowX:getComputedStyle(e).overflowX})')
                buttons = page.locator('#system button:visible').evaluate_all('els=>els.map(e=>({id:e.id,text:e.innerText,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))')
                layout['map_pan'] = pan
                layout['visible_buttons'] = buttons
                check('390x844 map pan is bounded inside its own region', pan['scrollWidth'] > pan['clientWidth'] and pan['overflowX'] in ('auto','scroll'))
                check('390x844 visible buttons retain 44px touch targets', bool(buttons) and all(b['width'] >= 44 and b['height'] >= 44 for b in buttons), buttons)
            for suffix, full_page in (('viewport', False), ('full-page', True)):
                shot = OUT / f'{label}-{args.stage}-{suffix}.png'
                page.screenshot(path=str(shot), full_page=full_page)
                report['screenshots'].append(str(shot))
            if args.stage == 'after' and width == 1366:
                labels = page.locator('.am-readouts dt').all_text_contents()
                expected = ['MISSION STATE', 'CURRENT WAYPOINT', 'TARGET HEADING', 'CURRENT HEADING', 'HEADING ERROR', 'LEFT APPLIED', 'RIGHT APPLIED']
                check('the scene retains all seven primary readouts', labels == expected, labels)
                stylesheets = page.locator('link[rel="stylesheet"]').evaluate_all('els=>els.map(e=>e.getAttribute("href"))')
                check('Overall-only stylesheet is last', stylesheets[-1] == '../src/css/overall-instrument.css?v=data-report-2', stylesheets)
                type_checks = page.evaluate(CONTRAST_JS, ['.am-readouts dt', '.am-readouts dd', '.am-explanation dd'])
                layout['essential_text_contrast'] = type_checks
                check('essential readout and explanation text meets 4.5:1 contrast', all(float(x['ratio']) >= 4.5 and float(x['fontSize'].replace('px','')) >= 14 for x in type_checks), type_checks)
                native_buttons = page.locator('#system button:visible').evaluate_all('els=>els.map(e=>({id:e.id,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))')
                check('1366x768 visible controls retain 44px targets', all(b['width'] >= 44 and b['height'] >= 44 for b in native_buttons), native_buttons)
        if args.stage == 'after':
            page = browser.new_page(viewport={'width': 1366, 'height': 768}, device_scale_factor=1, reduced_motion='no-preference')
            events = watch(page, 'lifecycle')
            page.goto(PAGE_URL, wait_until='load')
            page.wait_for_function('!!window.AutonomousMission')
            initial = page.evaluate('window.AutonomousMission.snapshot()')
            check('fresh page has a paused mission and matching presentation hook', not initial['playing'] and page.locator('#system').get_attribute('data-playing') == 'false')
            page.locator('#am-start').click()
            page.wait_for_function('window.AutonomousMission.snapshot().clockMs >= 200', timeout=5000)
            playing = page.evaluate("""() => {
              const root=document.querySelector('#system'), svg=document.querySelector('#am-map'), boat=document.querySelector('#am-boat'), target=document.querySelector('#am-target'), s=window.AutonomousMission.snapshot();
              const pt=p=>{const q=svg.createSVGPoint();q.x=p.x;q.y=p.y;return q.matrixTransform(svg.getScreenCTM());};
              const tip=q=>{q.x=0;q.y=-13;return q.matrixTransform(boat.getScreenCTM());};
              const actual=tip(svg.createSVGPoint()), expected=pt(s.position), targetPoint=pt(s.target), renderedTarget=pt({x:Number(target.getAttribute('cx')),y:Number(target.getAttribute('cy'))});
              return {playing:s.playing,hook:root.dataset.playing,clockMs:s.clockMs,targetAnimation:getComputedStyle(target).animationName,routeAnimation:getComputedStyle(document.querySelector('#am-route-progress')).animationName,boatError:Math.hypot(actual.x-expected.x,actual.y-expected.y),targetError:Math.hypot(targetPoint.x-renderedTarget.x,targetPoint.y-renderedTarget.y),position:s.position,target:s.target};
            }""")
            check('native SIM starts state-bound target/path motion without changing SVG pose geometry', playing['playing'] and playing['hook']=='true' and playing['clockMs'] >= 200 and playing['targetAnimation']=='am-target-focus' and playing['routeAnimation']=='am-followed-route' and playing['boatError'] < 1 and playing['targetError'] < 1, playing)
            page.locator('#am-toggle').click()
            paused = page.evaluate('window.AutonomousMission.snapshot()')
            paused_styles = page.evaluate("""() => ({hook:document.querySelector('#system').dataset.playing,target:getComputedStyle(document.querySelector('#am-target')).animationName,path:getComputedStyle(document.querySelector('#am-route-progress')).animationName})""")
            check('native PAUSE stops motion decoration and mirrors paused state', not paused['playing'] and page.locator('#system').get_attribute('data-playing') == 'false' and paused_styles['target']=='none' and paused_styles['path']=='none', paused_styles)
            page.wait_for_timeout(160)
            before_step = page.evaluate('window.AutonomousMission.snapshot()')
            page.locator('#am-next').click()
            after_step = page.evaluate('window.AutonomousMission.snapshot()')
            check('native NEXT STEP advances exactly one real 50ms step and remains paused', not after_step['playing'] and after_step['clockMs']-before_step['clockMs']==50 and page.locator('#system').get_attribute('data-playing')=='false', {'before':before_step['clockMs'],'after':after_step['clockMs']})
            before_lens = page.evaluate('window.AutonomousMission.snapshot()')
            page.locator('#am-tab-route').focus()
            page.keyboard.press('ArrowRight')
            after_lens = page.evaluate('window.AutonomousMission.snapshot()')
            check('keyboard lens change preserves paused mission state and pose', page.locator('#am-tab-navigation').get_attribute('aria-selected')=='true' and not after_lens['playing'] and after_lens['clockMs']==before_lens['clockMs'] and after_lens['position']==before_lens['position'])
            focus_style = page.locator('#am-tab-navigation').evaluate('(e)=>({outlineStyle:getComputedStyle(e).outlineStyle,outlineWidth:getComputedStyle(e).outlineWidth,outlineColor:getComputedStyle(e).outlineColor})')
            check('keyboard navigation presents a visible focus indicator', focus_style['outlineStyle']=='solid' and float(focus_style['outlineWidth'].replace('px','')) >= 3, focus_style)
            page.locator('#am-tabs [data-mode="CONTROL"]').click()
            page.locator('#am-speed').select_option('4')
            page.locator('#am-start').click()
            page.wait_for_function('window.AutonomousMission.snapshot().playing', timeout=3000)
            page.locator('#am-disturbance').click()
            page.wait_for_function('window.AutonomousMission.snapshot().force.remainingSec > 0', timeout=3000)
            disturbed = page.evaluate('window.AutonomousMission.snapshot()')
            check('native disturbance control produces only the existing mission force state', disturbed['force']['remainingSec'] > 0 and disturbed['playing'])
            page.locator('#am-reset').click()
            reset = page.evaluate('window.AutonomousMission.snapshot()')
            check('native RESET returns immediately to READY/HOME and stops motion', reset['missionState']=='READY' and reset['clockMs']==0 and not reset['playing'] and page.locator('#system').get_attribute('data-playing')=='false')
            page.locator('#am-start').click()
            page.wait_for_function('window.AutonomousMission.snapshot().clockMs >= 100', timeout=4000)
            page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))")
            hidden = page.evaluate('window.AutonomousMission.snapshot()')
            hidden_styles = page.evaluate("getComputedStyle(document.querySelector('#am-target')).animationName")
            check('hidden-document pause clears the presentation hook and stops decoration', not hidden['playing'] and page.locator('#system').get_attribute('data-playing')=='false' and hidden_styles=='none', {'playing':hidden['playing'],'hook':page.locator('#system').get_attribute('data-playing'),'animation':hidden_styles})
            page.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))")
            page.emulate_media(reduced_motion='reduce')
            reduced = page.evaluate("""() => ({target:getComputedStyle(document.querySelector('#am-target')).animationName,path:getComputedStyle(document.querySelector('#am-route-progress')).animationName,transition:getComputedStyle(document.querySelector('#am-tabs button')).transitionDuration})""")
            check('reduced motion removes all decoration and transitions but keeps the scene', reduced['target']=='none' and reduced['path']=='none' and reduced['transition'] in ('0s','0s, 0s'), reduced)
            page.locator('#am-speed').select_option('4')
            page.locator('#am-spiral-demo').click()
            armed = page.evaluate('window.AutonomousMission.snapshot()')
            check('explicit spiral scenario starts the same mission with anomaly armed', armed['playing'] and armed['anomaly']['armed'] and armed['clockMs']==0)
            page.wait_for_function("window.AutonomousMission.snapshot().missionState === 'SPIRAL SCAN'", timeout=90000)
            spiral = page.evaluate('window.AutonomousMission.snapshot()')
            cause = spiral.get('spiralCause')
            check('real sample-trigger enters spiral with captured trigger-time evidence', spiral['missionState']=='SPIRAL SCAN' and cause is not None and cause['mean']>50 and len(cause['window'])==8 and cause['passedFirst'], {'state':spiral['missionState'],'spiralCause':cause,'window':spiral['anomaly']['window'],'mean':spiral['anomaly']['mean']})
            trigger_mean = cause['mean'] if cause else -1
            categories = page.locator('#am-explanation dt').all_text_contents()
            explanation = page.locator('#am-explanation').inner_text()
            progress = page.locator('#am-waypoint').inner_text()
            water_values = page.locator('#am-anomaly-values').inner_text()
            check('all four Thai causal categories remain visible during the spiral', categories == ['1 · รับค่าอะไร','2 · ตรวจ / คำนวณอะไร','3 · ตัดสินใจอะไร','4 · ผลที่เกิดในฉาก'], categories)
            check('WATER lens shows trigger-time mean and live 8-sample/25-target progress', f"{trigger_mean:.1f} NTU" in explanation and '8/8 ตัวอย่าง' in water_values and 'SPIRAL 1/25' in progress, {'explanation':explanation,'water':water_values,'progress':progress})
            page.locator('#am-tabs [data-mode="DATA"]').click()
            data_fields = {key:page.locator(f'#{key}').inner_text() for key in ('am-source-value','am-packet-identity','am-shore-value')}
            data_rows = page.locator('#am-data-table [data-report-field]')
            data_text = page.locator('#am-data-details').inner_text()
            check('DATA lens shows nine Thai report rows and separate current, outgoing and received reports without raw dump', page.locator('#am-data-details').is_visible() and data_rows.count()==9 and 'บนเรือจำลอง' in data_fields['am-source-value'] and 'ชุดที่' in data_fields['am-packet-identity'] and ('ชุดที่' in data_fields['am-shore-value'] or 'ยังไม่ได้รับ' in data_fields['am-shore-value']) and 'รายงานที่กำลังเตรียมหรือส่ง' in data_text and 'รายงานล่าสุดที่ฝั่งได้รับ' in data_text and not page.locator('#am-trace-details').is_visible(), data_fields)
            check('DATA user-facing copy has no raw transfer vocabulary or nonfinite placeholders', not bool(__import__('re').search(r'\b(?:SEQ|TX|RX|queued|posted|decoded|stale|NaN|null|undefined|little-endian)\b', data_text + ' ' + ' '.join(data_fields.values()), __import__('re').I)), {'fields':data_fields,'text':data_text})
            page.locator('#am-tabs [data-mode="ANOMALY"]').click()
            page.evaluate('scrollTo(0,0)')
            spiral_shot = OUT / 'spiral-active-after.png'
            page.screenshot(path=str(spiral_shot), full_page=False)
            report['screenshots'].append(str(spiral_shot))
            interrupted = spiral['anomaly']['interruptedIndex']
            page.wait_for_function("index => { const s=window.AutonomousMission.snapshot(); return s.missionState === 'GRID SCAN' && s.waypointIndex === index; }", timeout=120000, arg=interrupted)
            resumed = page.evaluate('window.AutonomousMission.snapshot()')
            check('spiral completes and returns to the exact interrupted GRID index', resumed['missionState']=='GRID SCAN' and resumed['waypointIndex']==interrupted and resumed['anomaly']['used'] and not resumed['anomaly']['armed'], {'interruptedIndex':interrupted,'resumed':{'missionState':resumed['missionState'],'waypointIndex':resumed['waypointIndex'],'spiralIndex':resumed['anomaly']['spiralIndex'],'used':resumed['anomaly']['used']}})
        for key, event in report['events'].items():
            check(f'{key} Chromium page has no page, console or resource errors', not event['page_errors'] and not event['console_errors'] and not event['request_failures'], event)
        if args.stage == 'after':
            baseline_path = Path('D:/Presention/presention-minimal-technical-20261021/BASELINE.json')
            baseline = json.loads(baseline_path.read_text(encoding='utf-8'))['files']
            allowed_visual_identities = {'pages/overall.html', 'src/js/overall/autonomous-mission.js', 'docs/MIGRATION_MAP.json'}
            drift = []
            for rel, expected in baseline.items():
                if rel in allowed_visual_identities:
                    continue
                file = ROOT / rel
                actual = hashlib.sha256(file.read_bytes()).hexdigest() if file.is_file() else None
                if actual != expected:
                    drift.append({'path':rel,'expected':expected,'actual':actual})
            report['baseline'] = {'path':str(baseline_path),'files_checked':len(baseline)-len(allowed_visual_identities),'approved_visual_identities':sorted(allowed_visual_identities),'unexpected_drift':drift}
            check('all baseline source identities outside this visual increment remain byte-identical', not drift, report['baseline'])
        browser.close()
except Exception as error:
    report['failures'].append({'type':type(error).__name__,'message':str(error)})
report['ended_unix'] = time.time()
report['screenshot_sha256'] = {name:hashlib.sha256(Path(name).read_bytes()).hexdigest() for name in report['screenshots'] if Path(name).is_file()}
report['exit_code'] = 1 if report['failures'] else 0
report_path = OUT / f'overall-instrument-{args.stage}.json'
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'stage':args.stage,'exit_code':report['exit_code'],'checks_passed':sum(c['passed'] for c in report['checks']),'checks_total':len(report['checks']),'failures':report['failures'],'report':str(report_path)},ensure_ascii=False))
raise SystemExit(report['exit_code'])
