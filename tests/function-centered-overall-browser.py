#!/usr/bin/env python
"""Native Chromium regression for the function-owned Overall surface."""
import json
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT.parent/'evidence'/'function-centered-overall'/'builder'
OUT.mkdir(parents=True,exist_ok=True)
PAGE=ROOT/'pages'/'overall.html'
FUNCTIONS=['mission','route','navigation','heading','drive','water','safety','report','power']
checks=[]
def check(name,ok,detail=None):
    item={'name':name,'passed':bool(ok),'detail':detail};checks.append(item)
    if not ok: raise AssertionError(json.dumps(item,ensure_ascii=False))
def signature(page):
    return page.evaluate('''() => {const s=AutonomousMission.snapshot(); return JSON.stringify({missionState:s.missionState,playing:s.playing,clockMs:s.clockMs,position:s.position,heading:s.heading,waypointIndex:s.waypointIndex,acceptedRoute:s.acceptedRoute,incoming:s.incoming,transport:s.transport})}''')
report={'started_unix':time.time(),'page':PAGE.as_uri(),'checks':checks,'page_errors':[],'console_errors':[],'screenshots':[]}
try:
  with sync_playwright() as pw:
    browser=pw.chromium.launch(headless=True)
    page=browser.new_page(viewport={'width':1440,'height':950},device_scale_factor=1)
    page.set_default_timeout(10000)
    page.on('pageerror',lambda e:report['page_errors'].append(str(e)))
    page.on('console',lambda m:report['console_errors'].append(m.text) if m.type=='error' else None)
    response=page.goto(PAGE.as_uri(),wait_until='load');page.wait_for_timeout(120)
    check('Overall page and canonical public mission API boot',bool(response and response.status==200 and page.evaluate('!!AutonomousMission && typeof AutonomousMission.subscribe === "function"')),response.status if response else None)
    check('nine function owners render with one read-only snapshot detail',page.locator('.fc-function').count()==9 and page.locator('.fc-detail').is_visible(),page.locator('.fc-functions').inner_text())
    actual=[page.locator('.fc-function').nth(i).get_attribute('data-function') for i in range(page.locator('.fc-function').count())]
    check('function names and ordering are distinct',actual==FUNCTIONS,actual)
    check('legacy LEARN, mission-start, OPERATE experiences are not visible',all(not page.locator('#'+i).is_visible() for i in ['learn','mission-start','operate']))
    check('canonical simulator and only start entry are unique',page.locator('#am-start').count()==1 and page.locator('#ms-start-btn').count()==1 and page.locator('#sim-start').count()==1 and not page.locator('#ms-start-btn').is_visible() and not page.locator('#sim-start').is_visible())
    page.screenshot(path=str(OUT/'function-center-desktop.png'));report['screenshots'].append(str(OUT/'function-center-desktop.png'))
    # Selections must not start, tick, or otherwise mutate the mission snapshot.
    before=signature(page)
    distinct=[]
    for name in FUNCTIONS:
      button=page.locator(f'[data-function="{name}"]');button.click()
      text=page.locator('.fc-detail').inner_text();distinct.append(text)
      check(f'{name} presents its own grounded drill-down',button.get_attribute('aria-pressed')=='true' and len(text)>100,text[:240])
      check(f'{name} selection preserves the entire mission/transport snapshot',signature(page)==before)
    check('all nine drill-downs have distinct explanation content',len(set(distinct))==9)
    for fragment,owner in [('learn','mission'),('overview','route'),('pid','heading'),('mission-start','mission'),('ms-uplink-panel','report'),('operate','mission'),('system','mission')]:
      page.evaluate('(value)=>{location.hash=value}',fragment)
      page.wait_for_function('(owner)=>document.querySelector(`[data-function="${owner}"]`)?.getAttribute("aria-pressed")==="true"',arg=owner)
      check(f'legacy #{fragment} resolves to owning function {owner}',page.locator(f'[data-function="{owner}"]').get_attribute('aria-pressed')=='true' and page.locator('#function-center').is_visible())
    # Open the existing canonical SIM; receive/apply the actual route and START, then pause.
    page.locator('[data-function="mission"]').click();page.locator('.fc-open-sim').click()
    check('mission drill-down reveals the one canonical simulator',page.locator('#system').is_visible() and page.locator('#am-start').is_visible())
    page.locator('#am-start').click()
    page.wait_for_function("""() => {const s=AutonomousMission.snapshot();return s.missionState==='GRID SCAN' && s.acceptedRoute?.length===9 && s.incoming.received.some(x=>x.kind==='route-upload') && s.incoming.applied.some(x=>x.kind==='route-upload') && s.clockMs>0 && (s.position.x!==335 || s.position.y!==455)}""",timeout=20000)
    moving=page.evaluate('AutonomousMission.snapshot()')
    check('fresh SIM accepts/applies supplied route, starts mission and changes pose/clock',moving['missionState']=='GRID SCAN' and len(moving['acceptedRoute'])==9 and moving['clockMs']>0 and moving['position']!={'x':335,'y':455},{'missionState':moving['missionState'],'clockMs':moving['clockMs'],'position':moving['position'],'acceptedRoute':len(moving['acceptedRoute']),'received':len(moving['incoming']['received']),'applied':len(moving['incoming']['applied'])})
    page.locator('#am-toggle').click();page.wait_for_function('() => !AutonomousMission.snapshot().playing')
    paused=signature(page)
    for name in FUNCTIONS:
      page.locator(f'[data-function="{name}"]').click()
      check(f'paused mission stays invariant through {name} selection',signature(page)==paused)
    # The report is a contextual view from the same transport, not another simulator.
    page.locator('[data-function="report"]').click();page.locator('.fc-open-sim').click()
    page.wait_for_function("() => document.querySelector('#am-data-details') && !document.querySelector('#am-data-details').hidden")
    check('report drill-down uses nine native report rows and both TX/RX columns',page.locator('#am-data-table [data-report-field]').count()==9 and page.locator('#am-data-table [data-report-value="outgoing"]').count()==9 and page.locator('#am-data-table [data-report-value="received"]').count()==9)
    check('report presentation leaves paused mission and transport unchanged',signature(page)==paused)
    page.screenshot(path=str(OUT/'canonical-sim-report-desktop.png'));report['screenshots'].append(str(OUT/'canonical-sim-report-desktop.png'))
    page.set_viewport_size({'width':390,'height':844});page.locator('[data-function="heading"]').click();page.screenshot(path=str(OUT/'function-center-phone.png'));report['screenshots'].append(str(OUT/'function-center-phone.png'))
    dims=page.evaluate('''() => ({inner:innerWidth,body:document.body.scrollWidth,doc:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll('.fc-function')].map(b=>Math.round(b.getBoundingClientRect().height))})''')
    check('phone layout has no document overflow and function touch targets are >=44px',dims['body']<=dims['inner'] and dims['doc']<=dims['inner'] and all(h>=44 for h in dims['buttons']),dims)
    page.emulate_media(reduced_motion='reduce')
    check('reduced motion preference removes animated selection transitions',page.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches && getComputedStyle(document.querySelector('.fc-function')).transitionDuration==='0s'"))
    check('native Chromium has no page or console errors',not report['page_errors'] and not report['console_errors'],{'page':report['page_errors'],'console':report['console_errors']})
    browser.close()
except Exception as e:
  report['exception']=f'{type(e).__name__}: {e}'
finally:
  report['ended_unix']=time.time();report['failed']=[c for c in checks if not c['passed']];report['child_exit_code']=1 if report.get('exception') or report['failed'] else 0
  (OUT/'GREEN.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
  print(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(1 if report['child_exit_code'] else 0)
