"""Exercise retained Overall controls against the actual root entry in Chromium."""
from pathlib import Path
import argparse, hashlib, json, time
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--out', required=True)
args = parser.parse_args()
OUT = Path(args.out); OUT.mkdir(parents=True, exist_ok=True)
report = {'started_unix': time.time(), 'checks': [], 'errors': [], 'screenshots': []}
def check(name, passed, data=None):
    report['checks'].append({'name': name, 'passed': bool(passed), 'data': data})
def state(page):
    return page.evaluate('''()=>{const s=AutonomousMission.snapshot();return {
        clockMs:s.clockMs,position:s.position,heading:s.heading,playing:s.playing,
        generation:s.incoming.generation,eventSequence:s.eventSequence,
        routeCount:s.acceptedRoute.length,stage:s.stationStage,speed:s.speed,
        missionState:s.missionState,activeLoop:s.activeLoop}}''')
def image(page, name):
    path=OUT/name; page.screenshot(path=str(path))
    report['screenshots'].append({'path':str(path),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'url':page.url,'viewport':page.viewport_size})
def boot(browser, width, height, motion='reduce'):
    page=browser.new_page(viewport={'width':width,'height':height},reduced_motion=motion)
    page.on('pageerror', lambda e: report['errors'].append(str(e)))
    page.on('console', lambda m: report['errors'].append(m.text) if m.type=='error' else None)
    page.goto((ROOT/'index.html').as_uri(),wait_until='load')
    page.wait_for_function('!!window.AutonomousMission && !!window.OverallVisualMotion && !!document.querySelector("#sim-live")')
    return page
with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True)
    try:
        page=boot(browser,1366,768)
        check('Root entry loads restored storyboards and labs without retired mission controllers',page.evaluate('''()=>({ok:!!OverallVisualMotion && !!OverallLabsModel && !window.SystemMission && !window.UplinkMotion && ![...document.scripts].some(s=>/\/(?:overall|mission-start)\.js(?:\?|$)/.test(s.src))}).ok'''))
        original=state(page)
        panels=[('sma','ov-sma-plot'),('spiral','ov-spiral-plot'),('data','ov-data-flow'),('home','ov-home-radius'),('heading','ov-heading-dial'),('pid','ov-pid-sketch'),('pwm','ov-pid-flow')]
        for key,svg in panels:
            panel=page.locator('.ov-panel').filter(has=page.locator('#'+svg))
            controls=panel.locator('.ov-motion-controls')
            if not controls.is_visible():
                check(key+' legacy panel remains intentionally unexposed (replacement preserved)',key=='home')
                continue
            def visible_svg():
                return panel.locator('svg').evaluate('''e=>{const c=e.cloneNode(true);c.querySelectorAll('[display="none"]').forEach(n=>n.remove());c.querySelectorAll('[class=""]').forEach(n=>n.removeAttribute('class'));return c.innerHTML}''')
            before=visible_svg()
            controls.locator('button').nth(1).click()
            if key=='heading': controls.locator('button').nth(1).click()
            current=page.evaluate('(key)=>OverallVisualMotion.snapshot().find(s=>s.id===key)',key)
            after=visible_svg()
            check(key+' manual NEXT changes actual visual frame under reduced motion',current['stage']==(2 if key=='heading' else 1) and before!=after,{'stage':current['stage'],'status':controls.locator('.ov-motion-status').inner_text()})
            check(key+' reduced motion inhibits automatic play only',controls.locator('button').nth(0).is_disabled() and controls.locator('button').nth(1).is_enabled())
            controls.locator('button').nth(2).click()
            check(key+' RESET restores original visible SVG',visible_svg()==before and page.evaluate('(key)=>OverallVisualMotion.snapshot().find(s=>s.id===key).stage',key)==0)
        check('All Learn storyboard actions leave canonical mission untouched',state(page)==original)
        page.locator('#whatif-details > summary').click()
        for gate in ['lab-passed-wp1','lab-grid','lab-safety']:
            page.locator('#'+gate).check()
        for preset,expected in [('below','ไม่ trigger'),('equal','ไม่ trigger'),('above','trigger และ gate ครบ'),('baseline','trigger และ gate ครบ'),('incomplete','ไม่ trigger')]:
            page.locator('[data-lab-preset="'+preset+'"]').click()
            check('What-If preset '+preset+' evaluates through native button',expected in page.locator('#lab-next').inner_text(),{'mean':page.locator('#lab-mean').inner_text(),'next':page.locator('#lab-next').inner_text()})
        page.locator('#lab-samples').fill('51,51,51,51,51,51,51,51')
        page.locator('#lab-passed-wp1').uncheck()
        check('What-If native gate input blocks simulated spiral', 'รอผ่าน WP1' in page.locator('#lab-next').inner_text())
        page.locator('#lab-samples').fill('51,NaN,51')
        check('What-If rejects invalid samples rather than displaying a trigger','finite' in page.locator('#lab-error').inner_text())
        page.locator('#rth-lab-details > summary').click()
        page.locator('#rth-reset').click()
        page.locator('#rth-home-set').check(); page.locator('#rth-fix-valid').check()
        page.locator('#rth-distance').fill('12')
        page.locator('#rth-tick').click()
        check('RTH example departure requires two manual seconds','ยังไม่ latch' in page.locator('#rth-departed').inner_text())
        page.locator('#rth-tick').click()
        check('RTH example latches after two manual seconds','latch ค้าง' in page.locator('#rth-departed').inner_text())
        page.locator('#rth-distance').fill('4')
        page.locator('#rth-tick').click();page.locator('#rth-tick').click()
        check('RTH example radius alone/two seconds do not mark arrival','ยังไม่ผ่าน' in page.locator('#rth-arrived').inner_text())
        page.locator('#rth-tick').click()
        check('RTH example arrival passes on third continuous manual second','ผ่าน ·' in page.locator('#rth-arrived').inner_text())
        page.locator('#rth-reset').click()
        check('RTH example RESET clears gates and counters',not page.locator('#rth-home-set').is_checked() and page.locator('#rth-outside-ms').inner_text().startswith('0 /') and page.locator('#rth-inside-ms').inner_text().startswith('0 /'))
        check('All What-If and RTH examples leave canonical mission untouched',state(page)==original)
        page.close()
        page=boot(browser,1366,768,'no-preference')
        panel=page.locator('.ov-panel').filter(has=page.locator('#ov-sma-plot')); controls=panel.locator('.ov-motion-controls')
        controls.scroll_into_view_if_needed()
        page.wait_for_function('OverallVisualMotion.snapshot().find(s=>s.id==="sma").visible')
        controls.locator('button').nth(0).click()
        page.wait_for_function('OverallVisualMotion.snapshot().find(s=>s.id==="sma").stage>=2')
        controls.locator('button').nth(0).click(); stage=page.evaluate('OverallVisualMotion.snapshot().find(s=>s.id==="sma").stage');page.wait_for_timeout(750)
        check('Learn normal-motion PLAY advances and native PAUSE freezes actual stage',stage>=2 and page.evaluate('OverallVisualMotion.snapshot().find(s=>s.id==="sma").stage')==stage)
        controls.locator('button').nth(0).click();page.emulate_media(reduced_motion='reduce');page.wait_for_timeout(750)
        check('Changing reduced-motion preference stops Learn automatic playback',page.evaluate('!OverallVisualMotion.snapshot().find(s=>s.id==="sma").playing') and controls.locator('button').nth(0).is_disabled())
        page.emulate_media(reduced_motion='no-preference');controls.locator('button').nth(0).click()
        page.locator('[data-autonomous-mission]').scroll_into_view_if_needed();page.wait_for_timeout(150)
        check('Offscreen Learn panel stops its automatic playback',page.evaluate('!OverallVisualMotion.snapshot().find(s=>s.id==="sma").playing'))
        controls.scroll_into_view_if_needed();page.wait_for_function('OverallVisualMotion.snapshot().find(s=>s.id==="sma").visible');controls.locator('button').nth(0).click()
        page.evaluate('Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});document.dispatchEvent(new Event("visibilitychange"))')
        check('Hidden-document lifecycle event stops Learn playback',page.evaluate('!OverallVisualMotion.snapshot().find(s=>s.id==="sma").playing'))
        page.evaluate('delete document.hidden;document.dispatchEvent(new Event("visibilitychange"))')
        controls.locator('button').nth(2).click();controls.locator('button').nth(1).click();image(page,'desktop-learn.png');page.close()
        for width,height in [(1366,768),(390,844)]:
            page=boot(browser,width,height)
            label=f'{width}x{height}'
            page.locator('#sim-speed').select_option('4')
            check(label+' Operate speed changes primary and canonical speed',page.locator('#am-speed').input_value()=='4' and state(page)['speed']==4)
            page.locator('#am-speed').select_option('1')
            check(label+' primary speed changes Operate speed',page.locator('#sim-speed').input_value()=='1' and state(page)['speed']==1)
            page.locator('#sim-step').click();page.locator('#sim-step').click()
            check(label+' Operate NEXT advances actual clock exactly 50ms per action while paused',state(page)['clockMs']==100 and not state(page)['playing'] and page.locator('#sim-clock').inner_text()=='0.10 s')
            page.locator('#sim-back').click();past=page.locator('#sim-clock').inner_text();live=state(page)
            page.locator('#am-speed').select_option('4')
            check(label+' history stays historical during live publication without rewinding canonical mission',page.locator('#sim-clock').inner_text()==past and page.locator('#sim-history-status').inner_text().startswith('HISTORICAL') and state(page)['clockMs']==live['clockMs'])
            page.locator('#sim-live').click()
            check(label+' native LIVE exits history without changing canonical clock',page.locator('#sim-history-status').inner_text().startswith('LIVE') and state(page)['clockMs']==100)
            page.locator('#sim-reset').click();page.wait_for_timeout(200)
            check(label+' Operate RESET clears canonical mission and prior-generation history',state(page)['clockMs']==0 and state(page)['missionState']=='READY' and page.locator('#sim-back').is_disabled() and page.locator('#sim-checkpoint option[value="afterWp1"]').evaluate('option=>option.disabled'))
            page.locator('#sim-start').click()
            page.wait_for_function('AutonomousMission.snapshot().stationStage==="moving"',timeout=15000)
            page.locator('#am-toggle').click()
            before=state(page)
            for _ in range(30):page.locator('#sim-step').click()
            after=state(page)
            incoming=page.evaluate('AutonomousMission.snapshot().incoming.posted.map(e=>e.kind)')
            check(label+' fresh Operate START uses actual route upload and separate START',after['routeCount']==9 and incoming.count('route-upload')==1 and incoming.count('start')==1,{'posted':incoming,'stage':after['stage']})
            check(label+' primary PAUSE and Operate STEP use same pose/clock and visibly move boat',not after['playing'] and after['clockMs']==before['clockMs']+1500 and after['position']!=before['position'] and page.locator('#sim-clock').inner_text()==f'{after["clockMs"]/1000:.2f} s',{'before':before,'after':after,'pose':page.locator('#sim-pose-readout').inner_text()})
            check(label+' visible Operate captions use human-readable values, not raw model logs',page.locator('#sim-decision').evaluate('e=>!/NaN|undefined|moving\\//.test(e.textContent)') and page.locator('#sim-insight').evaluate('e=>!/NaN|undefined|moving\\//.test(e.textContent)'),{'decision':page.locator('#sim-decision').inner_text(),'insight':page.locator('#sim-insight').inner_text()})
            check(label+' only canonical mission runtime and loop are active',after['activeLoop']==0 and page.evaluate('!window.SystemMission && !window.UplinkMotion'))
            page.locator('#sim-start').click();page.wait_for_timeout(120)
            check(label+' Operate RESUME updates actual mission and primary control',state(page)['playing'] and 'PAUSE' in page.locator('#am-toggle').inner_text())
            page.locator('#sim-start').click()
            check(label+' Operate PAUSE updates primary control',not state(page)['playing'] and 'RESUME' in page.locator('#am-toggle').inner_text())
            page.locator('#operate').scroll_into_view_if_needed();image(page,label+'-operate.png')
            check(label+' page has no horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth && document.body.scrollWidth<=innerWidth'))
            page.locator('#am-reset').click();page.wait_for_timeout(250)
            check(label+' primary RESET clears Operate pose, history and pending callbacks',state(page)['clockMs']==0 and state(page)['routeCount']==0 and page.locator('#sim-back').is_disabled() and page.locator('#sim-clock').inner_text()=='0.00 s')
            page.close()
    except Exception as exc:
        report['errors'].append(repr(exc))
    finally:
        browser.close()
report['sources']={str(p.relative_to(ROOT)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'index.html',ROOT/'pages/overall.html',*sorted((ROOT/'src/js/overall').glob('*.js')),*sorted((ROOT/'src/css').glob('*overall*')),ROOT/'src/css/autonomous-mission.css',Path(__file__)]}
report['passed']=sum(c['passed'] for c in report['checks']);report['failed']=sum(not c['passed'] for c in report['checks']);report['ended_unix']=time.time()
(OUT/'REPORT.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'passed':report['passed'],'failed':report['failed'],'errors':report['errors'],'report':str(OUT/'REPORT.json')},ensure_ascii=False))
raise SystemExit(1 if report['failed'] or report['errors'] else 0)
