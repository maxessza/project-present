from __future__ import annotations
import hashlib, json, time
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
out = Path('D:/Presention/presention-unified-sim-20261020/evidence/builder')
out.mkdir(parents=True, exist_ok=True)
report = {'url': (root / 'index.html').as_uri(), 'started': time.time(), 'checks': [], 'errors': {}}
def check(name, passed, details=None):
    report['checks'].append({'name': name, 'passed': bool(passed), 'details': details})
    if not passed: raise AssertionError(f'{name}: {details}')
with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True)
    page = browser.new_page(viewport={'width':1366,'height':768}, device_scale_factor=1)
    events = {'page':[], 'console':[], 'request':[]}
    page.on('pageerror', lambda e: events['page'].append(str(e)))
    page.on('console', lambda m: events['console'].append(m.text) if m.type == 'error' else None)
    page.on('requestfailed', lambda r: events['request'].append({'url':r.url,'failure':r.failure}))
    response = page.goto((root/'index.html').as_uri(), wait_until='load')
    check('direct file URL loads Overall', bool(response) and page.url.endswith('/pages/overall.html'), {'status':response.status if response else None,'url':page.url})
    initial = page.evaluate('window.AutonomousMission.snapshot()')
    page.locator('#am-next').click()
    one = page.evaluate('window.AutonomousMission.snapshot()')
    check('NEXT STEP from READY starts and advances one 50 ms event, then pauses', one['clockMs']==50 and not one['playing'] and one['missionState']=='GRID SCAN', {'clockMs':one['clockMs'],'playing':one['playing'],'state':one['missionState']})
    check('captured trace agrees with event time, inputs/outputs and firmware source range', one['latestEvent']['atMs']==50 and one['latestEvent']['inputs']['position']==initial['position'] and one['latestEvent']['output']['position']==one['position'] and one['latestEvent']['source']['path']=='src/core/Tasks.cpp' and one['latestEvent']['source']['status']=='simplified', one['latestEvent'])
    page.locator('#am-trace-details').locator('summary').click()
    check('closed-by-default inspector renders source mapping on demand', page.locator('#am-trace-details').evaluate('(e)=>e.open') and 'Tasks.cpp' in page.locator('#am-trace-source').inner_text() and 'simplified' in page.locator('#am-trace-source').inner_text())
    pose_before = page.evaluate('window.AutonomousMission.snapshot()')
    page.locator('#am-tabs [data-mode="CONTROL"]').click()
    focused = page.evaluate('window.AutonomousMission.snapshot()')
    check('explanation focus leaves mission clock, pose and captured event unchanged', focused['clockMs']==pose_before['clockMs'] and focused['position']==pose_before['position'] and focused['latestEvent']==pose_before['latestEvent'])
    page.locator('#am-reset').click()
    page.locator('#am-start').click()
    page.wait_for_function('window.AutonomousMission.snapshot().clockMs > 200', timeout=5000)
    moving = page.evaluate('window.AutonomousMission.snapshot()')
    check('single SIM click drives position through the coupled plant', moving['position']!=initial['position'] and moving['playing'], {'position':moving['position'],'clockMs':moving['clockMs']})
    page.locator('#am-toggle').click()
    paused = page.evaluate('window.AutonomousMission.snapshot()')
    page.wait_for_timeout(120)
    settled = page.evaluate('window.AutonomousMission.snapshot()')
    check('PAUSE freezes time and pose', not paused['playing'] and paused['clockMs']==settled['clockMs'] and paused['position']==settled['position'])
    page.locator('#am-reset').click()
    reset = page.evaluate('window.AutonomousMission.snapshot()')
    check('RESET returns mission clock/state/trace to fresh READY', reset['clockMs']==0 and reset['missionState']=='READY' and reset['latestEvent'] is None)
    ctm = page.evaluate('''() => { const s=window.AutonomousMission.snapshot(),svg=document.querySelector('#am-map'),boat=document.querySelector('#am-boat'),m=boat.getScreenCTM();const p=svg.createSVGPoint();p.x=0;p.y=-13;const tip=p.matrixTransform(m);const q=svg.createSVGPoint();q.x=s.position.x;q.y=s.position.y;const pose=q.matrixTransform(svg.getScreenCTM());return Math.hypot(tip.x-pose.x,tip.y-pose.y); }''')
    check('boat arrow tip CTM is anchored at canonical pose', ctm < 1, {'tip_error_px':ctm})
    page.locator('#am-trace-details').evaluate('(e)=>{e.open=false}')
    page.evaluate('window.scrollTo(0,0)')
    page.wait_for_timeout(50)
    page.screenshot(path=str(out/'mission-desktop-1366x768.png'))
    page.set_viewport_size({'width':390,'height':844})
    page.evaluate('window.scrollTo(0,0)')
    phone = page.evaluate('''() => ({scroll:document.documentElement.scrollWidth,inner:innerWidth,buttons:[...document.querySelectorAll('#system button')].filter(e=>e.offsetParent).map(e=>({label:e.textContent.trim(),w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}))})''')
    check('phone body has no horizontal overflow and visible mission controls meet 44px hit target', phone['scroll']<=phone['inner'] and all(b['w']>=44 and b['h']>=44 for b in phone['buttons']), phone)
    page.screenshot(path=str(out/'mission-phone-390x844.png'))
    report['errors']=events
    check('browser startup and journey have no page, console or resource errors', not events['page'] and not events['console'] and not events['request'], events)
    report['viewport']={'desktop':[1366,768],'phone':[390,844],'dpr':1,'reduced_motion':'no-preference'}
    report['source_sha256']={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in ['pages/overall.html','src/js/overall/autonomous-mission.js','src/js/overall/autonomous-mission-model.js','src/css/autonomous-mission.css']}
    browser.close()
report['ended']=time.time()
(out/'unified-mission-browser-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'checks_passed':sum(c['passed'] for c in report['checks']),'checks_total':len(report['checks']),'report':str(out/'unified-mission-browser-report.json')},ensure_ascii=False))
