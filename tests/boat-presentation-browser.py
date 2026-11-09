"""Native user journey: a fresh page and one START, no fixture preparation."""
from pathlib import Path
import argparse,hashlib,json,time
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--out',required=True);p.add_argument('--layout',action='store_true');p.add_argument('--regression',action='store_true');a=p.parse_args();out=Path(a.out);out.mkdir(parents=True,exist_ok=True)
report={'at':time.time(),'checks':[],'events':[],'source_sha256':{}}
for name in ['pages/system-explorer.html','src/js/explorer/boat-mission-ui.js','src/css/boat-mission.css']:
 report['source_sha256'][name]=hashlib.sha256((ROOT/name).read_bytes()).hexdigest()
def check(name,ok,details=None):report['checks'].append({'name':name,'passed':bool(ok),'details':details})
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch();page=browser.new_page(viewport={'width':1440,'height':900});page.set_default_timeout(4000)
  page.on('pageerror',lambda e:report['events'].append(str(e)))
  page.goto((ROOT/'pages/system-explorer.html').as_uri());page.screenshot(path=str(out/'initial.png'))
  def snapshot():return page.evaluate('window.BoatSimulation.snapshot()')
  before=snapshot();check('fresh page stays paused until user START',not before['playing'] and before['clockMs']==0)
  page.locator('#sim-start').click();page.wait_for_timeout(1000);after=snapshot();page.screenshot(path=str(out/'after-one-start.png'))
  check('one START click starts simulation time without preset or Play',after['playing'] and after['clockMs']>0,{'mode':after['mode'],'clock':after['clockMs'],'playing':after['playing'],'readiness':after['readiness']})
  check('one START click visibly moves the production boat',after['position']!=before['position'] and after['mode']=='GRID',{'before':before['position'],'after':after['position']})
  if a.layout:
   page.locator('#sim-play').click();paused=snapshot()
   check('inspector is closed by default, not a permanent sidebar',page.locator('#mission-console:visible').count()==0)
   geometry=page.locator('.visual-panel').bounding_box();check('simulation scene occupies at least 90 percent of viewport width',geometry is not None and geometry['width']>=1440*.9,geometry)
   check('default view keeps explanation text out of simulation',len(page.locator('body').inner_text())<1000,len(page.locator('body').inner_text()))
   inspect=page.locator('#sim-inspect');check('a deliberate inspect control exists',inspect.count()==1)
   if inspect.count():
    inspect.click();check('opening logic inspector preserves paused mission pose and clock',snapshot()['position']==paused['position'] and snapshot()['clockMs']==paused['clockMs']);page.screenshot(path=str(out/'inspector.png'))
    page.locator('#mission-focus [data-focus="gps"]').click();check('GPS inspection uses same scene',snapshot()['position']==paused['position']);inspect.click()
  if a.regression:
   page.locator('#sim-reset').click();page.wait_for_timeout(250);reset=snapshot();check('reset returns paused ready synthetic demo',reset['clockMs']==0 and not reset['playing'] and reset['readiness']['start'])
   page.locator('#sim-inspect').click();page.locator('#mission-focus [data-focus="readiness"]').click();page.locator('#sim-compass-fresh').uncheck();still=snapshot()['position'];page.locator('#sim-start').click();page.wait_for_timeout(400);waiting=snapshot()
   check('START never overwrites a user-created compass fault',not waiting['compass']['fresh'] and waiting['mode']=='STANDBY' and waiting['pendingStart'] and waiting['position']==still,waiting['readiness'])
   check('waiting reason is visible on the scene', 'เข็มทิศ' in page.locator('#sim-mission-headline').inner_text())
   page.locator('#sim-compass-fresh').check();page.wait_for_timeout(500);check('recovering compass accepts pending START and moves',snapshot()['mode']=='GRID' and snapshot()['position']!=still)
   page.locator('#sim-close-inspector').click();page.locator('#sim-play').click();paused=snapshot();page.wait_for_timeout(200);check('pause freezes time and position',snapshot()['clockMs']==paused['clockMs'] and snapshot()['position']==paused['position'])
   page.locator('#sim-inspect').click()
   for f in ['whole','readiness','navigation','gps','compass','steering']:
    page.locator(f'#mission-focus [data-focus="{f}"]').click();check('inspection preserves scene: '+f,snapshot()['position']==paused['position'] and snapshot()['clockMs']==paused['clockMs'])
   page.keyboard.press('Escape');check('Escape closes details',page.locator('#sim-inspector').is_hidden())
   page.locator('#sim-step').click();check('one manual step is exactly 250ms',snapshot()['clockMs']==paused['clockMs']+250)
   page.locator('#sim-play').click();page.locator('#sim-speed').select_option('12');t=snapshot()['clockMs'];page.wait_for_timeout(400);check('speed change applies during playback',snapshot()['clockMs']>=t+3000)
   page.locator('#sim-reset').click();page.wait_for_timeout(220);check('reset cancels the live playback loop',snapshot()['clockMs']==0 and not snapshot()['playing'])
   ctm=page.evaluate("""()=>{let s=BoatSimulation.snapshot(),e=document.querySelector('#sim-boat'),l=document.querySelector('#mission-dynamics'),p=new DOMPoint(s.position.x,s.position.y).matrixTransform(l.getScreenCTM()),m=e.getScreenCTM();return Math.hypot(p.x-m.e,p.y-m.f)}""");check('actual SVG boat agrees with production pose',ctm<1,ctm)
   transport=page.locator('#mission-transport').bounding_box();check('desktop controls fit on screen',transport is not None and transport['y']+transport['height']<=900)
   mobile=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,reduced_motion='reduce');mobile.set_default_timeout(4000);mobile.on('pageerror',lambda e:report['events'].append(str(e)));mobile.goto((ROOT/'pages/system-explorer.html').as_uri());mobile.screenshot(path=str(out/'phone-initial.png'))
   phonebox=mobile.locator('#scene-pan').bounding_box();boatbox=mobile.locator('#sim-boat').bounding_box();check('phone initially shows the full boat marker',phonebox is not None and boatbox is not None and boatbox['y']>=phonebox['y'] and boatbox['y']+boatbox['height']<=phonebox['y']+phonebox['height']-10,{'scene':phonebox,'boat':boatbox})
   hud_collisions=mobile.evaluate("""()=>{let h=document.querySelector('.scene-hud').getBoundingClientRect();return [...document.querySelectorAll('#survey-area>.map-label,#survey-area>.survey-grid-label')].filter(e=>{if(getComputedStyle(e).display==='none')return false;let r=e.getBoundingClientRect();return r.right>h.left&&r.left<h.right&&r.bottom>h.top&&r.top<h.bottom}).map(e=>e.textContent)}""");check('phone HUD does not overlap decorative map titles',not hud_collisions,hud_collisions)
   check('phone has no body overflow',mobile.evaluate('document.documentElement.scrollWidth<=innerWidth'))
   buttons=mobile.locator('#mission-transport button:visible').evaluate_all('es=>es.map(e=>({width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}))');check('phone controls have 44px touch targets',all(x['width']>=44 and x['height']>=44 for x in buttons),buttons)
   mobile.locator('#sim-start').click();mobile.wait_for_timeout(700);check('phone reduced-motion one START also moves',mobile.evaluate('BoatSimulation.snapshot().playing && BoatSimulation.snapshot().position.y<455'))
   mobile.locator('#sim-play').click();mobile.locator('#sim-inspect').click();mobile.locator('#mission-focus [data-focus="gps"]').click();mobile.screenshot(path=str(out/'phone-inspector.png'));mobile.locator('#sim-close-inspector').click();check('phone can close inspection and keep controls usable',mobile.locator('#sim-inspector').is_hidden())
  check('no uncaught errors',not report['events'],report['events']);browser.close()
except Exception as e:report['error']=repr(e)
report['exit_code']=int(bool(report.get('error')) or any(not x['passed'] for x in report['checks']))
(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8');print(json.dumps({'checks':len(report['checks']),'failed':[x for x in report['checks'] if not x['passed']],'error':report.get('error'),'out':str(out)},ensure_ascii=False));raise SystemExit(report['exit_code'])
